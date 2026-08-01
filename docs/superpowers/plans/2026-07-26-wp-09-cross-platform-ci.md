# WP-09 Cross-Platform CI and Release Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove Release 0 Spike 4 and turn the repository command contract into read-only, fail-closed GitHub Actions checks whose Linux, Windows, browser, negative-fixture, and template evidence all refer to one source commit.

**Architecture:** Root scripts own verification semantics; workflow YAML only checks out one commit, installs the pinned toolchain, invokes root commands, and uploads allowlisted reports. Pull requests run the same fast contract on Ubuntu 24.04 and Windows 2025. A manual release workflow runs full platform verification on both operating systems, browser verification on Linux, aggregates evidence with SHA-256 records, and applies a final same-commit gate without publishing anything.

**Tech Stack:** GitHub Actions, `actions/checkout@v6`, `actions/setup-node@v6`, `pnpm/action-setup@v6`, `actions/upload-artifact@v7`, `actions/download-artifact@v8`, Ubuntu 24.04, Windows Server 2025, Node.js 24 exact patch, pnpm exact version, Playwright, Node.js scripts, TypeScript, and YAML parsing.

## Global Constraints

- CI invokes public root commands rather than reimplementing repository logic in YAML
- Pull-request workflows use `pull_request`, never `pull_request_target`
- Workflow permissions remain `contents: read`; checkout never persists credentials
- Exact Node and pnpm versions come from `.node-version` and `package.json#packageManager`
- Every install uses `pnpm install --frozen-lockfile`
- Required steps never use `continue-on-error`
- Expected-negative fixtures pass only when the process exits non-zero and emits the declared diagnostic code
- Windows and Linux use identical root command names
- Chromium runs on main; Chromium, Firefox, and WebKit run at the release gate
- Uploaded files are explicitly listed and hash-recorded
- A release evidence package is invalid when any record names a different commit
- WP-09 does not deploy the website, push Git refs, create releases, publish packages, or mutate starter repositories

---

## File map

```text
scripts/ci/
├── read-toolchain.mjs
├── verify-environment.mjs
├── run-negative-fixtures.mjs
├── scan-publication-fixture.ts
├── write-platform-report.mjs
├── write-browser-report.mjs
├── collect-evidence.mjs
├── collect-release-evidence.mjs
├── verify-public-contract.mjs
└── tests/
    ├── read-toolchain.test.mjs
    ├── negative-fixtures.test.mjs
    ├── workflow-policy.test.mjs
    ├── collect-evidence.test.mjs
    └── release-evidence.test.mjs

.github/workflows/
├── pull-request.yml
├── main.yml
├── scheduled.yml
└── verify-release.yml

fixtures/
└── expected-failures.json

scripts/
├── verify-all-templates.ts
└── verify-release-0.mjs

docs/
├── maintainers/ci.md
├── maintainers/release-verification.md
└── architecture/release-0-evidence.md
```

## Workflow command matrix

| Workflow | OS | Required commands |
|---|---|---|
| Pull request | Ubuntu 24.04, Windows 2025 | `pnpm verify` |
| Main | Ubuntu 24.04 | `pnpm verify:release`, Chromium E2E |
| Scheduled | Ubuntu 24.04, Windows 2025 | `pnpm verify:release` |
| Verify release platform | Ubuntu 24.04, Windows 2025 | `pnpm verify:release`, platform report |
| Verify release browser | Ubuntu 24.04 | Chromium, Firefox, WebKit, browser report |
| Verify release aggregate | Ubuntu 24.04 | evidence collection and `pnpm release:gate` |

### Task 1: Finalize the root verification and exact toolchain contract

**Files:**
- Create: `scripts/ci/read-toolchain.mjs`
- Create: `scripts/ci/verify-environment.mjs`
- Create: `scripts/ci/tests/read-toolchain.test.mjs`
- Modify: `package.json`
- Modify: `scripts/run-pipeline.mjs`

**Interfaces:**
- Consumes: `.node-version`, `package.json#packageManager`, `process.env.npm_execpath`, and `runPipeline(scriptNames): Promise<void>`
- Produces: `readToolchain(root)`, `resolvePnpmInvocation(args)`, `verifyEnvironment(root)`, `pnpm content:validate:curriculum`, and the final fast `pnpm verify`

- [ ] **Step 1: Write failing exact-version and pnpm-invocation tests**

```js
// scripts/ci/tests/read-toolchain.test.mjs
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readToolchain, resolvePnpmInvocation } from '../read-toolchain.mjs';

test('reads exact Node 24 and pnpm versions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-toolchain-'));
  await writeFile(path.join(root, '.node-version'), '24.16.0\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11.0.0' }));
  assert.deepEqual(await readToolchain(root), { node: '24.16.0', pnpm: '11.0.0' });
});

test('rejects floating and wrong-family versions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-toolchain-invalid-'));
  await writeFile(path.join(root, '.node-version'), '26.0.0\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11' }));
  await assert.rejects(() => readToolchain(root), /exact Node 24 and pnpm semantic versions/);
});

test('uses the active pnpm JavaScript entry point without a shell', () => {
  const invocation = resolvePnpmInvocation(['--version'], {
    npmExecPath: '/tools/pnpm.cjs',
    platform: 'win32',
    execPath: 'C:\\node\\node.exe',
  });
  assert.deepEqual(invocation, {
    command: 'C:\\node\\node.exe',
    args: ['/tools/pnpm.cjs', '--version'],
  });
});
```

- [ ] **Step 2: Run the test and confirm the module is missing**

```bash
node --test scripts/ci/tests/read-toolchain.test.mjs
```

Expected: FAIL because `read-toolchain.mjs` does not exist.

- [ ] **Step 3: Implement exact parsing and cross-platform pnpm resolution**

