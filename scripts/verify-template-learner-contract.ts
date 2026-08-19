import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { CommandRunnerError, runCommand } from '../packages/command-runner/src/index.js';
import type { CommandResult } from '../packages/command-runner/src/index.js';
import { EvidenceManifestSchema } from '../packages/evidence-schema/src/index.js';
import {
  loadTemplateDefinition,
  materializeTemplate,
} from '../packages/template-builder/src/index.js';
import type { PublicationArtifact } from '../packages/template-builder/src/index.js';

/**
 * Learner-contract publication test for starters that ship a deliberately
 * incomplete milestone.
 *
 * This is separate from scripts/verify-all-templates.ts on purpose. That script
 * owns scanning, the reviewed file set, and release-report writing, and its
 * behaviour is pinned by scripts/ci/tests/template-report.test.mjs with a stubbed
 * pipeline. This script owns the opposite question: given a real materialized
 * starter, does the untouched repository fail for exactly the declared reasons?
 */

const templateRoot = 'templates/fullstack-vertical-slice';

const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' }).trim();

function pnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

/**
 * Reads the argv-shaped command contract already used by `template.yaml`
 * (`command`, `args`, `cwd`, `timeoutMs`). This is a reader for that same
 * contract, not a second acceptance schema: the fields, their types, and their
 * meaning are the ones `TemplateDefinitionSchema` already enforces.
 */
const AcceptanceCommandSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()),
    cwd: z.string().min(1),
    timeoutMs: z.number().int().positive(),
  })
  .strict();

const AcceptanceContractSchema = z
  .object({
    publication: z
      .object({ install: AcceptanceCommandSchema, baseline: AcceptanceCommandSchema })
      .strict(),
    learnerProbe: AcceptanceCommandSchema,
    expectations: z
      .object({
        learnerProbe: z
          .object({
            requiredDiagnostics: z.array(z.string()),
            requiredSuiteResults: z.array(z.string()),
            forbiddenDiagnostics: z.array(z.string()),
          })
          .loose(),
      })
      .loose(),
    untouchedSeams: z
      .object({
        workshopList: z
          .object({
            method: z.literal('GET'),
            path: z.string().min(1),
            status: z.number().int().positive(),
            body: z.object({ items: z.array(z.unknown()) }).strict(),
          })
          .strict(),
        enrollment: z
          .object({
            method: z.literal('POST'),
            path: z.string().min(1),
            status: z.number().int().positive(),
            code: z.string().min(1),
            message: z.string().min(1),
          })
          .strict(),
      })
      .strict(),
  })
  .loose();

interface CommandContract {
  command: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
}

function describeCommand(contract: CommandContract): string {
  return `${contract.command} ${contract.args.join(' ')} (cwd ${contract.cwd}, timeout ${String(contract.timeoutMs)}ms)`;
}

function sameCommand(left: CommandContract, right: CommandContract): boolean {
  return (
    left.command === right.command &&
    left.cwd === right.cwd &&
    left.timeoutMs === right.timeoutMs &&
    left.args.length === right.args.length &&
    left.args.every((value, index) => value === right.args[index])
  );
}

/**
 * The seams a freshly generated starter must present.
 *
 * These values live here, on the publication side, and never inside the generated
 * repository. A test shipped to a learner that pinned them would go red the moment
 * the learner implemented the milestone — the baseline would punish success — so
 * the learner's permanent suite asserts scaffolding and this asserts the starting
 * point. `acceptance/baseline.yaml` declares the same values for reviewers and is
 * checked against these constants, so the two cannot drift apart.
 */
const expectedSeams = {
  workshopList: { method: 'GET', path: '/api/workshops', status: 200, body: { items: [] } },
  enrollment: {
    method: 'POST',
    path: '/api/workshops/00000000-0000-4000-8000-000000000001/enrollments',
    status: 501,
    code: 'ENROLLMENT_NOT_IMPLEMENTED',
    message: 'Complete the authenticated transactional enrollment workflow',
  },
} as const;

/**
 * Asserts that the declared source-side baseline contract and the command
 * publication actually executes are the same argv, and that the baseline is the
 * baseline rather than the full learner verification.
 *
 * A green publication run that had invoked `pnpm verify` would mean the starter
 * shipped with the milestone already solved, so this comparison is a publication
 * control and not documentation upkeep.
 */
