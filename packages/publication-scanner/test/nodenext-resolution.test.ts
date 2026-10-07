import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanPublicationFiles } from '../src/index.js';

const scratchRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    scratchRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

interface ModuleFixture {
  readonly path: string;
  readonly contents: string;
}

async function scanFixture(
  files: readonly ModuleFixture[],
  selected?: readonly string[],
): Promise<readonly string[]> {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-nodenext-'));
  scratchRoots.push(root);
  for (const file of files) {
    const target = path.join(root, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.contents, 'utf8');
  }
  const outcome = await scanPublicationFiles(root, selected ?? files.map((file) => file.path));
  return outcome.ok ? [] : outcome.diagnostics.map((diagnostic) => diagnostic.code);
}

describe('NodeNext specifier resolution', () => {
  it.each([
    ['.js', '.ts', './sibling.js', 'sibling.ts'],
    ['.js', '.tsx', './Component.js', 'Component.tsx'],
    ['.js', '.jsx', './Widget.js', 'Widget.jsx'],
    ['.mjs', '.mts', './module.mjs', 'module.mts'],
    ['.cjs', '.cts', './legacy.cjs', 'legacy.cts'],
  ])(
    'resolves a %s specifier onto its %s source file',
    async (_specifierExtension, _sourceExtension, specifier, sourceFile) => {
      const codes = await scanFixture([
        {
          path: 'entry.ts',
          contents: `import { value } from '${specifier}';\nexport { value };\n`,
        },
        { path: sourceFile, contents: 'export const value = 1;\n' },
      ]);
      expect(codes).toEqual([]);
    },
  );

  it('resolves a real .js file rather than preferring a TypeScript neighbour', async () => {
    const codes = await scanFixture([
      { path: 'entry.ts', contents: "import './plain.js';\n" },
      { path: 'plain.js', contents: 'export const value = 1;\n' },
    ]);
    expect(codes).toEqual([]);
  });

  it('still reports an unresolved import when no source equivalent exists', async () => {
    const codes = await scanFixture([{ path: 'entry.ts', contents: "import './absent.js';\n" }]);
    expect(codes).toEqual(['PUBLICATION_IMPORT_UNRESOLVED_001']);
  });

  it('does not invent a mapping for extensions TypeScript never emits', async () => {
    const codes = await scanFixture([
      { path: 'entry.ts', contents: "import './data.json';\n" },
      { path: 'data.ts', contents: 'export const value = 1;\n' },
    ]);
    expect(codes).toEqual(['PUBLICATION_IMPORT_UNRESOLVED_001']);
  });

  it('reports a resolved TypeScript source that is outside the selected set', async () => {
    const codes = await scanFixture(
      [
        { path: 'entry.ts', contents: "import './unselected.js';\n" },
        { path: 'unselected.ts', contents: 'export const value = 1;\n' },
      ],
      ['entry.ts'],
    );
    expect(codes).toEqual(['PUBLICATION_IMPORT_SELECTION_001']);
  });

  it('still refuses a mapped specifier that reaches a private directory', async () => {
    const codes = await scanFixture([
      { path: 'entry.ts', contents: "import './solution/answer.js';\n" },
      { path: 'solution/answer.ts', contents: 'export const value = 1;\n' },
    ]);
    expect(codes).toContain('PUBLICATION_PATH_001');
    expect(codes).toContain('PUBLICATION_IMPORT_PRIVATE_001');
  });

  it('still refuses a mapped specifier that escapes the publication root', async () => {
    const codes = await scanFixture([
      { path: 'nested/entry.ts', contents: "import '../../outside.js';\n" },
    ]);
    expect(codes).toEqual(['PUBLICATION_IMPORT_PRIVATE_001']);
  });

  it('does not follow a symlinked TypeScript source', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'roadmap-nodenext-link-'));
    scratchRoots.push(root);
    await writeFile(path.join(root, 'entry.ts'), "import './linked.js';\n", 'utf8');
    const outsideSecret = path.join(root, 'secret.ts');
    await writeFile(outsideSecret, 'export const value = 1;\n', 'utf8');
    // Inability to create the symlink is a test-environment failure, never a skipped
    // security test: resolution must not accept a link as a publishable module.
    await symlink(outsideSecret, path.join(root, 'linked.ts'), 'file');

    const outcome = await scanPublicationFiles(root, ['entry.ts']);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        'PUBLICATION_IMPORT_UNRESOLVED_001',
      );
    }
  });
});