```js
// scripts/ci/read-toolchain.mjs
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const exactSemver = /^\d+\.\d+\.\d+$/;

export async function readToolchain(root = process.cwd()) {
  const node = (await readFile(path.join(root, '.node-version'), 'utf8')).trim();
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const pnpmMatch = /^pnpm@(\d+\.\d+\.\d+)$/.exec(packageJson.packageManager ?? '');
  if (!exactSemver.test(node) || !node.startsWith('24.') || !pnpmMatch) {
    throw new Error('Toolchain files must contain exact Node 24 and pnpm semantic versions');
  }
  return { node, pnpm: pnpmMatch[1] };
}

export function resolvePnpmInvocation(args, environment = {}) {
  const npmExecPath = environment.npmExecPath ?? process.env.npm_execpath;
  const platform = environment.platform ?? process.platform;
  const execPath = environment.execPath ?? process.execPath;
  if (npmExecPath) return { command: execPath, args: [npmExecPath, ...args] };
  if (platform === 'win32') return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'pnpm', ...args] };
  return { command: 'pnpm', args };
}
```

- [ ] **Step 4: Implement environment verification without assuming a Unix executable**

```js
// scripts/ci/verify-environment.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readToolchain, resolvePnpmInvocation } from './read-toolchain.mjs';

const execFileAsync = promisify(execFile);

export async function verifyEnvironment(root = process.cwd()) {
  const expected = await readToolchain(root);
  const invocation = resolvePnpmInvocation(['--version']);
  const { stdout } = await execFileAsync(invocation.command, invocation.args, {
    cwd: root,
    windowsHide: true,
  });
  const observed = { node: process.versions.node, pnpm: stdout.trim() };
  if (observed.node !== expected.node || observed.pnpm !== expected.pnpm) {
    throw new Error(`Toolchain mismatch: expected Node ${expected.node} / pnpm ${expected.pnpm}, observed Node ${observed.node} / pnpm ${observed.pnpm}`);
  }
  return { expected, observed };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await verifyEnvironment(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
```

- [ ] **Step 5: Extend bootstrap tests and set the final fast root scripts**

```json
{
  "scripts": {
    "test:bootstrap": "node --test scripts/*.test.mjs scripts/ci/tests/*.test.mjs",
    "environment:verify": "node scripts/ci/verify-environment.mjs",
    "content:validate": "pnpm --filter @roadmap/validate-content start --",
    "content:validate:curriculum": "pnpm content:validate curriculum --format json",
    "docs:build": "pnpm --filter @roadmap/docs build",
    "docs:test:e2e": "pnpm --filter @roadmap/docs test:e2e",
    "verify": "node scripts/run-pipeline.mjs environment:verify check test content:validate:curriculum docs:build"
  }
}
```

Do not add Playwright installation to `verify`; browser projects remain separate because a fresh developer checkout may not have browsers installed.

- [ ] **Step 6: Run the exact contract and commit**

```bash
node --test scripts/ci/tests/read-toolchain.test.mjs
pnpm environment:verify
pnpm verify

git add scripts/ci/read-toolchain.mjs scripts/ci/verify-environment.mjs scripts/ci/tests/read-toolchain.test.mjs package.json scripts/run-pipeline.mjs
git commit -m "feat: finalize root verification contract"
```

### Task 2: Turn expected-invalid fixtures into a positive CI assertion

**Files:**
- Create: `fixtures/expected-failures.json`
- Create: `scripts/ci/scan-publication-fixture.ts`
- Create: `scripts/ci/run-negative-fixtures.mjs`
- Create: `scripts/ci/tests/negative-fixtures.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: logical `pnpm` argv, standalone Node argv, exact diagnostic codes, curriculum invalid fixtures, publication invalid fixtures, and the intentionally incomplete learner exercise
- Produces: `runNegativeFixture(fixture, root)`, `runNegativeFixtureManifest(root)`, `.tmp/reports/negative-fixtures/report.json`, and `pnpm verify:negative-fixtures`

- [ ] **Step 1: Create an explicit manifest for every Release 0 invalid-fixture family**

```json
[
  { "id": "curriculum-schema", "command": "pnpm", "args": ["content:validate", "fixtures/curriculum/invalid/schema-error", "--format", "json"], "expectedDiagnostic": "CURRICULUM_SCHEMA_001" },
  { "id": "curriculum-duplicate-id", "command": "pnpm", "args": ["content:validate", "fixtures/curriculum/invalid/duplicate-id", "--format", "json"], "expectedDiagnostic": "CURRICULUM_ID_001" },
  { "id": "curriculum-missing-reference", "command": "pnpm", "args": ["content:validate", "fixtures/curriculum/invalid/missing-reference", "--format", "json"], "expectedDiagnostic": "CURRICULUM_REFERENCE_001" },
  { "id": "curriculum-cycle", "command": "pnpm", "args": ["content:validate", "fixtures/curriculum/invalid/multi-node-cycle", "--format", "json"], "expectedDiagnostic": "CURRICULUM_GRAPH_003" },
  { "id": "curriculum-publication", "command": "pnpm", "args": ["content:validate", "fixtures/curriculum/invalid/published-to-draft", "--format", "json"], "expectedDiagnostic": "CURRICULUM_PUBLICATION_001" },
  { "id": "curriculum-orphan", "command": "pnpm", "args": ["content:validate", "fixtures/curriculum/invalid/orphan-competency", "--format", "json"], "expectedDiagnostic": "CURRICULUM_COMPLETENESS_001" },
  { "id": "curriculum-assessment", "command": "pnpm", "args": ["content:validate", "fixtures/curriculum/invalid/missing-assessment", "--format", "json"], "expectedDiagnostic": "CURRICULUM_COMPLETENESS_002" },
  { "id": "curriculum-remediation", "command": "pnpm", "args": ["content:validate", "fixtures/curriculum/invalid/missing-remediation", "--format", "json"], "expectedDiagnostic": "CURRICULUM_COMPLETENESS_003" },
  { "id": "curriculum-milestone", "command": "pnpm", "args": ["content:validate", "fixtures/curriculum/invalid/unreachable-milestone", "--format", "json"], "expectedDiagnostic": "CURRICULUM_COMPLETENESS_004" },
  { "id": "publication-solution", "command": "node", "args": ["--import", "tsx", "scripts/ci/scan-publication-fixture.ts", "fixtures/publication/invalid/solution-path"], "expectedDiagnostic": "PUBLICATION_PATH_001" },
  { "id": "publication-marker", "command": "node", "args": ["--import", "tsx", "scripts/ci/scan-publication-fixture.ts", "fixtures/publication/invalid/maintainer-marker"], "expectedDiagnostic": "PUBLICATION_CONTENT_001" },
  { "id": "publication-internal-url", "command": "node", "args": ["--import", "tsx", "scripts/ci/scan-publication-fixture.ts", "fixtures/publication/invalid/internal-url"], "expectedDiagnostic": "PUBLICATION_INTERNAL_001" },
  { "id": "publication-local-path", "command": "node", "args": ["--import", "tsx", "scripts/ci/scan-publication-fixture.ts", "fixtures/publication/invalid/absolute-local-path"], "expectedDiagnostic": "PUBLICATION_INTERNAL_002" },
  { "id": "publication-private-key", "command": "node", "args": ["--import", "tsx", "scripts/ci/scan-publication-fixture.ts", "fixtures/publication/invalid/secret-private-key"], "expectedDiagnostic": "PUBLICATION_SECRET_001" },
  { "id": "publication-token", "command": "node", "args": ["--import", "tsx", "scripts/ci/scan-publication-fixture.ts", "fixtures/publication/invalid/secret-github-token"], "expectedDiagnostic": "PUBLICATION_SECRET_002" },
  { "id": "exercise-incomplete", "command": "pnpm", "args": ["exec", "tsx", "tooling/verify-exercise/src/main.ts", "exercises/javascript/ex-js-closure-counter", ".tmp/negative-exercise", "learner", "--json"], "expectedDiagnostic": "EXERCISE_COMMAND_001" }
]
```

The `exercise-incomplete` fixture deliberately uses the direct machine surface:

```bash
pnpm exec tsx tooling/verify-exercise/src/main.ts exercises/javascript/ex-js-closure-counter .tmp/negative-exercise learner --json
```

Its parser must read exactly one JSON value from stdout and preserve the declared `EXERCISE_COMMAND_001` diagnostic. Do not route this CI consumer through the human `exercise:verify` wrapper or treat pnpm lifecycle output as machine JSON; the public root script remains available for human use.

- [ ] **Step 2: Create a scanner CLI that emits one JSON object and a non-zero result**

```ts
// scripts/ci/scan-publication-fixture.ts
import { scanPublicationTree } from '@roadmap/publication-scanner';

