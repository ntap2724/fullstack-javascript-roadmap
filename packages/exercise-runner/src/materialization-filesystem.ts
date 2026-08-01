import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import {
  enumerateManifestFiles,
  readBaselineManifest,
  type BaselineFileRecord,
} from './baseline-manifest.js';
import { isSafeRelativePath, normalizeRelativePath } from '@roadmap/exercise-contract';
import { WorkspacePathError } from './workspace-paths.js';

export type OutputState =
  'missing' | 'existing-empty' | 'matching-valid' | 'invalid' | 'non-empty-unknown';
export type OutputDiagnosticCode = 'EXERCISE_OUTPUT_002' | 'EXERCISE_OUTPUT_003';

export interface CleanupFailureDetail {
  readonly side: 'stage' | 'reservation';
  readonly message: string;
}

export class ExerciseOutputError extends Error {
  readonly diagnosticCode: OutputDiagnosticCode;
  readonly cleanupFailures?: readonly CleanupFailureDetail[];

  constructor(
    diagnosticCode: OutputDiagnosticCode,
    message: string,
    cleanupFailures?: readonly CleanupFailureDetail[],
  ) {
    super(message);
    this.name = 'ExerciseOutputError';
    this.diagnosticCode = diagnosticCode;
    if (cleanupFailures !== undefined) this.cleanupFailures = Object.freeze([...cleanupFailures]);
  }
}

export interface OwnedStage {
  readonly root: string;
  readonly ownershipToken: string;
  readonly controlPaths: readonly string[];
}

export interface OwnedReservation {
  readonly root: string;
  readonly ownershipToken: string;
  readonly expectedInventory: readonly string[];
  readonly controlPaths: readonly string[];
}

export interface OwnedCleanupOptions {
  readonly requireOwnershipToken: true;
  readonly refuseUnexpectedContent: true;
  readonly allowPartialOwnedInventory: true;
}

export interface MaterializeFilesystemAdapter {
  inspectOutputState(target: string): Promise<OutputState>;
  createOwnedStage(
    parent: string,
    prefix: string,
    starterRoot: string,
    openTestsRoot: string,
  ): Promise<OwnedStage>;
  reserveMissingDirectory(
    target: string,
    expectedInventory: readonly string[],
  ): Promise<OwnedReservation>;
  populateReservedDirectory(
    stage: OwnedStage,
    reservation: OwnedReservation,
    options: {
      readonly noOverwrite: true;
      readonly sourceControlPaths: readonly string[];
      readonly targetControlPaths: readonly string[];
    },
  ): Promise<void>;
  validateOwnedInventory(reservation: OwnedReservation): Promise<void>;
  removeOwnedStage(
    stage: OwnedStage,
    expectedInventory: readonly string[],
    options: { readonly controlPaths: readonly string[] },
  ): Promise<void>;
  finalizeOwnedReservation(
    reservation: OwnedReservation,
    options: {
      readonly expectedInventory: readonly string[];
      readonly controlPaths: readonly string[];
    },
  ): Promise<void>;
  cleanupOwnedMaterialization(
    stage: OwnedStage | undefined,
    reservation: OwnedReservation | undefined,
    options: OwnedCleanupOptions,
  ): Promise<void>;
}

