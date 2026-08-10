import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { materializeTemplate } from '../src/index.js';

const fixture = new URL('../../../fixtures/publication/valid/minimal-template/', import.meta.url);

const provenance = {
  schemaVersion: 1 as const,
  templateId: 'template-minimal',
  templateVersion: '0.1.0',
  curriculumVersion: '0.1.0',
  sourceRepository: 'fullstack-javascript-roadmap',
  sourceCommit: '0123456789abcdef0123456789abcdef01234567',
  generatedAt: '2026-07-26T12:00:00.000Z',
  toolchain: { node: '24.0.0', pnpm: '11.0.0' },
  contractVersions: { exercise: 1, rubric: 1, evidence: 1, template: 1 },
};

describe('materializeTemplate', () => {
  it('strips files/ and resolves declared text tokens', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-template-'));
    const result = await materializeTemplate(fixture, output, provenance);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await readFile(path.join(output, 'README.md'), 'utf8')).toContain('0.1.0');
    expect(result.value.files.some((file) => file.path.startsWith('files/'))).toBe(false);
  });

  it('leaves no unresolved declared token in generated text', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-template-tokens-'));
    const result = await materializeTemplate(fixture, output, provenance);
    expect(result.ok).toBe(true);
    const readme = await readFile(path.join(output, 'README.md'), 'utf8');
    expect(readme).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });

  it('writes provenance to .roadmap/template-manifest.json', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-template-manifest-'));
    const result = await materializeTemplate(fixture, output, provenance);
    expect(result.ok).toBe(true);
    const written: unknown = JSON.parse(
      await readFile(path.join(output, '.roadmap', 'template-manifest.json'), 'utf8'),
    );
    expect(written).toEqual(provenance);
  });

  it('rejects provenance that disagrees with the template definition', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-template-mismatch-'));
    const result = await materializeTemplate(fixture, output, {
      ...provenance,
      templateVersion: '9.9.9',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.observed).toContain('TEMPLATE_PROVENANCE_001');
  });

  it('rejects an output that contains the source before deleting anything', async () => {
    const sourceRoot = path.resolve(
      fileURLToPath(
        new URL('../../../fixtures/publication/valid/minimal-template/', import.meta.url),
      ),
    );
    const parent = path.dirname(sourceRoot);
    const result = await materializeTemplate(sourceRoot, parent, provenance);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.observed).toContain('TEMPLATE_OUTPUT_001');
    expect(await readFile(path.join(sourceRoot, 'template.yaml'), 'utf8')).toContain(
      'schemaVersion',
    );
  });

  it('keeps the functional hash stable when only generatedAt changes', async () => {
    const firstRoot = await mkdtemp(path.join(tmpdir(), 'roadmap-template-first-'));
    const secondRoot = await mkdtemp(path.join(tmpdir(), 'roadmap-template-second-'));
    const first = await materializeTemplate(fixture, firstRoot, provenance);
    const second = await materializeTemplate(fixture, secondRoot, {
      ...provenance,
      generatedAt: '2026-07-27T12:00:00.000Z',
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.functionalSha256).toBe(second.value.functionalSha256);
    const changed = first.value.files
      .filter((left) => {
        const right = second.value.files.find(({ path: filePath }) => filePath === left.path);
        return right?.sha256 !== left.sha256;
      })
      .map(({ path: filePath }) => filePath);
    expect(changed).toEqual(['.roadmap/template-manifest.json']);
  });
});