const root = process.argv[2];
if (!root) throw new Error('Usage: scan-publication-fixture.ts <root>');
const result = await scanPublicationTree(root);
console.log(JSON.stringify(result));
process.exitCode = result.ok ? 0 : 1;
```

- [ ] **Step 3: Write failing tests for false pass and wrong diagnostic**

```js
// scripts/ci/tests/negative-fixtures.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { runNegativeFixture } from '../run-negative-fixtures.mjs';

test('accepts a non-zero process with the exact declared diagnostic', async () => {
  const result = await runNegativeFixture({
    id: 'expected',
    command: process.execPath,
    args: ['--input-type=module', '--eval', "console.log(JSON.stringify({diagnostics:[{code:'EXPECTED_001'}]})); process.exit(1)"],
    expectedDiagnostic: 'EXPECTED_001',
  }, process.cwd());
  assert.equal(result.status, 'passed');
});

test('rejects a fixture that exits zero', async () => {
  await assert.rejects(() => runNegativeFixture({
    id: 'false-pass', command: process.execPath, args: ['--eval', 'process.exit(0)'], expectedDiagnostic: 'EXPECTED_001',
  }, process.cwd()), /unexpectedly passed/);
});

test('rejects a non-zero process that emits a different diagnostic', async () => {
  await assert.rejects(() => runNegativeFixture({
    id: 'wrong-code',
    command: process.execPath,
    args: ['--input-type=module', '--eval', "console.log(JSON.stringify({diagnostics:[{code:'OTHER_001'}]})); process.exit(1)"],
    expectedDiagnostic: 'EXPECTED_001',
  }, process.cwd()), /without EXPECTED_001/);
});
```

- [ ] **Step 4: Implement argv-only execution, exact JSON diagnostic matching, and a report file**

```js
// scripts/ci/run-negative-fixtures.mjs
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolvePnpmInvocation } from './read-toolchain.mjs';

const execFileAsync = promisify(execFile);

function invocationFor(fixture) {
  if (fixture.command === 'pnpm') return resolvePnpmInvocation(['--silent', ...fixture.args]);
  return { command: fixture.command, args: fixture.args };
}

function diagnosticCodes(...outputs) {
  const values = [];
  for (const output of outputs) {
    const trimmed = output.trim();
    if (!trimmed) continue;
    try {
      values.push(JSON.parse(trimmed));
      continue;
    } catch {
      for (const line of trimmed.split(/\r?\n/)) {
        try { values.push(JSON.parse(line)); } catch { /* non-JSON process text */ }
      }
    }
  }
  const codes = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    if (typeof value.code === 'string') codes.add(value.code);
    Object.values(value).forEach(visit);
  };
  values.forEach(visit);
  return codes;
}

