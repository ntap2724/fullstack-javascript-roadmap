import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { RemediationCatalogSchema, validateRemediationCoverage } from '@roadmap/assessment-core';
import { runCommand } from '@roadmap/command-runner';
import { buildCurriculumGraph, validateCurriculumGraph } from '@roadmap/curriculum-graph';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import {
  CompetencySchema,
  GateSchema,
  ModuleSchema,
  ReleaseSchema,
  TrackSchema,
} from '@roadmap/curriculum-schema';
import { loadReleasePlan, validateReleasePlan } from '@roadmap/release-plan-schema';
import { RubricSchema } from '@roadmap/rubric-schema';
import {
  failure,
  success,
  type Diagnostic,
  type ValidationOutcome,
} from '@roadmap/validation-core';
import { runTemplateDryRun } from '../tooling/publish-templates/src/pipeline.js';

export interface Wp10SkeletonInput {
  sourceCommit: string;
  release: { id: string; status: string; maturity: string; claims: string[] };
  trackId: string;
  competencies: string[];
  modules: Array<{ id: string; body: string }>;
  gates: string[];
  backlog: { items: Array<{ id: string; competencies: string[] }> };
  decisions: Array<{ id: string; status: string }>;
  remediation: { missingBlockingCriteria: string[] };
  template: {
    id: string;
    version: string;
    baselineStatus: 'passed' | 'failed';
    learnerStatus: 'expected-failure' | 'passed' | 'unexpected-failure';
    learnerDiagnostics: string[];
  };
}

export interface Wp10SkeletonReport {
  schemaVersion: 1;
  status: 'passed';
  release: '0.1.0-skeleton';
  track: 'track-core-vertical-slice';
  template: 'template-fullstack-vertical-slice@0.1.0';
  competencies: number;
  modules: number;
  gates: number;
  backlogItems: number;
  sourceCommit: string;
}

export interface Wp10RepositoryReport {
  skeleton: Wp10SkeletonReport;
  backlog: {
    schemaVersion: 1;
    status: 'passed';
    sourceCommit: string;
    items: number;
    cycles: 0;
    topologicalOrder: readonly string[];
  };
  template: {
    schemaVersion: 1;
    status: 'passed';
    sourceCommit: string;
    templateId: 'template-fullstack-vertical-slice';
    baselineStatus: 'passed';
    learnerStatus: 'expected-failure';
    learnerDiagnostics: readonly ['LEARNER_API_ENROLLMENT_001', 'LEARNER_WEB_ENROLLMENT_001'];
  };
}

function diagnostic(code: string, reason: string, observed: unknown, expected: string): Diagnostic {
  return {
    code,
    severity: 'error',
    location: { file: '<wp10-skeleton>' },
    observed,
    expected,
    reason,
    remediation: 'Correct the referenced WP-10 contract and rerun pnpm verify:wp10',
    documentation: 'docs/architecture/release-0-evidence.md',
  };
}

