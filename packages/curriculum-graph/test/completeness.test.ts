import { describe, expect, it } from 'vitest';
import { completenessDiagnostics } from '../src/completeness.js';
import { buildIsolatedGraph } from './support/graph-builder.js';
import { validateFixture } from './support/validate-fixture.js';

describe('required competency completeness', () => {
  it.each([
    [
      'invalid/orphan-competency',
      'CURRICULUM_COMPLETENESS_001',
      'test.orphan',
      /orphan-competency\.md$/,
      undefined,
    ],
    [
      'invalid/missing-assessment',
      'CURRICULUM_COMPLETENESS_002',
      'test.missing-assessment',
      /competency\.md$/,
      'assessments.0',
    ],
    [
      'invalid/missing-remediation',
      'CURRICULUM_COMPLETENESS_003',
      'test.missing-remediation',
      /competency\.md$/,
      'remediation.0',
    ],
    [
      'invalid/unreachable-milestone',
      'CURRICULUM_COMPLETENESS_004',
      'milestone-orphan',
      /milestone\.md$/,
      undefined,
    ],
  ] as const)(
    'rejects %s with %s at the failing entity',
    async (fixture, code, id, filePattern, pointer) => {
      const outcome = await validateFixture(fixture);
      expect(outcome.ok).toBe(false);
      const diagnostic = outcome.diagnostics.find((candidate) => candidate.code === code);
      const fileMatcher: unknown = expect.stringMatching(filePattern);
      const locationMatcher: unknown = expect.objectContaining(
        pointer === undefined ? { file: fileMatcher } : { file: fileMatcher, pointer },
      );
      expect(diagnostic).toEqual(
        expect.objectContaining({
          code,
          observed: id,
          location: locationMatcher,
        }),
      );
    },
  );

  it('reports only the competency outside published-track contains reachability', async () => {
    const outcome = await validateFixture('invalid/orphan-competency');
    expect(
      outcome.diagnostics
        .filter(({ code }) => code === 'CURRICULUM_COMPLETENESS_001')
        .map(({ observed }) => observed),
    ).toEqual(['test.orphan']);
  });

  it('reports only the milestone outside published-track contains reachability', async () => {
    const outcome = await validateFixture('invalid/unreachable-milestone');
    expect(
      outcome.diagnostics
        .filter(({ code }) => code === 'CURRICULUM_COMPLETENESS_004')
        .map(({ observed }) => observed),
    ).toEqual(['milestone-orphan']);
  });

  it('accepts the complete minimal curriculum', async () => {
    const outcome = await validateFixture('valid/minimal');
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics).toEqual([]);
  });
});

describe('published-track root definition', () => {
  it.each([
    ['published', true],
    ['draft', false],
    ['review', false],
    ['deprecated', false],
    ['withdrawn', false],
  ] as const)('treats a %s track as an active root: %s', (status, isActive) => {
    const graph = buildIsolatedGraph({ trackStatus: status });
    const diagnostics = completenessDiagnostics(graph);
    const codes = diagnostics.map(({ code }) => code);

    if (isActive) {
      expect(codes).toContain('CURRICULUM_COMPLETENESS_001');
      expect(codes).toContain('CURRICULUM_COMPLETENESS_004');
      expect(
        diagnostics
          .filter(({ code }) => code === 'CURRICULUM_COMPLETENESS_001')
          .map(({ observed }) => observed),
      ).toEqual(['test.orphan']);
      expect(
        diagnostics
          .filter(({ code }) => code === 'CURRICULUM_COMPLETENESS_004')
          .map(({ observed }) => observed),
      ).toEqual(['milestone-orphan']);
    } else {
      expect(codes).not.toContain('CURRICULUM_COMPLETENESS_001');
      expect(codes).not.toContain('CURRICULUM_COMPLETENESS_004');
    }
  });
});
