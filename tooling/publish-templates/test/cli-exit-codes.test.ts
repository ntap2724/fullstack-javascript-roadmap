import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main } from '../src/main.js';

/**
 * F4 — the three-way exit contract of src/main.ts.
 *
 *   0 = the dry-run report passed
 *   1 = the report came back not passed
 *   2 = something threw and was caught
 *
 * Measured before this file existed: the `2` branch was already exercised by
 * test/cli.test.ts, which spawns the CLI with a bad flag and asserts an actual
 * process code of 2 plus the stderr message. Mutating `return 2` to `return 0`
 * or to `return 1` was killed there, and unwiring `process.exitCode = await
 * main(...)` was killed there too. What survived every mutation was the report
 * branch: rewriting `report.status === 'passed' ? 0 : 1` to `return 0`, to
 * `return 1`, or to the inverted `? 1 : 0` changed nothing, because no test
 * called main() at all and no test ever produced a non-passing report through
 * the CLI. That gap is what this file closes.
 *
 * Two layers are kept deliberately separate, because they prove different
 * things and one does not imply the other:
 *
 *   Layer A — main() is a mapping function. Asserting `await main(argv) === 1`
 *             exercises the mapping and nothing else. main()'s return value is
 *             NOT the process exit code.
 *   Layer B — the module-level invoked-as-main guard assigns that return value
 *             to process.exitCode. Only a real spawned process proves the code
 *             the operating system actually reports.
 */

const require = createRequire(import.meta.url);
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const mainModule = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const javascriptEngineering = path.join(repoRoot, 'templates', 'javascript-engineering');

/**
 * The CLI is TypeScript, so a spawned run needs tsx. It is loaded by passing
 * tsx's own CLI entry to node rather than by setting NODE_OPTIONS='--import
 * tsx', and that difference is load-bearing rather than stylistic.
 *
 * Measured: NODE_OPTIONS is inherited by every descendant process. The verifier
 * stage runs `pnpm install --frozen-lockfile` and `pnpm verify:baseline` INSIDE
 * the generated artifact, where tsx is not installed, so those grandchildren die
 * with ERR_MODULE_NOT_FOUND, the verifier records TEMPLATE_VERIFY_001, and a
 * genuinely passing template reports exit 1. A passing-case test written with
 * NODE_OPTIONS therefore fails for a reason that has nothing to do with the exit
 * mapping. Passing the CLI entry as an argument keeps the child environment
 * clean, and NODE_OPTIONS is stripped below so an outer environment cannot
 * reintroduce the same leak.
 */
const tsxCli = require.resolve('tsx/cli');

function childEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  return environment;
}

interface CliOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

/**
 * Spawns the CLI and reports the ACTUAL process exit status.
 *
 * `spawn` plus the `close` event is used instead of promisified `execFile`
 * because execFile resolves on success and rejects on failure, so a successful
 * run never yields a numeric code to assert on — exit 0 would be inferred from
 * "it resolved" rather than observed. `close` reports code and signal uniformly
 * for 0, 1 and 2 alike, and it surfaces `signal` so a process killed for an
 * unrelated reason cannot be mistaken for a mapped exit code.
 */