async function assertBaselineCommandContract(): Promise<readonly string[]> {
  const { definition } = await loadTemplateDefinition(templateRoot);
  const acceptancePath = path.join(templateRoot, 'acceptance', 'baseline.yaml');
  const parsed = AcceptanceContractSchema.safeParse(parse(await readFile(acceptancePath, 'utf8')));
  if (!parsed.success) {
    return [
      `TEMPLATE_ACCEPTANCE_001: acceptance/baseline.yaml does not declare an argv-shaped command contract: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`,
    ];
  }
  const acceptance = parsed.data;
  const failures: string[] = [];

  if (!sameCommand(definition.verification.install, acceptance.publication.install)) {
    failures.push(
      `TEMPLATE_ACCEPTANCE_002: template.yaml install ${describeCommand(definition.verification.install)} does not match acceptance/baseline.yaml publication.install ${describeCommand(acceptance.publication.install)}`,
    );
  }
  if (!sameCommand(definition.verification.baseline, acceptance.publication.baseline)) {
    failures.push(
      `TEMPLATE_ACCEPTANCE_002: template.yaml baseline ${describeCommand(definition.verification.baseline)} does not match acceptance/baseline.yaml publication.baseline ${describeCommand(acceptance.publication.baseline)}`,
    );
  }
  if (sameCommand(definition.verification.baseline, acceptance.learnerProbe)) {
    failures.push(
      `TEMPLATE_ACCEPTANCE_003: publication baseline must not be the learner probe ${describeCommand(acceptance.learnerProbe)}; publication would then require a completed solution to pass`,
    );
  }
  const baselineArgs = definition.verification.baseline.args;
  if (baselineArgs.length !== 1 || baselineArgs[0] !== 'verify:baseline') {
    failures.push(
      `TEMPLATE_ACCEPTANCE_003: publication baseline args must be exactly ["verify:baseline"], found ${JSON.stringify(baselineArgs)}`,
    );
  }
  if (JSON.stringify(acceptance.untouchedSeams) !== JSON.stringify(expectedSeams)) {
    failures.push(
      `TEMPLATE_ACCEPTANCE_004: acceptance/baseline.yaml untouchedSeams ${JSON.stringify(acceptance.untouchedSeams)} does not match the seams this publication test proves ${JSON.stringify(expectedSeams)}`,
    );
  }

  // The acceptance document is what a reviewer reads instead of this script, so
  // every list it publishes about the learner probe is compared with the list this
  // script actually enforces. Otherwise the document could promise a check that no
  // longer runs.
  const declaredProbe = acceptance.expectations.learnerProbe;
  const probeLists = [
    ['requiredDiagnostics', declaredProbe.requiredDiagnostics, requiredLearnerDiagnostics],
    ['requiredSuiteResults', declaredProbe.requiredSuiteResults, requiredSuiteResults],
    ['forbiddenDiagnostics', declaredProbe.forbiddenDiagnostics, forbiddenRunnerDiagnostics],
  ] as const;
  for (const [field, declared, enforced] of probeLists) {
    if (JSON.stringify(declared) !== JSON.stringify([...enforced])) {
      failures.push(
        `TEMPLATE_ACCEPTANCE_005: acceptance/baseline.yaml expectations.learnerProbe.${field} ${JSON.stringify(declared)} does not match what this publication test enforces ${JSON.stringify(enforced)}`,
      );
    }
  }
  return failures;
}

/**
 * Submitted-evidence discovery.
 *
 * A shipped example must never be countable as a completed milestone, so the
 * `.example.json` suffix is excluded here rather than merely discouraged in prose.
 */
export function isSubmittedEvidenceManifest(relativePath: string): boolean {
  if (!relativePath.startsWith('evidence/') || !relativePath.endsWith('.json')) return false;
  return !relativePath.endsWith('.example.json');
}

const requiredExamplePlaceholders = [
  'https://github.com/replace-me/workshop-enrollment',
  '0000000000000000000000000000000000000000',
  'replace-me',
] as const;

