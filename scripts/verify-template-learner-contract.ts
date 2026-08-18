import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

const forbiddenRunnerDiagnostics = ['LEARNER_RUNNER_001', 'LEARNER_RUNNER_002'] as const;

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
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ result: CommandResult } | { failure: string }> {
  try {
    return { result: await runCommand({ command: pnpmCommand(), args, cwd, timeoutMs }) };
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

async function assertGeneratedStarterContract(artifactRoot: string): Promise<readonly string[]> {
  const failures: string[] = [];

  const install = await observe(
    'pnpm install --frozen-lockfile',
    ['install', '--frozen-lockfile'],
    artifactRoot,
    600_000,
  );
  if ('failure' in install) return [install.failure];
  if (install.result.exitCode !== 0) {
    return [
      `TEMPLATE_LEARNER_006: frozen install failed inside the generated starter (exit ${String(install.result.exitCode)}): ${install.result.stderr.slice(-2000)}`,
    ];
  }

  const baseline = await observe(
    'pnpm verify:baseline',
    ['verify:baseline'],
    artifactRoot,
    900_000,
  );
  if ('failure' in baseline) return [baseline.failure];
  if (baseline.result.exitCode !== 0) {
    return [
      `TEMPLATE_LEARNER_007: verify:baseline must pass on an untouched starter (exit ${String(baseline.result.exitCode)}): ${baseline.result.stderr.slice(-2000)}`,
    ];
  }

  const probe = await observe('pnpm verify', ['verify'], artifactRoot, 900_000);
  if ('failure' in probe) return [probe.failure];
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
        `TEMPLATE_LEARNER_003: pnpm verify output does not contain ${code}; the corresponding learner suite did not run or did not report its contract`,
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

  return failures;
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
    failures.push(...(await assertGeneratedStarterContract(built.value.root)));

    if (failures.length > 0) {
      console.error(JSON.stringify({ templateId: definition.id, failures }, null, 2));
      process.exitCode = 1;
    }
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
}

await main();
