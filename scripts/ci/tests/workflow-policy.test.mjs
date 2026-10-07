import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';

async function workflows() {
  const directory = '.github/workflows';
  const names = (await readdir(directory)).filter((name) => name.endsWith('.yml'));
  return Promise.all(
    names.map(async (name) => ({
      name,
      value: parse(await readFile(`${directory}/${name}`, 'utf8')),
    })),
  );
}

function serialized(value) {
  return JSON.stringify(value);
}

test('all workflows are read-only and avoid unsafe triggers or commands', async () => {
  for (const { name, value } of await workflows()) {
    assert.equal(value.permissions?.contents, 'read', name);
    assert.equal(value.on?.pull_request_target, undefined, name);
    const text = serialized(value);
    assert.doesNotMatch(text, /continue-on-error|(?<!p)npm install|pnpm add|curl[^\n]*\|/i, name);
    assert.doesNotMatch(
      text,
      /contents.{0,20}write|pages.{0,20}write|id-token.{0,20}write|packages.{0,20}write/i,
      name,
    );
    assert.doesNotMatch(text, /secrets\.|git push|gh release|npm publish/i, name);
  }
});

test('pull requests use fixed runners, frozen install, and non-persistent checkout credentials', async () => {
  const value = parse(await readFile('.github/workflows/pull-request.yml', 'utf8'));
  assert.deepEqual(value.jobs.verify.strategy.matrix.os, ['ubuntu-24.04', 'windows-2025']);
  assert.equal(value.jobs.verify['timeout-minutes'], 30);
  const steps = value.jobs.verify.steps;
  assert.equal(
    steps.find((step) => step.uses === 'actions/checkout@v6').with['persist-credentials'],
    false,
  );
  assert.ok(steps.some((step) => step.run === 'pnpm install --frozen-lockfile'));
  assert.ok(steps.some((step) => step.run === 'pnpm verify'));
});

test('main and scheduled workflows preserve provenance and finite execution', async () => {
  const main = parse(await readFile('.github/workflows/main.yml', 'utf8'));
  const scheduled = parse(await readFile('.github/workflows/scheduled.yml', 'utf8'));
  assert.equal(main.jobs.full['timeout-minutes'], 45);
  assert.equal(scheduled.jobs['public-contract']['timeout-minutes'], 45);
  assert.equal(
    main.jobs.full.steps.find((step) => step.uses === 'actions/checkout@v6').with['fetch-depth'],
    0,
  );
  assert.equal(
    scheduled.jobs['public-contract'].steps.find((step) => step.uses === 'actions/checkout@v6')
      .with['fetch-depth'],
    0,
  );
  assert.ok(
    main.jobs.full.steps.some((step) => step.run === 'pnpm docs:test:e2e -- --project=chromium'),
  );
  assert.deepEqual(scheduled.jobs['public-contract'].strategy.matrix.os, [
    'ubuntu-24.04',
    'windows-2025',
  ]);
});

test('release verification aggregates two platforms and three browsers without publication authority', async () => {
  const value = parse(await readFile('.github/workflows/verify-release.yml', 'utf8'));
  assert.deepEqual(
    value.jobs.platform.strategy.matrix.include.map((entry) => entry.id),
    ['ubuntu-24.04', 'windows-2025'],
  );
  assert.ok(
    value.jobs.browser.steps.some(
      (step) =>
        step.run ===
        'pnpm --filter @roadmap/docs exec playwright install --with-deps chromium firefox webkit',
    ),
  );
  assert.equal(
    value.jobs.aggregate.steps.filter((step) => step.uses === 'actions/download-artifact@v8')
      .length,
    3,
  );
  assert.ok(value.jobs.aggregate.steps.some((step) => step.uses === 'actions/upload-artifact@v7'));
  const text = JSON.stringify(value);
  assert.doesNotMatch(
    text,
    /secrets\.|git push|gh release|npm publish|deploy|contents.{0,20}write|pages.{0,20}write|id-token.{0,20}write/i,
  );
});