async function assertEvidenceExampleIsNotEvidence(
  artifact: PublicationArtifact,
): Promise<readonly string[]> {
  const failures: string[] = [];
  const generatedPaths = artifact.files.map((file) => file.path);
  const examplePath = 'evidence/manifest.example.json';

  if (!generatedPaths.includes(examplePath)) {
    return [`TEMPLATE_EVIDENCE_001: generated starter is missing ${examplePath}`];
  }

  const submitted = generatedPaths.filter((entry) => isSubmittedEvidenceManifest(entry));
  if (submitted.length > 0) {
    failures.push(
      `TEMPLATE_EVIDENCE_002: a freshly generated starter must contain no submitted evidence manifest, found ${JSON.stringify(submitted)}`,
    );
  }

  const raw = await readFile(path.join(artifact.root, examplePath), 'utf8');
  for (const placeholder of requiredExamplePlaceholders) {
    if (!raw.includes(placeholder)) {
      failures.push(
        `TEMPLATE_EVIDENCE_003: ${examplePath} must contain the unmistakable placeholder ${placeholder}`,
      );
    }
  }

  // The example must still teach the canonical manifest shape, so it is validated
  // against the real schema rather than shipped as an approximation.
  const result = EvidenceManifestSchema.safeParse(JSON.parse(raw));
  if (!result.success) {
    failures.push(
      `TEMPLATE_EVIDENCE_004: ${examplePath} does not satisfy EvidenceManifestSchema: ${result.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`,
    );
  } else if (result.data.verification.status !== 'failed') {
    failures.push(
      `TEMPLATE_EVIDENCE_005: ${examplePath} must record verification.status "failed" so it cannot read as a passing result`,
    );
  }

  return failures;
}

const requiredLearnerDiagnostics = [
  'LEARNER_API_ENROLLMENT_001',
  'LEARNER_WEB_ENROLLMENT_001',
] as const;

/**
 * Evidence that each declared suite actually ran and actually failed.
 *
 * The diagnostic codes alone are not that evidence: the runner prints them in its
 * own per-suite header, so they appear even on a green run. These lines are emitted
 * only after a suite has been located, executed, and observed to exit non-zero.
 */
const requiredSuiteResults = [
  '--- api learner contract: NOT SATISFIED',
  '--- web learner contract: NOT SATISFIED',
] as const;

const forbiddenRunnerDiagnostics = [
  'LEARNER_RUNNER_001',
  'LEARNER_RUNNER_002',
  'LEARNER_RUNNER_003',
] as const;

/**
 * Markers that would mean the learner verification failed for the wrong reason.
 * The declared seams must be the only thing standing between a fresh starter and
 * a green `pnpm verify`; a missing module or an attempted database connection is
 * a broken starter masquerading as a teaching moment.
 */
const infrastructureFailureMarkers: readonly { label: string; pattern: RegExp }[] = [
  {
    label: 'missing module',
    pattern: /ERR_MODULE_NOT_FOUND|Cannot find module|Cannot find package/i,
  },
  {
    label: 'missing dependency',
    pattern: /ERR_PNPM_OUTDATED_LOCKFILE|ERR_PNPM_NO_MATCHING_VERSION/i,
  },
  { label: 'missing environment', pattern: /DATABASE_URL|WEB_ORIGIN|SESSION_TTL_MINUTES/ },
  {
    label: 'database connection',
    pattern: /ECONNREFUSED|ENOTFOUND|password authentication failed/i,
  },
  { label: 'browser configuration', pattern: /Cannot find.*jsdom|jsdom.*not found/i },
  { label: 'build failure', pattern: /error TS\d+|Build failed|vite build failed/i },
];

async function observe(
  label: string,
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ result: CommandResult } | { failure: string }> {
  try {
    return { result: await runCommand({ command, args, cwd, timeoutMs }) };
  } catch (error) {
    const detail =
      error instanceof CommandRunnerError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : 'unknown failure';
    return { failure: `TEMPLATE_LEARNER_001: ${label} could not be observed (${detail})` };
  }
}

/**
 * The published verification controls must reach a learner unchanged.
 *
 * `packages/template-builder/test/starter-verification-controls.test.ts` pins the
 * contract these two files express, and it reads the template source. This closes
 * the remaining gap by proving the source is what materialization actually
 * delivers, so the contract cannot be asserted against one set of bytes while a
 * different set ships.
 */
async function assertVerificationControlsShipVerbatim(
  artifactRoot: string,
): Promise<readonly string[]> {
  const failures: string[] = [];
  for (const relativePath of ['package.json', '.github/workflows/verify.yml']) {
    const source = await readFile(path.join(templateRoot, 'files', relativePath), 'utf8');
    let generated: string;
    try {
      generated = await readFile(path.join(artifactRoot, relativePath), 'utf8');
    } catch {
      failures.push(`TEMPLATE_CONTROL_001: generated starter is missing ${relativePath}`);
      continue;
    }
    if (generated !== source) {
      failures.push(
        `TEMPLATE_CONTROL_001: generated ${relativePath} differs from the reviewed template source, so its pinned contract does not describe what ships`,
      );
    }
  }
  return failures;
}

