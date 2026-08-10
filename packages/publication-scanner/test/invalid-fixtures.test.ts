import { describe, expect, it } from 'vitest';
import { scanPublicationTree } from '../src/index.js';

// Fixture roots resolve from this file, never from process.cwd(): vitest sets cwd
// to the project root, so a bare relative path would point at a directory that does
// not exist and every assertion below would pass against nothing (D3, WP-07 precedent).
const invalidFixtures = new URL('../../../fixtures/publication/invalid/', import.meta.url);

// Each fixture isolates ONE diagnostic. The expected code is asserted exactly, so a
// fixture that trips a different control fails here rather than passing on a
// coincidental rejection.
const cases = [
  ['solution-path', 'PUBLICATION_PATH_001'],
  ['nested-answer', 'PUBLICATION_PATH_001'],
  ['dotfile-not-allowlisted', 'PUBLICATION_PATH_001'],
  ['maintainer-marker', 'PUBLICATION_CONTENT_001'],
  ['internal-url', 'PUBLICATION_INTERNAL_001'],
  ['absolute-local-path', 'PUBLICATION_INTERNAL_002'],
  ['secret-private-key', 'PUBLICATION_SECRET_001'],
  ['secret-github-token', 'PUBLICATION_SECRET_002'],
  ['secret-aws-access-key', 'PUBLICATION_SECRET_003'],
] as const;

describe.each(cases)('%s fixture', (name, diagnosticCode) => {
  it(`fails with ${diagnosticCode}`, async () => {
    const result = await scanPublicationTree(new URL(`${name}/`, invalidFixtures));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(diagnosticCode);
  });
});

describe('rejection diagnostics carry actionable detail', () => {
  it('locates the offending file rather than only the scanned root', async () => {
    const result = await scanPublicationTree(new URL('solution-path/', invalidFixtures));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const diagnostic = result.diagnostics.find(({ code }) => code === 'PUBLICATION_PATH_001');
    expect(diagnostic?.location.file).toBe('files/solution/answer.js');
    expect(diagnostic?.severity).toBe('error');
    expect(diagnostic?.remediation).not.toHaveLength(0);
    expect(diagnostic?.documentation).toBe('docs/maintainers/template-publication.md');
  });

  it('reports the nested forbidden segment at its real depth', async () => {
    const result = await scanPublicationTree(new URL('nested-answer/', invalidFixtures));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const diagnostic = result.diagnostics.find(({ code }) => code === 'PUBLICATION_PATH_001');
    // A first-segment-only or basename-only implementation cannot produce this.
    expect(diagnostic?.location.file).toBe('files/src/modules/deep/answer-key/expected.md');
  });
});
