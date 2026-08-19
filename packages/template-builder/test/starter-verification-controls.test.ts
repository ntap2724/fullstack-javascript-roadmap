import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Contract tests for the verification controls the starter publishes.
 *
 * These are the controls a learner or an assistant would have to defeat to make a
 * repository read green without doing the work: the aggregate learner runner, and
 * the root scripts that decide what `verify` actually verifies. They are pinned
 * here — inside `pnpm test`, which runs on every pull request — rather than only
 * inside `pnpm verify:templates`, which does not.
 *
 * The subject is the template source. Materialization copies `files/**` verbatim,
 * and the publication test asserts that these two files reach the generated
 * repository byte-for-byte, so asserting the contract once here is enough.
 */

const starterRoot = fileURLToPath(
  new URL('../../../templates/fullstack-vertical-slice/files/', import.meta.url),
);
const runnerPath = path.join(starterRoot, 'scripts', 'verify-learner.mjs');

const scratchRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    scratchRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

/**
 * Stands in for pnpm. The runner locates pnpm through `npm_execpath` and runs it
 * as an argument to the current Node binary, so a plain script is a faithful
 * substitute: it records the suite it was asked to run and then behaves as the
 * case under test requires.
 */
const stubPnpmSource = [
  "const { appendFileSync, writeSync } = require('node:fs');",
  "const filter = process.argv[process.argv.indexOf('--filter') + 1];",
  "appendFileSync(process.env.STUB_LOG, filter + '\\n');",
  "const listed = (name) => (process.env[name] ?? '').split(',').includes(filter);",
  "if (listed('STUB_FLOOD')) {",
  "  const chunk = 'x'.repeat(1024 * 1024);",
  '  for (let index = 0; index < 17; index += 1) writeSync(1, chunk);',
  '  process.exit(0);',
  '}',
  "process.stdout.write('stub learner suite: ' + filter + '\\n');",
  "process.exit(listed('STUB_FAIL') ? 1 : 0);",
  '',
].join('\n');

function environmentWithoutExecPath(): Record<string, string> {
  const entries = Object.entries(process.env).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === 'string' && entry[0].toLowerCase() !== 'npm_execpath',
  );
  return Object.fromEntries(entries);
}

interface RunnerObservation {
  status: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  invoked: readonly string[];
}

