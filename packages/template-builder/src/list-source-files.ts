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
 * Lists the files Git considers part of the repository at `root`: tracked files
 * plus intentional new files that are not ignored. Returns `null` when `root` is
 * not inside a Git work tree, which is a capability answer rather than a failure —
 * the builder's own unit fixtures are plain scratch directories.
 *
 * A failure *after* Git has confirmed a work tree is a real error and propagates,
 * so a broken Git invocation can never be mistaken for "this template has no
 * repository-owned files".
 */
export async function listRepositoryFiles(root: string): Promise<readonly string[] | null> {
  try {
    await run('git', ['-C', root, 'rev-parse', '--is-inside-work-tree']);
  } catch {
    return null;
  }
  const { stdout } = await run(
    'git',
    ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  return stdout.split('\0').filter((entry) => entry.length > 0);
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
    } catch {
      // Git can list a path that was deleted after enumeration; a vanished
      // candidate is simply not publication input.
      continue;
    }
    if (metadata.isSymbolicLink()) {
      throw new Error(`TEMPLATE_SYMLINK_001:${relativePath}`);
    }
    if (metadata.isFile()) output.push({ absolutePath, relativePath });
  }

  return output.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}