export function evaluateWp10Skeleton(
  input: Wp10SkeletonInput,
): ValidationOutcome<Wp10SkeletonReport> {
  const diagnostics: Diagnostic[] = [];
  if (
    !/^[0-9a-f]{40}$/.test(input.sourceCommit) ||
    input.release.id !== 'release-0-1-0' ||
    input.release.status !== 'review' ||
    input.release.maturity !== 'experimental' ||
    input.release.claims.some((claim) =>
      /junior fullstack readiness|complete self-study|stable curriculum/i.test(claim),
    )
  ) {
    diagnostics.push(
      diagnostic(
        'WP10_RELEASE_CLAIM_001',
        'Release 0 overstates Release 1 completion',
        input.release,
        'Review-only experimental skeleton claims',
      ),
    );
  }

  const invalidModules = input.modules
    .filter(({ body }) => {
      const prose = body.replace(/^#{1,6}\s+.*$/gm, '').trim();
      return prose.length < 40 || /^(?:placeholder|coming soon|incomplete)$/i.test(prose);
    })
    .map(({ id }) => id);
  if (invalidModules.length > 0) {
    diagnostics.push(
      diagnostic(
        'WP10_CONTENT_001',
        'One or more modules contain no meaningful technical-preview body',
        invalidModules,
        'Nine nonempty modules',
      ),
    );
  }

  const covered = new Set(input.backlog.items.flatMap((item) => item.competencies));
  const missingCompetencies = input.competencies.filter((id) => !covered.has(id));
  if (
    input.trackId !== 'track-core-vertical-slice' ||
    input.competencies.length !== 19 ||
    input.modules.length !== 9 ||
    input.gates.length !== 7 ||
    input.backlog.items.length === 0 ||
    missingCompetencies.length > 0
  ) {
    diagnostics.push(
      diagnostic(
        'WP10_TRACEABILITY_001',
        'Skeleton counts or backlog traceability do not match the approved contract',
        {
          competencies: input.competencies.length,
          modules: input.modules.length,
          gates: input.gates.length,
          backlogItems: input.backlog.items.length,
          missingCompetencies,
        },
        '19 competencies, 9 modules, 7 gates, and positive backlog coverage',
      ),
    );
  }

  if (
    input.template.id !== 'template-fullstack-vertical-slice' ||
    input.template.version !== '0.1.0' ||
    input.template.baselineStatus !== 'passed'
  ) {
    diagnostics.push(
      diagnostic(
        'WP10_TEMPLATE_BASELINE_001',
        'Generated starter baseline is unhealthy',
        input.template.baselineStatus,
        'passed',
      ),
    );
  }

  const expectedLearnerCodes = ['LEARNER_API_ENROLLMENT_001', 'LEARNER_WEB_ENROLLMENT_001'];
  if (
    input.template.learnerStatus !== 'expected-failure' ||
    !expectedLearnerCodes.every((code) => input.template.learnerDiagnostics.includes(code))
  ) {
    diagnostics.push(
      diagnostic(
        'WP10_TEMPLATE_LEARNER_001',
        'Learner verification does not fail only at the declared incomplete seams',
        input.template,
        'Expected API and web enrollment failures',
      ),
    );
  }

  const requiredDecisions = new Set([
    '0002-reference-authentication',
    '0003-workshop-enrollment-boundaries',
    '0004-reference-deployment-shape',
  ]);
  const accepted = new Set(
    input.decisions.filter(({ status }) => status.startsWith('Accepted')).map(({ id }) => id),
  );
  const missingDecisions = [...requiredDecisions].filter((id) => !accepted.has(id));
  if (missingDecisions.length > 0) {
    diagnostics.push(
      diagnostic(
        'WP10_DECISION_001',
        'Required reference decisions are missing or not accepted',
        missingDecisions,
        'All three accepted ADRs',
      ),
    );
  }

  if (input.remediation.missingBlockingCriteria.length > 0) {
    diagnostics.push(
      diagnostic(
        'WP10_REMEDIATION_001',
        'Blocking rubric criteria lack remediation',
        input.remediation.missingBlockingCriteria,
        'Complete blocking-criterion coverage',
      ),
    );
  }

  if (diagnostics.length > 0) return failure(diagnostics);
  return success({
    schemaVersion: 1,
    status: 'passed',
    release: '0.1.0-skeleton',
    track: 'track-core-vertical-slice',
    template: 'template-fullstack-vertical-slice@0.1.0',
    competencies: input.competencies.length,
    modules: input.modules.length,
    gates: input.gates.length,
    backlogItems: input.backlog.items.length,
    sourceCommit: input.sourceCommit,
  });
}

function unwrap<T>(outcome: ValidationOutcome<T>): T {
  if (!outcome.ok) {
    const error = new Error('A prerequisite WP-10 validation failed');
    Object.assign(error, { diagnostics: outcome.diagnostics });
    throw error;
  }
  return outcome.value;
}

async function readDecisionStatus(
  root: string,
  id: string,
): Promise<{ id: string; status: string }> {
  const source = await readFile(path.join(root, 'docs', 'decisions', `${id}.md`), 'utf8');
  const match = /^\*\*Status:\*\*\s+(.+)$/m.exec(source);
  if (match?.[1] === undefined) throw new Error(`Decision status is missing: ${id}`);
  return { id, status: match[1].trim() };
}

function pnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function classifyLearnerProbe(result: Awaited<ReturnType<typeof runCommand>>) {
  const output = `${result.stdout}\n${result.stderr}`;
  const expected = ['LEARNER_API_ENROLLMENT_001', 'LEARNER_WEB_ENROLLMENT_001'] as const;
  const diagnostics = expected.filter((code) => output.includes(code));
  const infrastructureFailure =
    /ERR_MODULE_NOT_FOUND|Cannot find module|DATABASE_URL|ECONNREFUSED|LEARNER_RUNNER_00[1-3]/i.test(
      output,
    );
  if (result.exitCode === 0) return { status: 'passed' as const, diagnostics };
  if (!infrastructureFailure && diagnostics.length === expected.length) {
    return { status: 'expected-failure' as const, diagnostics: [...expected] };
  }
  return { status: 'unexpected-failure' as const, diagnostics };
}

export async function verifyWp10Repository(
  root = process.cwd(),
): Promise<ValidationOutcome<Wp10RepositoryReport>> {
  let outputRoot: string | undefined;
  try {
    const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    const corpus = unwrap(await loadCurriculum(path.join(root, 'curriculum')));
    const graph = unwrap(buildCurriculumGraph(corpus));
    unwrap(validateCurriculumGraph(graph));

    const getDocument = (id: string) => {
      const document = graph.nodes.get(id);
      if (document === undefined) throw new Error(`Missing validated curriculum entity: ${id}`);
      return document;
    };

    const release = ReleaseSchema.parse(getDocument('release-0-1-0').data);
    const track = TrackSchema.parse(getDocument('track-core-vertical-slice').data);
    const competencies = track.requiredCompetencies.map((id) =>
      CompetencySchema.parse(getDocument(id).data),
    );
    const modules = track.modules.map((id) => {
      const document = getDocument(id);
      const data = ModuleSchema.parse(document.data);
      return { id: data.id, body: document.body };
    });
    const gates = track.gates.map((id) => GateSchema.parse(getDocument(id).data));

    const rubricPath = path.join(
      root,
      'projects',
      'milestones',
      'workshop-enrollment',
      'rubric',
      'rubric.yaml',
    );
    const remediationPath = path.join(
      root,
      'projects',
      'milestones',
      'workshop-enrollment',
      'remediation',
      'catalog.yaml',
    );
    const rubric = RubricSchema.parse(YAML.parse(await readFile(rubricPath, 'utf8')));
    const remediation = RemediationCatalogSchema.parse(
      YAML.parse(await readFile(remediationPath, 'utf8')),
    );
    const remediationOutcome = validateRemediationCoverage(rubric, remediation);
    const missingBlockingCriteria = remediationOutcome.ok
      ? []
      : remediationOutcome.diagnostics.map((entry) => String(entry.observed)).sort();

    const loadedPlan = unwrap(
      await loadReleasePlan(path.join(root, 'planning', 'release-1', 'backlog.yaml')),
    );
    const validatedPlan = unwrap(
      validateReleasePlan(loadedPlan, {
        competencyIds: track.requiredCompetencies,
        moduleIds: track.modules,
        criterionIds: rubric.criteria.map((criterion) => criterion.id),
        criticalCriteria: rubric.criteria
          .filter((criterion) => criterion.critical)
          .map((criterion) => criterion.id),
      }),
    );

    const decisions = await Promise.all([
      readDecisionStatus(root, '0002-reference-authentication'),
      readDecisionStatus(root, '0003-workshop-enrollment-boundaries'),
      readDecisionStatus(root, '0004-reference-deployment-shape'),
    ]);

    const nodeVersion = (await readFile(path.join(root, '.node-version'), 'utf8')).trim();
    const pnpmVersion = (await readFile(path.join(root, '.pnpm-version'), 'utf8')).trim();
    outputRoot = await mkdtemp(path.join(tmpdir(), 'roadmap-wp10-template-'));
    const dryRun = await runTemplateDryRun({
      templateRoot: path.join(root, 'templates', 'fullstack-vertical-slice'),
      outputRoot,
      sourceRepository: 'fullstack-javascript-roadmap',
      sourceCommit,
      generatedAt: new Date().toISOString(),
      nodeVersion,
      pnpmVersion,
    });

    let learnerStatus: Wp10SkeletonInput['template']['learnerStatus'] = 'unexpected-failure';
    let learnerDiagnostics: string[] = [];
    if (dryRun.status === 'passed' && dryRun.artifact !== undefined) {
      const learnerProbe = classifyLearnerProbe(
        await runCommand({
          command: pnpmCommand(),
          args: ['verify'],
          cwd: dryRun.artifact.root,
          timeoutMs: 300_000,
        }),
      );
      learnerStatus = learnerProbe.status;
      learnerDiagnostics = [...learnerProbe.diagnostics];
    }

    const evaluated = evaluateWp10Skeleton({
      sourceCommit,
      release: {
        id: release.id,
        status: release.status,
        maturity: release.maturity,
        claims: release.claims,
      },
      trackId: track.id,
      competencies: competencies.map(({ id }) => id),
      modules,
      gates: gates.map(({ id }) => id),
      backlog: {
        items: validatedPlan.plan.items.map((item) => ({
          id: item.id,
          competencies: item.coverage.competencies,
        })),
      },
      decisions,
      remediation: { missingBlockingCriteria },
      template: {
        id: 'template-fullstack-vertical-slice',
        version: '0.1.0',
        baselineStatus: dryRun.status === 'passed' ? 'passed' : 'failed',
        learnerStatus,
        learnerDiagnostics,
      },
    });
    if (!evaluated.ok) return evaluated;

    const report: Wp10RepositoryReport = {
      skeleton: evaluated.value,
      backlog: {
        schemaVersion: 1,
        status: 'passed',
        sourceCommit,
        items: validatedPlan.plan.items.length,
        cycles: 0,
        topologicalOrder: validatedPlan.topologicalOrder,
      },
      template: {
        schemaVersion: 1,
        status: 'passed',
        sourceCommit,
        templateId: 'template-fullstack-vertical-slice',
        baselineStatus: 'passed',
        learnerStatus: 'expected-failure',
        learnerDiagnostics: ['LEARNER_API_ENROLLMENT_001', 'LEARNER_WEB_ENROLLMENT_001'],
      },
    };
    const reportDir = path.join(root, '.tmp', 'reports', 'wp10');
    await mkdir(reportDir, { recursive: true });
    await Promise.all([
      writeFile(
        path.join(reportDir, 'vertical-slice-skeleton.json'),
        `${JSON.stringify(report.skeleton, null, 2)}\n`,
        'utf8',
      ),
      writeFile(
        path.join(reportDir, 'release-1-backlog.json'),
        `${JSON.stringify(report.backlog, null, 2)}\n`,
        'utf8',
      ),
      writeFile(
        path.join(reportDir, 'fullstack-template.json'),
        `${JSON.stringify(report.template, null, 2)}\n`,
        'utf8',
      ),
    ]);
    return success(report);
  } catch (error) {
    const carried =
      error instanceof Error && 'diagnostics' in error
        ? (error as Error & { diagnostics: readonly Diagnostic[] }).diagnostics
        : undefined;
    return carried
      ? failure(carried)
      : failure([
          diagnostic(
            'WP10_INTERNAL_001',
            'The repository adapter crashed before producing trustworthy evidence',
            error instanceof Error ? error.message : String(error),
            'All prerequisite validators and probes complete without throwing',
          ),
        ]);
  } finally {
    if (outputRoot !== undefined) await rm(outputRoot, { recursive: true, force: true });
  }
}

const invoked = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) {
  const result = await verifyWp10Repository();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
