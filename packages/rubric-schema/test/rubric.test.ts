import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  CriterionIdSchema,
  evaluateRubric,
  rubricEvidenceReferences,
  RubricSchema,
  RubricSubmissionSchema,
} from '../src/index.js';
import type { CriterionResult } from '../src/index.js';
import { generateRubricJsonSchema } from '../src/json-schema.js';

interface CriticalCriterionFixture {
  readonly rubric: unknown;
  readonly submission: unknown;
}

interface InlineCriterion {
  readonly id: string;
  readonly critical: boolean;
  readonly required: boolean;
}

const criticalOnlyFailedCriterion = {
  criterionId: 'closure.private-state',
  critical: true,
  required: false,
  score: 1,
  status: 'failed',
} satisfies CriterionResult;

async function readCriticalCriterionFixture(): Promise<CriticalCriterionFixture> {
  return JSON.parse(
    await readFile(
      new URL(
        '../../../fixtures/rubric/invalid/critical-criterion-below-threshold.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as CriticalCriterionFixture;
}

function createRubric(criteria: readonly InlineCriterion[]) {
  return {
    schemaVersion: 1,
    id: 'rubric-js-closure-counter',
    version: '1.0.0',
    title: 'Closure counter rubric',
    criteria: criteria.map((criterion) => ({
      ...criterion,
      title: criterion.id,
      competency: 'js.function.closure',
      evidence: ['test-report'],
      levels: {
        '0': 'Does not meet the criterion',
        '1': 'Partially meets the criterion',
        '2': 'Meets the criterion',
        '3': 'Exceeds the criterion',
      },
    })),
  };
}

function getFirstCriterion(rubric: ReturnType<typeof createRubric>) {
  const criterion = rubric.criteria[0];
  if (criterion === undefined) {
    throw new Error('Expected rubric test data to contain a criterion');
  }
  return criterion;
}

describe('evaluateRubric', () => {
  it('fails when the repository fixture has a critical criterion below 2 regardless of another score', async () => {
    const fixture = await readCriticalCriterionFixture();
    const rubric = RubricSchema.parse(fixture.rubric);
    const result = evaluateRubric(rubric, RubricSubmissionSchema.parse(fixture.submission));

    expect(result.status).toBe('needs-remediation');
    expect(result.blockingCriterionIds).toEqual(['closure.private-state']);
    expect(result.criteria).toEqual([
      {
        criterionId: 'closure.private-state',
        critical: true,
        required: true,
        score: 1,
        status: 'failed',
      },
      {
        criterionId: 'documentation.explanation',
        critical: false,
        required: true,
        score: 3,
        status: 'passed',
      },
    ]);
  });

  it('blocks a below-threshold critical criterion that is not required', () => {
    const rubric = RubricSchema.parse(
      createRubric([{ id: 'closure.private-state', critical: true, required: false }]),
    );

    const result = evaluateRubric(rubric, {
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      scores: { 'closure.private-state': 1 },
    });

    expect(result.status).toBe('needs-remediation');
    expect(result.blockingCriterionIds).toEqual(['closure.private-state']);
    expect(result.criteria).toEqual([criticalOnlyFailedCriterion]);
  });

  it('requires a missing required criterion even when the critical criterion passes', () => {
    const rubric = RubricSchema.parse(
      createRubric([
        { id: 'closure.private-state', critical: true, required: true },
        { id: 'documentation.explanation', critical: false, required: true },
      ]),
    );

    const result = evaluateRubric(rubric, {
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      scores: { 'closure.private-state': 2 },
    });

    expect(result.status).toBe('needs-remediation');
    expect(result.blockingCriterionIds).toEqual(['documentation.explanation']);
  });

  it('passes only when every required and critical criterion is at least 2', () => {
    const rubric = RubricSchema.parse(
      createRubric([
        { id: 'closure.private-state', critical: true, required: true },
        { id: 'documentation.explanation', critical: false, required: true },
      ]),
    );

    const result = evaluateRubric(rubric, {
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      scores: {
        'closure.private-state': 2,
        'documentation.explanation': 3,
      },
    });

    expect(result.status).toBe('passed');
    expect(result.blockingCriterionIds).toEqual([]);
  });

  it('does not block for an omitted optional noncritical criterion', () => {
    const rubric = RubricSchema.parse(
      createRubric([
        { id: 'closure.private-state', critical: true, required: true },
        { id: 'documentation.explanation', critical: false, required: false },
      ]),
    );

    const result = evaluateRubric(rubric, {
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      scores: { 'closure.private-state': 2 },
    });

    expect(result.status).toBe('passed');
    expect(result.criteria).toEqual([
      {
        criterionId: 'closure.private-state',
        critical: true,
        required: true,
        score: 2,
        status: 'passed',
      },
      {
        criterionId: 'documentation.explanation',
        critical: false,
        required: false,
        score: null,
        status: 'missing',
      },
    ]);
  });

  it('rejects a submission targeted at another rubric version', () => {
    const rubric = RubricSchema.parse(
      createRubric([{ id: 'closure.private-state', critical: true, required: true }]),
    );

    expect(() =>
      evaluateRubric(rubric, {
        rubricId: rubric.id,
        rubricVersion: '9.9.9',
        scores: { 'closure.private-state': 2 },
      }),
    ).toThrow(
      'Rubric submission targets rubric-js-closure-counter@9.9.9, expected rubric-js-closure-counter@1.0.0',
    );
  });

  it('rejects a submission targeted at another rubric ID', () => {
    const rubric = RubricSchema.parse(
      createRubric([{ id: 'closure.private-state', critical: true, required: true }]),
    );

    expect(() =>
      evaluateRubric(rubric, {
        rubricId: 'rubric-js-other-counter',
        rubricVersion: rubric.version,
        scores: { 'closure.private-state': 2 },
      }),
    ).toThrow(
      'Rubric submission targets rubric-js-other-counter@1.0.0, expected rubric-js-closure-counter@1.0.0',
    );
  });

  it('rejects undeclared score keys in deterministic order', () => {
    const rubric = RubricSchema.parse(
      createRubric([{ id: 'closure.private-state', critical: true, required: true }]),
    );

    expect(() =>
      evaluateRubric(rubric, {
        rubricId: rubric.id,
        rubricVersion: rubric.version,
        scores: {
          'closure.private-state': 2,
          'zeta.criterion': 3,
          'alpha.criterion': 3,
        },
      }),
    ).toThrow('Unknown rubric criterion: alpha.criterion, zeta.criterion');
  });
});

describe('RubricSchema', () => {
  it('rejects artifact IDs outside the canonical rubric family', () => {
    const nonRubric = {
      ...createRubric([{ id: 'closure.private-state', critical: true, required: true }]),
      id: 'assessment-js-closure-counter',
    };

    expect(() => RubricSchema.parse(nonRubric)).toThrow(
      'Rubric IDs must use the canonical rubric artifact family',
    );
  });

  it('rejects criterion IDs outside the dotted criterion grammar', () => {
    const invalidCriterionId = createRubric([
      { id: 'private-state', critical: true, required: true },
    ]);

    expect(() => RubricSchema.parse(invalidCriterionId)).toThrow();
  });

  it('rejects a criterion with a noncanonical competency ID', () => {
    const invalidCompetency = createRubric([
      { id: 'closure.private-state', critical: true, required: true },
    ]);
    getFirstCriterion(invalidCompetency).competency = 'closure';

    expect(() => RubricSchema.parse(invalidCompetency)).toThrow();
  });

  it('accepts only the closed evidence-reference vocabulary', () => {
    const acceptedReferences = [
      'test-report',
      'source-diff',
      'explanation',
      'observation-report',
      'debugging-report',
    ];

    for (const evidenceReference of acceptedReferences) {
      const rubric = createRubric([
        { id: 'closure.private-state', critical: true, required: true },
      ]);
      getFirstCriterion(rubric).evidence = [evidenceReference];

      expect(RubricSchema.safeParse(rubric).success).toBe(true);
    }

    const invalidEvidence = createRubric([
      { id: 'closure.private-state', critical: true, required: true },
    ]);
    getFirstCriterion(invalidEvidence).evidence = ['screen-recording'];

    expect(RubricSchema.safeParse(invalidEvidence).success).toBe(false);
  });

  it('rejects unknown rubric fields to prevent metadata drift', () => {
    const unknownField = {
      ...createRubric([{ id: 'closure.private-state', critical: true, required: true }]),
      undocumentedField: true,
    };

    expect(RubricSchema.safeParse(unknownField).success).toBe(false);
  });

  it('rejects duplicate criterion IDs', () => {
    const duplicateCriteria = createRubric([
      { id: 'closure.private-state', critical: true, required: true },
      { id: 'closure.private-state', critical: false, required: true },
    ]);

    expect(RubricSchema.safeParse(duplicateCriteria).success).toBe(false);
  });

  it('rejects unknown criterion and level fields', () => {
    const criterionFixture = createRubric([
      { id: 'closure.private-state', critical: true, required: true },
    ]);
    const criterion = getFirstCriterion(criterionFixture);
    const unknownCriterionField = {
      ...criterionFixture,
      criteria: [{ ...criterion, undocumentedField: true }],
    };
    const unknownLevelField = {
      ...criterionFixture,
      criteria: [{ ...criterion, levels: { ...criterion.levels, '4': 'Out of range' } }],
    };

    expect(RubricSchema.safeParse(unknownCriterionField).success).toBe(false);
    expect(RubricSchema.safeParse(unknownLevelField).success).toBe(false);
  });

  it('requires schema version, semver, title, criteria, and every nonempty level', () => {
    const valid = createRubric([{ id: 'closure.private-state', critical: true, required: true }]);
    const criterion = getFirstCriterion(valid);
    const missingLevel = {
      ...valid,
      criteria: [{ ...criterion, levels: { ...criterion.levels, '3': '' } }],
    };

    expect(RubricSchema.safeParse({ ...valid, schemaVersion: 2 }).success).toBe(false);
    expect(RubricSchema.safeParse({ ...valid, version: '1.0' }).success).toBe(false);
    expect(RubricSchema.safeParse({ ...valid, title: '' }).success).toBe(false);
    expect(RubricSchema.safeParse({ ...valid, criteria: [] }).success).toBe(false);
    expect(RubricSchema.safeParse(missingLevel).success).toBe(false);
  });
});

describe('RubricSubmissionSchema', () => {
  it('rejects noncanonical targets, invalid score keys or scores, and unknown fields', () => {
    const valid = {
      rubricId: 'rubric-js-closure-counter',
      rubricVersion: '1.0.0',
      scores: { 'closure.private-state': 2 },
    };

    expect(
      RubricSubmissionSchema.safeParse({ ...valid, rubricId: 'assessment-js-closure' }).success,
    ).toBe(false);
    expect(RubricSubmissionSchema.safeParse({ ...valid, rubricVersion: '1.0' }).success).toBe(
      false,
    );
    expect(
      RubricSubmissionSchema.safeParse({ ...valid, scores: { 'closure.private-state': 4 } })
        .success,
    ).toBe(false);
    expect(RubricSubmissionSchema.safeParse({ ...valid, scores: { criterion: 2 } }).success).toBe(
      false,
    );
    expect(RubricSubmissionSchema.safeParse({ ...valid, undocumentedField: true }).success).toBe(
      false,
    );
  });
});

describe('generated JSON Schema', () => {
  it('matches the canonical rubric schema exactly', async () => {
    const committed: unknown = JSON.parse(
      await readFile(new URL('../generated/rubric.schema.json', import.meta.url), 'utf8'),
    );

    expect(committed).toEqual(generateRubricJsonSchema());
  });
});

describe('public schema surface', () => {
  it('exposes the dotted criterion parser and exact evidence-reference order', () => {
    expect(CriterionIdSchema.parse('closure.private-state')).toBe('closure.private-state');
    expect(rubricEvidenceReferences).toEqual([
      'test-report',
      'source-diff',
      'explanation',
      'observation-report',
      'debugging-report',
    ]);
  });
});