export async function runNegativeFixture(fixture, root) {
  const invocation = invocationFor(fixture);
  try {
    await execFileAsync(invocation.command, invocation.args, {
      cwd: root,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    throw new Error(`Negative fixture ${fixture.id} unexpectedly passed`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('unexpectedly passed')) throw error;
    const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    const codes = diagnosticCodes(stdout, stderr);
    if (!codes.has(fixture.expectedDiagnostic)) {
      throw new Error(`Negative fixture ${fixture.id} failed without ${fixture.expectedDiagnostic}`);
    }
    return { id: fixture.id, status: 'passed', expectedDiagnostic: fixture.expectedDiagnostic };
  }
}

export async function runNegativeFixtureManifest(root = process.cwd()) {
  const fixtures = JSON.parse(await readFile(path.join(root, 'fixtures/expected-failures.json'), 'utf8'));
  const results = [];
  for (const fixture of fixtures) results.push(await runNegativeFixture(fixture, root));
  const report = {
    schemaVersion: 1,
    status: 'passed',
    sourceCommit: process.env.GITHUB_SHA ?? '0000000000000000000000000000000000000000',
    results,
  };
  const reportPath = path.join(root, '.tmp/reports/negative-fixtures/report.json');
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await runNegativeFixtureManifest()));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
```

- [ ] **Step 5: Wire, run, and commit the negative suite**

```json
{
  "scripts": {
    "verify:negative-fixtures": "node scripts/ci/run-negative-fixtures.mjs"
  }
}
```

```bash
node --test scripts/ci/tests/negative-fixtures.test.mjs
pnpm verify:negative-fixtures

git add fixtures/expected-failures.json scripts/ci/scan-publication-fixture.ts scripts/ci/run-negative-fixtures.mjs scripts/ci/tests/negative-fixtures.test.mjs package.json
git commit -m "test: assert expected validator failures"
```

### Task 3: Create the least-privilege pull-request workflow

**Files:**
- Create: `.github/workflows/pull-request.yml`
- Create: `scripts/ci/tests/workflow-policy.test.mjs`
- Create: `docs/maintainers/ci.md`

**Interfaces:**
- Consumes: `pnpm verify` and the pinned toolchain
- Produces: required checks `verify (ubuntu-24.04)` and `verify (windows-2025)` plus a structural workflow-policy test

- [ ] **Step 1: Create the cross-platform pull-request workflow**

```yaml
# .github/workflows/pull-request.yml
name: Pull request

on:
  pull_request:

permissions:
  contents: read

concurrency:
  group: pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

env:
  CI: 'true'

jobs:
  verify:
    name: verify (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-24.04, windows-2025]
    runs-on: ${{ matrix.os }}
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v6
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@v6
        with:
          run_install: false
      - uses: actions/setup-node@v6
        with:
          node-version-file: .node-version
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify
```

- [ ] **Step 2: Write a workflow-policy test that parses YAML rather than grepping it**

```js
// scripts/ci/tests/workflow-policy.test.mjs
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';

async function workflows() {
  const directory = '.github/workflows';
  const names = (await readdir(directory)).filter((name) => name.endsWith('.yml'));
  return Promise.all(names.map(async (name) => ({ name, value: parse(await readFile(`${directory}/${name}`, 'utf8')) })));
}

function serialized(value) { return JSON.stringify(value); }

test('all workflows are read-only and avoid unsafe triggers or commands', async () => {
  for (const { name, value } of await workflows()) {
    assert.equal(value.permissions?.contents, 'read', name);
    assert.equal(value.on?.pull_request_target, undefined, name);
    const text = serialized(value);
    assert.doesNotMatch(text, /continue-on-error|npm install|pnpm add|curl[^\n]*\|/i, name);
    assert.doesNotMatch(text, /contents.{0,20}write|pages.{0,20}write|id-token.{0,20}write|packages.{0,20}write/i, name);
    assert.doesNotMatch(text, /secrets\.|git push|gh release|npm publish/i, name);
  }
});

test('pull requests use fixed runners, frozen install, and non-persistent checkout credentials', async () => {
  const value = parse(await readFile('.github/workflows/pull-request.yml', 'utf8'));
  assert.deepEqual(value.jobs.verify.strategy.matrix.os, ['ubuntu-24.04', 'windows-2025']);
  assert.equal(value.jobs.verify['timeout-minutes'], 30);
  const steps = value.jobs.verify.steps;
  assert.equal(steps.find((step) => step.uses === 'actions/checkout@v6').with['persist-credentials'], false);
  assert.ok(steps.some((step) => step.run === 'pnpm install --frozen-lockfile'));
  assert.ok(steps.some((step) => step.run === 'pnpm verify'));
});
```

- [ ] **Step 3: Document local reproduction and required checks**

Create `docs/maintainers/ci.md` with these exact mappings:

```text
verify (ubuntu-24.04) → pnpm install --frozen-lockfile && pnpm verify
verify (windows-2025) → pnpm install --frozen-lockfile && pnpm verify
```

The document must state that fixed runner labels are intentional, browser downloads are excluded from the fast contract, and a green badge without the referenced command log is not sufficient release evidence.

- [ ] **Step 4: Run policy verification and commit**

```bash
node --test scripts/ci/tests/workflow-policy.test.mjs
pnpm check

git add .github/workflows/pull-request.yml scripts/ci/tests/workflow-policy.test.mjs docs/maintainers/ci.md
git commit -m "ci: verify pull requests on Windows and Linux"
```

### Task 4: Add main and scheduled full verification

**Files:**
- Create: `.github/workflows/main.yml`
- Create: `.github/workflows/scheduled.yml`
- Modify: `scripts/ci/tests/workflow-policy.test.mjs`

**Interfaces:**
- Consumes: `pnpm verify:release` and `pnpm docs:test:e2e -- --project=chromium`
- Produces: full main-branch verification and a scheduled same-contract cross-platform regression run

- [ ] **Step 1: Create the main workflow with one browser project**

```yaml
# .github/workflows/main.yml
name: Main verification

on:
  push:
    branches: [main]

permissions:
  contents: read

env:
  CI: 'true'

jobs:
  full:
    runs-on: ubuntu-24.04
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: pnpm/action-setup@v6
        with:
          run_install: false
      - uses: actions/setup-node@v6
        with:
          node-version-file: .node-version
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify:release
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm docs:test:e2e -- --project=chromium
```

- [ ] **Step 2: Create the scheduled cross-platform workflow**

```yaml
# .github/workflows/scheduled.yml
name: Scheduled verification

on:
  schedule:
    - cron: '17 3 * * 1'
  workflow_dispatch:

permissions:
  contents: read

env:
  CI: 'true'

jobs:
  public-contract:
    name: public-contract (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-24.04, windows-2025]
    runs-on: ${{ matrix.os }}
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: pnpm/action-setup@v6
        with:
          run_install: false
      - uses: actions/setup-node@v6
        with:
          node-version-file: .node-version
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify:release
```

- [ ] **Step 3: Add exact policy assertions for full workflows**

```js
// append to scripts/ci/tests/workflow-policy.test.mjs
test('main and scheduled workflows preserve provenance and finite execution', async () => {
  const main = parse(await readFile('.github/workflows/main.yml', 'utf8'));
  const scheduled = parse(await readFile('.github/workflows/scheduled.yml', 'utf8'));
  assert.equal(main.jobs.full['timeout-minutes'], 45);
  assert.equal(scheduled.jobs['public-contract']['timeout-minutes'], 45);
  assert.equal(main.jobs.full.steps.find((step) => step.uses === 'actions/checkout@v6').with['fetch-depth'], 0);
  assert.equal(scheduled.jobs['public-contract'].steps.find((step) => step.uses === 'actions/checkout@v6').with['fetch-depth'], 0);
  assert.ok(main.jobs.full.steps.some((step) => step.run === 'pnpm docs:test:e2e -- --project=chromium'));
  assert.deepEqual(scheduled.jobs['public-contract'].strategy.matrix.os, ['ubuntu-24.04', 'windows-2025']);
});
```

- [ ] **Step 4: Run and commit**

```bash
node --test scripts/ci/tests/workflow-policy.test.mjs

git add .github/workflows/main.yml .github/workflows/scheduled.yml scripts/ci/tests/workflow-policy.test.mjs
git commit -m "ci: add full and scheduled verification"
```

### Task 5: Collect allowlisted evidence with deterministic hashes

**Files:**
- Create: `scripts/ci/collect-evidence.mjs`
- Create: `scripts/ci/tests/collect-evidence.test.mjs`
- Create: `docs/maintainers/release-verification.md`

**Interfaces:**
- Consumes: one 40-hex source commit, one generation timestamp, workflow-run metadata, and an explicit `{source, target}` file list
- Produces: a recreated evidence root containing copied files and `manifest.json` with sorted SHA-256 records

- [ ] **Step 1: Write failing copy, hash, and traversal tests**

```js
// scripts/ci/tests/collect-evidence.test.mjs
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEvidence } from '../collect-evidence.mjs';

