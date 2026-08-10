import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, selectPublicationFiles } from '../src/index.js';

const fixture = new URL('../../../fixtures/publication/valid/minimal-template/', import.meta.url);

describe('selectPublicationFiles', () => {
  it('selects allowlisted dotfiles but not private fixtures', async () => {
    const selected = await selectPublicationFiles(fixture);
    expect(selected).toContain('files/.github/workflows/verify.yml');
    expect(selected).toContain('files/README.md');
    expect(selected).not.toContain('private-fixtures/answer.js');
  });

  it('returns sorted POSIX paths', async () => {
    const selected = await selectPublicationFiles(fixture);
    expect(selected).toEqual([...selected].sort());
    expect(selected.every((entry) => !entry.includes('\\'))).toBe(true);
  });

  it('selects nothing outside the files/ allowlist root', async () => {
    const selected = await selectPublicationFiles(fixture);
    expect(selected.every((entry) => entry.startsWith('files/'))).toBe(true);
    expect(selected).not.toContain('template.yaml');
  });
});

describe('template definition loading', () => {
  it('rejects a parent-traversal publication glob at schema load', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'roadmap-traversal-'));
    await mkdir(path.join(root, 'files'), { recursive: true });
    await writeFile(path.join(root, 'files', 'README.md'), 'traversal fixture\n', 'utf8');
    await writeFile(
      path.join(root, 'template.yaml'),
      [
        'schemaVersion: 1',
        'id: template-traversal',
        'repositoryName: traversal',
        'version: 0.1.0',
        'curriculum:',
        '  release: 0.1.0',
        '  entryPoint: project-traversal',
        'runtime:',
        '  nodeFamily: 24',
        '  packageManager: pnpm',
        'publication:',
        '  include:',
        '    - ../files/**',
        '  exclude: []',
        '  textTransforms: []',
        'verification:',
        '  install:',
        '    command: pnpm',
        '    args: [install, --frozen-lockfile]',
        '    cwd: .',
        '    timeoutMs: 180000',
        '  baseline:',
        '    command: pnpm',
        '    args: [verify:baseline]',
        '    cwd: .',
        '    timeoutMs: 180000',
        '',
      ].join('\n'),
      'utf8',
    );

    await expect(selectPublicationFiles(root)).rejects.toThrow();
    await rm(root, { recursive: true, force: true });
  });
});

describe('listSourceFiles symlink rejection', () => {
  it('rejects a symlink with TEMPLATE_SYMLINK_001 before selection', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'roadmap-symlink-'));
    await mkdir(path.join(root, 'files'), { recursive: true });
    await writeFile(path.join(root, 'files', 'README.md'), 'symlink fixture\n', 'utf8');
    const outsideSecret = path.join(root, 'outside.txt');
    await writeFile(outsideSecret, 'must never be published\n', 'utf8');

    // Inability to create the symlink is a test-environment failure, never a skipped
    // security test: an unthrown assertion here would silently retire the control.
    await symlink(outsideSecret, path.join(root, 'files', 'escape.txt'), 'file');

    await expect(listSourceFiles(root)).rejects.toThrow(/TEMPLATE_SYMLINK_001/);
    await rm(root, { recursive: true, force: true });
  });
});
