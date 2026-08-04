import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { RubricSchema } from '@roadmap/rubric-schema';
import type { Rubric, RubricEvaluation } from '@roadmap/rubric-schema';
import {
  createAssessmentResult,
  RemediationCatalogSchema,
  validateRemediationCoverage,
} from '../src/index.js';
import type { AssessmentResult, RemediationCatalog } from '../src/index.js';
import { generateRemediationCatalogJsonSchema } from '../src/json-schema.js';

interface RubricCriterionInput {
  readonly id: string;
  readonly critical: boolean;
  readonly required: boolean;
}

async function readRemediationCatalogFixture(): Promise<RemediationCatalog> {
  return RemediationCatalogSchema.parse(
    parse(
      await readFile(
        new URL('../../../fixtures/assessment/closure-counter-remediation.yaml', import.meta.url),
        'utf8',
      ),
    ),
  );
}

function createRubric(criteria: readonly RubricCriterionInput[]): Rubric {
  return RubricSchema.parse({
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
  });
}

function requireFailure(outcome: ReturnType<typeof validateRemediationCoverage>): readonly {
  readonly code: string;
  readonly severity: string;
  readonly location: { readonly file: string; readonly pointer?: string };
  readonly observed: unknown;
  readonly expected: string;
  readonly reason: string;
  readonly remediation: string;
  readonly documentation: string;
}[] {
  expect(outcome.ok).toBe(false);
  if (outcome.ok) throw new Error('Expected remediation coverage to fail');
  return outcome.diagnostics;
}

describe('RemediationCatalogSchema', () => {
  it('parses the exact canonical repository YAML remediation fixture', async () => {
    const catalog = await readRemediationCatalogFixture();

    expect(catalog).toEqual({
      schemaVersion: 1,
      entries: [
        {
          criterion: 'closure.private-state',
          competency: 'js.function.closure',
          lessons: ['lesson-js-closure-private-state'],
          exercises: ['ex-js-closure-counter'],
          retake: [
            'Restore independent state for each counter instance',
            'Add the negative independence test',
            'Update the technical explanation',
          ],
        },
      ],
    });
  });

  it('rejects duplicate criteria and strict unknown catalog keys', async () => {
    const catalog = await readRemediationCatalogFixture();
    const entry = catalog.entries[0];
    if (entry === undefined)
      throw new Error('Expected the fixture to contain one remediation entry');

    expect(() =>
      RemediationCatalogSchema.parse({
        schemaVersion: 1,
        entries: [entry, entry],
      }),
    ).toThrow('One remediation entry per criterion is allowed');
    expect(
      RemediationCatalogSchema.safeParse({
        ...catalog,
        undocumentedField: true,
      }).success,
    ).toBe(false);
    expect(
      RemediationCatalogSchema.safeParse({
        schemaVersion: 1,
        entries: [{ ...entry, undocumentedField: true }],
      }).success,
    ).toBe(false);
  });

  it('requires canonical criterion, competency, lesson, and exercise identifiers', async () => {
    const catalog = await readRemediationCatalogFixture();
    const entry = catalog.entries[0];
    if (entry === undefined)
      throw new Error('Expected the fixture to contain one remediation entry');

    expect(
      RemediationCatalogSchema.safeParse({
        schemaVersion: 1,
        entries: [{ ...entry, criterion: 'private-state' }],
      }).success,
    ).toBe(false);
    expect(
      RemediationCatalogSchema.safeParse({
        schemaVersion: 1,
        entries: [{ ...entry, competency: 'closure' }],
      }).success,
    ).toBe(false);
    expect(
      RemediationCatalogSchema.safeParse({
        schemaVersion: 1,
        entries: [{ ...entry, lessons: ['assessment-js-closure-counter'] }],
      }).success,
    ).toBe(false);
    expect(
      RemediationCatalogSchema.safeParse({
        schemaVersion: 1,
        entries: [{ ...entry, exercises: ['lesson-js-closure-private-state'] }],
      }).success,
    ).toBe(false);
  });

  it('requires schema version one, at least one entry, and nonempty retake requirements', async () => {
    const catalog = await readRemediationCatalogFixture();
    const entry = catalog.entries[0];
    if (entry === undefined)
      throw new Error('Expected the fixture to contain one remediation entry');

    expect(RemediationCatalogSchema.safeParse({ ...catalog, schemaVersion: 2 }).success).toBe(
      false,
    );
    expect(RemediationCatalogSchema.safeParse({ schemaVersion: 1, entries: [] }).success).toBe(
      false,
    );
    expect(
      RemediationCatalogSchema.safeParse({
        schemaVersion: 1,
        entries: [{ ...entry, retake: [] }],
      }).success,
    ).toBe(false);
    expect(
      RemediationCatalogSchema.safeParse({
        schemaVersion: 1,
        entries: [{ ...entry, retake: [''] }],
      }).success,
    ).toBe(false);
  });
});

