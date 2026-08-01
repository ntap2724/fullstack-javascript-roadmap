import { access, constants, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import {
  CommandRunnerError,
  runCommand,
  type CommandResult,
  type CommandSpec,
} from '@roadmap/command-runner';
import {
  isSafeRelativePath,
  normalizeRelativePath,
  type ExerciseDefinition,
} from '@roadmap/exercise-contract';
import type { Diagnostic } from '@roadmap/validation-core';
import type { ExerciseWorkspace } from './materialize.js';
import { verifyEditablePaths } from './verify-editable-paths.js';

export type VerificationMode = 'baseline' | 'learner';

export interface VerificationStepResult {
  readonly id: string;
  readonly required: boolean;
  readonly command: CommandResult;
}

export interface ExerciseVerificationReport {
  readonly exerciseId: string;
  readonly mode: VerificationMode;
  readonly status: 'passed' | 'failed' | 'internal-error';
  readonly steps: readonly VerificationStepResult[];
  readonly diagnostics: readonly Diagnostic[];
}

type CommandRunner = (spec: CommandSpec) => Promise<CommandResult>;

interface CommandSnapshot {
  readonly id: string;
  readonly required: boolean;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
}

class BoundaryFailure extends Error {}

const SIGNAL_NAMES: ReadonlySet<string> = new Set([
  'SIGABRT',
  'SIGALRM',
  'SIGBUS',
  'SIGBREAK',
  'SIGCHLD',
  'SIGCONT',
  'SIGFPE',
  'SIGHUP',
  'SIGILL',
  'SIGINT',
  'SIGIO',
  'SIGIOT',
  'SIGKILL',
  'SIGPIPE',
  'SIGPOLL',
  'SIGPROF',
  'SIGPWR',
  'SIGQUIT',
  'SIGSEGV',
  'SIGSTKFLT',
  'SIGSTOP',
  'SIGSYS',
  'SIGTERM',
  'SIGTRAP',
  'SIGTSTP',
  'SIGTTIN',
  'SIGTTOU',
  'SIGUNUSED',
  'SIGURG',
  'SIGUSR1',
  'SIGUSR2',
  'SIGVTALRM',
  'SIGWINCH',
  'SIGXCPU',
  'SIGXFSZ',
  'SIGLOST',
  'SIGINFO',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVerificationMode(value: unknown): value is VerificationMode {
  return value === 'baseline' || value === 'learner';
}

function reportMode(value: unknown): VerificationMode {
  return isVerificationMode(value) ? value : 'learner';
}

function exerciseIdFrom(value: unknown): string {
  if (isRecord(value) && typeof value.id === 'string' && value.id.length > 0) return value.id;
  return 'unknown-exercise';
}

function internalDiagnostic(pointer?: string): Diagnostic {
  return {
    code: 'EXERCISE_INTERNAL_001',
    severity: 'error',
    location: {
      file: '.roadmap/exercise-baseline.json',
      ...(pointer === undefined ? {} : { pointer }),
    },
    observed: 'verifier-internal-error',
    expected: 'A trusted exercise definition and contained command workspace.',
    reason: 'The verification boundary could not be established safely.',
    remediation:
      'Restore valid exercise metadata and workspace paths before retrying verification.',
    documentation:
      'Internal verification failures do not expose command, path, or exception details.',
  };
}

function commandDiagnostic(
  code:
    | 'EXERCISE_COMMAND_001'
    | 'EXERCISE_COMMAND_002'
    | 'EXERCISE_COMMAND_003'
    | 'EXERCISE_COMMAND_004'
    | 'EXERCISE_COMMAND_005',
  pointer: string,
  observed: unknown,
): Diagnostic {
  return {
    code,
    severity: 'error',
    location: { file: '.roadmap/exercise-baseline.json', pointer },
    observed,
    expected: 'A command that completes within the released exercise command contract.',
    reason: 'The exercise command did not produce an acceptable verification result.',
    remediation: 'Correct the exercise or command environment and retry the verification.',
    documentation: 'Command failures are reported with stable codes and no raw process details.',
  };
}

function completedObserved(result: CommandResult): Record<string, unknown> {
  return {
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    stderr: result.stderr,
  };
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function snapshotArgs(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new BoundaryFailure();
  const indexed: readonly unknown[] = value;
  const args: string[] = [];
  for (let index = 0; index < indexed.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(indexed, index)) throw new BoundaryFailure();
    const descriptor = Object.getOwnPropertyDescriptor(indexed, String(index));
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new BoundaryFailure();
    }
    const argument = indexed[index];
    if (typeof argument !== 'string' || argument.includes('\0')) throw new BoundaryFailure();
    args.push(argument);
  }
  return Object.freeze(args);
}

function snapshotEditablePaths(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new BoundaryFailure();
  const indexed: readonly unknown[] = value;
  const patterns: string[] = [];
  for (let index = 0; index < indexed.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(indexed, index)) throw new BoundaryFailure();
    const descriptor = Object.getOwnPropertyDescriptor(indexed, String(index));
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new BoundaryFailure();
    }
    const pattern = indexed[index];
    if (typeof pattern !== 'string' || pattern.length === 0 || pattern.includes('\0')) {
      throw new BoundaryFailure();
    }
    patterns.push(pattern);
  }
  return Object.freeze(patterns);
}

