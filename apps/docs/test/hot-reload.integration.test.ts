import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { appendFile, cp, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const authoritativeCurriculumRoot = path.join(repositoryRoot, 'curriculum');
const HOT_RELOAD_HOST = '127.0.0.1';
// Deliberately far from Astro's 4321 and Vite's 5173 defaults. A developer's own
// dev server, or a stray static server on 4321/4322, would otherwise answer this
// test's requests and turn a real assertion into an unexplained timeout.
const HOT_RELOAD_PORT = 18422;
const HOT_RELOAD_BASE_URL = new URL(`http://${HOT_RELOAD_HOST}:${String(HOT_RELOAD_PORT)}/`);
const HOT_RELOAD_PREFIX = 'wp04-hot-reload-';
const DIAGNOSTIC_BUFFER_LIMIT = 16_384;

async function assertHotReloadPortAvailable(): Promise<void> {
  // Probe the loopback address the test polls AND the wildcard address. On Windows a
  // server already bound to 0.0.0.0 does not prevent a later 127.0.0.1 bind, so
  // probing only the loopback address can report the port as free while another
  // process still serves the requests this test makes.
  for (const host of [HOT_RELOAD_HOST, '0.0.0.0']) {
    const probe = createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(HOT_RELOAD_PORT, host, resolve);
    });
    await new Promise<void>((resolve, reject) => {
      probe.close((error) => {
        if (error === undefined) {
          resolve();
        } else {
          reject(error);
        }
      });
    });
  }
}

function createBoundedDiagnosticBuffer(limit = DIAGNOSTIC_BUFFER_LIMIT) {
  let value = '';
  return {
    append(chunk: Buffer | string): void {
      value = `${value}${chunk.toString()}`.slice(-limit);
    },
    read(): string {
      return value;
    },
  };
}

type DiagnosticBuffer = ReturnType<typeof createBoundedDiagnosticBuffer>;

function diagnosticError(
  message: string,
  stdout: DiagnosticBuffer,
  stderr: DiagnosticBuffer,
): Error {
  return new Error(
    `${message}\n--- child stdout ---\n${stdout.read()}\n--- child stderr ---\n${stderr.read()}`,
  );
}

async function listMarkdownFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(candidate)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(candidate);
    }
  }
  return files.sort();
}

async function snapshotCurriculumHashes(): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const file of await listMarkdownFiles(authoritativeCurriculumRoot)) {
    const relativePath = path.relative(authoritativeCurriculumRoot, file).split(path.sep).join('/');
    hashes[relativePath] = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
  }
  return hashes;
}

function snapshotGitStatus(): string {
  const result = spawnSync('git', ['status', '--short', '--', '.', ':(exclude)apps/docs/.astro'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `git status --short failed with status ${String(result.status)}: ${result.stderr}`,
    );
  }
  return result.stdout;
}

function hasChildExited(child: ChildProcess): boolean {
  return child.exitCode !== null;
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null) return true;
  return Promise.race([
    once(child, 'exit').then(() => true),
    new Promise<boolean>((resolve) =>
      setTimeout(() => {
        resolve(false);
      }, timeoutMs),
    ),
  ]);
}

async function stopChildTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      shell: false,
      windowsHide: true,
      stdio: 'pipe',
    });
    if (result.status !== 0 && !hasChildExited(child)) {
      throw new Error(`taskkill failed with status ${String(result.status)}`);
    }
  } else {
    child.kill('SIGTERM');
  }
  if (await waitForExit(child, 10_000)) return;
  if (process.platform !== 'win32') {
    child.kill('SIGKILL');
    if (await waitForExit(child, 5_000)) return;
  }
  throw new Error('Astro child tree did not exit');
}

async function waitForServer(
  child: ChildProcess,
  stdout: DiagnosticBuffer,
  stderr: DiagnosticBuffer,
): Promise<void> {
  const deadline = Date.now() + 60_000;
  const childExit = once(child, 'exit').then(() => {
    throw diagnosticError(
      `Astro exited before ${HOT_RELOAD_BASE_URL.href} became ready`,
      stdout,
      stderr,
    );
  });

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw diagnosticError(
        `Astro exited before ${HOT_RELOAD_BASE_URL.href} became ready`,
        stdout,
        stderr,
      );
    }

    if (!stdout.read().includes('watching for file changes...')) {
      await Promise.race([childExit, new Promise<void>((resolve) => setTimeout(resolve, 250))]);
      continue;
    }

    try {
      const response = await fetch(HOT_RELOAD_BASE_URL, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status < 500) return;
    } catch {
      if (hasChildExited(child)) {
        throw diagnosticError(
          `Astro exited before ${HOT_RELOAD_BASE_URL.href} became ready`,
          stdout,
          stderr,
        );
      }
    }

    await Promise.race([childExit, new Promise<void>((resolve) => setTimeout(resolve, 250))]);
  }

  throw diagnosticError(`Timed out waiting for ${HOT_RELOAD_BASE_URL.href}`, stdout, stderr);
}

