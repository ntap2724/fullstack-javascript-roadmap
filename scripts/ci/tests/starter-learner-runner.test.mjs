import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Behavioural contract for the learner-contract runner the starter publishes.
 *
 * These tests execute the REAL `scripts/verify-learner.mjs` with a stubbed pnpm, so
 * they are what actually prove the runner cannot report an unevaluated suite as a
 * pass. Two false greens were found and closed here.
 *
 * They live in the `test:bootstrap` stage rather than alongside the runner's
 * source-text pins in `packages/template-builder/test/`. Each case spawns several
 * real Node processes, and inside vitest's parallel pool that load raced
 * `apps/docs/test/content-loader.test.ts`, whose `vi.waitFor` calls sit close to
 * their timeout while it renders the whole curriculum. `pnpm test` runs
 * `test:bootstrap` before `test:unit`, so running here removes the overlap without
 * giving up per-pull-request coverage or weakening a single assertion.
 */

const starterRoot = path.resolve('templates/fullstack-vertical-slice/files');
const runnerPath = path.join(starterRoot, 'scripts', 'verify-learner.mjs');

const scratchRoots = [];

after(async () => {
  await Promise.all(
    scratchRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

/**
 * Stands in for pnpm. The runner locates pnpm through `npm_execpath` and runs it as
 * an argument to the current Node binary, so a plain script is a faithful
 * substitute.
 *
 * It models both invocations the runner makes and, critically, pnpm's real
 * no-match semantics: `pnpm --filter <unmatched>` succeeds and `pnpm list` returns
 * an empty array, which is exactly how an unevaluated suite could be mistaken for a
 * passing one.
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
];

function environmentWithoutExecPath() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([name, value]) => typeof value === 'string' && name.toLowerCase() !== 'npm_execpath',
    ),
  );
}

async function runRunner(options) {
  const scratch = await mkdtemp(path.join(tmpdir(), 'roadmap-learner-runner-'));
  scratchRoots.push(scratch);
  const stubPath = path.join(scratch, 'stub-pnpm.cjs');
  const logPath = path.join(scratch, 'invocations.log');
  const projectRoot = path.join(scratch, 'projects');
  await writeFile(stubPath, stubPnpmSource, 'utf8');
  await writeFile(logPath, '', 'utf8');

  // Each stubbed project gets a real manifest and a real suite file, because the
  // runner reads the manifest for the script it is about to call and checks that the
  // file carrying the contract still exists.
  for (const { filter, suiteFile } of stubFilters) {
    const directory = path.join(projectRoot, filter.split('/')[1]);
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

  const env = {
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
  // Only the tail is read back; pulling 16 MiB into this process costs far more
  // than any assertion needs.
  const captured = await open(outputPath, 'r');
  try {
    const { size } = await captured.stat();
    const window = Math.min(size, 64 * 1024);
    const buffer = Buffer.alloc(window);
    await captured.read(buffer, 0, window, size - window);
    return {
      status: result.status,
      stdout: buffer.toString('utf8'),
      stderr: result.stderr,
      invoked: log.split('\n').filter((line) => line.length > 0),
    };
  } finally {
    await captured.close();
  }
}

test('runs every declared learner suite even when the first one fails', async () => {
  const observed = await runRunner({ fail: ['@workshop/api'] });

  assert.deepEqual(observed.invoked, ['@workshop/api', '@workshop/web']);
  assert.equal(observed.status, 1);
});

test('exits zero only when every learner suite passes', async () => {
  const observed = await runRunner({});

  assert.deepEqual(observed.invoked, ['@workshop/api', '@workshop/web']);
  assert.equal(observed.status, 0);
});

test('reports a missing pnpm execution path as a runner failure', async () => {
  const observed = await runRunner({ execPath: 'absent' });

  assert.equal(observed.status, 2);
  assert.match(observed.stderr, /LEARNER_RUNNER_001/);
  assert.deepEqual(observed.invoked, []);
});

/**
 * The original false green. `pnpm --filter <unmatched> test:learner` exits 0, so
 * renaming a workspace package — or narrowing `pnpm-workspace.yaml` — used to make
 * the runner report an unevaluated contract as satisfied and hand back a green
 * `pnpm verify` on an untouched starter.
 */
test('reports a declared suite that cannot be found as a runner failure', async () => {
  const observed = await runRunner({ missing: ['@workshop/api'], fail: ['@workshop/web'] });

  assert.match(observed.stderr, /LEARNER_RUNNER_003/);
  assert.match(observed.stderr, /@workshop\/api/);
  assert.equal(observed.status, 1);
  // The missing suite was never executed, and the remaining suite still was.
  assert.deepEqual(observed.invoked, ['@workshop/web']);
  assert.doesNotMatch(observed.stdout, /api learner contract: satisfied/);
});

/**
 * Two more ways a suite can be present-but-unevaluable, exercised together because
 * each is a distinct message from the same control: a project that matches the
 * filter but declares no script, and a project whose contract file has been
 * deleted. `pnpm run` reports the first as a plain non-zero exit, indistinguishable
 * from a failing suite; paired with `passWithNoTests`, a test runner reports the
 * second as success.
 */
test('reports a located suite that cannot carry its contract as a runner failure', async () => {
  const observed = await runRunner({
    scriptless: ['@workshop/api'],
    suiteless: ['@workshop/web'],
  });

  assert.match(observed.stderr, /declares no test:learner script/);
  assert.match(observed.stderr, /no longer contains test\/learner\.test\.tsx/);
  assert.equal(observed.status, 1);
  assert.deepEqual(observed.invoked, []);
  assert.doesNotMatch(observed.stdout, /learner contract: satisfied/);
});

/**
 * Proves the subprocess option object is genuinely in force rather than merely
 * present in the source: a suite that writes past `maxBuffer` is killed, and the
 * runner classifies that as its own failure instead of letting it pass for the
 * expected learner failure. `timeout` lives in the same object literal, which the
 * source contract in packages/template-builder/test pins.
 */
test('reports a suite that overruns the output limit as a runner failure', async () => {
  const observed = await runRunner({ flood: ['@workshop/api'] });

  assert.match(observed.stderr, /LEARNER_RUNNER_002/);
  assert.match(observed.stderr, /ENOBUFS/);
  // The overflow must not be mistaken for the learner's declared failure, and it
  // must not swallow the remaining suite. (The runner names each suite's declared
  // diagnostic in its own header on every run, so the verdict line discriminates.)
  assert.doesNotMatch(observed.stdout, /api learner contract: satisfied/);
  assert.deepEqual(observed.invoked, ['@workshop/api', '@workshop/web']);
  assert.equal(observed.status, 1);
});