const STAGE_TOKEN_PATH = '.roadmap/stage-ownership-token';
const RESERVATION_TOKEN_PATH = '.roadmap/reservation-ownership-token';
const BASELINE_PATH = '.roadmap/exercise-baseline.json';

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function outputFailure(message: string): ExerciseOutputError {
  return new ExerciseOutputError('EXERCISE_OUTPUT_003', message);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function foldPath(value: string): string {
  return value.toLowerCase();
}

async function targetHasReparseAlias(target: string): Promise<boolean> {
  try {
    const information = await lstat(target);
    if (information.isSymbolicLink() || (!information.isDirectory() && !information.isFile())) {
      return true;
    }
    const canonical = await realpath(target);
    const lexical = path.resolve(target);
    return process.platform === 'win32'
      ? canonical.toLowerCase() !== lexical.toLowerCase()
      : canonical !== lexical;
  } catch {
    return true;
  }
}

function snapshotPaths(value: readonly string[], label: string): readonly string[] {
  const candidate: unknown = value;
  if (!Array.isArray(candidate)) throw outputFailure(`${label} must be a dense array`);
  const indexed: readonly unknown[] = candidate;
  const snapshot: string[] = [];
  for (let index = 0; index < indexed.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(indexed, index)) {
      throw outputFailure(`${label} must be a dense array`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(indexed, String(index));
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
      throw outputFailure(`${label} cannot contain accessors`);
    }
    const pathValue = indexed[index];
    if (
      typeof pathValue !== 'string' ||
      !isSafeRelativePath(pathValue) ||
      normalizeRelativePath(pathValue) !== pathValue
    ) {
      throw outputFailure(`${label} contains an unsafe path`);
    }
    snapshot.push(pathValue);
  }
  return snapshot;
}

function validateDisjointPathSets(
  expectedInventoryInput: readonly string[],
  controlPathsInput: readonly string[],
): { readonly expectedInventory: readonly string[]; readonly controlPaths: readonly string[] } {
  const expectedInventory = snapshotPaths(expectedInventoryInput, 'Expected inventory');
  const controlPaths = snapshotPaths(controlPathsInput, 'Control paths');
  const expected = new Set<string>();
  const folded = new Set<string>();
  for (const value of expectedInventory) {
    const foldedValue = foldPath(value);
    if (expected.has(value) || folded.has(foldedValue)) {
      throw outputFailure('Expected inventory contains duplicate or case-alias paths');
    }
    expected.add(value);
    folded.add(foldedValue);
  }
  for (const value of controlPaths) {
    const foldedValue = foldPath(value);
    if (expected.has(value) || folded.has(foldedValue)) {
      throw outputFailure('Expected inventory and controls must be disjoint');
    }
    folded.add(foldedValue);
  }
  return { expectedInventory, controlPaths };
}

interface OwnedEntry {
  readonly path: string;
  readonly kind: 'file' | 'directory';
}

async function collectOwnedEntries(root: string): Promise<readonly OwnedEntry[]> {
  const entries: OwnedEntry[] = [];
  async function walk(current: string, prefix: string): Promise<void> {
    let children;
    try {
      children = await readdir(current, { withFileTypes: true });
    } catch {
      throw outputFailure('Owned filesystem content could not be inspected');
    }
    children.sort((left, right) => compareCodeUnits(left.name, right.name));
    for (const child of children) {
      const relativePath = prefix.length === 0 ? child.name : `${prefix}/${child.name}`;
      if (
        !isSafeRelativePath(relativePath) ||
        normalizeRelativePath(relativePath) !== relativePath
      ) {
        throw outputFailure('Owned filesystem path is unsafe');
      }
      const absolutePath = path.join(current, child.name);
      let information;
      try {
        information = await lstat(absolutePath);
      } catch {
        throw outputFailure('Owned filesystem content could not be inspected');
      }
      if (child.isSymbolicLink() || information.isSymbolicLink()) {
        throw outputFailure('Owned cleanup refuses reparse or symbolic-link content');
      }
      if (information.isDirectory()) {
        entries.push({ path: relativePath, kind: 'directory' });
        await walk(absolutePath, relativePath);
      } else if (information.isFile()) {
        entries.push({ path: relativePath, kind: 'file' });
      } else {
        throw outputFailure('Owned filesystem contains an unsupported entry');
      }
    }
  }
  await walk(root, '');
  return entries;
}

function allowedDirectories(files: readonly string[]): Set<string> {
  const directories = new Set<string>();
  for (const file of files) {
    const segments = file.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join('/'));
    }
  }
  return directories;
}

