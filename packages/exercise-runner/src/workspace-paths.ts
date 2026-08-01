import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

export type WorkspacePathErrorCode = 'EXERCISE_PATH_001' | 'EXERCISE_OUTPUT_001';

export class WorkspacePathError extends Error {
  readonly code: WorkspacePathErrorCode;

  constructor(code: WorkspacePathErrorCode, message: string) {
    super(message);
    this.name = 'WorkspacePathError';
    this.code = code;
  }
}

function comparable(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isWithinOrEqual(base: string, candidate: string): boolean {
  const relative = path.relative(comparable(base), comparable(candidate));
  return (
    relative.length === 0 ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

interface ExistingAncestor {
  readonly lexical: string;
  readonly canonical: string;
}

function isReparseAlias(lexical: string, canonical: string): boolean {
  return comparable(lexical) !== comparable(canonical);
}

/** Rejects a public source root whose lexical path is itself a reparse alias. */
export async function assertSourceRootIsReal(lexicalSourceRoot: string): Promise<void> {
  const lexical = path.resolve(lexicalSourceRoot);
  let information;
  try {
    information = await lstat(lexical);
  } catch {
    throw new WorkspacePathError('EXERCISE_PATH_001', 'Exercise source could not be inspected');
  }
  if (!information.isDirectory() || information.isSymbolicLink()) {
    throw new WorkspacePathError('EXERCISE_PATH_001', 'Exercise source must be a real directory');
  }
  let canonical: string;
  try {
    canonical = await realpath(lexical);
  } catch {
    throw new WorkspacePathError('EXERCISE_PATH_001', 'Exercise source could not be resolved');
  }
  if (isReparseAlias(lexical, canonical)) {
    throw new WorkspacePathError('EXERCISE_PATH_001', 'Exercise source cannot be a reparse alias');
  }
}

async function findExistingAncestor(target: string): Promise<ExistingAncestor> {
  let cursor = path.resolve(target);
  while (cursor.length > 0) {
    try {
      const information = await lstat(cursor);
      if (information.isSymbolicLink()) {
        throw new WorkspacePathError(
          'EXERCISE_OUTPUT_001',
          'Exercise output cannot use a symbolic-link or junction ancestor',
        );
      }
      const canonical = await realpath(cursor);
      if (isReparseAlias(cursor, canonical)) {
        throw new WorkspacePathError(
          'EXERCISE_OUTPUT_001',
          'Exercise output cannot use a reparse-point ancestor',
        );
      }
      return { lexical: cursor, canonical };
    } catch (error) {
      if (error instanceof WorkspacePathError) throw error;
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        throw new WorkspacePathError('EXERCISE_PATH_001', 'Workspace path could not be inspected');
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) {
        throw new WorkspacePathError('EXERCISE_PATH_001', 'Workspace path has no existing parent');
      }
      cursor = parent;
    }
  }
  throw new WorkspacePathError('EXERCISE_PATH_001', 'Workspace path has no existing parent');
}

/** Ensures the source and output cannot alias, nest, or cross a reparse boundary. */
export async function assertSourceOutputAreDisjoint(
  canonicalSourceRoot: string,
  outputRoot: string,
): Promise<void> {
  let source: string;
  try {
    source = await realpath(canonicalSourceRoot);
  } catch {
    throw new WorkspacePathError('EXERCISE_PATH_001', 'Exercise source could not be resolved');
  }

  const sourceAbsolute = comparable(source);
  const outputAbsolute = comparable(outputRoot);
  if (
    isWithinOrEqual(sourceAbsolute, outputAbsolute) ||
    isWithinOrEqual(outputAbsolute, sourceAbsolute)
  ) {
    throw new WorkspacePathError(
      'EXERCISE_OUTPUT_001',
      'Exercise source and output must be disjoint',
    );
  }

  let ancestor: ExistingAncestor;
  try {
    ancestor = await findExistingAncestor(outputAbsolute);
  } catch (error) {
    if (error instanceof WorkspacePathError) throw error;
    throw new WorkspacePathError('EXERCISE_PATH_001', 'Workspace output could not be inspected');
  }

  const missingSuffix = path.relative(ancestor.lexical, outputAbsolute);
  const canonicalCandidate = path.resolve(
    ancestor.canonical,
    missingSuffix.length === 0 ? '.' : missingSuffix,
  );
  if (
    isWithinOrEqual(sourceAbsolute, canonicalCandidate) ||
    isWithinOrEqual(canonicalCandidate, sourceAbsolute)
  ) {
    throw new WorkspacePathError(
      'EXERCISE_OUTPUT_001',
      'Exercise source and output must be disjoint',
    );
  }
}
