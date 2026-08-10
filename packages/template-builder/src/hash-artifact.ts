import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { normalizeRelativePath } from '@roadmap/exercise-contract';
import { TEMPLATE_MANIFEST_RELATIVE_PATH } from './manifest.js';

export interface GeneratedFileRecord {
  path: string;
  bytes: number;
  sha256: string;
}

export interface PublicationArtifact {
  root: string;
  files: readonly GeneratedFileRecord[];
  functionalSha256: string;
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) output.push(...(await listFiles(root, absolute)));
    if (entry.isFile()) output.push(normalizeRelativePath(path.relative(root, absolute)));
  }
  return output.sort();
}

export async function buildPublicationArtifact(root: string): Promise<PublicationArtifact> {
  const files: GeneratedFileRecord[] = [];
  const functionalHash = createHash('sha256');
  for (const relativePath of await listFiles(root)) {
    const bytes = await readFile(path.join(root, relativePath));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    files.push({ path: relativePath, bytes: bytes.byteLength, sha256 });
    // Release metadata is volatile by design; excluding it keeps the functional hash
    // stable across rebuilds while every learner-visible byte still contributes.
    if (relativePath !== TEMPLATE_MANIFEST_RELATIVE_PATH) {
      functionalHash.update(relativePath).update('\0').update(bytes).update('\0');
    }
  }
  return { root, files, functionalSha256: functionalHash.digest('hex') };
}
