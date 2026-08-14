import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { normalizeRelativePath } from '@roadmap/exercise-contract';
import { failure, type ValidationOutcome } from '@roadmap/validation-core';
import { scanPublicationFiles } from './scan-files.js';

/**
 * Enumerates a complete generated tree and scans every regular file it contains.
 *
 * Symlink paths are collected and handed to `scanPublicationFiles`, whose `lstat`
 * produces `PUBLICATION_SYMLINK_001`. Enumeration deliberately does NOT descend
 * into a link: dereferencing it would walk outside the publication root and could
 * pull private bytes into a public scan report.
 *
 * Index-mode 160000 gitlink detection is NOT repeated here. It belongs to
 * `scanPublicationFiles`, which this function delegates to, so one gitlink produces
 * exactly one diagnostic and the check also reaches the source template root the
 * pipeline scans through that same entry point.
 */
export async function scanPublicationTree(
  rootInput: string | URL,
): Promise<ValidationOutcome<void>> {
  try {
    const root = await realpath(rootInput);
    const files: string[] = [];

    async function visit(current: string): Promise<void> {
      for (const entry of await readdir(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        const relative = normalizeRelativePath(path.relative(root, absolute));
        const metadata = await lstat(absolute);
        if (metadata.isSymbolicLink()) {
          files.push(relative);
          continue;
        }
        if (metadata.isDirectory()) await visit(absolute);
        if (metadata.isFile()) files.push(relative);
      }
    }

    await visit(root);
    return await scanPublicationFiles(root, files);
  } catch (error) {
    return failure([
      {
        code: 'PUBLICATION_INTERNAL_999',
        severity: 'error',
        location: { file: String(rootInput) },
        observed: error instanceof Error ? error.message : String(error),
        expected: 'Scanner completes normally',
        reason: 'Publication tree enumeration crashed',
        remediation: 'Treat the release as blocked and inspect the scanner failure',
        documentation: 'docs/maintainers/template-publication.md',
      },
    ]);
  }
}
