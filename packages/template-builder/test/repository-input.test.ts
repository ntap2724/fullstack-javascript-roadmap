import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  listRepositoryFiles,
  listSourceFiles,
  materializeTemplate,
  selectPublicationFiles,
} from '../src/index.js';

const run = promisify(execFile);
const scratchRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    scratchRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const templateYaml = [
  'schemaVersion: 1',
  'id: template-scratch',
  'repositoryName: scratch',
  'version: 0.1.0',
  'curriculum:',
  '  release: 0.1.0',
  '  entryPoint: project-scratch',
  'runtime:',
  '  nodeFamily: 24',
  '  packageManager: pnpm',
  'publication:',
  '  include:',
  '    - files/**',
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
].join('\n');

async function write(root: string, relativePath: string, contents: string): Promise<string> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, 'utf8');
  return target;
}

async function createTemplate(options: { git: boolean; gitignore?: string }): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-repo-input-'));
  scratchRoots.push(root);
  await write(root, 'template.yaml', templateYaml);
  await write(root, 'files/README.md', 'scratch starter\n');
  await write(root, 'files/src/index.ts', 'export const value = 1;\n');
  if (options.gitignore !== undefined) {
    await write(root, '.gitignore', options.gitignore);
  }
  if (options.git) {
    await run('git', ['-C', root, 'init']);
  }
  return root;
}

/**
 * Reproduces what running the starter's own commands inside `files/` leaves behind:
 * a dependency tree containing symlinks, and compiled build output.
 */
async function addGeneratedArtifacts(root: string): Promise<void> {
  await write(root, 'files/node_modules/.modules.yaml', 'lockfileVersion: 9\n');
  await write(root, 'files/node_modules/pkg/index.js', 'module.exports = 1;\n');
  await write(root, 'files/dist/index.js', 'export const built = 1;\n');
  await write(root, 'files/src/dist/nested.js', 'export const nested = 1;\n');
  const linkTarget = path.join(root, 'files', 'node_modules', 'pkg');
  // Inability to create the symlink is a test-environment failure, never a skipped
  // test: the symlink is the exact condition that used to abort enumeration.
  await symlink(linkTarget, path.join(root, 'files', 'node_modules', '@scope'), 'junction');
}

describe('publication input assembly', () => {
  it('excludes ignored dependency trees and build output from selection', async () => {
    const root = await createTemplate({ git: true, gitignore: 'node_modules/\ndist/\n' });
    await addGeneratedArtifacts(root);

    const selected = await selectPublicationFiles(root);

    expect(selected).toEqual(['files/README.md', 'files/src/index.ts']);
    expect(selected.some((entry) => entry.includes('node_modules'))).toBe(false);
    expect(selected.some((entry) => entry.includes('dist'))).toBe(false);
  });

  it('does not abort enumeration on symlinks inside an ignored dependency tree', async () => {
    const root = await createTemplate({ git: true, gitignore: 'node_modules/\ndist/\n' });
    await addGeneratedArtifacts(root);

    await expect(listSourceFiles(root)).resolves.toBeDefined();
  });

  it('keeps ignored artifacts out of the materialized starter', async () => {
    const root = await createTemplate({ git: true, gitignore: 'node_modules/\ndist/\n' });
    await addGeneratedArtifacts(root);
    const outputRoot = await mkdtemp(path.join(tmpdir(), 'roadmap-repo-output-'));
    scratchRoots.push(outputRoot);

    const built = await materializeTemplate(root, outputRoot, {
      schemaVersion: 1,
      templateId: 'template-scratch',
      templateVersion: '0.1.0',
      curriculumVersion: '0.1.0',
      sourceRepository: 'fullstack-javascript-roadmap',
      sourceCommit: '0'.repeat(40),
      generatedAt: '2026-08-18T00:00:00.000Z',
      toolchain: { node: '24.18.0', pnpm: '11.9.0' },
      contractVersions: { exercise: 1, rubric: 1, evidence: 1, template: 1 },
    });

    expect(built.ok).toBe(true);
    if (built.ok) {
      const generated = built.value.files.map((file) => file.path);
      expect(generated).toEqual(['.roadmap/template-manifest.json', 'README.md', 'src/index.ts']);
      expect(generated.some((entry) => entry.includes('node_modules'))).toBe(false);
      expect(generated.some((entry) => entry.includes('dist'))).toBe(false);
    }
  });

  it('includes an intentional new file that is not ignored', async () => {
    const root = await createTemplate({ git: true, gitignore: 'node_modules/\ndist/\n' });
    await write(root, 'files/AGENTS.md', 'scratch rules\n');

    await expect(selectPublicationFiles(root)).resolves.toContain('files/AGENTS.md');
  });

  it('includes a committed file and still excludes ignored artifacts', async () => {
    const root = await createTemplate({ git: true, gitignore: 'node_modules/\ndist/\n' });
    await addGeneratedArtifacts(root);
    await run('git', ['-C', root, 'add', '-A']);

    const selected = await selectPublicationFiles(root);

    expect(selected).toEqual(['files/README.md', 'files/src/index.ts']);
  });

  it('fails closed when a generated directory is committed rather than ignored', async () => {
    const root = await createTemplate({ git: true });
    await write(root, 'files/dist/leaked.js', 'export const built = 1;\n');

    await expect(listSourceFiles(root)).rejects.toThrow(/TEMPLATE_GENERATED_001/);
  });

  it('still rejects a repository-owned symlink on a publishable path', async () => {
    const root = await createTemplate({ git: true, gitignore: 'node_modules/\ndist/\n' });
    const outsideSecret = path.join(root, 'outside.txt');
    await writeFile(outsideSecret, 'must never be published\n', 'utf8');
    await symlink(outsideSecret, path.join(root, 'files', 'escape.txt'), 'file');

    await expect(listSourceFiles(root)).rejects.toThrow(/TEMPLATE_SYMLINK_001/);
  });
});

describe('listRepositoryFiles capability detection', () => {
  it('reports null outside a Git work tree so plain fixtures still enumerate', async () => {
    const root = await createTemplate({ git: false });

    expect(await listRepositoryFiles(root)).toBeNull();
    await expect(selectPublicationFiles(root)).resolves.toEqual([
      'files/README.md',
      'files/src/index.ts',
    ]);
  });

  it('prunes generated directories outside a Git work tree too', async () => {
    const root = await createTemplate({ git: false });
    await addGeneratedArtifacts(root);

    expect(await listRepositoryFiles(root)).toBeNull();
    await expect(selectPublicationFiles(root)).resolves.toEqual([
      'files/README.md',
      'files/src/index.ts',
    ]);
  });
});
