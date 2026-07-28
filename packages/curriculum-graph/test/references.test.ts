import { describe, expect, it } from 'vitest';
import { graphFixture } from './support/graph-fixture.js';

describe('declared references and normalized containment', () => {
  it('normalizes track, module, competency, lesson, and milestone containment', async () => {
    const outcome = await graphFixture('valid/minimal');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.value.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'track-js-core',
          to: 'module-js-functions',
          type: 'contains',
        }),
        expect.objectContaining({
          from: 'module-js-functions',
          to: 'js.function.values',
          type: 'contains',
        }),
        expect.objectContaining({
          from: 'module-js-functions',
          to: 'lesson-js-function-values',
          type: 'contains',
        }),
        expect.objectContaining({
          from: 'module-js-functions',
          to: 'milestone-js-foundations',
          type: 'contains',
        }),
      ]),
    );
  });

  it.each([
    ['invalid/missing-module-competency', 'competencies.0'],
    ['invalid/missing-module-milestone', 'milestone'],
  ] as const)('rejects %s at the declaring pointer', async (fixture, pointer) => {
    const outcome = await graphFixture(fixture);
    expect(outcome.ok).toBe(false);
    const locationMatcher: unknown = expect.objectContaining({ pointer });
    expect(outcome.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CURRICULUM_REFERENCE_001',
          location: locationMatcher,
        }),
      ]),
    );
  });

  it('deduplicates reciprocal structural declarations without losing declaration locations', async () => {
    const outcome = await graphFixture('valid/minimal');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const moduleLessonEdges = outcome.value.edges.filter(
      ({ from, to, type }) =>
        from === 'module-js-functions' && to === 'lesson-js-function-values' && type === 'contains',
    );
    expect(moduleLessonEdges).toHaveLength(1);
    expect(outcome.value.declaredReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          declaringId: 'module-js-functions',
          targetId: 'lesson-js-function-values',
          relation: 'module.lessons',
        }),
        expect.objectContaining({
          declaringId: 'lesson-js-function-values',
          targetId: 'module-js-functions',
          relation: 'lesson.module',
        }),
      ]),
    );
  });
});
