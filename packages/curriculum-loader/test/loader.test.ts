import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCurriculum } from '../src/index.js';

const fixtures = path.resolve(import.meta.dirname, '../../../fixtures/curriculum');
const repositoryRoot = path.resolve(import.meta.dirname, '../../..');

describe('loadCurriculum', () => {
  it('loads validated Markdown documents and preserves body and file path', async () => {
    const outcome = await loadCurriculum(path.join(fixtures, 'valid/minimal'));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.documents.length).toBeGreaterThan(0);
    const competency = outcome.value.documents.find(({ data }) => data.id === 'js.function.values');
    expect(competency?.body).toContain('Nội dung fixture tối thiểu.');
    expect(competency?.filePath).toMatch(/\.md$/);
  });

  it('returns CURRICULUM_SCHEMA_001 for invalid frontmatter', async () => {
    const outcome = await loadCurriculum(path.join(fixtures, 'invalid/schema-error'));
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics.map(({ code }) => code)).toContain('CURRICULUM_SCHEMA_001');
  });

  it('orders documents deterministically by normalized path regardless of platform separators', async () => {
    const root = path.join(fixtures, 'valid/sort-order');
    const outcome = await loadCurriculum(root);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const relativePaths = outcome.value.documents.map((doc) =>
      path.relative(root, doc.filePath).split(path.sep).join('/'),
    );
    expect(relativePaths).toEqual(['a-dir/nested.md', 'a_file.md']);
  });

  it('aggregates diagnostics from every invalid file instead of stopping at the first', async () => {
    const outcome = await loadCurriculum(path.join(fixtures, 'invalid/multi-error'));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    const schemaDiagnostics = outcome.diagnostics.filter(
      ({ code }) => code === 'CURRICULUM_SCHEMA_001',
    );
    const filesWithDiagnostics = new Set(schemaDiagnostics.map(({ location }) => location.file));
    expect(filesWithDiagnostics.size).toBe(2);
  });

  it('loads the canonical curriculum root without treating governance files as artifacts', async () => {
    const outcome = await loadCurriculum(path.join(repositoryRoot, 'curriculum'));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(
      outcome.value.documents.some(({ filePath }) => path.basename(filePath) === 'AGENTS.md'),
    ).toBe(false);
  });

  it('ignores exact AGENTS.md governance files at root and nested depths', async () => {
    const root = path.join(fixtures, 'valid/governance-boundary');
    const outcome = await loadCurriculum(root);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(
      outcome.value.documents.map(({ filePath }) =>
        path.relative(root, filePath).split(path.sep).join('/'),
      ),
    ).toEqual(['normal.md']);
  });

  it('keeps every near-name Markdown candidate fail closed with its own parse location', async () => {
    const root = path.join(fixtures, 'invalid/malformed-markdown');
    const outcome = await loadCurriculum(root);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    const parseLocations = outcome.diagnostics
      .filter(({ code }) => code === 'CURRICULUM_PARSE_001')
      .map(({ location }) => path.relative(root, location.file).split(path.sep).join('/'));
    expect(parseLocations).toEqual([
      'AGENTS.mdx',
      'NOT-AGENTS.md',
      'README.md',
      'case-variant/agents.md',
    ]);
  });
});