describe('validateRemediationCoverage', () => {
  it('reports required-only and critical-only omissions as canonical errors', async () => {
    const catalog = await readRemediationCatalogFixture();
    const requiredOnly = createRubric([
      { id: 'documentation.explanation', critical: false, required: true },
    ]);
    const criticalOnly = createRubric([
      { id: 'critical.debugging', critical: true, required: false },
    ]);

    expect(requireFailure(validateRemediationCoverage(requiredOnly, catalog))).toEqual([
      {
        code: 'ASSESSMENT_REMEDIATION_001',
        severity: 'error',
        location: {
          file: 'rubric-js-closure-counter',
          pointer: '/criteria/documentation.explanation',
        },
        observed: 'documentation.explanation',
        expected: 'One remediation entry for every required or critical criterion',
        reason: 'A blocking rubric failure would have no deterministic recovery path',
        remediation: 'Add a remediation catalog entry for documentation.explanation',
        documentation: 'docs/authoring/remediation.md',
      },
    ]);
    expect(requireFailure(validateRemediationCoverage(criticalOnly, catalog))).toMatchObject([
      {
        code: 'ASSESSMENT_REMEDIATION_001',
        severity: 'error',
        observed: 'critical.debugging',
        documentation: 'docs/authoring/remediation.md',
      },
    ]);
  });

  it('sorts multiple missing required or critical criteria by criterion ID', async () => {
    const catalog = await readRemediationCatalogFixture();
    const rubric = createRubric([
      { id: 'zeta.last', critical: false, required: true },
      { id: 'alpha.first', critical: true, required: false },
      { id: 'closure.private-state', critical: true, required: true },
    ]);

    expect(
      requireFailure(validateRemediationCoverage(rubric, catalog)).map(({ observed }) => observed),
    ).toEqual(['alpha.first', 'zeta.last']);
  });

  it('returns success(undefined) only when all required and critical criteria have remediation', async () => {
    const catalog = await readRemediationCatalogFixture();
    const rubric = createRubric([
      { id: 'closure.private-state', critical: true, required: true },
      { id: 'optional.context', critical: false, required: false },
    ]);

    expect(validateRemediationCoverage(rubric, catalog)).toEqual({
      ok: true,
      value: undefined,
      diagnostics: [],
    });
  });
});

describe('createAssessmentResult', () => {
  it('preserves blocking order and returns exact fixture remediation for needs-remediation results', async () => {
    const catalog = await readRemediationCatalogFixture();
    const evaluation: RubricEvaluation = {
      status: 'needs-remediation',
      criteria: [
        {
          criterionId: 'closure.private-state',
          critical: true,
          required: true,
          score: 1,
          status: 'failed',
        },
      ],
      blockingCriterionIds: ['closure.private-state'],
    };
    const result: AssessmentResult = createAssessmentResult(evaluation, catalog);

    expect(result).toEqual({
      status: 'needs-remediation',
      blocking: [
        {
          criterion: 'closure.private-state',
          competency: 'js.function.closure',
          lessons: ['lesson-js-closure-private-state'],
          exercises: ['ex-js-closure-counter'],
          retake: [
            'Restore independent state for each counter instance',
            'Add the negative independence test',
            'Update the technical explanation',
          ],
        },
      ],
    });
  });

  it('returns passed results without blocking remediation and fails closed for a missing blocking entry', async () => {
    const catalog: RemediationCatalog = await readRemediationCatalogFixture();
    const passed: RubricEvaluation = {
      status: 'passed',
      criteria: [],
      blockingCriterionIds: [],
    };
    const missing: RubricEvaluation = {
      status: 'needs-remediation',
      criteria: [
        {
          criterionId: 'documentation.explanation',
          critical: false,
          required: true,
          score: 0,
          status: 'failed',
        },
      ],
      blockingCriterionIds: ['documentation.explanation'],
    };

    expect(createAssessmentResult(passed, catalog)).toEqual({
      status: 'passed',
      blocking: [],
    });
    expect(() => createAssessmentResult(missing, catalog)).toThrow(
      'No remediation entry for blocking criterion documentation.explanation',
    );
  });
});

describe('generated remediation catalog JSON Schema', () => {
  it('matches the committed artifact exactly', async () => {
    const committed: unknown = JSON.parse(
      await readFile(
        new URL('../generated/remediation-catalog.schema.json', import.meta.url),
        'utf8',
      ),
    ) as unknown;

    expect(committed).toEqual(generateRemediationCatalogJsonSchema());
  });
});
