import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { RemediationCatalogSchema, validateRemediationCoverage } from '@roadmap/assessment-core';
import { runCommand } from '@roadmap/command-runner';
import {
  buildCurriculumGraph,
  validateCurriculumGraph,
  type CurriculumGraph,
} from '@roadmap/curriculum-graph';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import {
  CompetencySchema,
  AssessmentSchema,
  GateSchema,
  ModuleSchema,
  ProjectSchema,
  ReleaseSchema,
  TrackSchema,
} from '@roadmap/curriculum-schema';
import {
  loadReleasePlan,
  validateIssueContracts,
  validateReleasePlan,
} from '@roadmap/release-plan-schema';
import { RubricSchema, type Rubric } from '@roadmap/rubric-schema';
import {
  failure,
  success,
  type Diagnostic,
  type ValidationOutcome,
} from '@roadmap/validation-core';
import { runTemplateDryRun } from '../tooling/publish-templates/src/pipeline.js';
import {
  readAcceptanceContract,
  verifyUntouchedSeamContract,
} from './verify-template-learner-contract.js';

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

function curriculumModuleCompetencies(
  graph: CurriculumGraph,
  moduleIds: readonly string[],
): ReadonlyMap<string, readonly string[]> {
  return new Map(
    moduleIds.map((id) => {
      const document = graph.nodes.get(id);
      const module =
        document?.data.kind === 'module' ? ModuleSchema.parse(document.data) : undefined;
      return [id, module?.competencies ?? []] as const;
    }),
  );
}

function rubricCriterionCompetencies(rubric: Rubric): ReadonlyMap<string, string> {
  return new Map(rubric.criteria.map((criterion) => [criterion.id, criterion.competency]));
}

function projectDiagnostic(reason: string, observed: unknown): Diagnostic {
  return diagnostic(
    'WP10_PROJECT_001',
    reason,
    observed,
    'A mini-capstone assessment artifact linked to a contained Workshop Enrollment project contract',
  );
}

async function readWorkshopProjectContract(
  root: string,
  getDocument: (
    id: string,
  ) => CurriculumGraph['nodes'] extends ReadonlyMap<string, infer T> ? T : never,
  miniCapstoneGate: ReturnType<typeof GateSchema.parse>,
): Promise<void> {
  try {
    const assessment = AssessmentSchema.parse(getDocument(miniCapstoneGate.exitAssessment).data);
    if (
      assessment.assessmentType !== 'milestone-project' ||
      assessment.artifact !== 'project-workshop-enrollment'
    ) {
      throw new Error(
        'The mini-capstone exit assessment does not declare project-workshop-enrollment',
      );
    }
    const project = ProjectSchema.parse(getDocument(assessment.artifact).data);
    const resolvedRoot = await realpath(root);
    const contractPath = path.resolve(root, project.contractPath);
    const resolvedContractPath = await realpath(contractPath);
    const relative = path.relative(resolvedRoot, resolvedContractPath);
    if (
      relative === '' ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error(`Project contract escapes repository root: ${project.contractPath}`);
    }
    const contract: unknown = YAML.parse(await readFile(resolvedContractPath, 'utf8'));
    if (typeof contract !== 'object' || contract === null || Array.isArray(contract)) {
      throw new Error('Project contract must be a YAML object');
    }
    const value = contract as Record<string, unknown>;
    const required = {
      schemaVersion: 1,
      id: project.id,
      version: '0.1.0',
      status: 'review',
      track: 'track-core-vertical-slice',
      starterTemplate: 'template-fullstack-vertical-slice',
      rubric: 'rubric-workshop-enrollment',
      remediation: 'remediation-workshop-enrollment',
      changeRequest: 'change-request-workshop-multiple-sessions',
      debuggingTask: 'debugging-workshop-duplicate-enrollment',
    } as const;
    for (const [field, expected] of Object.entries(required)) {
      if (value[field] !== expected) {
        throw new Error(`Project contract ${field} does not match ${String(expected)}`);
      }
    }
    if (
      !Array.isArray(value.competencies) ||
      !sameStringSet(value.competencies, project.competencies)
    ) {
      throw new Error('Project contract competencies do not match its curriculum project');
    }
  } catch (error) {
    throw Object.assign(new Error('WP-10 project contract validation failed'), {
      diagnostics: [
        projectDiagnostic(error instanceof Error ? error.message : String(error), error),
      ],
    });
  }
}

