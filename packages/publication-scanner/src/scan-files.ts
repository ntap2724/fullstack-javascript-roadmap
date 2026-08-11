import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { isSafeRelativePath, normalizeRelativePath } from '@roadmap/exercise-contract';
import {
  failure,
  success,
  type Diagnostic,
  type ValidationOutcome,
} from '@roadmap/validation-core';
import { contentDiagnostics, MAX_SCANNABLE_FILE_BYTES } from './scan-content.js';
import { pathDiagnostic } from './scan-path.js';

async function scanOne(
  root: string,
  relativeInput: string,
  diagnostics: Diagnostic[],
): Promise<void> {
  const relative = normalizeRelativePath(relativeInput);
  if (!isSafeRelativePath(relative)) throw new Error(`Unsafe selected path: ${relativeInput}`);
  const absolute = path.resolve(root, relative);
  const relationship = path.relative(root, absolute);
  if (
    relationship === '..' ||
    relationship.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relationship)
  ) {
    throw new Error(`Selected path escapes root: ${relative}`);
  }

  // lstat, never stat: a symlink must be reported as itself rather than silently
  // resolved to whatever it points at, which may lie outside the publication root.
  const metadata = await lstat(absolute);
  if (metadata.isSymbolicLink()) {
    diagnostics.push({
      code: 'PUBLICATION_SYMLINK_001',
      severity: 'error',
      location: { file: relative },
      observed: relative,
      expected: 'A regular file',
      reason: 'Symlinks can escape the publication root or conceal selected bytes',
      remediation: 'Replace the symlink with an explicit public file or remove it',
      documentation: 'docs/maintainers/template-publication.md',
    });
    return;
  }
  // The checks above are lexical and cover the FINAL component only. Neither sees an
  // ANCESTOR that is a symlink: `files/linkdir/benign.md` is a safe-looking relative
  // path whose real bytes may live anywhere on disk. `realpath` resolves every
  // component, and `root` is itself already realpath-resolved by the caller, so the
  // two sides are compared in the same namespace.
  const realAbsolute = await realpath(absolute);
  const realRelationship = path.relative(root, realAbsolute);
  if (
    realRelationship === '..' ||
    realRelationship.startsWith(`..${path.sep}`) ||
    path.isAbsolute(realRelationship)
  ) {
    diagnostics.push({
      code: 'PUBLICATION_SYMLINK_002',
      severity: 'error',
      location: { file: relative },
      // The real path is deliberately NOT recorded: it is an out-of-root filesystem
      // location, and copying it into a published diagnostic would disclose exactly
      // the internal layout this control exists to keep out of public output.
      observed: relative,
      expected: 'A path whose resolved location stays inside the publication root',
      reason: 'An ancestor path component resolves outside the publication root',
      remediation: 'Remove the linked directory and publish an explicit in-root file',
      documentation: 'docs/maintainers/template-publication.md',
    });
    return;
  }

  if (!metadata.isFile()) {
    throw new Error(`Selected publication entry is not a regular file: ${relative}`);
  }

  const pathIssue = pathDiagnostic(relative);
  if (pathIssue) diagnostics.push(pathIssue);
  if (metadata.size > MAX_SCANNABLE_FILE_BYTES) {
    diagnostics.push({
      code: 'PUBLICATION_CONTENT_002',
      severity: 'error',
      location: { file: relative },
      observed: metadata.size,
      expected: 'A file no larger than 2 MiB or an approved scanner extension',
      reason: 'The Release 0 scanner cannot inspect this file within its reviewed limit',
      remediation: 'Remove the file or add a separately reviewed binary-publication policy',
      documentation: 'docs/maintainers/template-publication.md',
    });
  } else {
    diagnostics.push(...contentDiagnostics(relative, await readFile(absolute)));
  }
}

/**
 * Scans exactly the supplied selection. Every failure mode — an unsafe path, an
 * escaping path, an unreadable entry, or an unexpected exception — resolves to a
 * failed outcome rather than a thrown error, so publication fails closed.
 */
export async function scanPublicationFiles(
  rootInput: string | URL,
  selectedPaths: readonly string[],
): Promise<ValidationOutcome<void>> {
  try {
    const root = await realpath(rootInput);
    const diagnostics: Diagnostic[] = [];
    for (const relative of [...selectedPaths].sort()) await scanOne(root, relative, diagnostics);
    return diagnostics.some(({ severity }) => severity === 'error')
      ? failure(diagnostics)
      : success(undefined, diagnostics);
  } catch (error) {
    return failure([
      {
        code: 'PUBLICATION_INTERNAL_999',
        severity: 'error',
        location: { file: String(rootInput) },
        observed: error instanceof Error ? error.message : String(error),
        expected: 'Selected publication files are regular, contained, and readable',
        reason: 'Publication scanner could not safely inspect the selected file set',
        remediation: 'Block publication and repair the selected path or scanner failure',
        documentation: 'docs/maintainers/template-publication.md',
      },
    ]);
  }
}