async function runRunner(options: {
  fail?: readonly string[];
  flood?: readonly string[];
  execPath?: 'stub' | 'absent';
}): Promise<RunnerObservation> {
  const scratch = await mkdtemp(path.join(tmpdir(), 'roadmap-learner-runner-'));
  scratchRoots.push(scratch);
  const stubPath = path.join(scratch, 'stub-pnpm.cjs');
  const logPath = path.join(scratch, 'invocations.log');
  await writeFile(stubPath, stubPnpmSource, 'utf8');
  await writeFile(logPath, '', 'utf8');

  const env: Record<string, string> = {
    ...environmentWithoutExecPath(),
    STUB_LOG: logPath,
    STUB_FAIL: (options.fail ?? []).join(','),
    STUB_FLOOD: (options.flood ?? []).join(','),
  };
  if (options.execPath !== 'absent') env.npm_execpath = stubPath;

  const result = spawnSync(process.execPath, [runnerPath], {
    cwd: scratch,
    encoding: 'utf8',
    env,
    shell: false,
    // The overflow case deliberately produces more than 16 MiB, which the runner
    // faithfully re-emits. Discarding its stdout keeps that out of the report
    // without changing anything the assertions depend on.
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  const log = await readFile(logPath, 'utf8');
  return {
    status: result.status,
    signal: result.signal,
    stderr: result.stderr,
    invoked: log.split('\n').filter((line) => line.length > 0),
  };
}

describe('learner runner subprocess limits', () => {
  /** Isolates the option object handed to the runner's single spawnSync call. */
  async function spawnCallSource(): Promise<string> {
    const source = await readFile(runnerPath, 'utf8');
    expect(
      source.split('spawnSync(').length - 1,
      'the runner must contain exactly one spawnSync call',
    ).toBe(1);
    const start = source.indexOf('spawnSync(');
    const end = source.indexOf('\n  );', start);
    expect(end, 'the spawnSync call must be terminated').toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it('bounds every suite in time and in output', async () => {
    const call = await spawnCallSource();

    expect(call).toContain('timeout: SUITE_TIMEOUT_MS,');
    expect(call).toContain('maxBuffer: SUITE_MAX_BUFFER_BYTES,');
  });

  it('declares limits large enough for real suites and small enough to bound', async () => {
    const source = await readFile(runnerPath, 'utf8');

    expect(source).toContain('const SUITE_TIMEOUT_MS = 300_000;');
    expect(source).toContain('const SUITE_MAX_BUFFER_BYTES = 16_777_216;');
  });

  it('keeps shell-free argv execution while bounded', async () => {
    const call = await spawnCallSource();

    expect(call).toContain('shell: false,');
    expect(call).toContain('process.execPath,');
    expect(call).toContain("[pnpmExecPath, '--filter', suite.filter, 'test:learner'],");
  });
});

describe('learner runner behaviour', () => {
  it('runs every declared suite even when the first one fails', async () => {
    const observed = await runRunner({ fail: ['@workshop/api'] });

    expect(observed.invoked).toEqual(['@workshop/api', '@workshop/web']);
    expect(observed.status).toBe(1);
  });

  it('exits zero only when every suite passes', async () => {
    const observed = await runRunner({});

    expect(observed.invoked).toEqual(['@workshop/api', '@workshop/web']);
    expect(observed.status).toBe(0);
  });

  it('reports a missing pnpm execution path as a runner failure', async () => {
    const observed = await runRunner({ execPath: 'absent' });

    expect(observed.status).toBe(2);
    expect(observed.stderr).toContain('LEARNER_RUNNER_001');
    expect(observed.invoked).toEqual([]);
  });

  /**
   * Proves the option object is genuinely in force rather than merely present in
   * the source: a suite that writes past `maxBuffer` is killed, and the runner
   * classifies that as its own failure instead of letting it pass for the expected
   * learner failure. `timeout` lives in the same object literal, which the source
   * contract above pins.
   */
  it('reports a suite that overruns the output limit as a runner failure', async () => {
    const observed = await runRunner({ flood: ['@workshop/api'] });

    expect(observed.stderr).toContain('LEARNER_RUNNER_002');
    expect(observed.stderr).toContain('ENOBUFS');
    expect(observed.stderr).not.toContain('LEARNER_API_ENROLLMENT_001');
    // The overflow must not swallow the remaining suite, and it must not be
    // mistaken for a satisfied contract.
    expect(observed.invoked).toEqual(['@workshop/api', '@workshop/web']);
    expect(observed.status).toBe(1);
  });
});

async function starterScripts(): Promise<Record<string, string>> {
  const parsed: unknown = JSON.parse(
    await readFile(path.join(starterRoot, 'package.json'), 'utf8'),
  );
  if (typeof parsed !== 'object' || parsed === null || !('scripts' in parsed)) {
    throw new Error('the starter manifest must declare a scripts block');
  }
  const { scripts } = parsed;
  if (typeof scripts !== 'object' || scripts === null) {
    throw new Error('the starter scripts block must be an object');
  }
  const entries = Object.entries(scripts).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return Object.fromEntries(entries);
}

function declared(scripts: Record<string, string>, name: string): string {
  const value = scripts[name];
  if (value === undefined) throw new Error(`the starter must declare a ${name} script`);
  return value;
}

describe('generated starter verification scripts', () => {
  it('keeps verify:baseline as the health check and nothing more', async () => {
    const baseline = declared(await starterScripts(), 'verify:baseline');

    expect(baseline).toContain('pnpm check');
    expect(baseline).toContain('pnpm test:infrastructure');
    expect(baseline).toContain('pnpm build');
    // The publication gate runs this command. If it ever reached the learner
    // contract, publication would require shipping a completed solution.
    expect(baseline).not.toContain('test:learner');
    expect(baseline).not.toContain('verify-learner');
  });

  it('routes the learner contract through the aggregate runner', async () => {
    expect(declared(await starterScripts(), 'test:learner')).toBe(
      'node scripts/verify-learner.mjs',
    );
  });

  it('makes verify the baseline followed by the learner contract', async () => {
    const verify = declared(await starterScripts(), 'verify');

    expect(verify).toContain('verify:baseline');
    expect(verify).toContain('test:learner');
    expect(verify.indexOf('verify:baseline')).toBeLessThan(verify.indexOf('test:learner'));
    // `&&` is what makes the learner result decide the command's exit status.
    // `||` or `;` would let a red learner contract read as success.
    expect(verify).toContain('&&');
    expect(verify).not.toContain('||');
    expect(verify).not.toContain(';');
  });

  it('never tolerates a non-zero exit in any declared script', async () => {
    for (const [name, command] of Object.entries(await starterScripts())) {
      expect(command, name).not.toMatch(/\|\|\s*true|\|\|\s*exit\s+0|continue-on-error|set \+e/);
    }
  });

  it('keeps test covering the infrastructure and learner suites', async () => {
    const test = declared(await starterScripts(), 'test');

    expect(test).toContain('test:infrastructure');
    expect(test).toContain('test:learner');
  });
});