test('copies allowlisted files and records path, bytes, and sha256', async () => {
  const input = await mkdtemp(path.join(tmpdir(), 'roadmap-evidence-input-'));
  const output = await mkdtemp(path.join(tmpdir(), 'roadmap-evidence-output-'));
  await writeFile(path.join(input, 'verify.json'), '{"status":"passed"}\n');
  await collectEvidence({
    outputRoot: output,
    sourceCommit: '0123456789abcdef0123456789abcdef01234567',
    generatedAt: '2026-07-26T12:00:00.000Z',
    workflowRun: '123',
    files: [{ source: path.join(input, 'verify.json'), target: 'reports/verify.json' }],
  });
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
  assert.equal(manifest.files[0].path, 'reports/verify.json');
  assert.match(manifest.files[0].sha256, /^[0-9a-f]{64}$/);
});

test('rejects absolute and parent-traversing targets', async () => {
  await assert.rejects(() => collectEvidence({
    outputRoot: '.tmp/evidence',
    sourceCommit: '0123456789abcdef0123456789abcdef01234567',
    generatedAt: '2026-07-26T12:00:00.000Z',
    workflowRun: '123',
    files: [{ source: 'README.md', target: '../README.md' }],
  }), /unsafe evidence target/);
});
```

- [ ] **Step 2: Implement safe copying and post-copy hashing**

```js
// scripts/ci/collect-evidence.mjs
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

function safeTarget(target) {
  return typeof target === 'string'
    && target.length > 0
    && !path.posix.isAbsolute(target) && !path.win32.isAbsolute(target)
    && !target.split(/[\\/]/).includes('..');
}