/**
 * Builds the seam probe injected into a materialized starter.
 *
 * Every value interpolated into the emitted source goes through `JSON.stringify`,
 * so a seam constant cannot become syntax.
 */
function seamProbeSource(): string {
  const { workshopList, enrollment } = expectedSeams;
  return [
    "import { ApiErrorSchema, WorkshopListResponseSchema } from '@workshop/contracts';",
    "import request from 'supertest';",
    "import { describe, expect, it } from 'vitest';",
    "import { createApp } from '../src/app.js';",
    '',
    "describe('untouched starter seams', () => {",
    "  it('serves the declared initial workshop list', async () => {",
    `    const response = await request(createApp()).get(${JSON.stringify(workshopList.path)});`,
    `    expect(response.status).toBe(${String(workshopList.status)});`,
    `    expect(WorkshopListResponseSchema.parse(response.body)).toEqual(${JSON.stringify(workshopList.body)});`,
    '  });',
    '',
    "  it('answers the enrollment seam with the declared incomplete response', async () => {",
    `    const response = await request(createApp()).post(${JSON.stringify(enrollment.path)});`,
    `    expect(response.status).toBe(${String(enrollment.status)});`,
    // The whole error body is asserted, not just the code: the message tells the
    // learner what to build, and the echoed request ID is what makes a failure
    // traceable. Both were covered before this proof moved out of the starter.
    `    expect(ApiErrorSchema.parse(response.body)).toEqual({`,
    `      code: ${JSON.stringify(enrollment.code)},`,
    `      message: ${JSON.stringify(enrollment.message)},`,
    `      requestId: response.headers['x-request-id'],`,
    '    });',
    '  });',
    '});',
    '',
  ].join('\n');
}

/**
 * Proves the untouched generated starter really does present the declared seams.
 *
 * The probe is written into the materialized copy, executed, and deleted. It is
 * never part of the published file set, so it pins the starting point without ever
 * constraining a learner who moves past it.
 */
async function assertUntouchedSeamContract(artifactRoot: string): Promise<readonly string[]> {
  const probeRelativePath = 'test/__publication-seam-probe__.test.ts';
  const probePath = path.join(artifactRoot, 'apps', 'api', probeRelativePath);
  try {
    // Inside the `try` so a starter without the expected test directory produces a
    // diagnostic rather than an unhandled stack trace.
    await writeFile(probePath, seamProbeSource(), 'utf8');
    const probe = await observe(
      'the untouched-seam probe',
      pnpmCommand(),
      [
        '--fail-if-no-match',
        '--filter',
        '@workshop/api',
        'exec',
        'vitest',
        'run',
        '--config',
        'vitest.config.ts',
        probeRelativePath,
      ],
      artifactRoot,
      300_000,
    );
    if ('failure' in probe)
      return [probe.failure.replace('TEMPLATE_LEARNER_001', 'TEMPLATE_SEAM_001')];
    if (probe.result.exitCode !== 0) {
      return [
        `TEMPLATE_SEAM_002: the untouched starter does not present the declared initial seams (exit ${String(probe.result.exitCode)}): ${`${probe.result.stdout}\n${probe.result.stderr}`.slice(-2000)}`,
      ];
    }
    return [];
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown failure';
    return [`TEMPLATE_SEAM_001: the untouched-seam probe could not be installed (${detail})`];
  } finally {
    await rm(probePath, { force: true });
  }
}

interface StarterObservation {
  failures: readonly string[];
  /** True once a frozen install succeeded, so further probes can run. */
  installed: boolean;
}

