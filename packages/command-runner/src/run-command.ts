import { access, constants, realpath, stat } from 'node:fs/promises';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import spawn from 'cross-spawn';

const MAX_STREAM_BYTES = 1_048_576;
const CLEANUP_GRACE_MS = 250;
const CLEANUP_FORCE_MS = 750;
const CLEANUP_POLL_MS = 25;
const CLEANUP_GRACEFUL_COMMAND_TIMEOUT_MS = 700;
const CLEANUP_FORCE_COMMAND_TIMEOUT_MS = 900;
const CLEANUP_HELPER_TIMEOUT_MS = 250;

export interface CommandSpec {
  command: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
}

export interface CommandResult {
  command: CommandSpec;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export type CommandRunnerErrorCode =
  'INVALID_SPEC' | 'SPAWN_FAILED' | 'OUTPUT_LIMIT_EXCEEDED' | 'CLEANUP_FAILED';

export class CommandRunnerError extends Error {
  readonly code: CommandRunnerErrorCode;

  constructor(code: CommandRunnerErrorCode, message: string) {
    super(message);
    this.name = 'CommandRunnerError';
    this.code = code;
  }
}

type SpawnImplementation = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export interface CommandRunnerTestHooks {
  readonly spawn?: SpawnImplementation;
  readonly taskkill?: SpawnImplementation;
  readonly windowsProcessAlive?: (pid: number) => boolean;
  readonly unixKill?: (pid: number, signal: NodeJS.Signals) => void;
  readonly terminateOwnedTree?: (pid: number) => Promise<void>;
  readonly onSettle?: (kind: 'resolve' | 'reject') => void;
  readonly onReady?: () => void;
}

let activeTestHooks: CommandRunnerTestHooks = {};

/** @internal Package-local seam for deterministic lifecycle tests; not exported from index.ts. */
export function __setCommandRunnerTestHooks(hooks: CommandRunnerTestHooks = {}): () => void {
  const previous = activeTestHooks;
  activeTestHooks = hooks;
  return () => {
    activeTestHooks = previous;
  };
}

interface OutputAccumulator {
  readonly chunks: Buffer[];
  byteLength: number;
  overflowed: boolean;
}

interface RuntimeState {
  closed: boolean;
  cleanupConfirmed: boolean;
  timedOut: boolean;
  failure: CommandRunnerError | undefined;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function invalidSpec(): CommandRunnerError {
  return new CommandRunnerError('INVALID_SPEC', 'Invalid command specification');
}

function spawnFailure(): CommandRunnerError {
  return new CommandRunnerError('SPAWN_FAILED', 'Command failed to spawn');
}

function outputLimitFailure(): CommandRunnerError {
  return new CommandRunnerError(
    'OUTPUT_LIMIT_EXCEEDED',
    'Command output exceeded the per-stream byte limit',
  );
}

function cleanupFailure(): CommandRunnerError {
  return new CommandRunnerError(
    'CLEANUP_FAILED',
    'Command process-tree cleanup could not be confirmed',
  );
}

function hasNul(value: string): boolean {
  return value.includes('\0');
}

function snapshotCommandSpec(spec: CommandSpec): CommandSpec {
  try {
    if (!isRecord(spec)) throw invalidSpec();

    const command = spec.command;
    const rawArgs = spec.args;
    const cwd = spec.cwd;
    const timeoutMs = spec.timeoutMs;

    if (typeof command !== 'string' || command.trim().length === 0 || hasNul(command)) {
      throw invalidSpec();
    }
    if (!Array.isArray(rawArgs)) throw invalidSpec();
    const indexedArgs: readonly unknown[] = rawArgs;
    const args: string[] = [];
    for (let index = 0; index < indexedArgs.length; index += 1) {
      const arg = indexedArgs[index];
      if (typeof arg !== 'string' || hasNul(arg)) throw invalidSpec();
      args.push(arg);
    }
    if (typeof cwd !== 'string' || cwd.length === 0 || hasNul(cwd)) {
      throw invalidSpec();
    }
    if (
      !Number.isFinite(timeoutMs) ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs <= 0 ||
      timeoutMs > 900_000
    ) {
      throw invalidSpec();
    }

    return Object.freeze({
      command,
      args: Object.freeze(args),
      cwd,
      timeoutMs,
    });
  } catch (error) {
    if (error instanceof CommandRunnerError) throw error;
    throw invalidSpec();
  }
}

async function validateCommandSpec(spec: CommandSpec): Promise<string> {
  try {
    const resolvedCwd = await realpath(spec.cwd);
    const cwdStats = await stat(resolvedCwd);
    if (!cwdStats.isDirectory()) throw invalidSpec();
    await access(resolvedCwd, constants.R_OK | constants.X_OK);
    return resolvedCwd;
  } catch (error) {
    if (error instanceof CommandRunnerError) throw error;
    throw invalidSpec();
  }
}

function appendBounded(target: OutputAccumulator, chunk: Buffer | string): boolean {
  if (target.overflowed) return false;
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
  const remaining = MAX_STREAM_BYTES - target.byteLength;
  if (bytes.byteLength > remaining) {
    if (remaining > 0) target.chunks.push(bytes.subarray(0, remaining));
    target.byteLength = MAX_STREAM_BYTES;
    target.overflowed = true;
    return false;
  }
  target.chunks.push(bytes);
  target.byteLength += bytes.byteLength;
  return true;
}

function decodeOutput(target: OutputAccumulator): string {
  return Buffer.concat(target.chunks, target.byteLength).toString('utf8');
}

function errorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}

function isMissingProcess(error: unknown): boolean {
  const code = errorCode(error);
  return code === 'ESRCH' || code === 'ENOENT';
}

function isUnixGroupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (isMissingProcess(error)) return false;
    return true;
  }
}

function isWindowsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isMissingProcess(error)) return false;
    return true;
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitUntilGone(isAlive: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isAlive()) {
    if (Date.now() >= deadline) return false;
    await sleep(CLEANUP_POLL_MS);
  }
  return true;
}

async function runTaskkill(
  args: readonly string[],
  taskkillSpawn: SpawnImplementation,
  commandTimeoutMs: number,
): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    let finished = false;
    let timedOut = false;
    let taskkill: ChildProcess;
    try {
      taskkill = taskkillSpawn('taskkill.exe', [...args], {
        shell: false,
        stdio: ['ignore', 'ignore', 'ignore'],
        windowsHide: true,
      });
    } catch {
      reject(new Error('taskkill could not be started'));
      return;
    }

    const finish = (error: Error | undefined, exitCode: number | undefined): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      taskkill.removeListener('error', onError);
      taskkill.removeListener('close', onClose);
      if (error) reject(error);
      else resolve(exitCode ?? -1);
    };
    const onError = (): void => {
      finish(new Error('taskkill failed'), undefined);
    };
    const onClose = (exitCode: number | null): void => {
      if (timedOut) {
        finish(new Error('taskkill timed out'), undefined);
      } else {
        finish(undefined, exitCode ?? -1);
      }
    };
    taskkill.once('error', onError);
    taskkill.once('close', onClose);
    const timer = setTimeout(() => {
      if (finished) return;
      timedOut = true;
      try {
        taskkill.kill();
      } catch {
        // The bounded command timeout still ends through the same rejection path.
      }
      const helperPid = taskkill.pid;
      if (typeof helperPid !== 'number') {
        finish(new Error('taskkill helper cleanup could not be confirmed'), undefined);
        return;
      }
      void waitUntilGone(() => isWindowsProcessAlive(helperPid), CLEANUP_HELPER_TIMEOUT_MS).then(
        (helperGone) => {
          finish(
            new Error(
              helperGone ? 'taskkill timed out' : 'taskkill helper cleanup could not be confirmed',
            ),
            undefined,
          );
        },
        () => {
          finish(new Error('taskkill helper cleanup could not be confirmed'), undefined);
        },
      );
    }, commandTimeoutMs);
  });
}

async function terminateWindowsTree(pid: number, hooks: CommandRunnerTestHooks): Promise<void> {
  const isProcessAlive = hooks.windowsProcessAlive ?? isWindowsProcessAlive;
  const taskkillSpawn = hooks.taskkill ?? spawn;
  if (!isProcessAlive(pid)) return;
  let gracefulExit = -1;
  let gracefulFailed = false;
  try {
    gracefulExit = await runTaskkill(
      ['/PID', String(pid), '/T'],
      taskkillSpawn,
      CLEANUP_GRACEFUL_COMMAND_TIMEOUT_MS,
    );
  } catch {
    gracefulFailed = true;
  }
  if (
    !gracefulFailed &&
    gracefulExit === 0 &&
    (await waitUntilGone(() => isProcessAlive(pid), CLEANUP_GRACE_MS))
  ) {
    return;
  }

  let forcedExit = -1;
  let forceFailed = false;
  try {
    forcedExit = await runTaskkill(
      ['/PID', String(pid), '/T', '/F'],
      taskkillSpawn,
      CLEANUP_FORCE_COMMAND_TIMEOUT_MS,
    );
  } catch {
    forceFailed = true;
  }
  if (
    !forceFailed &&
    forcedExit === 0 &&
    (await waitUntilGone(() => isProcessAlive(pid), CLEANUP_FORCE_MS))
  ) {
    return;
  }

  if (isProcessAlive(pid)) {
    try {
      process.kill(pid);
    } catch (error) {
      if (!isMissingProcess(error)) throw error;
    }
  }
  if (!(await waitUntilGone(() => isProcessAlive(pid), CLEANUP_FORCE_MS))) {
    throw new Error('Windows process tree remained alive');
  }
  if (gracefulFailed || forceFailed || gracefulExit !== 0 || forcedExit !== 0) {
    throw new Error('Windows process-tree cleanup was not authoritatively confirmed');
  }
}

