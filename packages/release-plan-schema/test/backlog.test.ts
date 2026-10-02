import path from 'node:path';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import { RubricSchema } from '@roadmap/rubric-schema';
import {
  ReleasePlanSchema,
  validateReleasePlan,
  type ReleasePlan,
  type ReleasePlanValidationContext,
} from '../src/index.js';

const context: ReleasePlanValidationContext = {
  competencyIds: ['js.function.closure', 'db.transaction.atomic-enrollment'],
  moduleIds: ['module-javascript-essentials', 'module-postgresql-drizzle'],
  criterionIds: ['backend.authorization'],
  criticalCriteria: ['backend.authorization'],
};

const command = {
  command: 'pnpm',
  args: ['test'],
  cwd: '.',
  timeoutMs: 120_000,
};

const validPlan = (): ReleasePlan =>
  ReleasePlanSchema.parse({
    schemaVersion: 1,
    releaseId: 'release-0-1-0',
    items: [
      {
        id: 'R1-CONTENT-JS-001',
        status: 'ready',
        lane: 'curriculum',
        risk: 'R1',
        objective: 'Write and validate the closure mental-model lesson',
        specReferences: ['curriculum/competencies/js.function.closure.md'],
        dependsOn: [],
        files: ['curriculum/lessons/lesson-js-closure-private-state.md'],
        acceptance: [command],
        review: ['curriculum', 'testing'],
        evidence: ['executable-example-report'],
        openQuestions: [],
        coverage: {
          competencies: ['js.function.closure'],
          modules: [{ id: 'module-javascript-essentials', roles: ['content', 'assessment'] }],
          criteria: [],
        },
      },
      {
        id: 'R1-DB-002',
        status: 'ready',
        lane: 'database',
        risk: 'R4',
        objective: 'Implement and verify atomic enrollment authorization',
        specReferences: ['projects/milestones/workshop-enrollment/rubric/rubric.yaml'],
        dependsOn: ['R1-CONTENT-JS-001'],
        files: ['templates/fullstack-vertical-slice/files/apps/api/src/enrollment.ts'],
        acceptance: [command],
        review: ['architecture', 'security', 'testing'],
        evidence: ['transaction-integration-report'],
        openQuestions: [],
        coverage: {
          competencies: ['db.transaction.atomic-enrollment'],
          modules: [{ id: 'module-postgresql-drizzle', roles: ['content', 'assessment'] }],
          criteria: [
            {
              id: 'backend.authorization',
              roles: ['implementation', 'test', 'remediation'],
            },
          ],
        },
      },
    ],
  });

function twoItems(plan: ReleasePlan): [ReleasePlan['items'][number], ReleasePlan['items'][number]] {
  const [first, second] = plan.items;
  if (first === undefined || second === undefined)
    throw new Error('fixture requires two work items');
  return [first, second];
}

function firstModule(
  plan: ReleasePlan,
): ReleasePlan['items'][number]['coverage']['modules'][number] {
  const [module] = twoItems(plan)[0].coverage.modules;
  if (module === undefined) throw new Error('fixture requires module coverage');
  return module;
}

function firstCriterion(
  plan: ReleasePlan,
): ReleasePlan['items'][number]['coverage']['criteria'][number] {
  const [criterion] = twoItems(plan)[1].coverage.criteria;
  if (criterion === undefined) throw new Error('fixture requires criterion coverage');
  return criterion;
}

const firstItem = (plan: ReleasePlan): ReleasePlan['items'][number] => twoItems(plan)[0];
const secondItem = (plan: ReleasePlan): ReleasePlan['items'][number] => twoItems(plan)[1];

describe('ReleasePlanSchema', () => {
  it('rejects shell strings, absolute paths, and ready items with open questions', () => {
    const invalid = structuredClone(validPlan());
    const first = firstItem(invalid);
    first.acceptance[0] = { ...first.acceptance[0], command: 'pnpm test && rm -rf .' };
    first.files = ['C:\\private\\answer.ts'];
    first.openQuestions = ['Which runtime should we use?'];
    expect(() => ReleasePlanSchema.parse(invalid)).toThrow();
  });
});

describe('validateReleasePlan', () => {
  it('returns deterministic topological order and complete coverage', () => {
    const result = validateReleasePlan(validPlan(), context);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.topologicalOrder).toEqual(['R1-CONTENT-JS-001', 'R1-DB-002']);
      expect(result.value.coverage).toEqual({ competencies: 2, modules: 2, criticalCriteria: 1 });
    }
  });

  it.each([
    [
      'RELEASE_PLAN_ID_001',
      (plan: ReleasePlan) => {
        secondItem(plan).id = firstItem(plan).id;
      },
    ],
    [
      'RELEASE_PLAN_DEPENDENCY_001',
      (plan: ReleasePlan) => {
        secondItem(plan).dependsOn = ['R1-MISSING-001'];
      },
    ],
    [
      'RELEASE_PLAN_CYCLE_001',
      (plan: ReleasePlan) => {
        firstItem(plan).dependsOn = ['R1-DB-002'];
      },
    ],
    [
      'RELEASE_PLAN_SCOPE_001',
      (plan: ReleasePlan) => {
        firstItem(plan).objective = 'Finish Release 1';
      },
    ],
    [
      'RELEASE_PLAN_TRACEABILITY_001',
      (plan: ReleasePlan) => {
        firstItem(plan).coverage.competencies = [];
      },
    ],
    [
      'RELEASE_PLAN_MODULE_001',
      (plan: ReleasePlan) => {
        firstModule(plan).roles = ['content'];
      },
    ],
    [
      'RELEASE_PLAN_CRITERION_001',
      (plan: ReleasePlan) => {
        firstCriterion(plan).roles = ['implementation'];
      },
    ],
  ] as const)('emits %s for the exact invalid contract', (code, mutate) => {
    const plan = validPlan();
    mutate(plan);
    const result = validateReleasePlan(plan, context);
    expect(result.ok).toBe(false);
  });

  it('validates the repository Release 1 backlog against curriculum and rubric coverage', async () => {
    const root = path.resolve(import.meta.dirname, '..', '..', '..');
    const corpus = await loadCurriculum(path.join(root, 'curriculum'));
    expect(corpus.ok).toBe(true);
    if (!corpus.ok) return;

    const byId = new Map(corpus.value.documents.map((document) => [document.data.id, document]));
    const track = byId.get('track-core-vertical-slice');
    expect(track?.data.kind).toBe('track');
    if (track?.data.kind !== 'track') return;

    const rubric = RubricSchema.parse(
      YAML.parse(
        await readFile(
          path.join(root, 'projects', 'milestones', 'workshop-enrollment', 'rubric', 'rubric.yaml'),
          'utf8',
        ),
      ),
    );
    const plan = ReleasePlanSchema.parse(
      YAML.parse(await readFile(path.join(root, 'planning', 'release-1', 'backlog.yaml'), 'utf8')),
    );
    const result = validateReleasePlan(plan, {
      competencyIds: track.data.requiredCompetencies,
      moduleIds: track.data.modules,
      criterionIds: rubric.criteria.map((criterion) => criterion.id),
      criticalCriteria: rubric.criteria
        .filter((criterion) => criterion.critical)
        .map((criterion) => criterion.id),
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.topologicalOrder.length).toBeGreaterThan(0);
  });
});
