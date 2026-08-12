import { lstat, readdir, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { normalizeRelativePath } from '@roadmap/exercise-contract';
import {
  failure,
  success,
  type Diagnostic,
  type ValidationOutcome,
} from '@roadmap/validation-core';
import { scanPublicationFiles } from './scan-files.js';

const execFileAsync = promisify(execFile);

/**
 * Reports gitlinks (index mode 160000) WHERE REPOSITORY METADATA IS AVAILABLE.
 *
 * A gitlink occupies an index entry, not a working-tree file, so the directory walk below
 * cannot observe it: `readdir` sees either an empty directory or nothing at all. A generated
 * publication tree carries no git metadata, in which case there is no index to read and this
 * surface is silently absent — that is why `.gitmodules` is checked independently per file
 * rather than relying on this. An unreadable or absent index yields no finding here; it must
 * never be read as an all-clear for the other surface.
 */
async function gitlinkDiagnostics(root: string): Promise<readonly Diagnostic[]> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('git', ['-C', root, 'ls-files', '--stage', '--', ':(top)'], {
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

/**
 * Enumerates a complete generated tree and scans every regular file it contains.
 *
 * Symlink paths are collected and handed to `scanPublicationFiles`, whose `lstat`
 * produces `PUBLICATION_SYMLINK_001`. Enumeration deliberately does NOT descend
 * into a link: dereferencing it would walk outside the publication root and could
 * pull private bytes into a public scan report.
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
    const fileScan = await scanPublicationFiles(root, files);
    const gitlinks = await gitlinkDiagnostics(root);
    const diagnostics = [...fileScan.diagnostics, ...gitlinks];
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
        expected: 'Scanner completes normally',
        reason: 'Publication tree enumeration crashed',
        remediation: 'Treat the release as blocked and inspect the scanner failure',
        documentation: 'docs/maintainers/template-publication.md',
      },
    ]);
  }
}