async function terminateUnixGroup(pid: number, hooks: CommandRunnerTestHooks): Promise<void> {
  const killProcess =
    hooks.unixKill ??
    ((targetPid: number, signal: NodeJS.Signals): void => {
      process.kill(targetPid, signal);
    });
  if (!isUnixGroupAlive(pid)) return;
  try {
    killProcess(-pid, 'SIGTERM');
  } catch (error) {
    if (!isMissingProcess(error)) throw error;
  }
  if (await waitUntilGone(() => isUnixGroupAlive(pid), CLEANUP_GRACE_MS)) return;
  try {
    killProcess(-pid, 'SIGKILL');
  } catch (error) {
    if (!isMissingProcess(error)) throw error;
  }
  if (!(await waitUntilGone(() => isUnixGroupAlive(pid), CLEANUP_FORCE_MS))) {
    throw new Error('Unix process group remained alive');
  }
}

async function terminateOwnedTree(pid: number, hooks: CommandRunnerTestHooks): Promise<void> {
  if (process.platform === 'win32') {
    await terminateWindowsTree(pid, hooks);
  } else {
    await terminateUnixGroup(pid, hooks);
  }
}

export async function runCommand(spec: CommandSpec): Promise<CommandResult> {
  const operationSpec = snapshotCommandSpec(spec);
  const validatedCwd = await validateCommandSpec(operationSpec);
  const startedAt = Date.now();
  const hooks = activeTestHooks;
  const spawnProcess = hooks.spawn ?? spawn;
  let child: ChildProcess;
  try {
    child = spawnProcess(operationSpec.command, [...operationSpec.args], {
      cwd: validatedCwd,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
  } catch {
    throw spawnFailure();
  }

  const childStdout = child.stdout;
  const childStderr = child.stderr;
  if (childStdout === null || childStderr === null) {
    throw spawnFailure();
  }

  const resultCommand: CommandSpec = operationSpec;

  return await new Promise<CommandResult>((resolve, reject) => {
    const state: RuntimeState = {
      closed: false,
      cleanupConfirmed: false,
      timedOut: false,
      failure: undefined,
      exitCode: null,
      signal: null,
    };
    const stdout: OutputAccumulator = { chunks: [], byteLength: 0, overflowed: false };
    const stderr: OutputAccumulator = { chunks: [], byteLength: 0, overflowed: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cleanupPromise: Promise<void> | undefined;
    let settled = false;

    const settleOnce = (error?: CommandRunnerError): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
      child.removeListener('close', onClose);
      childStdout.removeListener('data', onStdout);
      childStderr.removeListener('data', onStderr);
      hooks.onSettle?.(error ? 'reject' : 'resolve');
      if (error) {
        reject(error);
        return;
      }
      resolve({
        command: resultCommand,
        exitCode: state.exitCode,
        signal: state.signal,
        timedOut: state.timedOut,
        stdout: decodeOutput(stdout),
        stderr: decodeOutput(stderr),
        durationMs: Math.max(0, Date.now() - startedAt),
      });
    };

    const finishIfReady = (): void => {
      if (settled || !state.closed || !state.cleanupConfirmed) return;
      settleOnce(state.failure);
    };

    const ensureCleanup = async (): Promise<void> => {
      if (state.cleanupConfirmed) {
        finishIfReady();
        return;
      }
      if (cleanupPromise === undefined) {
        cleanupPromise = (async () => {
          try {
            if (typeof child.pid !== 'number') {
              state.cleanupConfirmed = true;
              return;
            }
            if (hooks.terminateOwnedTree !== undefined) {
              await hooks.terminateOwnedTree(child.pid);
            } else {
              await terminateOwnedTree(child.pid, hooks);
            }
            state.cleanupConfirmed = true;
          } catch {
            const error = cleanupFailure();
            state.failure = error;
            settleOnce(error);
            throw error;
          }
        })();
      }
      await cleanupPromise;
      finishIfReady();
    };

    const failAndCleanup = (error: CommandRunnerError): void => {
      if (settled) return;
      state.failure ??= error;
      void ensureCleanup().catch(() => undefined);
    };

    const onStdout = (chunk: Buffer | string): void => {
      if (!appendBounded(stdout, chunk)) {
        childStdout.removeListener('data', onStdout);
        childStdout.resume();
        failAndCleanup(outputLimitFailure());
      }
    };
    const onStderr = (chunk: Buffer | string): void => {
      if (!appendBounded(stderr, chunk)) {
        childStderr.removeListener('data', onStderr);
        childStderr.resume();
        failAndCleanup(outputLimitFailure());
      }
    };
    const onError = (): void => {
      if (settled || state.closed) return;
      state.closed = true;
      failAndCleanup(spawnFailure());
    };
    const onExit = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      state.exitCode = exitCode;
      state.signal = signal;
    };
    const onClose = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      state.closed = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (state.exitCode === null) state.exitCode = exitCode;
      if (state.signal === null) state.signal = signal;
      void ensureCleanup().catch(() => undefined);
    };

    childStdout.on('data', onStdout);
    childStderr.on('data', onStderr);
    child.once('error', onError);
    child.once('exit', onExit);
    child.once('close', onClose);
    timer = setTimeout(() => {
      if (settled || state.closed) return;
      state.timedOut = true;
      void ensureCleanup().catch(() => undefined);
    }, operationSpec.timeoutMs);
    hooks.onReady?.();
  });
}