test('Windows verification runs after canonical-root preparation', async () => {
  const value = parse(await readFile('.github/workflows/pull-request.yml', 'utf8'));
  const steps = value.jobs.verify.steps;
  const prepareStep = steps.find((step) => step.run === 'node scripts/ci/prepare-runner-temp.mjs');
  assert.ok(prepareStep, 'prepare-runner-temp step must exist');
  const installStep = steps.find((step) => step.run === 'pnpm install --frozen-lockfile');
  assert.ok(installStep, 'pnpm install step must exist');
  const verifyStep = steps.find((step) => step.run === 'pnpm verify');
  assert.ok(verifyStep, 'pnpm verify step must exist');
  const prepareIndex = steps.indexOf(prepareStep);
  const installIndex = steps.indexOf(installStep);
  const verifyIndex = steps.indexOf(verifyStep);
  assert.ok(prepareIndex < installIndex, 'prepare must come before install');
  assert.ok(installIndex < verifyIndex, 'install must come before verify');
});

test('canonical-root preparation is not removed from workflows', async () => {
  const names = ['pull-request.yml', 'scheduled.yml', 'verify-release.yml'];
  for (const name of names) {
    const value = parse(await readFile('.github/workflows/' + name, 'utf8'));
    const text = JSON.stringify(value);
    assert.ok(text.includes('prepare-runner-temp'), name + ' must include prepare-runner-temp');
    assert.doesNotMatch(text, /continue-on-error.*prepare-runner-temp/i, name);
    assert.doesNotMatch(text, /prepare-runner-temp.*continue-on-error/i, name);
  }
});

test('verification executes after canonical root preparation', async () => {
  const value = parse(await readFile('.github/workflows/pull-request.yml', 'utf8'));
  const steps = value.jobs.verify.steps;
  const prepareStep = steps.find((step) => step.run === 'node scripts/ci/prepare-runner-temp.mjs');
  assert.ok(prepareStep, 'prepare-runner-temp step must exist');
  const verifyStep = steps.find((step) => step.run === 'pnpm verify');
  assert.ok(verifyStep, 'pnpm verify step must exist');
  const prepareIndex = steps.indexOf(prepareStep);
  const verifyIndex = steps.indexOf(verifyStep);
  assert.ok(prepareIndex < verifyIndex, 'verification must run after canonical root preparation');

  test('Playwright install runs from @roadmap/docs workspace, not root', async () => {
    const workflows = ['main.yml', 'verify-release.yml'];
    for (const name of workflows) {
      const value = parse(await readFile('.github/workflows/' + name, 'utf8'));
      const text = JSON.stringify(value);
      assert.ok(
        text.includes('pnpm --filter @roadmap/docs exec playwright'),
        name + ' must use --filter @roadmap/docs for playwright',
      );
      assert.doesNotMatch(
        text,
        /pnpm exec playwright(?!.*--filter)/,
        name + ' must not use root pnpm exec playwright',
      );
    }
  });
});

/**
 * The workflow published into a learner repository is itself a verification
 * control, so it is pinned here alongside this repository's own workflows.
 *
 * The bypass this guards against is cheap and quiet, and it has several depths:
 * swap the learner-contract job's `pnpm verify` for `pnpm verify:baseline`, widen
 * its job-level `if`, filter its trigger so no pull request matches, skip the step
 * that runs it, or give the job an empty matrix. Each leaves the repository reading
 * green while the milestone is untouched, so the artifact is pinned whole rather
 * than checked bypass by bypass.
 */
