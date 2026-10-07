// Aggregate learner-contract runner.
//
// Contract:
//   * Runs EVERY declared learner suite, even when an earlier suite fails. A
//     learner must see the full picture of what is unimplemented in one run,
//     not discover the next failure only after fixing the previous one.
//   * Exits non-zero when any suite fails, and zero only when all pass.
//   * Never invents a verdict: each suite's real stdout and stderr are printed
//     verbatim, so the stable diagnostic codes come from the tests themselves
//     rather than from this runner.
//   * A suite that cannot be found has NOT passed. `pnpm --filter` exits 0 when
//     no project matches, so a renamed package or a narrowed
//     `pnpm-workspace.yaml` would otherwise report an unevaluated contract as
//     satisfied and make an untouched starter read green. Each suite is located
//     before it is run, and the run itself adds `--fail-if-no-match`.
//
// Execution model: pnpm is located through npm_execpath and invoked as an
// argument to the current Node binary with shell: false. Nothing is passed
// through a shell, so no argument can be reinterpreted as shell syntax.
//
// Each suite is bounded in time and in output. A suite that hangs or floods
// stdout is a RUNNER failure and is reported as one; it is never allowed to
// masquerade as the expected learner failure, and it never stops the remaining
// suites from running.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A real learner suite finishes in seconds; five minutes is a hang, not slowness. */
const SUITE_TIMEOUT_MS = 300_000;
/** Generous for verbose test output, bounded so a runaway suite cannot exhaust memory. */
const SUITE_MAX_BUFFER_BYTES = 16_777_216;

const pnpmExecPath = process.env.npm_execpath;
if (!pnpmExecPath) {
  console.error(
    'LEARNER_RUNNER_001: npm_execpath is unavailable; run this command through pnpm (pnpm test:learner)',
  );
  process.exit(2);
}

/** Every pnpm invocation this runner makes shares one bounded, shell-free shape. */
function runPnpm(args) {
  return spawnSync(process.execPath, [pnpmExecPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    shell: false,
    timeout: SUITE_TIMEOUT_MS,
    maxBuffer: SUITE_MAX_BUFFER_BYTES,
  });
}

/**
 * Confirms a declared suite exists as a workspace project, declares the script
 * this runner is about to call, and still contains the suite file that carries its
 * contract.
 *
 * `pnpm list --json` answers structurally — an array of matched projects, each with
 * its path — rather than through a message this runner would have to parse, so the
 * check does not depend on pnpm's wording or locale.
 *
 * All three halves matter. A missing project, a missing script, and a deleted suite
 * file are runner problems, and reporting any of them as an unimplemented milestone
 * would be a lie in the learner's favour. A deleted suite file is the sharpest of
 * the three: paired with `passWithNoTests`, a test runner reports "no tests" as
 * success.
 */
function locateSuite(suite) {
  const listed = runPnpm(['--filter', suite.filter, 'list', '--depth=-1', '--json']);
  if (listed.error) return listed.error.message;
  if (listed.status !== 0) return `pnpm list exited ${listed.status}`;

  let parsed;
  try {
    parsed = JSON.parse(listed.stdout);
  } catch (error) {
    return `pnpm list did not return JSON (${error.message})`;
  }
  if (!Array.isArray(parsed)) return 'pnpm list did not return an array of projects';

  const project = parsed.find((entry) => entry?.name === suite.filter);
  if (!project) return `no workspace project is named ${suite.filter}`;
  if (typeof project.path !== 'string') return `pnpm list reported no path for ${suite.filter}`;

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(project.path, 'package.json'), 'utf8'));
  } catch (error) {
    return `cannot read the package manifest for ${suite.filter} (${error.message})`;
  }
  if (typeof manifest.scripts?.['test:learner'] !== 'string') {
    return `${suite.filter} declares no test:learner script`;
  }
  if (!existsSync(join(project.path, suite.suiteFile))) {
    return `${suite.filter} no longer contains ${suite.suiteFile}`;
  }
  return null;
}

/**
 * Each entry names the suite to execute. The stable diagnostics stay inside the
 * learner assertions: printing them here would let an unevaluated or interrupted
 * suite look like its intended failure to repository-owned verification.
 */
const suites = [
  {
    name: 'api',
    filter: '@workshop/api',
    suiteFile: 'test/learner.test.ts',
  },
  {
    name: 'web',
    filter: '@workshop/web',
    suiteFile: 'test/learner.test.tsx',
  },
];

let failed = false;

for (const suite of suites) {
  console.log(`\n=== learner contract: ${suite.name} ===`);

  const missing = locateSuite(suite);
  if (missing) {
    console.error(
      `LEARNER_RUNNER_003: ${suite.name}: ${missing}; the declared learner suite could not be located, so its contract was NOT evaluated`,
    );
    failed = true;
    continue;
  }

  // `--passWithNoTests=false` is the second half of the "did it actually run?"
  // question. Locating the suite file proves it exists; this proves the test
  // runner collected it. A suite config that sets `passWithNoTests: true` and
  // narrows `include`/`exclude` past the learner suite would otherwise report
  // "no test files found" as success, and an untouched starter would read green
  // with zero learner assertions executed. The flag overrides the config, and
  // both suites are vitest — which the repository-owned script contract pins.
  const result = runPnpm([
    '--fail-if-no-match',
    '--filter',
    suite.filter,
    'run',
    'test:learner',
    '--passWithNoTests=false',
  ]);

  // Print both streams for every suite before deciding anything, so a reader
  // never has to guess which suite produced which output.
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');

  if (result.error) {
    const signal = result.signal ? ` (signal ${result.signal})` : '';
    console.error(`LEARNER_RUNNER_002: ${suite.name}: ${result.error.message}${signal}`);
    failed = true;
    continue;
  }

  // No exit status means the process was terminated rather than finished. That is
  // a runner problem, and reporting it as an unimplemented milestone would be a
  // lie in the learner's favour.
  if (result.status === null) {
    const signal = result.signal ? ` (signal ${result.signal})` : '';
    console.error(
      `LEARNER_RUNNER_002: ${suite.name}: the suite was terminated without an exit status${signal}`,
    );
    failed = true;
    continue;
  }

  if (result.status !== 0) {
    console.log(`\n--- ${suite.name} learner contract: NOT SATISFIED (exit ${result.status}) ---`);
    failed = true;
    continue;
  }

  console.log(`\n--- ${suite.name} learner contract: satisfied ---`);
}

if (failed) {
  console.error(
    '\nOne or more learner contracts are not satisfied. On an untouched starter this is the expected state: implement the enrollment workflow described in README.md.',
  );
}

process.exitCode = failed ? 1 : 0;
