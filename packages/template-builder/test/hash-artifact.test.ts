import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPublicationArtifact, TEMPLATE_MANIFEST_RELATIVE_PATH } from '../src/index.js';

async function buildTree(manifestBody: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-artifact-'));
  await mkdir(path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, '.roadmap'), { recursive: true });
  await writeFile(path.join(root, 'README.md'), 'readme\n', 'utf8');
  await writeFile(path.join(root, 'src', 'index.js'), 'export const a = 1;\n', 'utf8');
  await writeFile(path.join(root, TEMPLATE_MANIFEST_RELATIVE_PATH), manifestBody, 'utf8');
  return root;
}

describe('buildPublicationArtifact', () => {
  it('records every file as a sorted POSIX path with byte length and sha256', async () => {
    const root = await buildTree('{"generatedAt":"a"}\n');
    const artifact = await buildPublicationArtifact(root);

    expect(artifact.files.map((file) => file.path)).toEqual([
      '.roadmap/template-manifest.json',
      'README.md',
      'src/index.js',
    ]);
    expect(artifact.files.map((file) => file.path)).toEqual(
      [...artifact.files.map((file) => file.path)].sort(),
    );

    const readme = artifact.files.find((file) => file.path === 'README.md');
    expect(readme?.bytes).toBe(Buffer.byteLength('readme\n'));
    expect(readme?.sha256).toBe(createHash('sha256').update('readme\n').digest('hex'));
  });

  it('excludes the provenance manifest from the functional hash but still records it', async () => {
    const first = await buildPublicationArtifact(await buildTree('{"generatedAt":"first"}\n'));
    const second = await buildPublicationArtifact(await buildTree('{"generatedAt":"second"}\n'));

    expect(first.functionalSha256).toBe(second.functionalSha256);
    expect(first.files.map((file) => file.path)).toContain(TEMPLATE_MANIFEST_RELATIVE_PATH);

    const firstManifest = first.files.find((f) => f.path === TEMPLATE_MANIFEST_RELATIVE_PATH);
    const secondManifest = second.files.find((f) => f.path === TEMPLATE_MANIFEST_RELATIVE_PATH);
    expect(firstManifest?.sha256).not.toBe(secondManifest?.sha256);
  });

  it('changes the functional hash when a learner-visible byte changes', async () => {
    const baseline = await buildPublicationArtifact(await buildTree('{"generatedAt":"a"}\n'));
    const mutatedRoot = await buildTree('{"generatedAt":"a"}\n');
    await writeFile(path.join(mutatedRoot, 'README.md'), 'readme changed\n', 'utf8');
    const mutated = await buildPublicationArtifact(mutatedRoot);

    expect(mutated.functionalSha256).not.toBe(baseline.functionalSha256);
  });

  it('separates path bytes from content bytes so renames change the functional hash', async () => {
    const original = await mkdtemp(path.join(tmpdir(), 'roadmap-artifact-rename-'));
    await writeFile(path.join(original, 'ab'), 'c', 'utf8');
    const renamed = await mkdtemp(path.join(tmpdir(), 'roadmap-artifact-rename-'));
    await writeFile(path.join(renamed, 'a'), 'bc', 'utf8');

    const left = await buildPublicationArtifact(original);
    const right = await buildPublicationArtifact(renamed);
    expect(left.functionalSha256).not.toBe(right.functionalSha256);
  });
});