function snapshotCommand(value: unknown): CommandSnapshot {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['args', 'command', 'cwd', 'id', 'required', 'timeoutMs'])
  ) {
    throw new BoundaryFailure();
  }
  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    value.id.includes('\0') ||
    typeof value.command !== 'string' ||
    value.command.length === 0 ||
    value.command.includes('\0') ||
    typeof value.cwd !== 'string' ||
    value.cwd.length === 0 ||
    value.cwd.includes('\0') ||
    typeof value.required !== 'boolean' ||
    typeof value.timeoutMs !== 'number' ||
    !Number.isInteger(value.timeoutMs) ||
    value.timeoutMs <= 0 ||
    value.timeoutMs > 900_000
  ) {
    throw new BoundaryFailure();
  }
  return Object.freeze({
    id: value.id,
    required: value.required,
    command: value.command,
    args: snapshotArgs(value.args),
    cwd: value.cwd,
    timeoutMs: value.timeoutMs,
  });
}

function snapshotCommands(definition: unknown, mode: VerificationMode): readonly CommandSnapshot[] {
  if (!isRecord(definition) || !isRecord(definition.commands)) throw new BoundaryFailure();
  const selected = definition.commands[mode];
  if (!Array.isArray(selected)) throw new BoundaryFailure();
  const indexed: readonly unknown[] = selected;
  const snapshots: CommandSnapshot[] = [];
  for (let index = 0; index < indexed.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(indexed, index)) throw new BoundaryFailure();
    snapshots.push(snapshotCommand(indexed[index]));
  }
  return Object.freeze(snapshots);
}

function commandSpec(snapshot: CommandSnapshot, cwd: string): CommandSpec {
  return Object.freeze({
    command: snapshot.command,
    args: Object.freeze([...snapshot.args]),
    cwd,
    timeoutMs: snapshot.timeoutMs,
  });
}

function isSignal(value: unknown): value is NodeJS.Signals | null {
  return value === null || (typeof value === 'string' && SIGNAL_NAMES.has(value));
}

function snapshotResult(value: unknown): CommandResult {
  if (!isRecord(value)) throw new BoundaryFailure();
  if (
    !hasExactKeys(value, [
      'command',
      'durationMs',
      'exitCode',
      'signal',
      'stderr',
      'stdout',
      'timedOut',
    ]) ||
    (typeof value.exitCode !== 'number' && value.exitCode !== null) ||
    (typeof value.exitCode === 'number' && !Number.isInteger(value.exitCode)) ||
    typeof value.timedOut !== 'boolean' ||
    typeof value.stdout !== 'string' ||
    typeof value.stderr !== 'string' ||
    typeof value.durationMs !== 'number' ||
    !Number.isFinite(value.durationMs) ||
    value.durationMs < 0 ||
    !isSignal(value.signal)
  ) {
    throw new BoundaryFailure();
  }
  const command = snapshotCommandSpec(value.command);
  return Object.freeze({
    command,
    exitCode: value.exitCode,
    signal: value.signal,
    timedOut: value.timedOut,
    stdout: value.stdout,
    stderr: value.stderr,
    durationMs: value.durationMs,
  });
}