function runCli(argv: readonly string[]): Promise<CliOutcome> {
  return new Promise<CliOutcome>((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, mainModule, ...argv], {
      cwd: repoRoot,
      env: childEnvironment(),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

const outputRoot = (): Promise<string> => mkdtemp(path.join(tmpdir(), 'roadmap-f4-out-'));

function baseArgv(templateRoot: string, output: string): readonly string[] {
  return [
    '--template',
    templateRoot,
    '--output',
    output,
    '--source-repository',
    'fullstack-javascript-roadmap',
    '--source-commit',
    '0123456789abcdef0123456789abcdef01234567',
    '--generated-at',
    '2026-07-26T12:00:00.000Z',
    '--node-version',
    '24.0.0',
    '--pnpm-version',
    '11.0.0',
  ];
}

/**
 * A template whose reviewed file set disagrees with what materialization
 * produces. This is the construction that yields a NOT-passed report with
 * nothing thrown anywhere in the chain: the source scan succeeds, the build
 * succeeds, the output scan succeeds, and the pipeline then returns
 * TEMPLATE_FILESET_001 by an ordinary `return` before any command runs. The
 * exit 1 it produces therefore cannot be an exception in disguise.
 */
async function driftedTemplateRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-f4-drift-'));
  await mkdir(path.join(root, 'files'), { recursive: true });
  await mkdir(path.join(root, 'publication-tests'), { recursive: true });
  await copyFile(
    path.join(javascriptEngineering, 'template.yaml'),
    path.join(root, 'template.yaml'),
  );
  await writeFile(path.join(root, 'files', 'README.md'), '# fixture\n');
  await writeFile(
    path.join(root, 'publication-tests', 'expected-files.json'),
    JSON.stringify(['README.md']),
  );
  return root;
}

/**
 * Runtime narrowing for a logged or parsed report. A type guard rather than an
 * `as` cast: a cast asserts the shape instead of checking it, so every assertion
 * below would keep passing if main() logged something else entirely.
 */
function isReport(value: unknown): value is { status: unknown; diagnostics: readonly unknown[] } {
  if (typeof value !== 'object' || value === null) return false;
  if (!('status' in value) || !('diagnostics' in value)) return false;
  return Array.isArray(value.diagnostics);
}

function diagnosticCodes(diagnostics: readonly unknown[]): readonly unknown[] {
  return diagnostics.map((entry) =>
    typeof entry === 'object' && entry !== null && 'code' in entry ? entry.code : undefined,
  );
}

interface ConsoleCapture {
  logged: readonly unknown[];
  errored: readonly unknown[];
}

/**
 * main() reports through console, and which stream it used is the only thing
 * that distinguishes the mapped branches from each other by construction rather
 * than by trusting the number: the report branches log the report on stdout and
 * never touch stderr, while the catch branch writes the message on stderr and
 * never logs a report.
 */
function captureConsole(): ConsoleCapture {
  const logged: unknown[] = [];
  const errored: unknown[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logged.push(...args);
  });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errored.push(...args);
  });
  return { logged, errored };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('main() exit mapping, in-process', () => {
  // This layer asserts on main()'s RETURN VALUE, which is not the process exit
  // code. Layer B below covers that separately.

  it('returns 0 when the report passes, and prints the passing report', async () => {
    const capture = captureConsole();
    const code = await main(baseArgv(javascriptEngineering, await outputRoot()));

    // Attribution before the number: the 0 must come from a report that really
    // passed, not from a run that printed nothing.
    expect(capture.errored).toEqual([]);
    expect(capture.logged).toHaveLength(1);
    const report = capture.logged[0];
    expect(isReport(report)).toBe(true);
    if (!isReport(report)) return;
    expect(report.status).toBe('passed');
    expect(report.diagnostics).toEqual([]);
    expect(code).toBe(0);
  }, 600_000);

  it('returns 1 when the report does not pass, with nothing thrown', async () => {
    const capture = captureConsole();
    const code = await main(baseArgv(await driftedTemplateRoot(), await outputRoot()));

    // The discriminator that makes this a 1 and not a 2: the catch branch writes
    // to stderr, and stderr was never touched. Asserting only `code === 1` would
    // pass just as well if the mapping collapsed and the pipeline had thrown.
    expect(capture.errored).toEqual([]);
    expect(capture.logged).toHaveLength(1);
    const report = capture.logged[0];
    expect(isReport(report)).toBe(true);
    if (!isReport(report)) return;
    expect(report.status).toBe('failed');
    expect(diagnosticCodes(report.diagnostics)).toEqual(['TEMPLATE_FILESET_001']);
    // The pipeline returned before the verifier ran, so no command executed.
    expect('verification' in report).toBe(false);
    expect(code).toBe(1);
  }, 600_000);

  // Exit 2 is a catch-all: a missing flag, an unknown flag, a duplicate flag and
  // a pipeline explosion would all produce it. The number alone therefore
  // attributes nothing, so each row pins the specific error path by its exact
  // stderr message and additionally requires that no report was printed.
  const throwingInvocations = [
    ['an unknown flag', ['--bogus'], 'Unknown flag: --bogus'],
    ['a missing required flag', ['--template', 'x'], 'Missing required flag: --output'],
  ] as const;

  for (const [label, argv, message] of throwingInvocations) {
    it(`returns 2 for ${label}, attributed by its exact message`, async () => {
      const capture = captureConsole();
      const code = await main(argv);

      expect(capture.logged).toEqual([]);
      expect(capture.errored).toEqual([message]);
      expect(code).toBe(2);
    });
  }
});

describe('CLI process exit contract, spawned', () => {
  // This layer asserts the code the operating system actually reports, which is
  // what makes the guard's `process.exitCode = await main(...)` wiring load
  // bearing. Every assertion here rules out a code that did not come from the
  // mapping: `signal` must be null, so a killed or crashed process cannot be
  // read as a mapped exit.

  it('exits 0 and prints the passing report on stdout', async () => {
    const outcome = await runCli([
      ...baseArgv(javascriptEngineering, await outputRoot()),
      '--json',
    ]);

    expect(outcome.signal).toBeNull();
    expect(outcome.stderr).toBe('');
    // Load-bearing, not decorative. Measured: importing main.ts instead of
    // invoking it as the entry script leaves the invoked-as-main guard unfired,
    // so main() never runs, nothing is printed, and the process still exits 0.
    // A bare `expect(code).toBe(0)` is satisfied by that empty run, so exit 0 is
    // only evidence of the mapping when the report was actually produced.
    expect(outcome.stdout).not.toBe('');
    const parsed: unknown = JSON.parse(outcome.stdout);
    expect(isReport(parsed)).toBe(true);
    if (!isReport(parsed)) return;
    expect(parsed.status).toBe('passed');
    expect(outcome.code).toBe(0);
  }, 600_000);

  it('exits 1 with the failed report on stdout and a silent stderr', async () => {
    const outcome = await runCli([
      ...baseArgv(await driftedTemplateRoot(), await outputRoot()),
      '--json',
    ]);

    expect(outcome.signal).toBeNull();
    // Distinguishes this exit 1 from the catch-all 2 by construction: a caught
    // throw would have written the message here and printed no report.
    expect(outcome.stderr).toBe('');
    expect(outcome.stdout).not.toBe('');
    const parsed: unknown = JSON.parse(outcome.stdout);
    expect(isReport(parsed)).toBe(true);
    if (!isReport(parsed)) return;
    expect(parsed.status).toBe('failed');
    expect(diagnosticCodes(parsed.diagnostics)).toEqual(['TEMPLATE_FILESET_001']);
    expect(outcome.code).toBe(1);
  }, 600_000);

  it('exits 2 with the message on stderr and nothing on stdout', async () => {
    // test/cli.test.ts already proves an actual code of 2 for a bad flag. This
    // row is measured through the same helper as the 0 and 1 cases above so the
    // three codes are comparable evidence rather than three different methods,
    // and it adds the half that file does not assert: stdout stays empty, so a
    // report was never produced.
    const outcome = await runCli(['--bogus']);

    expect(outcome.signal).toBeNull();
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toContain('Unknown flag: --bogus');
    expect(outcome.code).toBe(2);
  }, 120_000);
});
