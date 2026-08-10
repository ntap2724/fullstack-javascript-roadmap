import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { normalizeRelativePath } from '@roadmap/exercise-contract';

export interface SourceFileEntry {
  absolutePath: string;
  relativePath: string;
}

export async function listSourceFiles(
  root: string,
  current = root,
): Promise<readonly SourceFileEntry[]> {
  const output: SourceFileEntry[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolutePath = path.join(current, entry.name);
    const metadata = await lstat(absolutePath);
    if (metadata.isSymbolicLink()) {
      throw new Error(
        `TEMPLATE_SYMLINK_001:${normalizeRelativePath(path.relative(root, absolutePath))}`,
      );
    }
    if (metadata.isDirectory()) output.push(...(await listSourceFiles(root, absolutePath)));
    if (metadata.isFile()) {
      output.push({
        absolutePath,
        relativePath: normalizeRelativePath(path.relative(root, absolutePath)),
      });
    }
  }
  return output.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}