function snapshotCommandSpec(value: unknown): CommandSpec {
  if (!isRecord(value) || !hasExactKeys(value, ['args', 'command', 'cwd', 'timeoutMs'])) {
    throw new BoundaryFailure();
  }
  if (
    typeof value.command !== 'string' ||
    value.command.length === 0 ||
    value.command.includes('\0') ||
    typeof value.cwd !== 'string' ||
    value.cwd.length === 0 ||
    value.cwd.includes('\0') ||
    typeof value.timeoutMs !== 'number' ||
    !Number.isInteger(value.timeoutMs) ||
    value.timeoutMs <= 0 ||
    value.timeoutMs > 900_000
  ) {
    throw new BoundaryFailure();
  }
  return Object.freeze({
    command: value.command,
    args: snapshotArgs(value.args),
    cwd: value.cwd,
    timeoutMs: value.timeoutMs,
  });
}

function isPathInside(base: string, candidate: string): boolean {
  const relative = path.relative(base, candidate);
  return (
    relative.length === 0 ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function isLexicallyContained(base: string, candidate: string): boolean {
  const comparableBase = process.platform === 'win32' ? base.toLowerCase() : base;
  const comparableCandidate = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
  return isPathInside(comparableBase, comparableCandidate);
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

async function resolveContainedCwd(rootInput: string, relativeCwd: string): Promise<string> {
  if (
    relativeCwd !== '.' &&
    (!isSafeRelativePath(relativeCwd) || normalizeRelativePath(relativeCwd) !== relativeCwd)
  ) {
    throw new BoundaryFailure();
  }
  const lexicalRoot = path.resolve(rootInput);
  let rootInformation;
  try {
    rootInformation = await lstat(lexicalRoot);
  } catch {
    throw new BoundaryFailure();
  }
  if (!rootInformation.isDirectory() || rootInformation.isSymbolicLink())
    throw new BoundaryFailure();
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(lexicalRoot);
  } catch {
    throw new BoundaryFailure();
  }
  if (!isLexicallyContained(lexicalRoot, canonicalRoot) || lexicalRoot !== canonicalRoot) {
    throw new BoundaryFailure();
  }
  const requested =
    relativeCwd === '.' ? lexicalRoot : path.join(lexicalRoot, ...relativeCwd.split('/'));
  if (!isLexicallyContained(lexicalRoot, requested)) throw new BoundaryFailure();

  const relativeSegments = relativeCwd === '.' ? [] : relativeCwd.split('/');
  let lexicalCursor = lexicalRoot;
  for (const segment of relativeSegments) {
    lexicalCursor = path.join(lexicalCursor, segment);
    let information;
    try {
      information = await lstat(lexicalCursor);
    } catch {
      throw new BoundaryFailure();
    }
    if (!information.isDirectory() || information.isSymbolicLink()) throw new BoundaryFailure();
    let canonicalCursor: string;
    try {
      canonicalCursor = await realpath(lexicalCursor);
      await access(canonicalCursor, constants.R_OK | constants.X_OK);
    } catch {
      throw new BoundaryFailure();
    }
    if (canonicalCursor !== lexicalCursor || !isPathInside(canonicalRoot, canonicalCursor)) {
      throw new BoundaryFailure();
    }
  }

  let canonicalCandidate: string;
  try {
    canonicalCandidate = await realpath(requested);
    const candidateInformation = await lstat(requested);
    if (!candidateInformation.isDirectory() || candidateInformation.isSymbolicLink()) {
      throw new BoundaryFailure();
    }
    await access(canonicalCandidate, constants.R_OK | constants.X_OK);
  } catch (error) {
    if (error instanceof BoundaryFailure) throw error;
    if (isMissing(error)) throw new BoundaryFailure();
    throw new BoundaryFailure();
  }
  if (canonicalCandidate !== requested || !isPathInside(canonicalRoot, canonicalCandidate)) {
    throw new BoundaryFailure();
  }
  return canonicalCandidate;
}

function typedCommandCode(
  error: CommandRunnerError,
): 'EXERCISE_COMMAND_003' | 'EXERCISE_COMMAND_004' | 'EXERCISE_COMMAND_005' | undefined {
  if (error.code === 'SPAWN_FAILED') return 'EXERCISE_COMMAND_003';
  if (error.code === 'OUTPUT_LIMIT_EXCEEDED') return 'EXERCISE_COMMAND_004';
  if (error.code === 'CLEANUP_FAILED') return 'EXERCISE_COMMAND_005';
  return undefined;
}

function report(
  definition: unknown,
  mode: VerificationMode,
  status: ExerciseVerificationReport['status'],
  steps: readonly VerificationStepResult[],
  diagnostics: readonly Diagnostic[],
): ExerciseVerificationReport {
  return {
    exerciseId: exerciseIdFrom(definition),
    mode,
    status,
    steps: Object.freeze([...steps]),
    diagnostics: Object.freeze([...diagnostics]),
  };
}

async function verifyExerciseCore(
  definition: ExerciseDefinition,
  workspace: ExerciseWorkspace,
  mode: unknown,
  runner: CommandRunner,
): Promise<ExerciseVerificationReport> {
  const safeMode = reportMode(mode);
  let protection;
  try {
    const runtimeDefinition: unknown = definition;
    if (!isRecord(runtimeDefinition) || !isRecord(runtimeDefinition.constraints)) {
      throw new BoundaryFailure();
    }
    const editablePaths = snapshotEditablePaths(runtimeDefinition.constraints.editablePaths);
    protection = await verifyEditablePaths(workspace, definition, editablePaths);
  } catch {
    return report(definition, safeMode, 'internal-error', [], [internalDiagnostic()]);
  }
  if (!protection.ok) return report(definition, safeMode, 'failed', [], protection.diagnostics);
  if (!isVerificationMode(mode)) {
    return report(definition, safeMode, 'internal-error', [], [internalDiagnostic()]);
  }

  let snapshots: readonly CommandSnapshot[];
  try {
    snapshots = snapshotCommands(definition, mode);
  } catch {
    return report(definition, mode, 'internal-error', [], [internalDiagnostic()]);
  }

  const steps: VerificationStepResult[] = [];
  for (const snapshot of snapshots) {
    const pointer = `/commands/${mode}/${snapshot.id}`;
    let cwd: string;
    try {
      cwd = await resolveContainedCwd(workspace.root, snapshot.cwd);
    } catch {
      return report(definition, mode, 'internal-error', steps, [internalDiagnostic(pointer)]);
    }

    let result: CommandResult;
    try {
      result = snapshotResult(await runner(commandSpec(snapshot, cwd)));
    } catch (error) {
      if (error instanceof CommandRunnerError) {
        const code = typedCommandCode(error);
        if (code !== undefined) {
          return report(definition, mode, 'failed', steps, [
            commandDiagnostic(code, pointer, 'command-runner-failure'),
          ]);
        }
      }
      return report(definition, mode, 'internal-error', steps, [internalDiagnostic(pointer)]);
    }

    const step: VerificationStepResult = Object.freeze({
      id: snapshot.id,
      required: snapshot.required,
      command: result,
    });
    steps.push(step);
    if (!snapshot.required) continue;
    if (result.timedOut) {
      return report(definition, mode, 'failed', steps, [
        commandDiagnostic('EXERCISE_COMMAND_002', pointer, completedObserved(result)),
      ]);
    }
    if (result.exitCode !== 0) {
      return report(definition, mode, 'failed', steps, [
        commandDiagnostic('EXERCISE_COMMAND_001', pointer, completedObserved(result)),
      ]);
    }
  }
  return report(definition, mode, 'passed', steps, []);
}

export async function verifyExercise(
  definition: ExerciseDefinition,
  workspace: ExerciseWorkspace,
  mode: VerificationMode,
): Promise<ExerciseVerificationReport> {
  return verifyExerciseCore(definition, workspace, mode, runCommand);
}

/** @internal Package-local runner seam; deliberately absent from index.ts. */
export async function verifyExerciseWithRunnerForTest(
  definition: ExerciseDefinition,
  workspace: ExerciseWorkspace,
  mode: unknown,
  runner: CommandRunner,
): Promise<ExerciseVerificationReport> {
  return verifyExerciseCore(definition, workspace, mode, runner);
}