test('the generated starter workflow cannot be downgraded into a false green', async () => {
  const value = parse(
    await readFile('templates/fullstack-vertical-slice/files/.github/workflows/verify.yml', 'utf8'),
  );

  assert.deepEqual(value.permissions, { contents: 'read' });
  // The whole trigger block is pinned, not just its keys. `pull_request:` with a
  // `paths-ignore: ['**']` filter — or `branches: [does-not-exist]`, or `types: []`
  // — keeps every key in place while the learner-contract job never runs for any
  // pull request. That is the "narrow its triggers" bypass the starter's own
  // AGENTS.md names, and key-only comparison does not see it.
  assert.deepEqual(value.on, { push: null, pull_request: null, workflow_dispatch: null });

  const jobNames = Object.keys(value.jobs).sort();
  assert.deepEqual(jobNames, ['baseline', 'learner-contract']);
  const commands = (job) => value.jobs[job].steps.map((step) => step.run).filter(Boolean);

  // The baseline job proves the scaffolding, so it runs unconditionally and a
  // freshly generated repository is green on its first push.
  assert.equal(value.jobs.baseline.if, undefined, 'the baseline job must not be skippable');
  assert.ok(commands('baseline').includes('pnpm install --frozen-lockfile'));
  assert.ok(commands('baseline').includes('pnpm verify:baseline'));
  assert.ok(
    !commands('baseline').includes('pnpm verify'),
    'the baseline job must not require a completed milestone',
  );

  // The learner-contract job proves the milestone, so it runs FULL verification.
  assert.ok(commands('learner-contract').includes('pnpm verify'));
  assert.ok(
    !commands('learner-contract').includes('pnpm verify:baseline'),
    'the learner-contract job must not be downgraded to the baseline command',
  );
  assert.equal(value.jobs['learner-contract'].if, "github.event_name != 'push'");

  for (const job of jobNames) {
    assert.equal(value.jobs[job]['runs-on'], 'ubuntu-24.04', job);
    assert.equal(value.jobs[job]['timeout-minutes'], 20, job);
    assert.equal(
      value.jobs[job].steps.find((step) => step.uses === 'actions/checkout@v6').with[
        'persist-credentials'
      ],
      false,
      job,
    );
    // A step that never runs does not fail its job, so a step-level `if` is the
    // quiet version of widening the job-level one. An empty `strategy` matrix
    // produces zero jobs and reports success the same way.
    assert.equal(value.jobs[job].strategy, undefined, job);
    for (const [index, step] of value.jobs[job].steps.entries()) {
      assert.equal(step.if, undefined, `${job} step ${String(index)} must not be conditional`);
      assert.equal(
        step['continue-on-error'],
        undefined,
        `${job} step ${String(index)} must not tolerate failure`,
      );
    }
  }

  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /continue-on-error/i);
  assert.doesNotMatch(text, /\|\|\s*true|\|\|\s*exit\s+0|set \+e/i);
  assert.doesNotMatch(
    text,
    /secrets\.|contents.{0,20}write|id-token.{0,20}write|packages.{0,20}write/i,
  );

  // Backstop. Every assertion above names a bypass someone actually tried; this one
  // closes the class by declaring the whole artifact. GitHub Actions offers many
  // ways to make a step or job not decide the result — `if`, `strategy`, `needs`,
  // `continue-on-error`, a filtered trigger — and enumerating them has now been
  // insufficient twice. Any intentional change to the starter workflow must be
  // restated here.
  const toolchainSteps = [
    { uses: 'actions/checkout@v6', with: { 'persist-credentials': false } },
    { uses: 'pnpm/action-setup@v6', with: { run_install: false } },
    {
      uses: 'actions/setup-node@v6',
      with: {
        'node-version-file': '.node-version',
        cache: 'pnpm',
        'cache-dependency-path': 'pnpm-lock.yaml',
      },
    },
    { run: 'pnpm install --frozen-lockfile' },
  ];
  assert.deepEqual(value, {
    name: 'Verify',
    on: { push: null, pull_request: null, workflow_dispatch: null },
    permissions: { contents: 'read' },
    jobs: {
      baseline: {
        'runs-on': 'ubuntu-24.04',
        'timeout-minutes': 20,
        steps: [...toolchainSteps, { run: 'pnpm verify:baseline' }],
      },
      'learner-contract': {
        if: "github.event_name != 'push'",
        'runs-on': 'ubuntu-24.04',
        'timeout-minutes': 20,
        steps: [...toolchainSteps, { run: 'pnpm verify' }],
      },
    },
  });
});
