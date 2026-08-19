import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

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
 * and `assertVerificationControlsShipVerbatim` in
 * scripts/verify-template-learner-contract.ts proves that the runner, the root
 * manifest, and the workflow reach the generated repository byte-for-byte, so
 * asserting the contract once here is enough.
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
 * substitute.
 *
 * It models the two invocations the runner makes and, critically, pnpm's real
 * no-match semantics: `pnpm --filter <unmatched>` succeeds and `pnpm list` returns
 * an empty array, which is exactly how an unevaluated suite could be mistaken for
 * a passing one.
 */
const stubPnpmSource = [
  "const { appendFileSync, writeSync } = require('node:fs');",
  "const { join } = require('node:path');",
  "const filter = process.argv[process.argv.indexOf('--filter') + 1];",
  "const listed = (name) => (process.env[name] ?? '').split(',').includes(filter);",
  '',
  "if (process.argv.includes('list')) {",
  "  if (listed('STUB_MISSING')) {",
  "    process.stdout.write('[]');",
  '  } else {',
  "    const directory = join(process.env.STUB_PROJECT_ROOT, filter.split('/').pop());",
  '    process.stdout.write(JSON.stringify([{ name: filter, path: directory }]));',
  '  }',
  '  process.exit(0);',
  '}',
  '',
  "appendFileSync(process.env.STUB_LOG, filter + '\\n');",
  "if (listed('STUB_FLOOD')) {",
  "  const chunk = 'x'.repeat(1024 * 1024);",
  '  for (let index = 0; index < 17; index += 1) writeSync(1, chunk);',
  '  process.exit(0);',
  '}',
  "process.stdout.write('stub learner suite: ' + filter + '\\n');",
  "process.exit(listed('STUB_FAIL') ? 1 : 0);",
  '',
].join('\n');

const stubFilters = [
  { filter: '@workshop/api', suiteFile: 'test/learner.test.ts' },
  { filter: '@workshop/web', suiteFile: 'test/learner.test.tsx' },
] as const;

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
  stdout: string;
  stderr: string;
  invoked: readonly string[];
}

