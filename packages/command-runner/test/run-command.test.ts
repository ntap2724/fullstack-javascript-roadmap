import { EventEmitter } from 'node:events';
import { spawn as nodeSpawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { runCommand } from '../src/index.js';
import { __setCommandRunnerTestHooks, type CommandRunnerTestHooks } from '../src/run-command.js';

const nodeCommand = process.execPath;

const spec = (source: string, timeoutMs = 5_000) => ({
  command: nodeCommand,
  args: ['--input-type=module', '--eval', source],
  cwd: process.cwd(),
  timeoutMs,
});

describe('runCommand', () => {
  it('captures stdout, stderr, exit code, and elapsed time without a shell', async () => {
    const result = await runCommand(spec("console.log('out'); console.error('err')"));
    expect(result.exitCode).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toBe('out\n');
    expect(result.stderr).toBe('err\n');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('does not settle successfully while a normal-exit detached descendant is alive', async () => {
    if (process.platform !== 'win32') return;

    const root = await mkdtemp(path.join(tmpdir(), 'command-runner-containment-'));
    const marker = path.join(root, 'descendant-pid.txt');
    let descendantPid: number | undefined;
    const source = `
      import { spawn } from 'node:child_process';
      import { writeFile } from 'node:fs/promises';
      const marker = process.argv[1];
      const descendant = spawn(
        process.execPath,
        ['--input-type=module', '--eval', 'setTimeout(() => {}, 1500)'],
        { detached: true, stdio: 'ignore' },
      );
      await writeFile(marker, String(descendant.pid), 'utf8');
      descendant.unref();
    `;

    try {
      let result: Awaited<ReturnType<typeof runCommand>> | undefined;
      try {
        result = await runCommand({
          command: nodeCommand,
          args: ['--input-type=module', '--eval', source, marker],
          cwd: process.cwd(),
          timeoutMs: 5_000,
        });
      } catch (error) {
        expect(error).toMatchObject({ code: 'CLEANUP_FAILED' });
      }

      try {
        descendantPid = Number((await readFile(marker, 'utf8')).trim());
      } catch {
        descendantPid = undefined;
      }

      if (result !== undefined) {
        expect(result.exitCode).toBe(0);
        expect(descendantPid).toBeGreaterThan(0);
        expect(isProcessAlive(descendantPid as number)).toBe(false);
      }
    } finally {
      try {
        if (descendantPid !== undefined && descendantPid > 0) {
          await terminateSpecificWindowsTree(descendantPid);
          expect(await waitForProcessGone(descendantPid, 2_000)).toBe(true);
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  it('preserves a non-zero exit code', async () => {
    const result = await runCommand(spec('process.exit(7)'));
    expect(result.exitCode).toBe(7);
    expect(result.timedOut).toBe(false);
  });

  it('passes metacharacters as literal arguments rather than shell syntax', async () => {
    const result = await runCommand({
      command: nodeCommand,
      args: ['--input-type=module', '--eval', 'console.log(process.argv[1])', '&& echo injected'],
      cwd: process.cwd(),
      timeoutMs: 5_000,
    });
    expect(result.stdout).toBe('&& echo injected\n');
    expect(result.stderr).toBe('');
  });

  it('rejects invalid command specifications with a stable typed code', async () => {
    const invalidSpecs = [
      { command: '', args: [], cwd: process.cwd(), timeoutMs: 5_000 },
      { command: 'node\0invalid', args: [], cwd: process.cwd(), timeoutMs: 5_000 },
      { command: nodeCommand, args: ['valid\0invalid'], cwd: process.cwd(), timeoutMs: 5_000 },
      { command: nodeCommand, args: [], cwd: '', timeoutMs: 5_000 },
      {
        command: nodeCommand,
        args: [],
        cwd: path.join(tmpdir(), 'missing-command-cwd'),
        timeoutMs: 5_000,
      },
      { command: nodeCommand, args: [], cwd: process.cwd(), timeoutMs: 0 },
      { command: nodeCommand, args: [], cwd: process.cwd(), timeoutMs: 900_001 },
      { command: nodeCommand, args: [], cwd: process.cwd(), timeoutMs: Number.NaN },
    ];

    for (const invalidSpec of invalidSpecs) {
      await expect(runCommand(invalidSpec)).rejects.toMatchObject({
        code: 'INVALID_SPEC',
      });
    }
  });

  it('[SOL-T1-003] rejects sparse argv as INVALID_SPEC', async () => {
    const sparseArgs = new Array<string>(1);
    await expect(
      runCommand({
        command: nodeCommand,
        args: sparseArgs,
        cwd: process.cwd(),
        timeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SPEC' });
  });

  it('[SOL-T1-002] executes and returns the dense snapshot taken before validation awaits', async () => {
    const mutableSpec = spec("console.log('stable-snapshot')");
    const command = runCommand(mutableSpec);
    mutableSpec.command = 'roadmap-command-mutated-after-call';
    mutableSpec.args = ['--mutated-after-call'];
    mutableSpec.timeoutMs = 1;

    const result = await command;
    expect(result.stdout).toBe('stable-snapshot\n');
    expect(result.command.command).toBe(nodeCommand);
    expect(result.command.args).toEqual([
      '--input-type=module',
      '--eval',
      "console.log('stable-snapshot')",
    ]);
    expect(result.command.timeoutMs).toBe(5_000);
  });

  it('rejects when the executable cannot be started', async () => {
    await expect(
      runCommand({
        command: 'roadmap-command-that-does-not-exist',
        args: [],
        cwd: process.cwd(),
        timeoutMs: 500,
      }),
    ).rejects.toMatchObject({
      code: 'SPAWN_FAILED',
    });
  });

  it('marks and terminates commands that exceed the timeout', async () => {
    const startedAt = Date.now();
    const result = await runCommand(spec('setTimeout(() => {}, 10_000)', 50));
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it('does not leave a child alive when it installs a SIGTERM handler', async () => {
    const source = `
      process.on('SIGTERM', () => {});
      setInterval(() => process.stdout.write('alive\\n'), 25);
    `;
    const result = await runCommand(spec(source, 50));
    expect(result.timedOut).toBe(true);
    expect(result.durationMs).toBeLessThan(2_000);
  });

  it('removes a real grandchild before a timeout settles', async () => {
    const source = `
      import { spawn } from 'node:child_process';
      const grandchild = spawn(
        process.execPath,
        ['--input-type=module', '--eval', 'setInterval(() => {}, 10_000)'],
        { stdio: 'ignore' },
      );
      console.log(grandchild.pid);
      setInterval(() => {}, 10_000);
    `;
    const result = await runCommand(spec(source, 500));
    const grandchildPid = Number(result.stdout.trim());
    expect(result.timedOut).toBe(true);
    expect(grandchildPid).toBeGreaterThan(0);
    expect(isProcessAlive(grandchildPid)).toBe(false);
  });

  it('rejects with a stable typed output-limit error for per-stream floods', async () => {
    const source = `
      const chunk = 'x'.repeat(65_536);
      for (let index = 0; index < 64; index += 1) {
        process.stdout.write(chunk);
        process.stderr.write(chunk);
      }
      setInterval(() => {}, 10_000);
    `;
    let readyAt: number | undefined;
    const restore = __setCommandRunnerTestHooks({
      onReady: () => {
        readyAt = Date.now();
      },
    });
    try {
      await expect(runCommand(spec(source, 5_000))).rejects.toMatchObject({
        code: 'OUTPUT_LIMIT_EXCEEDED',
      });
      if (readyAt === undefined) throw new Error('Command runner readiness hook did not fire');
      expect(Date.now() - readyAt).toBeLessThan(2_000);
    } finally {
      restore();
    }
  });

  it('[SOL-T1-004] accepts exactly 1,048,576 stdout bytes intact', async () => {
    const result = await runCommand(spec('process.stdout.write(Buffer.alloc(1_048_576, 0x61))'));
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBe(1_048_576);
    expect(result.stdout).toBe('a'.repeat(1_048_576));
  });

  it('[SOL-T1-004] rejects 1,048,577 stdout bytes with OUTPUT_LIMIT_EXCEEDED', async () => {
    const startedAt = Date.now();
    await expect(
      runCommand(
        spec('process.stdout.write(Buffer.alloc(1_048_577, 0x62)); setInterval(() => {}, 10_000)'),
      ),
    ).rejects.toMatchObject({ code: 'OUTPUT_LIMIT_EXCEEDED' });
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it('[SOL-T1-001/T1-004] rejects failed Windows tree commands after root disappearance', async () => {
    if (process.platform !== 'win32') return;
    const child = createFakeChild(32_001);
    const taskkillCalls: Array<{ command: string; args: string[]; options: SpawnOptions }> = [];
    let aliveChecks = 0;
    let readyResolve: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      readyResolve = resolve;
    });
    const restore = __setCommandRunnerTestHooks({
      spawn: () => child,
      taskkill: (command, args, options) => {
        taskkillCalls.push({ command, args: [...args], options });
        return createFakeTaskkill(1);
      },
      windowsProcessAlive: () => {
        aliveChecks += 1;
        return aliveChecks === 1;
      },
      onReady: () => readyResolve?.(),
    });
    try {
      const command = runCommand(spec('ignored'));
      await ready;
      child.emit('close', 0, null);
      await expect(command).rejects.toMatchObject({ code: 'CLEANUP_FAILED' });
      expect(taskkillCalls).toHaveLength(2);
      expect(taskkillCalls[0]?.command).toBe('taskkill.exe');
      expect(taskkillCalls[0]?.args).toEqual(['/PID', '32001', '/T']);
      expect(taskkillCalls[1]?.args).toEqual(['/PID', '32001', '/T', '/F']);
      expect(taskkillCalls[0]?.options.shell).toBe(false);
      expect(taskkillCalls[0]?.options.windowsHide).toBe(true);
      expect(taskkillCalls[0]?.options.stdio).toEqual(['ignore', 'ignore', 'ignore']);
    } finally {
      restore();
      child.stdout.destroy();
      child.stderr.destroy();
    }
  });

  it('[SOL-T1-001] rejects timed-out Windows tree commands and terminates the helpers', async () => {
    if (process.platform !== 'win32') return;
    const child = createFakeChild(32_002);
    let helperKillCount = 0;
    let aliveChecks = 0;
    let readyResolve: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      readyResolve = resolve;
    });
    const restore = __setCommandRunnerTestHooks({
      spawn: () => child,
      taskkill: () =>
        createFakeTaskkill(null, () => {
          helperKillCount += 1;
        }),
      windowsProcessAlive: () => {
        aliveChecks += 1;
        return aliveChecks === 1;
      },
      onReady: () => readyResolve?.(),
    });
    try {
      const command = runCommand(spec('ignored'));
      await ready;
      child.emit('close', 0, null);
      await expect(command).rejects.toMatchObject({ code: 'CLEANUP_FAILED' });
      expect(helperKillCount).toBe(2);
    } finally {
      restore();
      child.stdout.destroy();
      child.stderr.destroy();
    }
  });

  it('[SOL-T1-004] uses a negative process-group PID for Unix cleanup', async () => {
    if (process.platform === 'win32') return;
    const killedPids: number[] = [];
    const realKill = process.kill.bind(process);
    const restore = __setCommandRunnerTestHooks({
      unixKill: (pid, signal) => {
        killedPids.push(pid);
        realKill(pid, signal);
      },
    });
    try {
      const result = await runCommand(spec('setInterval(() => {}, 10_000)', 50));
      expect(result.timedOut).toBe(true);
      expect(killedPids.some((pid) => pid < 0)).toBe(true);
    } finally {
      restore();
    }
  });

  it('rejects rather than resolving when cleanup confirmation fails', async () => {
    const restore = __setCommandRunnerTestHooks({
      terminateOwnedTree: () => {
        throw new Error('controlled cleanup confirmation failure');
      },
    });
    try {
      await expect(runCommand(spec("console.log('cleanup')"))).rejects.toMatchObject({
        code: 'CLEANUP_FAILED',
      });
    } finally {
      restore();
    }
  });

  it('settles exactly once across error, exit, and close races', async () => {
    const child = new EventEmitter() as unknown as ChildProcess & {
      pid: number;
      stdout: PassThrough;
      stderr: PassThrough;
    };
    child.pid = 32_001;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    let settlementCount = 0;
    let readyResolve: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      readyResolve = resolve;
    });
    const hooks: CommandRunnerTestHooks = {
      spawn: () => child,
      terminateOwnedTree: () => Promise.resolve(),
      onSettle: () => {
        settlementCount += 1;
      },
      onReady: () => readyResolve?.(),
    };
    const restore = __setCommandRunnerTestHooks(hooks);
    try {
      const command = runCommand(spec('ignored'));
      await ready;
      queueMicrotask(() => {
        child.emit('error', new Error('controlled race'));
        child.emit('exit', null, 'SIGTERM');
        child.emit('close', null, 'SIGTERM');
        child.emit('close', null, 'SIGTERM');
      });
      await expect(command).rejects.toMatchObject({
        code: 'SPAWN_FAILED',
      });
      expect(settlementCount).toBe(1);
    } finally {
      restore();
      child.stdout.destroy();
      child.stderr.destroy();
    }
  });

  it('preserves split multibyte UTF-8 at the stream boundary', async () => {
    const result = await runCommand(
      spec(`
      const bytes = Buffer.from('a€b');
      process.stdout.write(bytes.subarray(0, 2));
      setTimeout(() => process.stdout.write(bytes.subarray(2)), 10);
    `),
    );
    expect(result.stdout).toBe('a€b');
  });

  it('captures SIGTERM on Unix without generalizing that evidence to Windows', async () => {
    if (process.platform === 'win32') return;
    const result = await runCommand(spec("process.kill(process.pid, 'SIGTERM')"));
    expect(result.signal).toBe('SIGTERM');
    expect(result.timedOut).toBe(false);
  });

  it('resolves a Windows .cmd executable through cross-spawn on Windows', async () => {
    if (process.platform !== 'win32') return;
    const root = await mkdtemp(path.join(tmpdir(), 'command-runner-cmd-'));
    const commandFile = path.join(root, 'echo-command.cmd');
    await writeFile(commandFile, '@echo off\r\necho cmd-ok\r\n', 'utf8');
    try {
      const result = await runCommand({
        command: commandFile,
        args: [],
        cwd: root,
        timeoutMs: 5_000,
      });
      expect(result.stdout.trim()).toBe('cmd-ok');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    { phase: 'SETUP', code: 'SPAWN_FAILED' },
    { phase: 'ASSIGN', code: 'SPAWN_FAILED' },
    { phase: 'PROTOCOL', code: 'SPAWN_FAILED' },
    { phase: 'CONTAINMENT_QUERY', code: 'CLEANUP_FAILED' },
    { phase: 'CONTAINMENT_TERMINATE', code: 'CLEANUP_FAILED' },
    { phase: 'CONTAINMENT_WAIT', code: 'CLEANUP_FAILED' },
  ])('maps a controlled Windows $phase uncertainty to $code', async ({ phase, code }) => {
    if (process.platform !== 'win32') return;
    const restore = __setCommandRunnerTestHooks({
      windowsJobHostSetup: (...observed: unknown[]) => {
        if (observed[0] === phase) throw new Error(`controlled ${phase} uncertainty`);
      },
    });
    try {
      const requiresTermination = phase === 'CONTAINMENT_TERMINATE' || phase === 'CONTAINMENT_WAIT';
      await expect(
        runCommand(
          spec(
            requiresTermination ? 'setInterval(() => {}, 10_000)' : 'process.exit(0)',
            requiresTermination ? 50 : 5_000,
          ),
        ),
      ).rejects.toMatchObject({ code });
    } finally {
      restore();
    }
  });
});

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      const code = (error as Error & { code?: string }).code;
      return code !== 'ESRCH' && code !== 'ENOENT';
    }
    return false;
  }
}

async function terminateSpecificWindowsTree(pid: number): Promise<void> {
  if (!isProcessAlive(pid)) return;
  await new Promise<void>((resolve, reject) => {
    let finished = false;
    const killer = nodeSpawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      shell: false,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    });
    const finish = (error?: Error): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      killer.removeListener('error', onError);
      killer.removeListener('close', onClose);
      if (error) reject(error);
      else resolve();
    };
    const onError = (): void => {
      finish(new Error('test cleanup taskkill failed'));
    };
    const onClose = (): void => {
      finish();
    };
    killer.once('error', onError);
    killer.once('close', onClose);
    const timer = setTimeout(() => {
      try {
        killer.kill();
      } catch {
        // The bounded wait below remains the cleanup proof.
      }
      finish();
    }, 1_000);
  });
}

async function waitForProcessGone(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isProcessAlive(pid)) {
    if (Date.now() >= deadline) return false;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  return true;
}

function createFakeChild(pid: number): ChildProcess & {
  stdout: PassThrough;
  stderr: PassThrough;
} {
  const child = new EventEmitter() as unknown as ChildProcess & {
    pid: number;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: () => boolean;
  };
  child.pid = pid;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
  return child;
}

function createFakeTaskkill(exitCode: number | null, onKill?: () => void): ChildProcess {
  const taskkill = new EventEmitter() as unknown as ChildProcess & {
    pid: number;
    kill: () => boolean;
  };
  taskkill.pid = 45_001;
  taskkill.kill = () => {
    onKill?.();
    if (exitCode === null) queueMicrotask(() => taskkill.emit('close', null, null));
    return true;
  };
  if (exitCode !== null) queueMicrotask(() => taskkill.emit('close', exitCode, null));
  return taskkill;
}