async function requestRoute(route: string): Promise<{ body: string; status: number }> {
  const response = await fetch(new URL(route, HOT_RELOAD_BASE_URL), {
    signal: AbortSignal.timeout(5_000),
  });
  return { body: await response.text(), status: response.status };
}

async function waitForRouteMarker(
  route: string,
  marker: string,
  child: ChildProcess,
  stdout: DiagnosticBuffer,
  stderr: DiagnosticBuffer,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw diagnosticError(`Astro exited while waiting for ${marker}`, stdout, stderr);
    }
    try {
      const response = await requestRoute(route);
      if (response.status === 200 && response.body.includes(marker)) return;
    } catch {
      if (hasChildExited(child)) {
        throw diagnosticError(`Astro exited while waiting for ${marker}`, stdout, stderr);
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
  }
  throw diagnosticError(`Timed out waiting for rendered marker ${marker}`, stdout, stderr);
}

async function removeTemporaryRoot(candidate: string): Promise<void> {
  const resolvedTempDirectory = await realpath(tmpdir());
  const resolvedCandidate = await realpath(candidate);
  const relative = path.relative(resolvedTempDirectory, resolvedCandidate);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative) ||
    !path.basename(resolvedCandidate).startsWith(HOT_RELOAD_PREFIX)
  ) {
    throw new Error(`Refusing to remove unverified temporary directory: ${resolvedCandidate}`);
  }
  await rm(resolvedCandidate, { recursive: true });
}

describe('Astro curriculum hot reload', () => {
  it('reloads a copied development corpus without mutating authoritative files', async () => {
    const authoritativeHashes = await snapshotCurriculumHashes();
    const gitStatus = snapshotGitStatus();
    const stdout = createBoundedDiagnosticBuffer();
    const stderr = createBoundedDiagnosticBuffer();
    let temporaryRoot: string | undefined;
    let child: ChildProcess | undefined;
    let executionError: unknown;
    const failures: unknown[] = [];

    try {
      temporaryRoot = await mkdtemp(path.join(tmpdir(), HOT_RELOAD_PREFIX));
      const temporaryCurriculumRoot = path.join(temporaryRoot, 'curriculum');
      await cp(authoritativeCurriculumRoot, temporaryCurriculumRoot, { recursive: true });

      const npmExecPath = process.env.npm_execpath;
      if (npmExecPath === undefined) {
        throw new Error('npm_execpath is required for a shell-free pnpm child process');
      }

      await assertHotReloadPortAvailable();
      child = spawn(
        process.execPath,
        [
          npmExecPath,
          '--filter',
          '@roadmap/docs',
          'dev',
          '--host',
          HOT_RELOAD_HOST,
          '--port',
          String(HOT_RELOAD_PORT),
        ],
        {
          cwd: repositoryRoot,
          env: {
            ...process.env,
            VITEST: undefined,
            ASTRO_DEV_BACKGROUND: '1',
            ROADMAP_CURRICULUM_ROOT: temporaryCurriculumRoot,
            ROADMAP_ENABLE_TEST_CURRICULUM_ROOT: '1',
            ROADMAP_PUBLICATION_CHANNEL: 'development',
          },
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout.append(chunk);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr.append(chunk);
      });

      await waitForServer(child, stdout, stderr);

      await waitForRouteMarker(
        '/lessons/release-zero/draft/',
        'RELEASE_ZERO_DRAFT_BODY',
        child,
        stdout,
        stderr,
      );

      const closureRoute = '/lessons/javascript/functions/closure-private-state/';
      const closure = await requestRoute(closureRoute);
      expect(closure.status).toBe(200);
      expect(closure.body).toContain('RELEASE_ZERO_CLOSURE_BODY');

      const marker = `WP04_HOT_RELOAD_${randomUUID()}`;
      const copiedClosure = path.join(
        temporaryCurriculumRoot,
        'lessons',
        'lesson-js-closure-private-state.md',
      );
      await appendFile(copiedClosure, `\n\n${marker}\n`, 'utf8');
      await waitForRouteMarker(closureRoute, marker, child, stdout, stderr);
    } catch (error) {
      executionError = error;
    } finally {
      if (executionError !== undefined) failures.push(executionError);

      let childStopped = true;
      if (child !== undefined) {
        try {
          await stopChildTree(child);
        } catch (error) {
          childStopped = false;
          failures.push(error);
        }
      }

      if (temporaryRoot !== undefined && childStopped) {
        try {
          await removeTemporaryRoot(temporaryRoot);
        } catch (error) {
          failures.push(error);
        }
      }

      try {
        expect(await snapshotCurriculumHashes()).toEqual(authoritativeHashes);
      } catch (error) {
        failures.push(error);
      }
      try {
        expect(snapshotGitStatus()).toBe(gitStatus);
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(failures, 'Hot-reload integration failed');
    }
  }, 120_000);
});
