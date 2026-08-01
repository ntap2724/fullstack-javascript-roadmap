import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  isSafeRelativePath,
  matchesEditablePath,
  normalizeRelativePath,
  type ExerciseDefinition,
} from '@roadmap/exercise-contract';
import type { Diagnostic } from '@roadmap/validation-core';
import { WorkspacePathError } from './workspace-paths.js';

export interface BaselineFileRecord {
  path: string;
  bytes: number;
  sha256: string;
}

export interface ExerciseBaselineManifest {
  schemaVersion: 1;
  exerciseId: string;
  exerciseVersion: string;
  files: readonly BaselineFileRecord[];
}

export interface WorkspaceFileManifest {
  schemaVersion: 1;
  files: readonly BaselineFileRecord[];
}

export type ManifestComparisonResult =
  { ok: true; changed: readonly string[] } | { ok: false; diagnostics: readonly Diagnostic[] };

class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

const EXERCISE_ID_PATTERN = /^ex-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function foldPath(value: string): string {
  return value.toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function assertDataProperties(value: Record<string, unknown>): void {
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new ManifestError('Manifest accessors are not allowed');
    }
  }
}

function assertDenseArray(value: unknown): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) throw new ManifestError('Manifest array is invalid');
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new ManifestError('Manifest array is sparse');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new ManifestError('Manifest array accessors are not allowed');
    }
  }
}

function parseFileRecord(value: unknown): BaselineFileRecord {
  if (!isRecord(value) || !hasExactKeys(value, ['bytes', 'path', 'sha256'])) {
    throw new ManifestError('Manifest file record is invalid');
  }
  assertDataProperties(value);
  const relativePath = value.path;
  const bytes = value.bytes;
  const sha256 = value.sha256;
  if (
    typeof relativePath !== 'string' ||
    !isSafeRelativePath(relativePath) ||
    normalizeRelativePath(relativePath) !== relativePath ||
    typeof bytes !== 'number' ||
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    typeof sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(sha256)
  ) {
    throw new ManifestError('Manifest file record values are invalid');
  }
  return { path: relativePath, bytes, sha256 };
}

function parseRecords(value: unknown): BaselineFileRecord[] {
  assertDenseArray(value);
  const files = value.map(parseFileRecord);
  const foldedPaths = new Set<string>();
  for (let index = 1; index < files.length; index += 1) {
    const previous = files[index - 1];
    const current = files[index];
    if (
      previous === undefined ||
      current === undefined ||
      compareCodeUnits(previous.path, current.path) >= 0
    ) {
      throw new ManifestError('Manifest paths must be strictly sorted and unique');
    }
  }
  for (const record of files) {
    const folded = foldPath(record.path);
    if (foldedPaths.has(folded)) throw new ManifestError('Manifest paths collide by case');
    foldedPaths.add(folded);
  }
  return files;
}

function parseManifest(value: unknown): ExerciseBaselineManifest {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['exerciseId', 'exerciseVersion', 'files', 'schemaVersion'])
  ) {
    throw new ManifestError('Manifest shape is invalid');
  }
  assertDataProperties(value);
  if (
    value.schemaVersion !== 1 ||
    typeof value.exerciseId !== 'string' ||
    !EXERCISE_ID_PATTERN.test(value.exerciseId) ||
    typeof value.exerciseVersion !== 'string' ||
    !SEMVER_PATTERN.test(value.exerciseVersion)
  ) {
    throw new ManifestError('Manifest provenance is invalid');
  }
  const files = parseRecords(value.files);
  return {
    schemaVersion: 1,
    exerciseId: value.exerciseId,
    exerciseVersion: value.exerciseVersion,
    files,
  };
}

function parseWorkspaceManifest(value: unknown): WorkspaceFileManifest {
  if (!isRecord(value) || !hasExactKeys(value, ['files', 'schemaVersion'])) {
    throw new ManifestError('Workspace manifest shape is invalid');
  }
  assertDataProperties(value);
  if (value.schemaVersion !== 1) throw new ManifestError('Workspace manifest schema is invalid');
  return { schemaVersion: 1, files: parseRecords(value.files) };
}

