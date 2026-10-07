import { access, lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { Diagnostic } from '@roadmap/validation-core';
import ts from 'typescript';
import { forbiddenPathSegments } from './policies.js';

const moduleExtensions = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx', '.json'];
const parseableExtensions = new Set(moduleExtensions.filter((extension) => extension !== '.json'));

/**
 * TypeScript's NodeNext output convention: a source file imports its sibling by the
 * EMITTED specifier (`./health.js`) while the file on disk is `./health.ts`. Without
 * this mapping every TypeScript starter reports unresolved edges for imports that
 * compile and run, which would make the unresolved-import control unusable exactly
 * where it matters most.
 *
 * This widens resolution only. Containment, symlink rejection, the private-path
 * check, and the selected-set membership check all still run on whatever resolves,
 * so a `.js` specifier that lands on an unselected or out-of-root `.ts` file is
 * still reported.
 */
const typescriptSourceEquivalents = new Map<string, readonly string[]>([
  ['.js', ['.ts', '.tsx', '.jsx']],
  ['.mjs', ['.mts']],
  ['.cjs', ['.cts']],
]);

function diagnostic(
  code: string,
  importer: string,
  specifier: string,
  reason: string,
  remediation: string,
): Diagnostic {
  return {
    code,
    severity: 'error',
    location: { file: importer },
    observed: specifier,
    expected: 'A resolvable relative import that remains inside the selected public file set',
    reason,
    remediation,
    documentation: 'docs/maintainers/template-publication.md',
  };
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function resolveRelative(
  root: string,
  importer: string,
  specifier: string,
): Promise<string | null> {
  const importerDirectory = path.posix.dirname(importer);
  const unresolved = path.posix.normalize(path.posix.join(importerDirectory, specifier));
  const absolute = path.resolve(root, unresolved);
  const extension = path.posix.extname(unresolved);
  const candidates = extension
    ? [
        absolute,
        ...(typescriptSourceEquivalents.get(extension) ?? []).map(
          (replacement) => `${absolute.slice(0, -extension.length)}${replacement}`,
        ),
      ]
    : [
        absolute,
        ...moduleExtensions.map((candidate) => `${absolute}${candidate}`),
        ...moduleExtensions.map((candidate) => path.join(absolute, `index${candidate}`)),
      ];

  for (const candidate of candidates) {
    if (!(await exists(candidate))) continue;
    const metadata = await lstat(candidate);
    if (!metadata.isFile() || metadata.isSymbolicLink()) continue;
    const canonicalRelationship = path.relative(root, await realpath(candidate));
    if (
      canonicalRelationship === '..' ||
      canonicalRelationship.startsWith(`..${path.sep}`) ||
      path.isAbsolute(canonicalRelationship)
    )
      continue;
    return path.relative(root, candidate).replaceAll('\\', '/');
  }
  return null;
}

/**
 * Builds a bounded graph over selected JavaScript/TypeScript files. TypeScript's parser-backed
 * preprocessor recognizes static imports, export-from declarations, literal dynamic imports,
 * and require calls while ignoring comments, strings, non-literal imports, and bare packages.
 */
export async function importDiagnostics(
  root: string,
  selectedPaths: readonly string[],
): Promise<readonly Diagnostic[]> {
  const selected = new Set(selectedPaths.map((entry) => entry.replaceAll('\\', '/')));
  const diagnostics: Diagnostic[] = [];
  const visited = new Set<string>();
  const queue = [...selected].filter((entry) => parseableExtensions.has(path.posix.extname(entry)));

  while (queue.length > 0) {
    const importer = queue.shift();
    if (importer === undefined || visited.has(importer)) continue;
    visited.add(importer);

    const text = await readFile(path.resolve(root, importer), 'utf8');
    const imports = ts
      .preProcessFile(text, true, true)
      .importedFiles.map(({ fileName }) => fileName);
    for (const specifier of imports) {
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue;

      const lexicalTarget = path.posix.normalize(
        path.posix.join(path.posix.dirname(importer), specifier),
      );
      const segments = lexicalTarget.split('/').map((segment) => segment.toLowerCase());
      if (
        lexicalTarget === '..' ||
        lexicalTarget.startsWith('../') ||
        segments.some((segment) => forbiddenPathSegments.has(segment))
      ) {
        diagnostics.push(
          diagnostic(
            'PUBLICATION_IMPORT_PRIVATE_001',
            importer,
            specifier,
            'A relative module edge reaches outside the public root or into a private root',
            'Remove the private import and keep learner code self-contained within selected public files',
          ),
        );
        continue;
      }

      const resolved = await resolveRelative(root, importer, specifier);
      if (resolved === null) {
        diagnostics.push(
          diagnostic(
            'PUBLICATION_IMPORT_UNRESOLVED_001',
            importer,
            specifier,
            'A relative module edge cannot be resolved within the publication root',
            'Add the referenced public module or remove the unresolved relative import',
          ),
        );
        continue;
      }

      if (!selected.has(resolved)) {
        diagnostics.push(
          diagnostic(
            'PUBLICATION_IMPORT_SELECTION_001',
            importer,
            specifier,
            'A relative module edge resolves to a file outside the selected publication set',
            'Select the referenced public module or remove the import before publication',
          ),
        );
        continue;
      }

      if (parseableExtensions.has(path.posix.extname(resolved))) queue.push(resolved);
    }
  }

  return diagnostics;
}