function sameStringSet(value: unknown[], expected: readonly string[]): boolean {
  return (
    value.length === expected.length &&
    value.every((entry) => typeof entry === 'string' && expected.includes(entry)) &&
    new Set(value).size === value.length
  );
}

export function classifyLearnerProbe(
  result: Awaited<ReturnType<typeof runCommand>>,
  seamFailures: readonly string[] = [],
) {
  const output = `${result.stdout}\n${result.stderr}`;
  const expected = ['LEARNER_API_ENROLLMENT_001', 'LEARNER_WEB_ENROLLMENT_001'] as const;
  const suiteResults = [
    '--- api learner contract: NOT SATISFIED',
    '--- web learner contract: NOT SATISFIED',
  ] as const;
  const diagnostics = expected.filter((code) => output.includes(code));
  const runnerFailure = /LEARNER_RUNNER_00[1-3]/i.test(output);
  const infrastructureFailure =
    /ERR_MODULE_NOT_FOUND|Cannot find module|DATABASE_URL|ECONNREFUSED|browser|build failed|lockfile/i.test(
      output,
    );
  const completeExpectedFailure =
    seamFailures.length === 0 &&
    result.exitCode !== null &&
    result.exitCode !== 0 &&
    result.signal === null &&
    !result.timedOut &&
    diagnostics.length === expected.length &&
    suiteResults.every((marker) => output.includes(marker)) &&
    !runnerFailure &&
    !infrastructureFailure;
  if (result.exitCode === 0) return { status: 'passed' as const, diagnostics };
  if (completeExpectedFailure) {
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
    const miniCapstoneGate = gates.find(({ id }) => id === 'gate-mini-capstone');
    if (miniCapstoneGate === undefined) {
      throw Object.assign(new Error('WP-10 mini-capstone gate is missing'), {
        diagnostics: [projectDiagnostic('Track does not declare gate-mini-capstone', track.gates)],
      });
    }
    await readWorkshopProjectContract(root, (id) => getDocument(id), miniCapstoneGate);

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
    const issueContractDiagnostics = await validateIssueContracts(root, loadedPlan);
    if (issueContractDiagnostics.length > 0) {
      throw Object.assign(new Error('WP-10 issue-contract validation failed'), {
        diagnostics: issueContractDiagnostics,
      });
    }
    const validatedPlan = unwrap(
      validateReleasePlan(loadedPlan, {
        competencyIds: track.requiredCompetencies,
        moduleIds: track.modules,
        criterionIds: rubric.criteria.map((criterion) => criterion.id),
        criticalCriteria: rubric.criteria
          .filter((criterion) => criterion.critical)
          .map((criterion) => criterion.id),
        moduleCompetencies: curriculumModuleCompetencies(graph, track.modules),
        criterionCompetencies: rubricCriterionCompetencies(rubric),
        contentSequenceModules: track.modules,
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
      const templateRoot = path.join(root, 'templates', 'fullstack-vertical-slice');
      const acceptance = await readAcceptanceContract(templateRoot);
      const seamFailures = await verifyUntouchedSeamContract(dryRun.artifact.root);
      const learnerProbe = classifyLearnerProbe(
        await runCommand({
          command: acceptance.learnerProbe.command,
          args: acceptance.learnerProbe.args,
          cwd: path.resolve(dryRun.artifact.root, acceptance.learnerProbe.cwd),
          timeoutMs: acceptance.learnerProbe.timeoutMs,
        }),
        seamFailures,
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
