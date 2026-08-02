import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enumerateDeclaredReferences } from '@roadmap/curriculum-graph';
import {
  loadExercise,
  materializeExercise,
  openExerciseWorkspace,
  verifyExercise,
  type ExerciseWorkspace,
  type ExerciseVerificationReport,
  type VerificationMode,
} from '@roadmap/exercise-runner';
import type { CurriculumDocument } from '@roadmap/curriculum-schema';

interface RuntimeDiagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning' | 'notice';
  readonly location: {
    readonly file: string;
    readonly line?: number;
    readonly column?: number;
    readonly pointer?: string;
  };
  readonly observed: unknown;
  readonly expected: string;
  readonly reason: string;
  readonly remediation: string;
  readonly documentation: string;
}

type WorkspaceOutcome =
  | {
      readonly ok: true;
      readonly value: ExerciseWorkspace;
      readonly diagnostics: readonly RuntimeDiagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly RuntimeDiagnostic[] };

export interface ParsedInvocation {
  readonly ok: true;
  readonly machine: boolean;
  readonly sourceRoot: string;
  readonly workspace: string;
  readonly mode: VerificationMode;
}

export interface UsageDiagnostic {
  readonly code: 'EXERCISE_USAGE_001';
  readonly kind: 'usage';
  readonly message: string;
  readonly usage: string;
}

export interface ParseFailure {
  readonly ok: false;
  readonly machine: boolean;
  readonly diagnostic: UsageDiagnostic;
}

export type ParseResult = ParsedInvocation | ParseFailure;

export interface CliResult {
  readonly exitCode: 0 | 1 | 2 | 3;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CliDependencies {
  readonly loadExercise: typeof loadExercise;
  readonly materializeExercise: typeof materializeExercise;
  readonly openExerciseWorkspace: typeof openExerciseWorkspace;
  readonly verifyExercise: typeof verifyExercise;
}

export interface RunCliOptions {
  readonly cwd?: string;
  readonly dependencies?: Partial<CliDependencies>;
}

export interface ExerciseOwnershipResult {
  readonly ok: boolean;
  readonly lessonReferences: readonly string[];
  readonly assessmentReferences: readonly string[];
}

const USAGE = 'Usage: exercise:verify <exercise-root> <workspace> <baseline|learner> [--json]';

const DOCUMENTATION = {
  authoring: 'docs/authoring/exercises.md',
  learner: 'docs/learner/exercise-workflow.md',
  maintainer: 'docs/maintainers/verifier-failures.md',
} as const;

const defaultDependencies: CliDependencies = {
  loadExercise,
  materializeExercise,
  openExerciseWorkspace,
  verifyExercise,
};

function usageFailure(machine: boolean, message: string): ParseFailure {
  return {
    ok: false,
    machine,
    diagnostic: {
      code: 'EXERCISE_USAGE_001',
      kind: 'usage',
      message,
      usage: USAGE,
    },
  };
}

export function parseArguments(args: readonly string[], cwd = process.cwd()): ParseResult {
  const machine = args.some((argument) => argument === '--json');
  const hasOption = args.some((argument) => argument.startsWith('-'));
  const machineShape =
    args.length === 4 &&
    args[3] === '--json' &&
    args[0] !== undefined &&
    args[1] !== undefined &&
    args[2] !== undefined &&
    !args[0].startsWith('-') &&
    !args[1].startsWith('-') &&
    !args[2].startsWith('-');
  const humanShape =
    args.length === 3 &&
    args[0] !== undefined &&
    args[1] !== undefined &&
    args[2] !== undefined &&
    !hasOption &&
    !args[0].startsWith('-') &&
    !args[1].startsWith('-') &&
    !args[2].startsWith('-');

  if ((!machine && !humanShape) || (machine && !machineShape)) {
    return usageFailure(machine, 'The invocation does not match the released command shape.');
  }

  const sourceArgument = args[0];
  const workspaceArgument = args[1];
  const modeArgument = args[2];
  if (
    sourceArgument === undefined ||
    workspaceArgument === undefined ||
    modeArgument === undefined
  ) {
    return usageFailure(machine, 'The invocation is missing a required argument.');
  }
  if (modeArgument !== 'baseline' && modeArgument !== 'learner') {
    return usageFailure(machine, 'The verification mode must be baseline or learner.');
  }

  return {
    ok: true,
    machine,
    sourceRoot: path.resolve(cwd, sourceArgument),
    workspace: path.resolve(cwd, workspaceArgument),
    mode: modeArgument,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

async function outputExists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function documentationFor(code: string): string {
  if (
    code === 'EXERCISE_INTERNAL_001' ||
    code === 'EXERCISE_OUTPUT_003' ||
    code === 'EXERCISE_COMMAND_002' ||
    code === 'EXERCISE_COMMAND_003' ||
    code === 'EXERCISE_COMMAND_004' ||
    code === 'EXERCISE_COMMAND_005'
  ) {
    return DOCUMENTATION.maintainer;
  }
  if (
    code.startsWith('EXERCISE_WORKSPACE_') ||
    code.startsWith('EXERCISE_EDITABLE_') ||
    code === 'EXERCISE_OUTPUT_002' ||
    code === 'EXERCISE_COMMAND_001'
  ) {
    return DOCUMENTATION.learner;
  }
  return DOCUMENTATION.authoring;
}

function projectDiagnostics(
  diagnostics: readonly RuntimeDiagnostic[],
): readonly RuntimeDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    documentation: documentationFor(diagnostic.code),
  }));
}