export async function collectEvidence(options) {
  if (!/^[0-9a-f]{40}$/.test(options.sourceCommit)) throw new Error('sourceCommit must be 40 lowercase hex characters');
  await rm(options.outputRoot, { recursive: true, force: true });
  await mkdir(options.outputRoot, { recursive: true });
  const records = [];
  for (const file of options.files) {
    if (!safeTarget(file.target)) throw new Error(`unsafe evidence target: ${file.target}`);
    const destination = path.join(options.outputRoot, file.target);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(file.source, destination);
    const bytes = await readFile(destination);
    records.push({
      path: file.target.replaceAll('\\', '/'),
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  records.sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    schemaVersion: 1,
    sourceCommit: options.sourceCommit,
    generatedAt: options.generatedAt,
    workflowRun: options.workflowRun,
    files: records,
  };
  await writeFile(path.join(options.outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
```

- [ ] **Step 3: Document what evidence does and does not prove**

`docs/maintainers/release-verification.md` must state:

```text
The package proves which allowlisted files were copied and hashed for one source commit and workflow run.
It does not prove learner authorship, educational effectiveness, absence of every vulnerability, or correctness beyond the commands represented by the reports.
```

- [ ] **Step 4: Run and commit**

```bash
node --test scripts/ci/tests/collect-evidence.test.mjs

git add scripts/ci/collect-evidence.mjs scripts/ci/tests/collect-evidence.test.mjs docs/maintainers/release-verification.md
git commit -m "feat: collect release verification evidence"
```

### Task 6: Build a read-only multi-job release-verification workflow

**Files:**
- Create: `scripts/ci/verify-public-contract.mjs`
- Create: `scripts/ci/write-platform-report.mjs`
- Create: `scripts/ci/write-browser-report.mjs`
- Create: `scripts/ci/collect-release-evidence.mjs`
- Create: `.github/workflows/verify-release.yml`
- Modify: `scripts/verify-all-templates.ts`
- Modify: `package.json`
- Modify: `scripts/ci/tests/workflow-policy.test.mjs`

**Interfaces:**
- Consumes: `runPipeline(): Promise<void>`, `.tmp/reports/negative-fixtures/report.json`, template dry-run reports, two platform reports, and one browser report
- Produces: `pnpm verify:release`, three intermediate artifacts, one aggregated `release-0-verification` artifact, and no publication side effect

- [ ] **Step 1: Compose the full public contract using the existing pipeline**

```js
// scripts/ci/verify-public-contract.mjs
import { runPipeline } from '../run-pipeline.mjs';

await runPipeline([
  'environment:verify',
  'check',
  'test',
  'content:validate:curriculum',
  'docs:build',
  'verify:negative-fixtures',
  'verify:templates',
]);
```

```json
{
  "scripts": {
    "verify:release": "node scripts/ci/verify-public-contract.mjs"
  }
}
```

- [ ] **Step 2: Make template verification write an allowlisted report**

At the end of each successful loop iteration in `scripts/verify-all-templates.ts`, write:

```ts
const reportPath = path.join('.tmp', 'reports', 'templates', `${path.basename(templateRoot)}.json`);
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify({
  schemaVersion: 1,
  status: 'passed',
  sourceCommit,
  templateId: path.basename(templateRoot),
  functionalSha256: report.artifact?.functionalSha256,
  diagnostics: report.diagnostics,
}, null, 2)}\n`);
```

Import `mkdir` and `writeFile` from `node:fs/promises`. The script must still exit non-zero before writing a passing report when any template fails.

- [ ] **Step 3: Implement platform and browser report writers**

```js
// scripts/ci/write-platform-report.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [platformId, output] = process.argv.slice(2);
if (!platformId || !output || !/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA ?? '')) {
  throw new Error('Usage: write-platform-report.mjs <platform-id> <output> with GITHUB_SHA');
}
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({
  schemaVersion: 1,
  kind: 'platform',
  id: platformId,
  status: 'passed',
  sourceCommit: process.env.GITHUB_SHA,
  workflowRun: process.env.GITHUB_RUN_ID,
  command: 'pnpm verify:release',
}, null, 2)}\n`);
```

```js
// scripts/ci/write-browser-report.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = process.argv[2];
if (!output || !/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA ?? '')) {
  throw new Error('Usage: write-browser-report.mjs <output> with GITHUB_SHA');
}
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({
  schemaVersion: 1,
  kind: 'browser',
  id: 'chromium-firefox-webkit',
  status: 'passed',
  sourceCommit: process.env.GITHUB_SHA,
  workflowRun: process.env.GITHUB_RUN_ID,
  projects: ['chromium', 'firefox', 'webkit'],
}, null, 2)}\n`);
```

- [ ] **Step 4: Implement same-commit aggregation and derived spike records**

```js
// scripts/ci/collect-release-evidence.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectEvidence } from './collect-evidence.mjs';

const downloaded = '.tmp/downloaded';
const outputRoot = '.tmp/release-evidence';
const sourceCommit = process.env.GITHUB_SHA;
if (!/^[0-9a-f]{40}$/.test(sourceCommit ?? '')) throw new Error('GITHUB_SHA must be a full commit');

const inputFiles = {
  ubuntu: `${downloaded}/ubuntu/platform/ubuntu-24.04.json`,
  windows: `${downloaded}/windows/platform/windows-2025.json`,
  browser: `${downloaded}/browser/all.json`,
  negative: `${downloaded}/ubuntu/negative-fixtures/report.json`,
  template: `${downloaded}/ubuntu/templates/javascript-engineering.json`,
};

for (const [name, file] of Object.entries(inputFiles)) {
  const value = JSON.parse(await readFile(file, 'utf8'));
  if (value.status !== 'passed' || value.sourceCommit !== sourceCommit) {
    throw new Error(`${name} evidence is not passed evidence for ${sourceCommit}`);
  }
}

const derivedRoot = '.tmp/derived-spikes';
await mkdir(derivedRoot, { recursive: true });
const spikes = [
  ['curriculum-to-starlight', ['platform/ubuntu-24.04.json', 'browser/all.json']],
  ['curriculum-graph', ['negative-fixtures/report.json']],
  ['template-publication', ['templates/javascript-engineering/report.json']],
  ['cross-platform', ['platform/ubuntu-24.04.json', 'platform/windows-2025.json']],
  ['leak-prevention', ['negative-fixtures/report.json', 'templates/javascript-engineering/report.json']],
];
for (const [id, evidence] of spikes) {
  await writeFile(path.join(derivedRoot, `${id}.json`), `${JSON.stringify({
    schemaVersion: 1,
    kind: 'spike',
    id,
    status: 'passed',
    sourceCommit,
    evidence,
  }, null, 2)}\n`);
}

await collectEvidence({
  outputRoot,
  sourceCommit,
  generatedAt: new Date().toISOString(),
  workflowRun: process.env.GITHUB_RUN_ID ?? 'local',
  files: [
    { source: inputFiles.ubuntu, target: 'platform/ubuntu-24.04.json' },
    { source: inputFiles.windows, target: 'platform/windows-2025.json' },
    { source: inputFiles.browser, target: 'browser/all.json' },
    { source: inputFiles.negative, target: 'negative-fixtures/report.json' },
    { source: inputFiles.template, target: 'templates/javascript-engineering/report.json' },
    ...spikes.map(([id]) => ({ source: `${derivedRoot}/${id}.json`, target: `spikes/${id}.json` })),
  ],
});
```

- [ ] **Step 5: Create the read-only platform, browser, and aggregate jobs**

```yaml
# .github/workflows/verify-release.yml
name: Verify Release 0

on:
  workflow_dispatch:

permissions:
  contents: read

env:
  CI: 'true'

jobs:
  platform:
    name: platform (${{ matrix.id }})
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: ubuntu-24.04
            id: ubuntu-24.04
          - os: windows-2025
            id: windows-2025
    runs-on: ${{ matrix.os }}
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: pnpm/action-setup@v6
        with:
          run_install: false
      - uses: actions/setup-node@v6
        with:
          node-version-file: .node-version
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify:release
      - run: node scripts/ci/write-platform-report.mjs ${{ matrix.id }} .tmp/reports/platform/${{ matrix.id }}.json
      - uses: actions/upload-artifact@v7
        with:
          name: release-platform-${{ matrix.id }}
          path: .tmp/reports
          if-no-files-found: error
          include-hidden-files: false
          retention-days: 7

  browser:
    runs-on: ubuntu-24.04
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v6
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@v6
        with:
          run_install: false
      - uses: actions/setup-node@v6
        with:
          node-version-file: .node-version
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium firefox webkit
      - run: pnpm docs:test:e2e
      - run: node scripts/ci/write-browser-report.mjs .tmp/reports/browser/all.json
      - uses: actions/upload-artifact@v7
        with:
          name: release-browser
          path: .tmp/reports/browser
          if-no-files-found: error
          include-hidden-files: false
          retention-days: 7

  aggregate:
    needs: [platform, browser]
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@v6
        with:
          node-version-file: .node-version
      - uses: actions/download-artifact@v8
        with:
          name: release-platform-ubuntu-24.04
          path: .tmp/downloaded/ubuntu
      - uses: actions/download-artifact@v8
        with:
          name: release-platform-windows-2025
          path: .tmp/downloaded/windows
      - uses: actions/download-artifact@v8
        with:
          name: release-browser
          path: .tmp/downloaded/browser
      - run: node scripts/ci/collect-release-evidence.mjs
      - run: node scripts/verify-release-0.mjs .tmp/release-evidence
      - uses: actions/upload-artifact@v7
        with:
          name: release-0-verification
          path: .tmp/release-evidence
          if-no-files-found: error
          include-hidden-files: false
          retention-days: 30
```

- [ ] **Step 6: Extend workflow policy tests for action versions and zero publication capability**

```js
// append to scripts/ci/tests/workflow-policy.test.mjs
test('release verification aggregates two platforms and three browsers without publication authority', async () => {
  const value = parse(await readFile('.github/workflows/verify-release.yml', 'utf8'));
  assert.deepEqual(value.jobs.platform.strategy.matrix.include.map((entry) => entry.id), ['ubuntu-24.04', 'windows-2025']);
  assert.ok(value.jobs.browser.steps.some((step) => step.run === 'pnpm exec playwright install --with-deps chromium firefox webkit'));
  assert.ok(value.jobs.aggregate.steps.filter((step) => step.uses === 'actions/download-artifact@v8').length === 3);
  assert.ok(value.jobs.aggregate.steps.some((step) => step.uses === 'actions/upload-artifact@v7'));
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /secrets\.|git push|gh release|npm publish|deploy|contents.{0,20}write|pages.{0,20}write|id-token.{0,20}write/i);
});
```

- [ ] **Step 7: Run local verification and commit**

```bash
pnpm verify:release
node --test scripts/ci/tests/workflow-policy.test.mjs

git add scripts/ci/verify-public-contract.mjs scripts/ci/write-platform-report.mjs scripts/ci/write-browser-report.mjs scripts/ci/collect-release-evidence.mjs scripts/verify-all-templates.ts .github/workflows/verify-release.yml package.json scripts/ci/tests/workflow-policy.test.mjs
git commit -m "ci: add read-only multi-platform release verification"
```

### Task 7: Enforce the final same-commit Release 0 evidence gate

**Files:**
- Create: `scripts/verify-release-0.mjs`
- Create: `scripts/ci/tests/release-evidence.test.mjs`
- Create: `docs/architecture/release-0-evidence.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: the aggregate `manifest.json`, all required evidence JSON files, and their recorded hashes
- Produces: `verifyRelease0Evidence(root)`, diagnostics `RELEASE_EVIDENCE_001` through `004`, and `pnpm release:gate`

- [ ] **Step 1: Write one passing test and one exact test for every failure code**

```js
// scripts/ci/tests/release-evidence.test.mjs
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredEvidence, verifyRelease0Evidence } from '../../verify-release-0.mjs';

