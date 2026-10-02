import { execFile } from 'node:child_process';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { normalizeRelativePath } from '@roadmap/exercise-contract';

const run = promisify(execFile);

export interface SourceFileEntry {
  absolutePath: string;
  relativePath: string;
}

/**
 * Directory names that are dependency trees or build output. They are never part
 * of a published starter, and enumerating them is actively harmful: a template's
 * `files/` directory is a real workspace, so running the starter's own commands
 * there leaves `node_modules` (hundreds of symlinks) and `dist` behind. Those
 * artifacts are git-ignored, so a clean `git status` says nothing about them.
 *
 * Pruning them is not a relaxation of the symlink control. The control exists to
 * stop a *published* path from pointing outside the publication root; a directory
 * that can never be published has no such path to protect.
 */
export const neverPublishedDirectories: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.pnpm-store',
  '.turbo',
]);

function hasNeverPublishedSegment(relativePath: string): boolean {
  return relativePath.split('/').some((segment) => neverPublishedDirectories.has(segment));
}

/**
 * Environment variables that relocate Git's idea of the repository or its index.
 * With any of them set, `git -C <templateRoot>` answers about a repository — or an
 * index — the template root has nothing to do with, so publication input would be
 * decided by ambient environment rather than by the template. That is refused
 * rather than reconciled: trusting the answer publishes another tree's file list,
 * and falling back to the walk publishes whatever is on disk.
 */
const gitLocationOverrides = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
] as const;

function activeGitLocationOverride(): string | null {
  for (const name of gitLocationOverrides) {
    const value = process.env[name];
    if (typeof value === 'string' && value.length > 0) return name;
  }
  return null;
}

function isMissingPath(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error;
    return code === 'ENOENT' || code === 'ENOTDIR';
  }
  return false;
}

/**
 * Locates the `.git` entry governing `root`, walking upward the way Git itself
 * discovers a repository. A directory (normal clone) and a file (linked worktree)
 * both count.
 *
 * This is a *structural* capability answer, deliberately not a reading of Git's
 * error text: message wording is localized and version-dependent, so classifying
 * failures by string would silently turn a translated "dubious ownership" error
 * into "this template has no repository-owned files".
 *
 * Only a genuinely absent path continues the walk. Any other `lstat` failure —
 * a permission problem on an ancestor, for instance — is reported, because
 * treating it as absence is how a real repository would get mistaken for none.
 */
async function discoverGitEntry(root: string): Promise<string | null> {
  let current = path.resolve(root);
  for (;;) {
    const candidate = path.join(current, '.git');
    try {
      await lstat(candidate);
      return candidate;
    } catch (error) {
      if (!isMissingPath(error)) {
        throw new Error(
          `TEMPLATE_INPUT_001:${root}:cannot determine whether ${candidate} exists (${describeFailure(error)})`,
          { cause: error },
        );
      }
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
}

function describeFailure(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    const { stderr } = error;
    if (typeof stderr === 'string' && stderr.trim().length > 0) return stderr.trim();
  }
  return error instanceof Error ? error.message : 'unknown failure';
}

/**
 * Lists the files Git considers part of the repository at `root`: tracked files
 * plus intentional new files that are not ignored.
 *
 * Returns `null` only when no `.git` entry governs `root` at all. That is a
 * capability answer rather than a failure — the builder's own unit fixtures are
 * plain scratch directories — and it is the single documented path to the raw
 * filesystem walk.
 *
 * When a repository *is* present, Git must succeed. Dubious ownership, malformed
 * configuration, a missing or unrunnable `git`, and permission failures all raise
 * TEMPLATE_INPUT_001 instead of degrading to the walk, because a fallback there
 * would publish whatever happens to be on disk while looking like a normal run.
 */
export async function listRepositoryFiles(root: string): Promise<readonly string[] | null> {
  const override = activeGitLocationOverride();
  if (override !== null) {
    throw new Error(
      `TEMPLATE_INPUT_001:${root}:${override} is set, so Git would answer about a repository other than the template root`,
    );
  }
  if ((await discoverGitEntry(root)) === null) return null;

  let insideWorkTree: string;
  try {
    const probe = await run('git', ['-C', root, 'rev-parse', '--is-inside-work-tree']);
    insideWorkTree = probe.stdout.trim();
  } catch (error) {
    throw new Error(`TEMPLATE_INPUT_001:${root}:${describeFailure(error)}`, { cause: error });
  }
  if (insideWorkTree !== 'true') {
    throw new Error(
      `TEMPLATE_INPUT_001:${root}:a .git entry is present but the path is not inside a work tree (rev-parse reported "${insideWorkTree}")`,
    );
  }

  try {
    const { stdout } = await run(
      'git',
      ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    return stdout.split('\0').filter((entry) => entry.length > 0);
  } catch (error) {
    throw new Error(`TEMPLATE_INPUT_001:${root}:${describeFailure(error)}`, { cause: error });
  }
}

async function walk(root: string, current: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolutePath = path.join(current, entry.name);
    const relativePath = normalizeRelativePath(path.relative(root, absolutePath));
    const metadata = await lstat(absolutePath);
    if (metadata.isDirectory()) {
      if (neverPublishedDirectories.has(entry.name)) continue;
      output.push(...(await walk(root, absolutePath)));
      continue;
    }
    if (metadata.isSymbolicLink() || metadata.isFile()) output.push(relativePath);
  }
  return output;
}

/**
 * Enumerates publication input for `root`.
 *
 * Membership is decided by the repository, not by whatever happens to be on disk.
 * Every candidate is then `lstat`ed so a repository-owned symlink still fails
 * closed with TEMPLATE_SYMLINK_001 before it can reach selection.
 */
export async function listSourceFiles(root: string): Promise<readonly SourceFileEntry[]> {
  const repositoryFiles = await listRepositoryFiles(root);
  const candidates = repositoryFiles ?? (await walk(root, root));

  const output: SourceFileEntry[] = [];
  for (const candidate of candidates) {
    const relativePath = normalizeRelativePath(candidate);
    // Defense in depth: Git already excludes ignored artifacts and the walk prunes
    // them, so reaching here means one of those inputs regressed. Fail closed
    // rather than publish build output.
    if (hasNeverPublishedSegment(relativePath)) {
      throw new Error(`TEMPLATE_GENERATED_001:${relativePath}`);
    }
    const absolutePath = path.join(root, relativePath);
    let metadata;
    try {
      metadata = await lstat(absolutePath);
    } catch (error) {
      // Git can list a path that was deleted after enumeration; only that
      // disappearance race is safe to ignore. Permission and I/O failures must
      // fail closed rather than silently dropping publication input.
      if (isMissingPath(error)) continue;
      throw new Error(`TEMPLATE_INPUT_001:${relativePath}:cannot inspect publication input`, {
        cause: error,
      });
    }
    if (metadata.isSymbolicLink()) {
      throw new Error(`TEMPLATE_SYMLINK_001:${relativePath}`);
    }
    if (!metadata.isFile()) {
      throw new Error(
        `TEMPLATE_INPUT_002:${relativePath}:publication input must be a regular file`,
      );
    }
    output.push({ absolutePath, relativePath });
  }

  return output.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}