function internalDiagnostic(): RuntimeDiagnostic {
  return {
    code: 'EXERCISE_INTERNAL_001',
    severity: 'error',
    location: { file: 'tooling/verify-exercise' },
    observed: 'verifier-internal-error',
    expected: 'A trusted exercise definition and contained workspace.',
    reason: 'The verifier encountered an unexpected internal failure.',
    remediation: 'Retry after restoring the released exercise and workspace state.',
    documentation: DOCUMENTATION.maintainer,
  };
}

function machineResult(payload: unknown, exitCode: 0 | 1 | 2 | 3): CliResult {
  return {
    exitCode,
    stdout: JSON.stringify(payload) + '\n',
    stderr: '',
  };
}

function usageResult(machine: boolean, diagnostic: UsageDiagnostic): CliResult {
  if (machine) return machineResult(diagnostic, 2);
  return {
    exitCode: 2,
    stdout: '',
    stderr: [diagnostic.code, diagnostic.message, diagnostic.usage].join('\n') + '\n',
  };
}

function humanDiagnostic(diagnostic: RuntimeDiagnostic): string {
  const pointer =
    diagnostic.location.pointer === undefined ? '' : ' ' + diagnostic.location.pointer;
  return [
    diagnostic.code + ' ' + diagnostic.location.file + pointer,
    'Reason: ' + diagnostic.reason,
    'Expected: ' + diagnostic.expected,
    'Documentation: ' + diagnostic.documentation,
    'Remediation: ' + diagnostic.remediation,
  ].join('\n');
}

function expectedFailure(machine: boolean, diagnostics: readonly RuntimeDiagnostic[]): CliResult {
  const projected = projectDiagnostics(diagnostics);
  if (machine) return machineResult({ status: 'failed', diagnostics: projected }, 1);
  return {
    exitCode: 1,
    stdout: '',
    stderr: projected.map(humanDiagnostic).join('\n\n') + '\n',
  };
}

function reportResult(machine: boolean, report: ExerciseVerificationReport): CliResult {
  const projectedReport = {
    ...report,
    diagnostics: projectDiagnostics(report.diagnostics),
  };
  if (report.status === 'internal-error') {
    if (machine) return machineResult(projectedReport, 3);
    return {
      exitCode: 3,
      stdout: '',
      stderr: projectedReport.diagnostics.map(humanDiagnostic).join('\n\n') + '\n',
    };
  }
  if (machine) return machineResult(projectedReport, report.status === 'passed' ? 0 : 1);
  if (report.status === 'passed') {
    return {
      exitCode: 0,
      stdout: 'Exercise verification passed: ' + report.exerciseId + ' (' + report.mode + ').\n',
      stderr: '',
    };
  }
  return {
    exitCode: 1,
    stdout: '',
    stderr: projectedReport.diagnostics.map(humanDiagnostic).join('\n\n') + '\n',
  };
}

export async function runCli(
  args: readonly string[],
  options: RunCliOptions = {},
): Promise<CliResult> {
  const parsed = parseArguments(args, options.cwd ?? process.cwd());
  if (!parsed.ok) return usageResult(parsed.machine, parsed.diagnostic);

  const dependencies: CliDependencies = {
    ...defaultDependencies,
    ...options.dependencies,
  };

  try {
    const loaded = await dependencies.loadExercise(parsed.sourceRoot);
    if (!loaded.ok) return expectedFailure(parsed.machine, loaded.diagnostics);

    const exists = await outputExists(parsed.workspace);
    const workspaceOutcome: WorkspaceOutcome = exists
      ? await dependencies.openExerciseWorkspace(parsed.sourceRoot, parsed.workspace)
      : await dependencies.materializeExercise(parsed.sourceRoot, parsed.workspace);
    if (!workspaceOutcome.ok) {
      return expectedFailure(parsed.machine, workspaceOutcome.diagnostics);
    }

    const report = await dependencies.verifyExercise(
      loaded.value,
      workspaceOutcome.value,
      parsed.mode,
    );
    return reportResult(parsed.machine, report);
  } catch {
    const diagnostic = internalDiagnostic();
    if (parsed.machine)
      return machineResult({ status: 'internal-error', diagnostics: [diagnostic] }, 3);
    return {
      exitCode: 3,
      stdout: '',
      stderr: humanDiagnostic(diagnostic) + '\n',
    };
  }
}

export function emit(result: CliResult): void {
  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

export function validateExerciseOwnership(
  documents: readonly CurriculumDocument[],
  exerciseId: string,
): ExerciseOwnershipResult {
  const references = enumerateDeclaredReferences(documents);
  const lessonReferences = references
    .filter(
      (reference) =>
        reference.declaringId === 'lesson-js-closure-private-state' &&
        reference.relation === 'lesson.exercises' &&
        reference.targetId === exerciseId,
    )
    .map((reference) => reference.pointer);
  const assessmentReferences = references
    .filter(
      (reference) =>
        reference.declaringId === 'assessment-js-closure' &&
        reference.relation === 'assessment.artifact' &&
        reference.targetId === exerciseId,
    )
    .map((reference) => reference.pointer);
  return {
    ok: lessonReferences.length === 1 && assessmentReferences.length === 1,
    lessonReferences,
    assessmentReferences,
  };
}

const invokedPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = await runCli(process.argv.slice(2));
  emit(result);
}