const commit = '0123456789abcdef0123456789abcdef01234567';

async function writeRecord(root, relative, value) {
  const absolute = path.join(root, relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  await writeFile(absolute, bytes);
  return {
    path: relative,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-release-evidence-'));
  const records = [];
  for (const relative of requiredEvidence) {
    const id = relative.startsWith('spikes/')
      ? path.basename(relative, '.json')
      : path.basename(relative, '.json');
    records.push(await writeRecord(root, relative, {
      schemaVersion: 1,
      id,
      status: 'passed',
      sourceCommit: commit,
    }));
  }
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    sourceCommit: commit,
    files: records,
  })}\n`);
  return root;
}

async function replaceEvidence(root, relative, value) {
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const replacement = await writeRecord(root, relative, value);
  manifest.files = manifest.files.map((record) => record.path === relative ? replacement : record);
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
}

test('accepts a complete same-commit evidence package', async () => {
  const root = await fixture();
  assert.deepEqual(await verifyRelease0Evidence(root), {
    status: 'passed',
    sourceCommit: commit,
    files: requiredEvidence.length,
  });
});

test('RELEASE_EVIDENCE_001 names a missing required file', async () => {
  const root = await fixture();
  await rm(path.join(root, 'platform/windows-2025.json'));
  await assert.rejects(() => verifyRelease0Evidence(root), /RELEASE_EVIDENCE_001: missing platform\/windows-2025\.json/);
});

test('RELEASE_EVIDENCE_002 rejects a recomputed record from another commit', async () => {
  const root = await fixture();
  await replaceEvidence(root, 'spikes/curriculum-graph.json', {
    schemaVersion: 1,
    id: 'curriculum-graph',
    status: 'passed',
    sourceCommit: 'f'.repeat(40),
  });
  await assert.rejects(() => verifyRelease0Evidence(root), /RELEASE_EVIDENCE_002/);
});

test('RELEASE_EVIDENCE_003 rejects a recomputed failed record', async () => {
  const root = await fixture();
  await replaceEvidence(root, 'spikes/leak-prevention.json', {
    schemaVersion: 1,
    id: 'leak-prevention',
    status: 'failed',
    sourceCommit: commit,
  });
  await assert.rejects(() => verifyRelease0Evidence(root), /RELEASE_EVIDENCE_003/);
});

test('RELEASE_EVIDENCE_004 rejects byte drift against the manifest', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'browser/all.json'), '{"tampered":true}\n');
  await assert.rejects(() => verifyRelease0Evidence(root), /RELEASE_EVIDENCE_004/);
});
```

