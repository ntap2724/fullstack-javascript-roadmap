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
//
// Execution model: pnpm is located through npm_execpath and invoked as an
// argument to the current Node binary with shell: false. Nothing is passed
// through a shell, so no argument can be reinterpreted as shell syntax.

import { spawnSync } from 'node:child_process';

const pnpmExecPath = process.env.npm_execpath;
if (!pnpmExecPath) {
  console.error(
    'LEARNER_RUNNER_001: npm_execpath is unavailable; run this command through pnpm (pnpm test:learner)',
  );
  process.exit(2);
}

/**
 * Each entry declares the diagnostic code its suite is expected to report while
 * the milestone is unimplemented. The codes are documented here for the reader;
 * they are asserted by the suites, not printed by this runner.
 */
const suites = [
  {
    name: 'api',
    filter: '@workshop/api',
    declaredDiagnostic: 'LEARNER_API_ENROLLMENT_001',
  },
  {
    name: 'web',
    filter: '@workshop/web',
    declaredDiagnostic: 'LEARNER_WEB_ENROLLMENT_001',
  },
];

let failed = false;

for (const suite of suites) {
  console.log(`\n=== learner contract: ${suite.name} (${suite.declaredDiagnostic}) ===`);

  const result = spawnSync(
    process.execPath,
    [pnpmExecPath, '--filter', suite.filter, 'test:learner'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env,
      shell: false,
    },
  );

  // Print both streams for every suite before deciding anything, so a reader
  // never has to guess which suite produced which output.
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');

  if (result.error) {
    console.error(`LEARNER_RUNNER_002: ${suite.name}: ${result.error.message}`);
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