function pathIsWithin(base: string, candidate: string): boolean {
  const comparableBase = process.platform === 'win32' ? base.toLowerCase() : base;
  const comparableCandidate = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
  const relative = path.relative(comparableBase, comparableCandidate);
  return (
    relative.length === 0 ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function pathError(message: string): WorkspacePathError {
  return new WorkspacePathError('EXERCISE_PATH_001', message);
}

interface TreeOptions {
  readonly excluded: ReadonlySet<string>;
}

async function enumerateTree(
  root: string,
  current: string,
  relativePrefix: string,
  canonicalRoot: string,
  options: TreeOptions,
  output: BaselineFileRecord[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    throw pathError('Exercise source or workspace contents could not be enumerated');
  }
  entries.sort((left, right) => compareCodeUnits(left.name, right.name));
  for (const entry of entries) {
    const relativePath =
      relativePrefix.length === 0 ? entry.name : `${relativePrefix}/${entry.name}`;
    if (!isSafeRelativePath(relativePath)) throw pathError('Unsafe exercise path encountered');
    if (options.excluded.has(relativePath)) continue;
    const absolutePath = path.join(current, entry.name);
    let information;
    let canonicalPath: string;
    try {
      information = await lstat(absolutePath);
      if (entry.isSymbolicLink() || information.isSymbolicLink()) {
        throw pathError('Reparse or symbolic-link exercise content is not allowed');
      }
      canonicalPath = await realpath(absolutePath);
    } catch (error) {
      if (error instanceof WorkspacePathError) throw error;
      throw pathError('Exercise content could not be resolved');
    }
    if (!pathIsWithin(canonicalRoot, canonicalPath)) {
      throw pathError('Exercise content resolves outside its selected source tree');
    }
    if (information.isDirectory()) {
      await enumerateTree(root, absolutePath, relativePath, canonicalRoot, options, output);
    } else if (information.isFile()) {
      output.push(await hashFile(absolutePath, relativePath));
    } else {
      throw pathError('Unsupported exercise filesystem entry encountered');
    }
  }
  void root;
}

function assertUniqueConcretePaths(records: readonly BaselineFileRecord[]): void {
  const exact = new Set<string>();
  const folded = new Set<string>();
  for (const record of records) {
    if (!isSafeRelativePath(record.path) || normalizeRelativePath(record.path) !== record.path) {
      throw pathError('Unsafe mapped exercise path encountered');
    }
    const foldedPath = foldPath(record.path);
    if (foldedPath === '.roadmap' || foldedPath.startsWith('.roadmap/')) {
      throw pathError('Source content cannot map into the reserved workspace control namespace');
    }
    if (exact.has(record.path) || folded.has(foldedPath)) {
      throw pathError('Mapped exercise paths collide');
    }
    exact.add(record.path);
    folded.add(foldedPath);
  }
}

export async function enumerateManifestFiles(
  root: string,
  excludedPaths: readonly string[] = [],
): Promise<readonly BaselineFileRecord[]> {
  let canonicalRoot: string;
  try {
    const rootInformation = await lstat(root);
    if (!rootInformation.isDirectory() || rootInformation.isSymbolicLink()) {
      throw pathError('Selected exercise tree root is not a real directory');
    }
    canonicalRoot = await realpath(root);
  } catch {
    throw pathError('Exercise source or workspace root could not be resolved');
  }
  const records: BaselineFileRecord[] = [];
  await enumerateTree(
    root,
    root,
    '',
    canonicalRoot,
    { excluded: new Set(excludedPaths.map(normalizeRelativePath)) },
    records,
  );
  records.sort((left, right) => compareCodeUnits(left.path, right.path));
  assertUniqueConcretePaths(records);
  return records;
}

async function assertRoadmapDirectoryContainsOnlyBaseline(root: string): Promise<void> {
  const roadmapRoot = path.join(root, '.roadmap');
  try {
    const information = await lstat(roadmapRoot);
    if (!information.isDirectory() || information.isSymbolicLink()) {
      throw pathError('Workspace control directory is invalid');
    }
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code === 'ENOENT') return;
    if (error instanceof WorkspacePathError) throw error;
    throw pathError('Workspace control directory is invalid');
  }
  let entries;
  try {
    entries = await readdir(roadmapRoot, { withFileTypes: true });
  } catch {
    throw pathError('Workspace control directory could not be inspected');
  }
  for (const entry of entries) {
    if (entry.name !== 'exercise-baseline.json' || entry.isSymbolicLink()) {
      throw pathError('Unexpected workspace control content encountered');
    }
    const information = await lstat(path.join(roadmapRoot, entry.name));
    if (!information.isFile()) throw pathError('Workspace baseline control is invalid');
  }
}

export async function hashFile(file: string, relativePath: string): Promise<BaselineFileRecord> {
  const bytes = await readFile(file);
  return {
    path: relativePath,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export async function writeBaselineManifest(
  file: string,
  manifest: ExerciseBaselineManifest,
): Promise<void> {
  const validated = parseManifest(manifest);
  await writeFile(file, `${JSON.stringify(validated, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
}

export async function readBaselineManifest(file: string): Promise<ExerciseBaselineManifest> {
  try {
    const text = await readFile(file, 'utf8');
    const parsed: unknown = JSON.parse(text);
    return parseManifest(parsed);
  } catch (error) {
    if (error instanceof ManifestError) throw error;
    throw new ManifestError('Baseline manifest could not be read');
  }
}

function recordsWithPrefix(
  records: readonly BaselineFileRecord[],
  prefix: string,
): BaselineFileRecord[] {
  return records.map((record) => ({ ...record, path: `${prefix}${record.path}` }));
}

export async function deriveAllowlistedManifest(
  sourceRoot: string,
  definition: ExerciseDefinition,
): Promise<ExerciseBaselineManifest> {
  const starterRecords = await enumerateManifestFiles(path.join(sourceRoot, 'starter'));
  const openRecords = await enumerateManifestFiles(path.join(sourceRoot, 'tests', 'open'));
  const files = [...starterRecords, ...recordsWithPrefix(openRecords, 'test/open/')].sort(
    (left, right) => compareCodeUnits(left.path, right.path),
  );
  assertUniqueConcretePaths(files);
  return {
    schemaVersion: 1,
    exerciseId: definition.id,
    exerciseVersion: definition.version,
    files,
  };
}

export async function deriveAuthoritativeManifest(
  sourceRoot: string,
  definition: ExerciseDefinition,
): Promise<ExerciseBaselineManifest> {
  const canonicalSourceRoot = await realpath(sourceRoot);
  return deriveAllowlistedManifest(canonicalSourceRoot, definition);
}

export async function deriveWorkspaceManifest(
  workspaceRoot: string,
): Promise<WorkspaceFileManifest> {
  await assertRoadmapDirectoryContainsOnlyBaseline(workspaceRoot);
  const files = await enumerateManifestFiles(workspaceRoot, ['.roadmap/exercise-baseline.json']);
  if (
    files.some(
      (record) =>
        record.path === '.roadmap/exercise-baseline.json' || record.path.startsWith('.roadmap/'),
    )
  ) {
    throw pathError('Workspace control content leaked into learner inventory');
  }
  return { schemaVersion: 1, files };
}

export async function validateAuthoritativeManifest(
  stageRoot: string,
  sourceRoot: string,
  definition: ExerciseDefinition,
  options: { readonly excludedStagePaths: readonly string[] },
): Promise<void> {
  const authoritative = await deriveAuthoritativeManifest(sourceRoot, definition);
  const current = await enumerateManifestFiles(stageRoot, options.excludedStagePaths);
  if (!recordsMatch(authoritative.files, current)) {
    throw new ManifestError('Materialization stage does not match authoritative source content');
  }
}

function recordsMatch(
  left: readonly BaselineFileRecord[],
  right: readonly BaselineFileRecord[],
): boolean {
  return (
    left.length === right.length &&
    left.every((record, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        record.path === other.path &&
        record.bytes === other.bytes &&
        record.sha256 === other.sha256
      );
    })
  );
}

export function manifestsMatchExactly(
  left: ExerciseBaselineManifest,
  right: ExerciseBaselineManifest,
): boolean {
  try {
    const validatedLeft = parseManifest(left);
    const validatedRight = parseManifest(right);
    return (
      validatedLeft.exerciseId === validatedRight.exerciseId &&
      validatedLeft.exerciseVersion === validatedRight.exerciseVersion &&
      recordsMatch(validatedLeft.files, validatedRight.files)
    );
  } catch {
    return false;
  }
}

function workspaceDiagnostic(reason: string, observed: unknown): Diagnostic {
  return {
    code: 'EXERCISE_WORKSPACE_001',
    severity: 'error',
    location: { file: '.roadmap/exercise-baseline.json' },
    observed,
    expected: 'A baseline and learner inventory consistent with the authoritative exercise',
    reason,
    remediation:
      'Reopen the workspace only after restoring its released provenance and protected files.',
    documentation: 'Workspace provenance is checked before learner edits are accepted.',
  };
}

function recordByPath(records: readonly BaselineFileRecord[]): Map<string, BaselineFileRecord> {
  return new Map(records.map((record) => [record.path, record]));
}

export function compareManifestTriplet(
  authoritative: ExerciseBaselineManifest,
  cached: ExerciseBaselineManifest,
  current: WorkspaceFileManifest,
  editablePaths: readonly string[],
): ManifestComparisonResult {
  let validatedAuthoritative: ExerciseBaselineManifest;
  let validatedCached: ExerciseBaselineManifest;
  let validatedCurrent: WorkspaceFileManifest;
  try {
    validatedAuthoritative = parseManifest(authoritative);
    validatedCached = parseManifest(cached);
    validatedCurrent = parseWorkspaceManifest(current);
  } catch {
    return {
      ok: false,
      diagnostics: [
        workspaceDiagnostic('Workspace manifest structure is invalid', 'invalid-manifest'),
      ],
    };
  }
  if (!manifestsMatchExactly(validatedAuthoritative, validatedCached)) {
    return {
      ok: false,
      diagnostics: [workspaceDiagnostic('Cached exercise provenance is stale', 'stale-baseline')],
    };
  }
  const authoritativeByPath = recordByPath(validatedAuthoritative.files);
  const currentByPath = recordByPath(validatedCurrent.files);
  const changed = new Set<string>();
  for (const record of validatedAuthoritative.files) {
    const currentRecord = currentByPath.get(record.path);
    if (currentRecord === undefined) {
      if (!matchesEditablePath(record.path, editablePaths)) {
        return {
          ok: false,
          diagnostics: [workspaceDiagnostic('A protected learner file is missing', record.path)],
        };
      }
      changed.add(record.path);
      continue;
    }
    if (record.bytes !== currentRecord.bytes || record.sha256 !== currentRecord.sha256) {
      if (!matchesEditablePath(record.path, editablePaths)) {
        return {
          ok: false,
          diagnostics: [workspaceDiagnostic('A protected learner file changed', record.path)],
        };
      }
      changed.add(record.path);
    }
  }
  for (const record of validatedCurrent.files) {
    if (!authoritativeByPath.has(record.path)) {
      if (!matchesEditablePath(record.path, editablePaths)) {
        return {
          ok: false,
          diagnostics: [workspaceDiagnostic('Unexpected workspace content was found', record.path)],
        };
      }
      changed.add(record.path);
    }
  }
  return { ok: true, changed: [...changed].sort() };
}
