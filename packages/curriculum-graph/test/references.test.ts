import { describe, expect, it } from 'vitest';
import { normalizeEdges } from '../src/edges.js';
import { resolveReferences } from '../src/references.js';
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

  it('rejects an existing wrong-kind module lesson at the declaring pointer', async () => {
    const outcome = await graphFixture('invalid/wrong-kind-module-lesson');
    expect(outcome.ok).toBe(false);
    const fileMatcher: unknown = expect.stringMatching(/module\.md$/);
    const locationMatcher: unknown = expect.objectContaining({
      file: fileMatcher,
      pointer: 'lessons.0',
    });
    expect(outcome.diagnostics).toEqual([
      expect.objectContaining({
        code: 'CURRICULUM_REFERENCE_002',
        location: locationMatcher,
        observed: {
          targetId: 'assessment-wrong-kind-module-lesson',
          actualKind: 'assessment',
        },
        expected: 'A curriculum document with kind "lesson" for module.lessons',
      }),
    ]);
  });

  it.each([
    ['track.requiredCompetencies', 'module-js-functions', 'module', 'competency'],
    ['track.modules', 'lesson-js-function-values', 'lesson', 'module'],
    ['module.competencies', 'lesson-js-function-values', 'lesson', 'competency'],
    ['module.lessons', 'assessment-js-function-values', 'assessment', 'lesson'],
    ['module.milestone', 'module-js-functions', 'module', 'milestone'],
    ['lesson.module', 'track-js-core', 'track', 'module'],
    ['lesson.competencies', 'assessment-js-function-values', 'assessment', 'competency'],
    ['lesson.assessments', 'lesson-js-function-values', 'lesson', 'assessment'],
    ['assessment.competencies', 'milestone-js-foundations', 'milestone', 'competency'],
    ['milestone.competencies', 'lesson-js-function-values', 'lesson', 'competency'],
    ['gate.remediation', 'lesson-js-function-values', 'lesson', 'assessment'],
  ] as const)(
    'rejects %s target %s whose existing kind is %s instead of %s',
    async (relation, targetId, actualKind, expectedKind) => {
      const valid = await graphFixture('valid/minimal');
      expect(valid.ok).toBe(true);
      if (!valid.ok) return;

      expect(
        resolveReferences(valid.value.nodes, [
          {
            declaringId: 'module-js-functions',
            targetId,
            relation,
            sourceFile: 'matrix.md',
            pointer: 'target.0',
          },
        ]),
      ).toEqual([
        expect.objectContaining({
          code: 'CURRICULUM_REFERENCE_002',
          location: { file: 'matrix.md', pointer: 'target.0' },
          observed: { targetId, actualKind },
          expected: `A curriculum document with kind "${expectedKind}" for ${relation}`,
        }),
      ]);
    },
  );

  it.each([
    [
      'invalid/missing-assessment',
      'test.missing-assessment',
      'lesson-assessment-wrong-kind',
      'assesses',
    ],
    [
      'invalid/missing-remediation',
      'test.missing-remediation',
      'assessment-remediation-wrong-kind',
      'remediates',
    ],
  ] as const)(
    'defers the competency evidence relation in %s to Task 7 completeness',
    async (fixture, competencyId, targetId, edgeType) => {
      const outcome = await graphFixture(fixture);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.value.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            from: competencyId,
            to: targetId,
            type: edgeType,
          }),
        ]),
      );
    },
  );

  it('normalizes gate remediation to its assessment target', async () => {
    const outcome = await graphFixture('valid/minimal');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const declared = {
      declaringId: 'gate-fixture',
      targetId: 'assessment-js-function-values',
      relation: 'gate.remediation' as const,
      sourceFile: 'gate-fixture.md',
      pointer: 'remediation.0',
    };
    expect(resolveReferences(outcome.value.nodes, [declared])).toEqual([]);
    expect(normalizeEdges([declared])).toEqual([
      {
        from: 'gate-fixture',
        to: 'assessment-js-function-values',
        type: 'remediates',
        sourceFile: 'gate-fixture.md',
      },
    ]);
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