- [ ] **Step 2: Run the tests and confirm the gate module is missing**

```bash
node --test scripts/ci/tests/release-evidence.test.mjs
```

Expected: FAIL because `scripts/verify-release-0.mjs` does not exist.

- [ ] **Step 3: Implement required paths, missing-file handling, hash validation, and semantic validation**

```js
// scripts/verify-release-0.mjs
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const requiredEvidence = [
  'platform/ubuntu-24.04.json',
  'platform/windows-2025.json',
  'browser/all.json',
  'spikes/curriculum-to-starlight.json',
  'spikes/curriculum-graph.json',
  'spikes/template-publication.json',
  'spikes/cross-platform.json',
  'spikes/leak-prevention.json',
  'negative-fixtures/report.json',
  'templates/javascript-engineering/report.json',
];

export async function verifyRelease0Evidence(root) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  } catch {
    throw new Error('RELEASE_EVIDENCE_001: manifest.json is missing or invalid');
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.sourceCommit ?? '')) {
    throw new Error('RELEASE_EVIDENCE_002: manifest source commit is invalid');
  }
  const records = new Map(manifest.files.map((record) => [record.path, record]));
  for (const relative of requiredEvidence) {
    const record = records.get(relative);
    if (!record) throw new Error(`RELEASE_EVIDENCE_001: missing ${relative}`);
    let bytes;
    try {
      bytes = await readFile(path.join(root, relative));
    } catch {
      throw new Error(`RELEASE_EVIDENCE_001: missing ${relative}`);
    }
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== record.sha256 || bytes.byteLength !== record.bytes) {
      throw new Error(`RELEASE_EVIDENCE_004: hash or byte mismatch for ${relative}`);
    }
    const value = JSON.parse(bytes.toString('utf8'));
    if (value.sourceCommit !== manifest.sourceCommit) {
      throw new Error(`RELEASE_EVIDENCE_002: commit mismatch in ${relative}`);
    }
    if (value.status !== 'passed') {
      throw new Error(`RELEASE_EVIDENCE_003: failed status in ${relative}`);
    }
  }

  const allowedSpikeIds = new Set([
    'curriculum-to-starlight',
    'curriculum-graph',
    'template-publication',
    'cross-platform',
    'leak-prevention',
  ]);
  const seen = new Set();
  for (const relative of requiredEvidence.filter((entry) => entry.startsWith('spikes/'))) {
    const value = JSON.parse(await readFile(path.join(root, relative), 'utf8'));
    if (!allowedSpikeIds.has(value.id) || seen.has(value.id)) {
      throw new Error(`RELEASE_EVIDENCE_003: duplicate or unrecognized spike ${value.id}`);
    }
    seen.add(value.id);
  }
  return { status: 'passed', sourceCommit: manifest.sourceCommit, files: requiredEvidence.length };
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invoked === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (!root) throw new Error('Usage: verify-release-0.mjs <evidence-root>');
  console.log(JSON.stringify(await verifyRelease0Evidence(root)));
}
```

- [ ] **Step 4: Add the root gate and rerun all five tests**

```json
{
  "scripts": {
    "release:gate": "node scripts/verify-release-0.mjs .tmp/release-evidence"
  }
}
```

```bash
node --test scripts/ci/tests/release-evidence.test.mjs
```

Expected: five tests pass, with one success path and one test for each stable failure code.

- [ ] **Step 5: Write the human evidence index**

`docs/architecture/release-0-evidence.md` must contain this table with the concrete producer for each record:

| Evidence | Producer | OS | Review level |
|---|---|---|---|
| `platform/ubuntu-24.04.json` | `platform (ubuntu-24.04)` | Linux | R3 |
| `platform/windows-2025.json` | `platform (windows-2025)` | Windows | R3 |
| `browser/all.json` | `browser` | Linux | R2 |
| `spikes/curriculum-to-starlight.json` | aggregate derivation | Linux | R3 |
| `spikes/curriculum-graph.json` | aggregate derivation | Linux | R3 |
| `spikes/template-publication.json` | aggregate derivation | Linux | R4 |
| `spikes/cross-platform.json` | aggregate derivation | Linux + Windows | R3 |
| `spikes/leak-prevention.json` | aggregate derivation | Linux | R4 |

For every row, add its negative fixture, source command, and known limitation.

- [ ] **Step 6: Run the final local gate tests and commit**

```bash
node --test scripts/ci/tests/release-evidence.test.mjs
pnpm check

git add scripts/verify-release-0.mjs scripts/ci/tests/release-evidence.test.mjs docs/architecture/release-0-evidence.md package.json
git commit -m "feat: enforce Release 0 same-commit evidence gate"
```

## WP-09 exit gate

Hosted evidence for one source commit must show:

```text
Pull request / verify (ubuntu-24.04)
Pull request / verify (windows-2025)
Main verification / full
Scheduled verification / public-contract (ubuntu-24.04)
Scheduled verification / public-contract (windows-2025)
Verify Release 0 / platform (ubuntu-24.04)
Verify Release 0 / platform (windows-2025)
Verify Release 0 / browser
Verify Release 0 / aggregate
```

Local reproduction from the pinned toolchain:

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm verify:negative-fixtures
pnpm verify:templates
pnpm verify:release
```

Acceptance evidence must prove:

- Windows and Linux run the same root commands
- A toolchain mismatch fails before content or build verification
- Every manifest entry fails with its exact diagnostic code
- Pull-request, main, scheduled, and release workflows have read-only permissions and non-persistent checkout credentials
- Main installs only Chromium; release runs Chromium, Firefox, and WebKit
- Release jobs have no secret reference or publication command
- Ubuntu, Windows, browser, negative-fixture, template, and spike reports name the same source commit
- Every copied evidence file matches its recorded byte count and SHA-256
- The final gate detects missing evidence, commit mismatch, failed status, and hash drift

## Checkpoint

Stop after hosted Linux and Windows runs produce a passing aggregate evidence artifact for the same commit. Review the downloaded JSON records and hashes, not only status badges. Do not begin WP-10 until all five architecture-spike records and both platform records are present in that artifact.