async function proveOwnedRoot(
  root: string,
  token: string,
  controlPaths: readonly string[],
  expectedInventory: readonly string[],
  options: { readonly allowPartial: boolean; readonly allowMissing: boolean },
): Promise<void> {
  let information;
  try {
    information = await lstat(root);
  } catch (error) {
    if (isMissing(error)) {
      if (options.allowMissing) return;
      throw outputFailure('Owned root is missing');
    }
    throw outputFailure('Owned root could not be inspected');
  }
  if (!information.isDirectory() || information.isSymbolicLink()) {
    throw outputFailure('Owned root is not a safe directory');
  }
  const validated = validateDisjointPathSets(expectedInventory, controlPaths);
  const controlSet = new Set(validated.controlPaths);
  const expectedSet = new Set(validated.expectedInventory);
  const tokenFiles = validated.controlPaths.filter((value) => value.endsWith('ownership-token'));
  if (tokenFiles.length !== 1) throw outputFailure('Owned token boundary is invalid');
  let tokenText: string;
  try {
    tokenText = await readFile(path.join(root, tokenFiles[0] ?? ''), 'utf8');
  } catch {
    throw outputFailure('Owned token could not be read');
  }
  if (tokenText !== token) throw outputFailure('Owned token did not match');

  const entries = await collectOwnedEntries(root);
  const allowedFiles = new Set([...expectedSet, ...controlSet]);
  const allowedDirs = allowedDirectories([...allowedFiles]);
  const actualFiles = new Set<string>();
  for (const entry of entries) {
    if (entry.kind === 'file') {
      if (!allowedFiles.has(entry.path))
        throw outputFailure('Unexpected owned file content was found');
      actualFiles.add(entry.path);
    } else if (!allowedDirs.has(entry.path)) {
      throw outputFailure('Unexpected owned directory content was found');
    }
  }
  for (const control of controlSet) {
    if (!actualFiles.has(control)) throw outputFailure('Owned control content is missing');
  }
  if (!options.allowPartial) {
    for (const expected of expectedSet) {
      if (!actualFiles.has(expected)) throw outputFailure('Owned inventory is incomplete');
    }
  }
}

async function removeProvenOwnedRoot(
  root: string,
  token: string,
  controlPaths: readonly string[],
  expectedInventory: readonly string[],
): Promise<void> {
  await proveOwnedRoot(root, token, controlPaths, expectedInventory, {
    allowPartial: true,
    allowMissing: true,
  });
  try {
    await rm(root, { recursive: true, force: false });
  } catch {
    throw outputFailure('Owned cleanup could not remove the proven root');
  }
}

