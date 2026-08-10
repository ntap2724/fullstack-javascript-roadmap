import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  curriculumVersion: '0.2.0',
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
    // Asserts the EXACT resolved line, not a substring. Both tokens must land in their
    // own positions: the fixture deliberately gives version (0.1.0) and
    // curriculum.release (0.2.0) different values, so swapping the two transform
    // sources produces a different string and fails here. A toContain check cannot
    // distinguish a string from a rearrangement of itself.
    expect(await readFile(path.join(output, 'README.md'), 'utf8')).toContain(
      'Template version 0.1.0 for curriculum release 0.2.0.',
    );
    expect(result.value.files.some((file) => file.path.startsWith('files/'))).toBe(false);
  });

  it('leaves no unresolved declared token in generated text', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-template-tokens-'));
    const result = await materializeTemplate(fixture, output, provenance);
    expect(result.ok).toBe(true);
    const readme = await readFile(path.join(output, 'README.md'), 'utf8');
    expect(readme).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });

  it('rejects an undeclared token before any output is generated', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'roadmap-template-undeclared-'));
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-template-undeclared-out-'));
    await mkdir(path.join(root, 'files'), { recursive: true });
    await writeFile(
      path.join(root, 'files', 'README.md'),
      'Undeclared token {{NOT_DECLARED}} in this file.\n',
      'utf8',
    );
    await writeFile(
      path.join(root, 'template.yaml'),
      [
        'schemaVersion: 1',
        'id: template-undeclared-token',
        'repositoryName: undeclared-token',
        'version: 0.1.0',
        'curriculum:',
        '  release: 0.2.0',
        '  entryPoint: project-undeclared-token',
        'runtime:',
        '  nodeFamily: 24',
        '  packageManager: pnpm',
        'publication:',
        '  include:',
        '    - files/**',
        '  exclude: []',
        '  textTransforms:',
        '    - token: "{{TEMPLATE_VERSION}}"',
        '      valueFrom: template.version',
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

    const result = await materializeTemplate(root, output, {
      ...provenance,
      templateId: 'template-undeclared-token',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // TEMPLATE_TRANSFORM_001 is thrown inside materialize and surfaced through the
    // failure diagnostic. This assertion fails if transforms.ts silently passes an
    // undeclared token through instead of rejecting the materialization.
    expect(result.diagnostics[0]?.observed).toContain('TEMPLATE_TRANSFORM_001:{{NOT_DECLARED}}');
    await rm(root, { recursive: true, force: true });
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

  it('rejects provenance whose curriculumVersion contradicts the definition', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-template-curriculum-'));
    // The fixture declares curriculum.release 0.2.0 and version 0.1.0. Claiming 0.1.0
    // as the curriculum version is coherent with nothing: it contradicts the only
    // authoritative source for that field, the definition.
    const result = await materializeTemplate(fixture, output, {
      ...provenance,
      curriculumVersion: '0.1.0',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.observed).toContain('TEMPLATE_PROVENANCE_001');

    // Fail-closed: the incoherent manifest must never be serialized, so the failure
    // provably precedes manifest writing rather than being cleaned up afterwards.
    await expect(
      readFile(path.join(output, '.roadmap', 'template-manifest.json'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    // Intended-reason control. The three assertions above are also satisfied by a
    // sibling-field mismatch such as templateId, because all identity mismatches share
    // TEMPLATE_PROVENANCE_001. Re-materializing with curriculumVersion as the ONLY
    // corrected field, everything else untouched, must succeed. That flip can only be
    // attributed to the curriculumVersion comparison: any unrelated cause would still
    // be present and would still reject.
    const controlOutput = await mkdtemp(path.join(tmpdir(), 'roadmap-template-curriculum-ok-'));
    const control = await materializeTemplate(fixture, controlOutput, {
      ...provenance,
      curriculumVersion: '0.2.0',
    });
    expect(control.ok).toBe(true);
  });

  it('accepts the same provenance once only curriculumVersion is made coherent', async () => {
    // Isolates the curriculumVersion comparison as the cause. Every other field is
    // byte-identical to the rejected case above; only this one field changes, and the
    // outcome flips from rejected to accepted.
    const rejectedOutput = await mkdtemp(path.join(tmpdir(), 'roadmap-template-iso-bad-'));
    const acceptedOutput = await mkdtemp(path.join(tmpdir(), 'roadmap-template-iso-ok-'));

    const rejected = await materializeTemplate(fixture, rejectedOutput, {
      ...provenance,
      curriculumVersion: '0.1.0',
    });
    const accepted = await materializeTemplate(fixture, acceptedOutput, {
      ...provenance,
      curriculumVersion: '0.2.0',
    });

    expect(rejected.ok).toBe(false);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const written: { curriculumVersion: string } = JSON.parse(
      await readFile(path.join(acceptedOutput, '.roadmap', 'template-manifest.json'), 'utf8'),
    ) as { curriculumVersion: string };
    expect(written.curriculumVersion).toBe('0.2.0');
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
