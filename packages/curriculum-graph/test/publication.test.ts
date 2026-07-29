import { describe, expect, it } from 'vitest';
import { publicationDiagnostics } from '../src/publication.js';
import { validateCurriculumGraph } from '../src/validate.js';
import type { CurriculumGraph } from '../src/types.js';
import {
  buildCompositeValidationGraph,
  buildDraftParentPublishedChildGraph,
} from './support/graph-builder.js';
import { validateFixture } from './support/validate-fixture.js';

describe('publication declarations', () => {
  it('rejects a published node depending on draft content at its declaration', async () => {
    const outcome = await validateFixture('invalid/published-to-draft');
    expect(outcome.ok).toBe(false);
    const fileMatcher: unknown = expect.stringMatching(/published-track\.md$/);
    const locationMatcher: unknown = expect.objectContaining({
      file: fileMatcher,
      pointer: 'prerequisites.0',
    });
    expect(outcome.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CURRICULUM_PUBLICATION_001',
          location: locationMatcher,
        }),
      ]),
    );
  });

  it.each([
    ['invalid/published-to-draft-reverse', 'draft'],
    ['invalid/published-to-review-reverse', 'review'],
  ] as const)(
    'rejects %s at the published lesson declaration despite reverse normalized containment',
    async (fixture, targetStatus) => {
      const outcome = await validateFixture(fixture);
      expect(outcome.ok).toBe(false);
      const fileMatcher: unknown = expect.stringMatching(/lesson\.md$/);
      const locationMatcher: unknown = expect.objectContaining({
        file: fileMatcher,
        pointer: 'module',
      });
      expect(outcome.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'CURRICULUM_PUBLICATION_001',
            location: locationMatcher,
            observed: {
              source: 'lesson-published-child',
              target: `module-${targetStatus}-parent`,
              targetStatus,
            },
          }),
        ]),
      );
    },
  );

  it('does not flag a draft parent declaration containing a published child', () => {
    const diagnostics = publicationDiagnostics(buildDraftParentPublishedChildGraph());
    expect(diagnostics.map(({ code }) => code)).not.toContain('CURRICULUM_PUBLICATION_001');
  });
});

describe('composed graph validation', () => {
  it('merges direct cycle and publication diagnostics', () => {
    const outcome = validateCurriculumGraph(buildCompositeValidationGraph());
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics.map(({ code }) => code)).toEqual([
      'CURRICULUM_GRAPH_003',
      'CURRICULUM_PUBLICATION_001',
    ]);
  });

  it('converts unexpected validator exceptions to VALIDATOR_INTERNAL_001', () => {
    const throwingGraph: CurriculumGraph = {
      nodes: new Map(),
      declaredReferences: [],
      get edges(): CurriculumGraph['edges'] {
        throw new Error('unexpected graph edge access');
      },
    };

    const outcome = validateCurriculumGraph(throwingGraph);
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics).toEqual([
      expect.objectContaining({
        code: 'VALIDATOR_INTERNAL_001',
        location: { file: '<curriculum-graph>' },
        observed: 'unexpected graph edge access',
      }),
    ]);
  });
});