async function runRunner(options: {
  fail?: readonly string[];
  flood?: readonly string[];
  missing?: readonly string[];
  scriptless?: readonly string[];
  suiteless?: readonly string[];
  execPath?: 'stub' | 'absent';
}): Promise<RunnerObservation> {
  const scratch = await mkdtemp(path.join(tmpdir(), 'roadmap-learner-runner-'));
  scratchRoots.push(scratch);
  const stubPath = path.join(scratch, 'stub-pnpm.cjs');
  const logPath = path.join(scratch, 'invocations.log');
  const projectRoot = path.join(scratch, 'projects');
  await writeFile(stubPath, stubPnpmSource, 'utf8');
  await writeFile(logPath, '', 'utf8');

  // Each stubbed project gets a real manifest and a real suite file, because the
  // runner reads the manifest for the script it is about to call and checks that the
  // suite carrying the contract still exists.
  for (const { filter, suiteFile } of stubFilters) {
    const directory = path.join(projectRoot, filter.split('/')[1] ?? filter);
    await mkdir(path.join(directory, path.dirname(suiteFile)), { recursive: true });
    const scripts = (options.scriptless ?? []).includes(filter)
      ? {}
      : { 'test:learner': 'vitest run' };
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: filter, scripts }),
      'utf8',
    );
    if (!(options.suiteless ?? []).includes(filter)) {
      await writeFile(path.join(directory, suiteFile), '// stub learner suite\n', 'utf8');
    }
  }

  const env: Record<string, string> = {
    ...environmentWithoutExecPath(),
    STUB_LOG: logPath,
    STUB_PROJECT_ROOT: projectRoot,
    STUB_FAIL: (options.fail ?? []).join(','),
    STUB_FLOOD: (options.flood ?? []).join(','),
    STUB_MISSING: (options.missing ?? []).join(','),
  };
  if (options.execPath !== 'absent') env.npm_execpath = stubPath;

  const outputPath = path.join(scratch, 'runner-stdout.log');
  const stdoutFile = await open(outputPath, 'w');
  let result;
  try {
    result = spawnSync(process.execPath, [runnerPath], {
      cwd: scratch,
      encoding: 'utf8',
      env,
      shell: false,
      // The overflow case deliberately produces more than 16 MiB, which the runner
      // faithfully re-emits. Sending its stdout to a file keeps that out of the
      // report while still capturing it: the runner writes its per-suite verdicts
      // with console.log, so assertions about those need the real stream.
      stdio: ['ignore', stdoutFile.fd, 'pipe'],
    });
  } finally {
    await stdoutFile.close();
  }

  const log = await readFile(logPath, 'utf8');
  return {
    status: result.status,
    signal: result.signal,
    stdout: await readFile(outputPath, 'utf8'),
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
    expect(call).toContain('[pnpmExecPath, ...args],');
  });

  it('locates each suite and refuses to let pnpm succeed on no match', async () => {
    const source = await readFile(runnerPath, 'utf8');

    // `pnpm --filter <unmatched>` exits 0, so the runner must not infer success
    // from an exit status alone. It asks pnpm which projects matched, checks the
    // matched project still declares the script and still contains the suite file,
    // and passes --fail-if-no-match so the run itself cannot come back green empty.
    expect(source).toContain("['--filter', suite.filter, 'list', '--depth=-1', '--json']");
    expect(source).toContain("['--fail-if-no-match', '--filter', suite.filter, 'test:learner']");
    expect(source).toContain('declares no test:learner script');
    expect(source).toContain('no longer contains');
    expect(source).toContain('LEARNER_RUNNER_003');
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
   * The false-green regression. `pnpm --filter <unmatched> test:learner` exits 0,
   * so renaming a workspace package — or narrowing `pnpm-workspace.yaml` — used to
   * make the runner report an unevaluated contract as satisfied and hand back a
   * green `pnpm verify` on an untouched starter.
   */
  it('reports a declared suite that cannot be found as a runner failure', async () => {
    const observed = await runRunner({ missing: ['@workshop/api'], fail: ['@workshop/web'] });

    expect(observed.stderr).toContain('LEARNER_RUNNER_003');
    expect(observed.stderr).toContain('@workshop/api');
    expect(observed.status).toBe(1);
    // The missing suite was never executed, and the remaining suite still was.
    expect(observed.invoked).toEqual(['@workshop/web']);
  });

  it('never reports a suite it could not find as satisfied', async () => {
    const observed = await runRunner({ missing: ['@workshop/api', '@workshop/web'] });

    expect(observed.status).toBe(1);
    expect(observed.invoked).toEqual([]);
    expect(observed.stdout).not.toContain('learner contract: satisfied');
  });

  /**
   * A project can match the filter and still not declare the script the runner is
   * about to call. `pnpm run` reports that as a non-zero exit, which is
   * indistinguishable from a failing suite — so the runner checks the manifest and
   * names the real problem instead.
   */
  it('reports a located suite with no test:learner script as a runner failure', async () => {
    const observed = await runRunner({ scriptless: ['@workshop/web'] });

    expect(observed.stderr).toContain('LEARNER_RUNNER_003');
    expect(observed.stderr).toContain('declares no test:learner script');
    expect(observed.status).toBe(1);
    expect(observed.invoked).toEqual(['@workshop/api']);
  });

  /**
   * The sharpest version of an unevaluated suite: delete the file carrying the
   * contract. Paired with `passWithNoTests`, a test runner reports "no tests" as
   * success, so the runner checks the suite file still exists rather than trusting
   * the child's exit code.
   */
  it('reports a deleted learner suite file as a runner failure', async () => {
    const observed = await runRunner({ suiteless: ['@workshop/web'] });

    expect(observed.stderr).toContain('LEARNER_RUNNER_003');
    expect(observed.stderr).toContain('no longer contains test/learner.test.tsx');
    expect(observed.status).toBe(1);
    expect(observed.invoked).toEqual(['@workshop/api']);
    expect(observed.stdout).not.toContain('web learner contract: satisfied');
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
    // The overflow must not be mistaken for the learner's declared failure, and it
    // must not swallow the remaining suite. (The runner's own per-suite header names
    // the declared diagnostic on every run, so the verdict line is what discriminates.)
    expect(observed.stdout).not.toContain('api learner contract: satisfied');
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
    // Strip the legitimate `&&` operators and nothing shell-significant may remain:
    // `||`, `;`, a pipe into another process, or a single `&` would each let a red
    // learner contract read as success.
    expect(verify).toContain('&&');
    expect(verify.replaceAll('&&', '')).not.toMatch(/[|;&]/);
  });

  it('never tolerates a non-zero exit in any declared script', async () => {
    for (const [name, command] of Object.entries(await starterScripts())) {
      // Same rule as `verify`, applied to every script: strip the legitimate `&&`
      // operators and nothing shell-significant may remain. An enumeration of bad
      // suffixes missed `|| echo ok` and `|| node -e ""`, either of which turns a
      // red command green — including `verify:baseline`, which is the publication
      // gate and the CI baseline job.
      expect(command.replaceAll('&&', ''), name).not.toMatch(/[|;&]/);
      expect(command, name).not.toMatch(/continue-on-error|set \+e|exit\s+0\s*$/);
    }
  });

  it('keeps test covering the infrastructure and learner suites', async () => {
    const test = declared(await starterScripts(), 'test');

    expect(test).toContain('test:infrastructure');
    expect(test).toContain('test:learner');
  });

  /**
   * The root `test:learner` is only as strong as the per-app scripts it fans out
   * to. Repointing `apps/web`'s at the infrastructure suite would silently delete
   * half the learner contract while every root-level check still passed.
   */
  it.each([
    ['apps/api', 'test/learner.test.ts'],
    ['apps/web', 'test/learner.test.tsx'],
  ])('routes %s test:learner at its own learner suite', async (packageDirectory, suiteFile) => {
    const parsed: unknown = JSON.parse(
      await readFile(path.join(starterRoot, packageDirectory, 'package.json'), 'utf8'),
    );
    if (typeof parsed !== 'object' || parsed === null || !('scripts' in parsed)) {
      throw new Error(`${packageDirectory} must declare a scripts block`);
    }
    const { scripts } = parsed;
    if (typeof scripts !== 'object' || scripts === null || !('test:learner' in scripts)) {
      throw new Error(`${packageDirectory} must declare a test:learner script`);
    }
    const command = scripts['test:learner'];

    expect(command).toBe(`vitest run --config vitest.config.ts ${suiteFile}`);
  });

  /**
   * The learner suites are reached by package name, so the workspace globs decide
   * whether they can be found at all. Narrowing them is the quietest way to make
   * the runner unable to locate a suite, so the globs are pinned rather than merely
   * documented as protected.
   */
  it('keeps the workspace globs that make the learner suites reachable', async () => {
    const workspace: unknown = parse(
      await readFile(path.join(starterRoot, 'pnpm-workspace.yaml'), 'utf8'),
    );
    if (typeof workspace !== 'object' || workspace === null || !('packages' in workspace)) {
      throw new Error('the starter workspace must declare packages');
    }

    expect(workspace.packages).toEqual(['apps/*', 'packages/*']);
  });
});
