import { describe, expect, it } from 'vitest';
import {
  classifyLearnerProbe,
  evaluateWp10Skeleton,
  type Wp10SkeletonInput,
} from './verify-wp10-skeleton.js';

const learnerOutput = [
  'LEARNER_API_ENROLLMENT_001',
  'LEARNER_WEB_ENROLLMENT_001',
  '--- api learner contract: NOT SATISFIED (exit 1) ---',
  '--- web learner contract: NOT SATISFIED (exit 1) ---',
].join('\n');

function learnerResult(overrides: Partial<Parameters<typeof classifyLearnerProbe>[0]> = {}) {
  return {
    command: { command: 'pnpm', args: ['verify'], cwd: '.', timeoutMs: 300_000 },
    exitCode: 1,
    signal: null,
    timedOut: false,
    stdout: learnerOutput,
    stderr: '',
    durationMs: 1,
    ...overrides,
  };
}

describe('learner probe classification', () => {
  it.each([
    [
      'requires both failed suite markers',
      { stdout: 'LEARNER_API_ENROLLMENT_001\nLEARNER_WEB_ENROLLMENT_001' },
    ],
    ['rejects a runner diagnostic', { stderr: 'LEARNER_RUNNER_002' }],
    ['rejects a timeout', { timedOut: true }],
    ['rejects signal termination', { signal: 'SIGTERM', exitCode: null }],
    ['rejects a passing command', { exitCode: 0 }],
  ])('%s', (_name, overrides) => {
    const classified = classifyLearnerProbe(learnerResult(overrides as never));
    expect(classified.status).not.toBe('expected-failure');
  });

  it('accepts exactly the two observed learner failures when the seam is proven', () => {
    expect(classifyLearnerProbe(learnerResult()).status).toBe('expected-failure');
  });

  it('rejects output when the independently probed seam is unhealthy', () => {
    expect(classifyLearnerProbe(learnerResult(), ['TEMPLATE_SEAM_002'] as const).status).toBe(
      'unexpected-failure',
    );
  });
});

const numberText = (value: number): string => String(value);

const validInput = (): Wp10SkeletonInput => ({
  sourceCommit: '0123456789abcdef0123456789abcdef01234567',
  release: {
    id: 'release-0-1-0',
    status: 'review',
    maturity: 'experimental',
    claims: ['Repository kernel and reference path structure are implemented'],
  },
  trackId: 'track-core-vertical-slice',
  competencies: Array.from({ length: 19 }, (_, index) => `competency.${numberText(index)}`),
  modules: Array.from({ length: 9 }, (_, index) => ({
    id: `module-${numberText(index)}`,
    body: `## Problem\nMeaningful technical preview body for module ${numberText(index)} with enough prose.`,
  })),
  gates: Array.from({ length: 7 }, (_, index) => `gate-${numberText(index)}`),
  backlog: {
    items: Array.from({ length: 19 }, (_, index) => ({
      id: `R1-ITEM-${numberText(index)}`,
      competencies: [`competency.${numberText(index)}`],
    })),
  },
  decisions: [
    { id: '0002-reference-authentication', status: 'Accepted for the Release 1 reference stack' },
    {
      id: '0003-workshop-enrollment-boundaries',
      status: 'Accepted for the Release 1 reference stack',
    },
    { id: '0004-reference-deployment-shape', status: 'Accepted for the Release 1 reference stack' },
  ],
  remediation: { missingBlockingCriteria: [] },
  template: {
    id: 'template-fullstack-vertical-slice',
    version: '0.1.0',
    baselineStatus: 'passed',
    learnerStatus: 'expected-failure',
    learnerDiagnostics: ['LEARNER_API_ENROLLMENT_001', 'LEARNER_WEB_ENROLLMENT_001'],
  },
});

function firstModule(input: Wp10SkeletonInput): Wp10SkeletonInput['modules'][number] {
  const [module] = input.modules;
  if (module === undefined) throw new Error('fixture requires one module');
  return module;
}

function firstDecision(input: Wp10SkeletonInput): Wp10SkeletonInput['decisions'][number] {
  const [decision] = input.decisions;
  if (decision === undefined) throw new Error('fixture requires one decision');
  return decision;
}

const cases = [
  [
    'WP10_RELEASE_CLAIM_001',
    (input: Wp10SkeletonInput) => input.release.claims.push('Junior Fullstack readiness'),
  ],
  [
    'WP10_CONTENT_001',
    (input: Wp10SkeletonInput) => {
      firstModule(input).body = '# Heading only';
    },
  ],
  [
    'WP10_TRACEABILITY_001',
    (input: Wp10SkeletonInput) => {
      input.backlog.items = input.backlog.items.slice(1);
    },
  ],
  [
    'WP10_TEMPLATE_BASELINE_001',
    (input: Wp10SkeletonInput) => {
      input.template.baselineStatus = 'failed';
    },
  ],
  [
    'WP10_TEMPLATE_LEARNER_001',
    (input: Wp10SkeletonInput) => {
      input.template.learnerStatus = 'passed';
    },
  ],
  [
    'WP10_DECISION_001',
    (input: Wp10SkeletonInput) => {
      firstDecision(input).status = 'Proposed';
    },
  ],
  [
    'WP10_REMEDIATION_001',
    (input: Wp10SkeletonInput) => {
      input.remediation.missingBlockingCriteria = ['backend.authorization'];
    },
  ],
] as const;

describe.each(cases)('%s', (code, mutate) => {
  it('fails with the exact diagnostic', () => {
    const input = validInput();
    mutate(input);
    const result = evaluateWp10Skeleton(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.map((entry) => entry.code)).toContain(code);
  });
});

it('accepts only the exact bounded skeleton contract', () => {
  const result = evaluateWp10Skeleton(validInput());
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toMatchObject({
      status: 'passed',
      competencies: 19,
      modules: 9,
      gates: 7,
      backlogItems: 19,
    });
  }
});