async function assertGeneratedStarterContract(artifactRoot: string): Promise<StarterObservation> {
  const failures: string[] = [];

  const install = await observe(
    'pnpm install --frozen-lockfile',
    pnpmCommand(),
    ['install', '--frozen-lockfile'],
    artifactRoot,
    600_000,
  );
  if ('failure' in install) return { failures: [install.failure], installed: false };
  if (install.result.exitCode !== 0) {
    return {
      failures: [
        `TEMPLATE_LEARNER_006: frozen install failed inside the generated starter (exit ${String(install.result.exitCode)}): ${install.result.stderr.slice(-2000)}`,
      ],
      installed: false,
    };
  }

  const baseline = await observe(
    'pnpm verify:baseline',
    pnpmCommand(),
    ['verify:baseline'],
    artifactRoot,
    900_000,
  );
  if ('failure' in baseline) return { failures: [baseline.failure], installed: true };
  if (baseline.result.exitCode !== 0) {
    return {
      failures: [
        `TEMPLATE_LEARNER_007: verify:baseline must pass on an untouched starter (exit ${String(baseline.result.exitCode)}): ${baseline.result.stderr.slice(-2000)}`,
      ],
      installed: true,
    };
  }

  const probe = await observe('pnpm verify', pnpmCommand(), ['verify'], artifactRoot, 900_000);
  if ('failure' in probe) return { failures: [probe.failure], installed: true };
  if (probe.result.timedOut) {
    failures.push('TEMPLATE_LEARNER_001: pnpm verify timed out inside the generated starter');
  }

  const output = `${probe.result.stdout}\n${probe.result.stderr}`;

  if (probe.result.exitCode === 0) {
    failures.push(
      'TEMPLATE_LEARNER_002: pnpm verify exited 0 on an untouched starter; the learner contract is not actually incomplete',
    );
  }
  for (const code of requiredLearnerDiagnostics) {
    if (!output.includes(code)) {
      failures.push(
        `TEMPLATE_LEARNER_003: pnpm verify output does not contain ${code}; the declared learner diagnostic was never reported`,
      );
    }
  }
  for (const marker of requiredSuiteResults) {
    if (!output.includes(marker)) {
      failures.push(
        `TEMPLATE_LEARNER_008: pnpm verify output does not contain "${marker}"; that suite was not observed to run and fail, so its contract is unproven`,
      );
    }
  }
  for (const code of forbiddenRunnerDiagnostics) {
    if (output.includes(code)) {
      failures.push(
        `TEMPLATE_LEARNER_004: pnpm verify reported ${code}; the runner itself failed instead of exercising the learner contract`,
      );
    }
  }
  for (const marker of infrastructureFailureMarkers) {
    if (marker.pattern.test(output)) {
      failures.push(
        `TEMPLATE_LEARNER_005: pnpm verify output matches a ${marker.label} failure; the learner failure must come only from the declared incomplete seams`,
      );
    }
  }

  return { failures, installed: true };
}

async function main(): Promise<void> {
  const dirty = git('status', '--porcelain');
  if (dirty.length > 0) throw new Error('TEMPLATE_RELEASE_001: worktree must be clean');
  const sourceCommit = git('rev-parse', 'HEAD');

  const failures: string[] = [...(await assertBaselineCommandContract())];

  const nodeVersion = (await readFile('.node-version', 'utf8')).trim();
  const pnpmVersion = (await readFile('.pnpm-version', 'utf8')).trim();
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'roadmap-learner-contract-'));
  try {
    const { definition } = await loadTemplateDefinition(templateRoot);
    const built = await materializeTemplate(templateRoot, outputRoot, {
      schemaVersion: 1,
      templateId: definition.id,
      templateVersion: definition.version,
      curriculumVersion: definition.curriculum.release,
      sourceRepository: 'fullstack-javascript-roadmap',
      sourceCommit,
      generatedAt: new Date().toISOString(),
      toolchain: { node: nodeVersion, pnpm: pnpmVersion },
      contractVersions: { exercise: 1, rubric: 1, evidence: 1, template: 1 },
    });
    if (!built.ok) {
      console.error(JSON.stringify({ failures, diagnostics: built.diagnostics }, null, 2));
      process.exitCode = 1;
      return;
    }

    failures.push(...(await assertEvidenceExampleIsNotEvidence(built.value)));
    failures.push(...(await assertVerificationControlsShipVerbatim(built.value.root)));

    const starter = await assertGeneratedStarterContract(built.value.root);
    failures.push(...starter.failures);
    // The seam probe needs a resolved dependency tree. Running it against a
    // starter that never installed would report a missing module as a missing
    // seam, so it is skipped only when install itself failed — and that failure is
    // already recorded above.
    if (starter.installed) {
      failures.push(...(await assertUntouchedSeamContract(built.value.root)));
    }

    if (failures.length > 0) {
      console.error(JSON.stringify({ templateId: definition.id, failures }, null, 2));
      process.exitCode = 1;
    }
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
}

await main();