function isWithinCanonical(base: string, candidate: string): boolean {
  const comparableBase = process.platform === 'win32' ? base.toLowerCase() : base;
  const comparableCandidate = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
  const relative = path.relative(comparableBase, comparableCandidate);
  return (
    relative.length === 0 ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

async function ensureDestinationParent(root: string, relativeFile: string): Promise<void> {
  if (!isSafeRelativePath(relativeFile) || normalizeRelativePath(relativeFile) !== relativeFile) {
    throw outputFailure('Destination path is not a safe concrete path');
  }
  let rootInformation;
  try {
    rootInformation = await lstat(root);
  } catch {
    throw outputFailure('Destination root could not be inspected');
  }
  if (!rootInformation.isDirectory() || rootInformation.isSymbolicLink()) {
    throw outputFailure('Destination root is not a real directory');
  }
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(root);
  } catch {
    throw outputFailure('Destination root could not be resolved');
  }
  const parentSegments = path.posix.dirname(relativeFile).split('/');
  if (parentSegments.length === 1 && parentSegments[0] === '.') return;
  let current = root;
  for (const segment of parentSegments) {
    if (segment === '.') continue;
    current = path.join(current, segment);
    try {
      const information = await lstat(current);
      if (!information.isDirectory() || information.isSymbolicLink()) {
        throw outputFailure('Destination parent is a reparse or unsupported entry');
      }
      const canonical = await realpath(current);
      if (!isWithinCanonical(canonicalRoot, canonical)) {
        throw outputFailure('Destination parent escapes the owned root');
      }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      try {
        await mkdir(current);
        const created = await lstat(current);
        const canonical = await realpath(current);
        if (
          !created.isDirectory() ||
          created.isSymbolicLink() ||
          !isWithinCanonical(canonicalRoot, canonical)
        ) {
          throw outputFailure('Destination parent could not be created safely');
        }
      } catch (creationError) {
        if (creationError instanceof ExerciseOutputError) throw creationError;
        throw outputFailure('Destination parent could not be created safely');
      }
    }
  }
}

async function copySourceTree(
  sourceRoot: string,
  stageRoot: string,
  records: readonly BaselineFileRecord[],
  destinationPrefix: string,
): Promise<readonly BaselineFileRecord[]> {
  for (const record of records) {
    const destinationRelative =
      destinationPrefix.length === 0 ? record.path : `${destinationPrefix}/${record.path}`;
    if (
      !isSafeRelativePath(destinationRelative) ||
      normalizeRelativePath(destinationRelative) !== destinationRelative ||
      destinationRelative === STAGE_TOKEN_PATH
    ) {
      throw new WorkspacePathError(
        'EXERCISE_PATH_001',
        'Source content conflicts with stage controls',
      );
    }
    const destination = path.join(stageRoot, destinationRelative);
    await ensureDestinationParent(stageRoot, destinationRelative);
    try {
      await copyFile(
        path.join(sourceRoot, ...record.path.split('/')),
        destination,
        constants.COPYFILE_EXCL,
      );
    } catch {
      throw new WorkspacePathError(
        'EXERCISE_PATH_001',
        'Source content could not be copied safely',
      );
    }
  }
  return records.map((record) => ({
    ...record,
    path: destinationPrefix.length === 0 ? record.path : `${destinationPrefix}/${record.path}`,
  }));
}

function newToken(): string {
  return randomBytes(16).toString('hex');
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

function productionAdapter(): MaterializeFilesystemAdapter {
  const stageExpectedInventory = new Map<string, readonly string[]>();

  const inspectOutputState = async (target: string): Promise<OutputState> => {
    let information;
    try {
      information = await lstat(target);
    } catch (error) {
      if (isMissing(error)) return 'missing';
      throw outputFailure('Exercise output could not be inspected');
    }
    if (information.isSymbolicLink() || !information.isDirectory()) return 'invalid';
    let entries;
    try {
      entries = await readdir(target);
    } catch {
      throw outputFailure('Exercise output could not be inspected');
    }
    if (entries.length === 0) return 'existing-empty';
    const baselinePath = path.join(target, ...BASELINE_PATH.split('/'));
    let baselineInformation;
    try {
      baselineInformation = await lstat(baselinePath);
    } catch (error) {
      if (isMissing(error)) {
        const roadmapPath = path.join(target, '.roadmap');
        try {
          const roadmapInformation = await lstat(roadmapPath);
          if (!roadmapInformation.isDirectory() || roadmapInformation.isSymbolicLink()) {
            return 'invalid';
          }
          const roadmapEntries = await readdir(roadmapPath);
          if (roadmapEntries.length > 0) return 'invalid';
        } catch (roadmapError) {
          if (!isMissing(roadmapError)) return 'invalid';
        }
        return 'non-empty-unknown';
      }
      return 'invalid';
    }
    if (!baselineInformation.isFile() || baselineInformation.isSymbolicLink()) return 'invalid';
    let baseline;
    try {
      baseline = await readBaselineManifest(baselinePath);
    } catch {
      return 'invalid';
    }
    try {
      const current = await enumerateManifestFiles(target, [BASELINE_PATH]);
      return recordsMatch(baseline.files, current) ? 'matching-valid' : 'non-empty-unknown';
    } catch {
      return 'invalid';
    }
  };

  const createOwnedStage = async (
    parent: string,
    prefix: string,
    starterRoot: string,
    openTestsRoot: string,
  ): Promise<OwnedStage> => {
    const starterRecords = await enumerateManifestFiles(starterRoot);
    const openRecords = await enumerateManifestFiles(openTestsRoot);
    const mappedOpenRecords = openRecords.map((record) => ({
      ...record,
      path: `test/open/${record.path}`,
    }));
    const expectedInventory = [
      ...starterRecords.map((record) => record.path),
      ...mappedOpenRecords.map((record) => record.path),
      BASELINE_PATH,
    ];
    try {
      validateDisjointPathSets(expectedInventory, [STAGE_TOKEN_PATH]);
    } catch {
      throw new WorkspacePathError('EXERCISE_PATH_001', 'Mapped exercise paths collide');
    }
    let root: string;
    try {
      root = await mkdtemp(path.join(parent, prefix));
    } catch {
      throw outputFailure('Owned stage could not be created');
    }
    const token = newToken();
    const controlPaths = [STAGE_TOKEN_PATH];
    stageExpectedInventory.set(root, expectedInventory);
    try {
      await ensureDestinationParent(root, STAGE_TOKEN_PATH);
      await writeFile(path.join(root, STAGE_TOKEN_PATH), token, { encoding: 'utf8', flag: 'wx' });
      await copySourceTree(starterRoot, root, starterRecords, '');
      await copySourceTree(openTestsRoot, root, openRecords, 'test/open');
      return { root, ownershipToken: token, controlPaths };
    } catch (error) {
      try {
        await removeProvenOwnedRoot(root, token, controlPaths, expectedInventory);
      } catch {
        throw outputFailure('Owned stage cleanup could not be proven after creation failure');
      }
      throw error;
    }
  };

  const reserveMissingDirectory = async (
    target: string,
    expectedInventory: readonly string[],
  ): Promise<OwnedReservation> => {
    const validated = validateDisjointPathSets(expectedInventory, [RESERVATION_TOKEN_PATH]);
    try {
      await mkdir(target);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
        const uncertain = await targetHasReparseAlias(target);
        if (uncertain) throw outputFailure('Exercise output alias could not be classified safely');
        throw new ExerciseOutputError(
          'EXERCISE_OUTPUT_002',
          'Exercise output appeared during exclusive reservation',
        );
      }
      throw outputFailure('Exercise output could not be exclusively reserved');
    }
    const token = newToken();
    const controlPaths = [RESERVATION_TOKEN_PATH];
    try {
      await ensureDestinationParent(target, RESERVATION_TOKEN_PATH);
      await writeFile(path.join(target, RESERVATION_TOKEN_PATH), token, {
        encoding: 'utf8',
        flag: 'wx',
      });
      return {
        root: target,
        ownershipToken: token,
        expectedInventory: [...validated.expectedInventory],
        controlPaths,
      };
    } catch {
      try {
        await removeProvenOwnedRoot(target, token, controlPaths, validated.expectedInventory);
      } catch {
        throw outputFailure('Reservation cleanup could not be proven after reservation failure');
      }
      throw outputFailure('Exercise output reservation could not be initialized');
    }
  };

  const populateReservedDirectory = async (
    stage: OwnedStage,
    reservation: OwnedReservation,
    options: {
      readonly noOverwrite: true;
      readonly sourceControlPaths: readonly string[];
      readonly targetControlPaths: readonly string[];
    },
  ): Promise<void> => {
    const runtimeOptions: unknown = options;
    if (!isRecord(runtimeOptions) || runtimeOptions.noOverwrite !== true) {
      throw outputFailure('Population must require no-overwrite semantics');
    }
    const sourceControls = new Set(snapshotPaths(options.sourceControlPaths, 'Source controls'));
    const targetControls = new Set(snapshotPaths(options.targetControlPaths, 'Target controls'));
    for (const relativePath of reservation.expectedInventory) {
      if (sourceControls.has(relativePath) || targetControls.has(relativePath)) continue;
      if (!isSafeRelativePath(relativePath) || normalizeRelativePath(relativePath) !== relativePath)
        throw outputFailure('Population inventory contains an unsafe path');
      const source = path.join(stage.root, ...relativePath.split('/'));
      const destination = path.join(reservation.root, ...relativePath.split('/'));
      try {
        await ensureDestinationParent(reservation.root, relativePath);
        await copyFile(source, destination, constants.COPYFILE_EXCL);
      } catch {
        throw outputFailure('Reserved exercise output could not be populated safely');
      }
    }
  };

  const validateOwnedInventory = async (reservation: OwnedReservation): Promise<void> => {
    await proveOwnedRoot(
      reservation.root,
      reservation.ownershipToken,
      reservation.controlPaths,
      reservation.expectedInventory,
      { allowPartial: false, allowMissing: false },
    );
  };

  const removeOwnedStage = async (
    stage: OwnedStage,
    expectedInventory: readonly string[],
    options: { readonly controlPaths: readonly string[] },
  ): Promise<void> => {
    await proveOwnedRoot(
      stage.root,
      stage.ownershipToken,
      options.controlPaths,
      expectedInventory,
      { allowPartial: false, allowMissing: false },
    );
    try {
      await rm(stage.root, { recursive: true, force: false });
    } catch {
      throw outputFailure('Owned stage could not be removed');
    }
    stageExpectedInventory.delete(stage.root);
  };

  const finalizeOwnedReservation = async (
    reservation: OwnedReservation,
    options: {
      readonly expectedInventory: readonly string[];
      readonly controlPaths: readonly string[];
    },
  ): Promise<void> => {
    await proveOwnedRoot(
      reservation.root,
      reservation.ownershipToken,
      options.controlPaths,
      options.expectedInventory,
      { allowPartial: false, allowMissing: false },
    );
    for (const controlPath of options.controlPaths) {
      try {
        await rm(path.join(reservation.root, ...controlPath.split('/')), { force: false });
      } catch {
        throw outputFailure('Reservation control finalization failed');
      }
    }
  };

  const cleanupOwnedMaterialization = async (
    stage: OwnedStage | undefined,
    reservation: OwnedReservation | undefined,
    options: OwnedCleanupOptions,
  ): Promise<void> => {
    const runtimeOptions: unknown = options;
    if (
      !isRecord(runtimeOptions) ||
      runtimeOptions.requireOwnershipToken !== true ||
      runtimeOptions.refuseUnexpectedContent !== true ||
      runtimeOptions.allowPartialOwnedInventory !== true
    ) {
      throw outputFailure('Owned cleanup must retain every fail-closed ownership guard');
    }
    const failures: CleanupFailureDetail[] = [];
    if (stage !== undefined) {
      try {
        await removeProvenOwnedRoot(
          stage.root,
          stage.ownershipToken,
          stage.controlPaths,
          stageExpectedInventory.get(stage.root) ?? [],
        );
        stageExpectedInventory.delete(stage.root);
      } catch {
        failures.push({ side: 'stage', message: 'Owned stage content was not proven for cleanup' });
      }
    }
    if (reservation !== undefined) {
      try {
        await removeProvenOwnedRoot(
          reservation.root,
          reservation.ownershipToken,
          reservation.controlPaths,
          reservation.expectedInventory,
        );
      } catch {
        failures.push({
          side: 'reservation',
          message: 'Owned reservation content was not proven for cleanup',
        });
      }
    }
    if (failures.length > 0) {
      throw new ExerciseOutputError(
        'EXERCISE_OUTPUT_003',
        'Owned materialization cleanup refused unproven content',
        failures,
      );
    }
  };

  return {
    inspectOutputState,
    createOwnedStage,
    reserveMissingDirectory,
    populateReservedDirectory,
    validateOwnedInventory,
    removeOwnedStage,
    finalizeOwnedReservation,
    cleanupOwnedMaterialization,
  };
}

export function createProductionMaterializeFilesystemAdapter(): MaterializeFilesystemAdapter {
  return productionAdapter();
}
