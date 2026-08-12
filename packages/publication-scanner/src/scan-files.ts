import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { isSafeRelativePath, normalizeRelativePath } from '@roadmap/exercise-contract';
import {
  failure,
  success,
  type Diagnostic,
  type ValidationOutcome,
} from '@roadmap/validation-core';
import { contentDiagnostics, MAX_SCANNABLE_FILE_BYTES } from './scan-content.js';
import { pathDiagnostic } from './scan-path.js';
import { importDiagnostics } from './scan-imports.js';

export interface ScanPublicationOptions {
  readonly answerFingerprints?: readonly string[];
}

const execFileAsync = promisify(execFile);

/**
 * Reports gitlinks (index mode 160000) WHERE REPOSITORY METADATA IS AVAILABLE.
 *
 * A gitlink occupies an index entry, not a working-tree file, so no directory walk can
 * observe it: the entry has no file to stat. It lives HERE, in the selected-files scan,
 * rather than in the generated-tree scan, because that is where the surface actually
 * exists. The production pipeline scans the SOURCE template root through
 * `scanPublicationFiles` and the generated tree through `scanPublicationTree`; a source
 * root sits inside a git repository and has an index, while a generated tree normally has
 * no git metadata at all. Attached to the tree scan alone, the check ran only where there
 * was nothing to find. `scanPublicationTree` delegates here, so both paths are covered by
 * this one call site and one gitlink yields exactly one diagnostic.
 *
 * The pathspec is `.`, which scopes the query to the SCANNED ROOT'S SUBTREE and makes
 * git's output relative to that root. `:(top)` would be wrong in both respects: it anchors
 * to the REPOSITORY root, so an unrelated gitlink elsewhere in a containing monorepo would
 * be reported against this publication, with a repository-relative `../` path. (A
 * `:(top)`-anchored pathspec is the right tool for auditing a whole repository; it is the
 * wrong tool for asking what a publication root contains.)
 *
 * An absent or unreadable index yields no finding, silently. That is not an all-clear for
 * the submodule ban: `.gitmodules` is checked per file, independently, below.
 */
async function gitlinkDiagnostics(root: string): Promise<readonly Diagnostic[]> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('git', ['-C', root, 'ls-files', '--stage', '--', '.'], {
      windowsHide: true,
    }));
  } catch {
    return [];
  }

  return stdout
    .split('\n')
    .filter((line) => line.startsWith('160000 '))
    .map((line) => ({
      code: 'PUBLICATION_SUBMODULE_001',
      severity: 'error' as const,
      location: { file: line.slice(line.indexOf('\t') + 1).trim() },
      observed: 'index mode 160000 gitlink',
      expected: 'No submodule metadata or gitlinks in Release 0 publication input',
      reason: 'Release 0 bans all submodules',
      remediation: 'Remove the gitlink and vendor reviewed public files directly',
      documentation: 'docs/maintainers/template-publication.md',
    }));
}

async function scanOne(
  root: string,
  relativeInput: string,
  diagnostics: Diagnostic[],
  options: ScanPublicationOptions,
  eligible: string[],
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
  eligible.push(relative);

  if (relative.split('/').some((segment) => segment.toLowerCase() === '.gitmodules')) {
    diagnostics.push({
      code: 'PUBLICATION_SUBMODULE_001',
      severity: 'error',
      location: { file: relative },
      observed: '.gitmodules metadata',
      expected: 'No submodule metadata or gitlinks in Release 0 publication input',
      reason: 'Release 0 bans all submodules',
      remediation: 'Vendor reviewed public files directly and remove the submodule metadata',
      documentation: 'docs/maintainers/template-publication.md',
    });
  }

  const bytes = await readFile(absolute);
  const fingerprint = createHash('sha256').update(bytes).digest('hex');
  if (options.answerFingerprints?.includes(fingerprint)) {
    diagnostics.push({
      code: 'PUBLICATION_ANSWER_001',
      severity: 'error',
      location: { file: relative },
      observed: 'sha256 fingerprint match',
      expected: 'Content whose exact bytes do not match a supplied private-answer fingerprint',
      reason: 'Publication content exactly matches a private-answer fingerprint',
      remediation:
        'Remove the answer content from the public file; do not expose the private corpus',
      documentation: 'docs/maintainers/template-publication.md',
    });
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
    diagnostics.push(...contentDiagnostics(relative, bytes));
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
  options: ScanPublicationOptions = {},
): Promise<ValidationOutcome<void>> {
  try {
    const root = await realpath(rootInput);
    const diagnostics: Diagnostic[] = [];
    // Only paths that CLEARED containment and file-kind validation may be handed to the
    // import graph. `scanOne` reports a rejected symlink or ancestor-escape and returns,
    // but a rejection code does not stop a later stage from reading the same path: the
    // graph resolves importers itself, so passing the raw selection would let it read and
    // parse out-of-root bytes and copy their import specifiers into published diagnostics
    // (F-01). Eligibility is recorded at the point of clearance rather than recomputed
    // here, so the two stages cannot drift apart.
    const eligible: string[] = [];
    for (const relative of [...selectedPaths].sort())
      await scanOne(root, relative, diagnostics, options, eligible);
    diagnostics.push(...(await importDiagnostics(root, eligible)));
    diagnostics.push(...(await gitlinkDiagnostics(root)));
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
