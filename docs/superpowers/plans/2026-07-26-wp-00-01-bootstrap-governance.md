# WP-00–01 Repository Bootstrap and Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reproducible greenfield pnpm monorepo with a fail-closed root command contract, approved design documentation, and Codex governance that is enforceable before domain implementation begins.

**Architecture:** The root contains only cross-cutting configuration and orchestration. Reusable configuration later moves behind `@roadmap/shared-config`, but Release 0 begins with explicit root files so bootstrap failures remain easy to diagnose. Repository policy is documented once at the highest applicable `AGENTS.md` scope and validated by mechanical checks where possible.

**Tech Stack:** Git, Node.js 24 LTS family, Corepack, pnpm, TypeScript, ESLint flat config, Prettier, Vitest, Node.js built-in test runner for pre-install bootstrap tests, GitHub issue forms, and Markdown.

## Global Constraints

- Greenfield repository with no inherited source or constraints
- Node.js 24 LTS family; pin the exact security-supported patch during Task 2
- Pin an exact pnpm version and commit the lockfile
- Strict TypeScript and ESM packages
- No Turborepo, Nx, or Bash-only scripts
- Windows 11 and Linux are primary environments
- Root commands must fail closed
- Approved design lives at `docs/superpowers/specs/2026-07-26-fullstack-javascript-roadmap-design.md`
- Do not create empty Release 2–6 directory scaffolding
- Do not add a license before the licensing decision gate

---

## File map

```text
.editorconfig                          Editor-independent whitespace contract
.gitattributes                        Line-ending and text/binary normalization
.gitignore                            Generated and local-state exclusions
.node-version                         Exact tested Node.js patch
.pnpm-version                         Exact tested pnpm version
package.json                          Root command contract and pinned package manager
pnpm-workspace.yaml                   Workspace membership and pnpm policy
pnpm-lock.yaml                        Exact dependency graph
eslint.config.mjs                     Repository lint contract
prettier.config.mjs                   Repository format contract
tsconfig.base.json                    Strict shared compiler baseline
tsconfig.json                         Root compiler entry point
vitest.config.ts                      Root Vitest projects definition
scripts/pin-toolchain.mjs             Records current approved Node and pnpm versions
scripts/run-pipeline.mjs               Fail-closed sequential command runner
scripts/check-repository-policy.mjs    Mechanical governance checks
scripts/repository-layout.test.mjs     Pre-install bootstrap tests
scripts/toolchain.test.mjs             Toolchain consistency tests
scripts/run-pipeline.test.mjs          Pipeline failure-propagation tests
AGENTS.md                              Root Codex and contributor rules
CONTRIBUTING.md                        Human contribution workflow
README.md                              Product and repository entry point
docs/architecture/README.md            Architecture index
docs/decisions/0001-toolchain.md       Exact toolchain decision record
docs/contributing/task-contract.md     Required task shape
docs/contributing/verification-report.md Required evidence report shape
.github/ISSUE_TEMPLATE/config.yml      Issue-template policy
.github/ISSUE_TEMPLATE/engineering.yml Engineering task form
.github/ISSUE_TEMPLATE/curriculum.yml  Curriculum task form
.github/pull_request_template.md        PR evidence checklist
curriculum/AGENTS.md                    Curriculum-scoped rules
exercises/AGENTS.md                     Exercise-scoped rules
templates/AGENTS.md                     Publication-scoped rules
packages/AGENTS.md                      Domain-package rules
tooling/AGENTS.md                       Validator/tooling rules
apps/docs/AGENTS.md                     Website-adapter rules
```

### Task 1: Initialize the repository and preserve the approved specification

**Files:**
- Create: `.editorconfig`
- Create: `.gitattributes`
- Create: `.gitignore`
- Create: `README.md`
- Create: `scripts/repository-layout.test.mjs`
- Create: `docs/superpowers/specs/2026-07-26-fullstack-javascript-roadmap-design.md`

**Interfaces:**
- Consumes: the approved design specification
- Produces: a clean Git repository whose first test describes mandatory root artifacts

- [ ] **Step 1: Initialize Git and create the failing layout test**

```js
// scripts/repository-layout.test.mjs
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const requiredFiles = [
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  'README.md',
  'docs/superpowers/specs/2026-07-26-fullstack-javascript-roadmap-design.md',
];

test('required greenfield repository files exist', async () => {
  await Promise.all(requiredFiles.map((file) => access(file)));
});

test('the written specification is marked approved and greenfield', async () => {
  const specification = await readFile(
    'docs/superpowers/specs/2026-07-26-fullstack-javascript-roadmap-design.md',
    'utf8',
  );
  assert.match(specification, /\*\*Status:\*\* Approved/);
  assert.match(specification, /Greenfield repository/);
});
```

- [ ] **Step 2: Run the test and confirm it fails because the root files do not exist**

Run:

```bash
git init
node --test scripts/repository-layout.test.mjs
```

Expected: non-zero exit with `ENOENT` for at least `.editorconfig`.

- [ ] **Step 3: Add the root text and line-ending contracts**

```ini
# .editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

```gitattributes
# .gitattributes
* text=auto eol=lf
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.webp binary
*.zip binary
*.gitbundle binary
```

```gitignore
# .gitignore
node_modules/
.pnpm-store/
dist/
coverage/
.playwright/
playwright-report/
test-results/
.generated/
.tmp/
.env
.env.*
!.env.example
.DS_Store
Thumbs.db
*.log
```

- [ ] **Step 4: Add the repository entry point and approved specification**

`README.md` must contain exactly these top-level sections:

```markdown
# Lộ trình Fullstack JavaScript

Repository-first, competency-based self-study curriculum for programmers who are new to web development.

## Status

Release 0 repository kernel is under construction. This repository does not yet claim a complete Junior Fullstack curriculum.

## Approved design

See `docs/superpowers/specs/2026-07-26-fullstack-javascript-roadmap-design.md`.

## Public command contract

The command contract is added in WP-00 and remains stable within its contract version.
```

Copy the approved specification without summarizing or rewriting it, and change only its status line to `**Status:** Approved`.

- [ ] **Step 5: Run the layout test and commit**

Run:

```bash
node --test scripts/repository-layout.test.mjs
git add .editorconfig .gitattributes .gitignore README.md scripts/repository-layout.test.mjs docs/superpowers/specs/2026-07-26-fullstack-javascript-roadmap-design.md
git commit -m "docs: establish approved greenfield repository"
```

Expected: tests pass and the commit contains no generated files.

### Task 2: Pin the toolchain and create the pnpm workspace contract

**Files:**
- Create: `.node-version`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `scripts/pin-toolchain.mjs`
- Create: `scripts/toolchain.test.mjs`
- Create: `docs/decisions/0001-toolchain.md`
- Create: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: an installed, security-supported Node.js 24.x runtime and an approved stable pnpm release
- Produces: exact runtime records, an ESM private workspace root, and a frozen dependency graph

- [ ] **Step 1: Write the failing consistency test**

```js
// scripts/toolchain.test.mjs
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

async function text(path) {
  return (await readFile(path, 'utf8')).trim();
}

test('Node.js runtime is an exact 24.x version and matches .node-version', async () => {
  const pinned = await text('.node-version');
  assert.match(pinned, /^24\.\d+\.\d+$/);
  assert.equal(process.versions.node, pinned);
});

test('packageManager pins the active pnpm version', async () => {
  const packageJson = JSON.parse(await text('package.json'));
  const expected = await text('.pnpm-version');
  assert.equal(packageJson.packageManager, `pnpm@${expected}`);
});

test('workspace policy rejects cycles and empty filters', async () => {
  const workspace = await text('pnpm-workspace.yaml');
  assert.match(workspace, /disallowWorkspaceCycles:\s*true/);
  assert.match(workspace, /failIfNoMatch:\s*true/);
});
```

- [ ] **Step 2: Run the test and confirm the pin files are missing**

Run:

```bash
node --test scripts/toolchain.test.mjs
```

Expected: non-zero exit because `.node-version` and `package.json` do not exist.

- [ ] **Step 3: Add the toolchain-recording script**

```js
// scripts/pin-toolchain.mjs
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const nodeVersion = process.versions.node;
if (!nodeVersion.startsWith('24.')) {
  throw new Error(`Expected Node.js 24.x, observed ${nodeVersion}`);
}

const npmExecPath = process.env.npm_execpath;
const pnpmVersion = npmExecPath
  ? execFileSync(process.execPath, [npmExecPath, '--version'], { encoding: 'utf8', shell: false }).trim()
  : execFileSync(process.platform === 'win32' ? 'corepack.cmd' : 'corepack', ['pnpm', '--version'], {
      encoding: 'utf8',
      shell: false,
    }).trim();

await writeFile('.node-version', `${nodeVersion}\n`);
await writeFile('.pnpm-version', `${pnpmVersion}\n`);

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
packageJson.engines = { node: '>=24 <25' };
packageJson.packageManager = `pnpm@${pnpmVersion}`;
await writeFile('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
```

- [ ] **Step 4: Create the root workspace files and pin the active approved versions**

```json
{
  "name": "fullstack-javascript-roadmap",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Repository-first competency-based Fullstack JavaScript curriculum",
  "scripts": {},
  "engines": {
    "node": ">=24 <25"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - apps/*
  - packages/*
  - tooling/*
  - exercises/*/*
  - templates/*

catalogMode: strict
cleanupUnusedCatalogs: true
disallowWorkspaceCycles: true
engineStrict: true
failIfNoMatch: true
sharedWorkspaceLockfile: true
strictPeerDependencies: true
saveWorkspaceProtocol: rolling
```

Before running the pin script, verify from the official Node.js release page that the installed `24.x` patch remains security-supported. Record the check date and source in the ADR. Then run:

```bash
corepack enable
node scripts/pin-toolchain.mjs
pnpm add -Dw --save-exact typescript zod vitest eslint @eslint/js typescript-eslint prettier yaml @types/node tsx globals
```

The commands write exact versions into `package.json` and `pnpm-lock.yaml`; no `latest` string is committed.

- [ ] **Step 5: Write the toolchain ADR and verify consistency**

`docs/decisions/0001-toolchain.md` must record:

```markdown
# ADR 0001: Release 0 toolchain

- Status: Accepted
- Decision date: 2026-07-26
- Runtime family: Node.js 24 LTS
- Exact tested Node.js version: value from `.node-version`
- Exact pnpm version: value from `.pnpm-version`
- Package manager source: Corepack
- Dependency policy: exact direct versions and committed frozen lockfile
- Revisit trigger: Node.js 24 security support change or an approved dependency migration
```

Run:

```bash
node --test scripts/toolchain.test.mjs
pnpm install --frozen-lockfile
```

Expected: both commands exit `0`.

- [ ] **Step 6: Commit**

```bash
git add .node-version .pnpm-version package.json pnpm-workspace.yaml pnpm-lock.yaml scripts/pin-toolchain.mjs scripts/toolchain.test.mjs docs/decisions/0001-toolchain.md
git commit -m "build: pin release zero toolchain"
```

### Task 3: Add strict TypeScript, lint, format, and Vitest project configuration

**Files:**
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `eslint.config.mjs`
- Create: `prettier.config.mjs`
- Create: `vitest.config.ts`
- Create: `scripts/config-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: exact dependencies from Task 2
- Produces: root `check` and `test` scripts used by every later plan

- [ ] **Step 1: Write the failing configuration contract test**

```js
// scripts/config-contract.test.mjs
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

test('TypeScript base config is strict and emits no build artifacts', async () => {
  const config = await readJson('tsconfig.base.json');
  assert.equal(config.compilerOptions.strict, true);
  assert.equal(config.compilerOptions.noEmit, true);
  assert.equal(config.compilerOptions.module, 'NodeNext');
  assert.equal(config.compilerOptions.moduleResolution, 'NodeNext');
});

test('root compiler entry point extends the base contract', async () => {
  const config = await readJson('tsconfig.json');
  assert.equal(config.extends, './tsconfig.base.json');
  assert.deepEqual(config.include, ['vitest.config.ts']);
});

test('root scripts expose check and bootstrap tests', async () => {
  const packageJson = await readJson('package.json');
  assert.equal(typeof packageJson.scripts.check, 'string');
  assert.equal(packageJson.scripts.test, 'node --test scripts/*.test.mjs');
});
```

- [ ] **Step 2: Run the test and confirm the configuration files are missing**

```bash
node --test scripts/config-contract.test.mjs
```

Expected: non-zero exit for `tsconfig.base.json`.

- [ ] **Step 3: Add strict compiler and formatter configuration**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": false,
    "resolveJsonModule": true
  }
}
```

```json
// tsconfig.json
{
  "extends": "./tsconfig.base.json",
  "include": ["vitest.config.ts"]
}
```

```js
// prettier.config.mjs
export default {
  endOfLine: 'lf',
  printWidth: 100,
  proseWrap: 'preserve',
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
};
```

- [ ] **Step 4: Add ESLint flat configuration and Vitest projects**

```js
// eslint.config.mjs
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/.generated/**', '**/.tmp/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
);
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: false,
    projects: [
      'packages/*/vitest.config.ts',
      'tooling/*/vitest.config.ts',
      'apps/*/vitest.config.ts',
    ],
  },
});
```

- [ ] **Step 5: Add the root scripts and run them**

Set these scripts in `package.json`:

```json
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint .",
    "typecheck": "tsc --project tsconfig.json",
    "check": "node scripts/run-pipeline.mjs format:check lint typecheck",
    "test": "node --test scripts/*.test.mjs"
  }
}
```

Task 4 creates `run-pipeline.mjs`; before that task, run the individual commands:

```bash
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
node --test scripts/config-contract.test.mjs
```

Expected: all commands exit `0`.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.base.json tsconfig.json eslint.config.mjs prettier.config.mjs vitest.config.ts scripts/config-contract.test.mjs package.json pnpm-lock.yaml
git commit -m "build: add strict repository checks"
```

### Task 4: Implement the fail-closed root pipeline and public command contract

**Files:**
- Create: `scripts/run-pipeline.mjs`
- Create: `scripts/run-pipeline.test.mjs`
- Create: `scripts/unavailable-command.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: named npm scripts from `package.json`
- Produces: `runPipeline(scriptNames): Promise<void>` and the stable root public commands

- [ ] **Step 1: Write tests for order, failure propagation, and unknown scripts**

```js
// scripts/run-pipeline.test.mjs
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from './run-pipeline.mjs';

test('pipeline stops after the first failing script', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-pipeline-'));
  const log = path.join(root, 'log.txt');
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      scripts: {
        first: `node -e "require('fs').appendFileSync(${JSON.stringify(log)}, 'first\\n')"`,
        fail: 'node -e "process.exit(7)"',
        last: `node -e "require('fs').appendFileSync(${JSON.stringify(log)}, 'last\\n')"`,
      },
    }),
  );

  await assert.rejects(() => runPipeline(['first', 'fail', 'last'], { cwd: root }));
  assert.equal(await readFile(log, 'utf8'), 'first\n');
  await rm(root, { recursive: true, force: true });
});

test('pipeline rejects an unknown script before execution', async () => {
  await assert.rejects(() => runPipeline(['script-that-does-not-exist']));
});
```

- [ ] **Step 2: Run the tests and confirm the module is missing**

```bash
node --test scripts/run-pipeline.test.mjs
```

Expected: non-zero exit with module-not-found for `run-pipeline.mjs`.

- [ ] **Step 3: Implement the minimal cross-platform pipeline**

```js
// scripts/run-pipeline.mjs
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function runPipeline(scriptNames, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const packageJson = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'));

  for (const scriptName of scriptNames) {
    if (typeof packageJson.scripts?.[scriptName] !== 'string') {
      throw new Error(`Unknown package script: ${scriptName}`);
    }
  }

  for (const scriptName of scriptNames) {
    await new Promise((resolve, reject) => {
      const npmExecPath = process.env.npm_execpath;
      const executable = npmExecPath ? process.execPath : process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
      const args = npmExecPath
        ? [npmExecPath, 'run', scriptName]
        : process.platform === 'win32'
          ? ['/d', '/s', '/c', 'pnpm', 'run', scriptName]
          : ['run', scriptName];
      const child = spawn(executable, args, {
        cwd,
        shell: false,
        stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`${scriptName} failed with code ${code} and signal ${signal}`));
      });
    });
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const scripts = process.argv.slice(2);
  if (scripts.length === 0) throw new Error('At least one script name is required');
  await runPipeline(scripts);
}
```

- [ ] **Step 4: Add explicit unimplemented-stage commands without reporting false success**

```js
// scripts/unavailable-command.mjs
const command = process.argv[2];
console.error(`${command} is not available until its owning work package is merged`);
process.exitCode = 2;
```

Set the root scripts to:

```json
{
  "scripts": {
    "dev": "node scripts/unavailable-command.mjs dev",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint .",
    "typecheck": "tsc --project tsconfig.json",
    "check": "node scripts/run-pipeline.mjs format:check lint typecheck",
    "test": "node --test scripts/*.test.mjs",
    "verify": "node scripts/run-pipeline.mjs check test",
    "verify:templates": "node scripts/unavailable-command.mjs verify:templates",
    "verify:release": "node scripts/unavailable-command.mjs verify:release"
  }
}
```

The unavailable-stage command exits `2`; it prevents a not-yet-implemented verifier from appearing green.

- [ ] **Step 5: Run targeted tests and the available root verifier**

```bash
node --test scripts/run-pipeline.test.mjs
pnpm verify
```

Expected: bootstrap tests and `pnpm verify` pass. `pnpm verify:templates` must exit `2` until WP-07 replaces it.

- [ ] **Step 6: Commit**

```bash
git add scripts/run-pipeline.mjs scripts/run-pipeline.test.mjs scripts/unavailable-command.mjs package.json
git commit -m "build: add fail closed root pipeline"
```

### Task 5: Add root and scoped `AGENTS.md` governance

**Files:**
- Create: `AGENTS.md`
- Create: `curriculum/AGENTS.md`
- Create: `exercises/AGENTS.md`
- Create: `templates/AGENTS.md`
- Create: `packages/AGENTS.md`
- Create: `tooling/AGENTS.md`
- Create: `apps/docs/AGENTS.md`
- Create: `scripts/check-repository-policy.mjs`
- Create: `scripts/repository-policy.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: approved product boundaries and root commands
- Produces: scoped instructions and `pnpm policy:check`

- [ ] **Step 1: Write a failing policy test for mandatory rules and prohibited duplication**

```js
// scripts/repository-policy.test.mjs
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFile(path, 'utf8');

test('root governance defines verification and prohibited shortcuts', async () => {
  const root = await read('AGENTS.md');
  assert.match(root, /implemented.*verified/is);
  assert.match(root, /Do not delete, skip, or weaken failing tests/i);
  assert.match(root, /Do not change acceptance criteria after implementation/i);
  assert.match(root, /pnpm verify/);
});

test('template governance requires allowlist and independent verification', async () => {
  const templates = await read('templates/AGENTS.md');
  assert.match(templates, /allowlist/i);
  assert.match(templates, /outside the monorepo/i);
  assert.match(templates, /solution/i);
});
```

- [ ] **Step 2: Run the test and confirm the governance files are missing**

```bash
node --test scripts/repository-policy.test.mjs
```

Expected: non-zero exit for `AGENTS.md`.

- [ ] **Step 3: Write the root governance file**

`AGENTS.md` must contain these sections and rules:

```markdown
# Repository instructions

## Product boundary

This repository is a self-study Fullstack JavaScript curriculum, not a learning-management system. Do not add accounts, cloud progress, an online IDE, remote execution, leaderboards, certificates, or an integrated AI tutor without an approved design change.

## Source of truth

Curriculum content and metadata live under `curriculum/`. Website pages and starter repositories are adapters or generated artifacts. Never maintain a second hand-edited curriculum copy.

## Required commands

Run the narrowest relevant test first, then `pnpm check`, then the relevant broader verifier. Never claim a command passed without recording its real exit result.

## Verification language

`implemented` means code was written. `verified` means the declared acceptance criteria were exercised and passed with evidence. Do not conflate them.

## Prohibited shortcuts

- Do not delete, skip, or weaken failing tests to obtain a green run
- Do not change acceptance criteria after implementation to fit the diff
- Do not convert validation errors into warnings without approval
- Do not hide failure with broad catch blocks or silent fallback
- Do not use `any` or unchecked assertions merely to silence TypeScript
- Do not edit generated artifacts by hand
- Do not publish from a dirty worktree
- Do not overwrite unrelated user changes

## Task boundary

Work only within the files and behavior allowed by the task contract. Stop and report a specification conflict rather than silently expanding scope.
```

- [ ] **Step 4: Write scoped instructions without repeating root policy**

Each scoped file links to `../AGENTS.md` or the correct relative root and adds only domain-specific rules:

```markdown
# Curriculum instructions

Root rules in `../AGENTS.md` apply.

- Write explanations in Vietnamese and retain English technical terms
- Give each lesson one primary objective
- Map every lesson to declared competencies and prerequisites
- Do not publish unsupported factual claims
- Keep examples executable where the subject is executable
- Do not mark stub-only content as published
```

```markdown
# Exercise instructions

Root rules in `../AGENTS.md` apply.

- Test observable contracts rather than reference-solution shape
- Ensure the learner starter fails for the intended learning reason
- Include an edge or negative case
- Keep hints progressive
- Run the same public verifier against the reference solution
```

```markdown
# Template instructions

Root rules in `../AGENTS.md` apply.

- Materialize public artifacts from an explicit allowlist
- Reject solutions, private fixtures, secrets, internal references, and symlinks
- Verify generated repositories outside the monorepo
- Include provenance linked to the source commit
- Never edit the public generated repository directly
```

Create equally focused files for packages, tooling, and the docs adapter using the approved boundaries.

- [ ] **Step 5: Add a mechanical policy checker and root script**

```js
// scripts/check-repository-policy.mjs
import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
  'AGENTS.md',
  'curriculum/AGENTS.md',
  'exercises/AGENTS.md',
  'templates/AGENTS.md',
  'packages/AGENTS.md',
  'tooling/AGENTS.md',
  'apps/docs/AGENTS.md',
];

for (const file of requiredFiles) await access(file);

const root = await readFile('AGENTS.md', 'utf8');
for (const phrase of [
  'implemented',
  'verified',
  'Do not delete, skip, or weaken failing tests',
  'Do not change acceptance criteria after implementation',
]) {
  if (!root.includes(phrase)) throw new Error(`Missing root governance phrase: ${phrase}`);
}
```

Add:

```json
{
  "scripts": {
    "policy:check": "node scripts/check-repository-policy.mjs",
    "check": "node scripts/run-pipeline.mjs format:check lint typecheck policy:check"
  }
}
```

- [ ] **Step 6: Run, review duplication, and commit**

```bash
node --test scripts/repository-policy.test.mjs
pnpm policy:check
pnpm check
git add AGENTS.md curriculum/AGENTS.md exercises/AGENTS.md templates/AGENTS.md packages/AGENTS.md tooling/AGENTS.md apps/docs/AGENTS.md scripts/check-repository-policy.mjs scripts/repository-policy.test.mjs package.json
git commit -m "docs: establish scoped repository governance"
```

### Task 6: Add contributor task, review, and evidence templates

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `docs/architecture/README.md`
- Create: `docs/contributing/task-contract.md`
- Create: `docs/contributing/verification-report.md`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/ISSUE_TEMPLATE/engineering.yml`
- Create: `.github/ISSUE_TEMPLATE/curriculum.yml`
- Create: `.github/pull_request_template.md`
- Create: `scripts/contribution-contract.test.mjs`

**Interfaces:**
- Consumes: root governance and work-package risk model
- Produces: machine-reviewable issue forms and a human evidence contract

- [ ] **Step 1: Write the failing contribution-contract test**

```js
// scripts/contribution-contract.test.mjs
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFile(path, 'utf8');

test('engineering issue form requires scope, risk, acceptance, commands, and evidence', async () => {
  const form = await read('.github/ISSUE_TEMPLATE/engineering.yml');
  for (const label of ['In scope', 'Out of scope', 'Risk level', 'Acceptance criteria', 'Commands', 'Evidence']) {
    assert.match(form, new RegExp(label, 'i'));
  }
});

test('pull request template distinguishes implementation from verification', async () => {
  const template = await read('.github/pull_request_template.md');
  assert.match(template, /Implementation status/);
  assert.match(template, /Verification evidence/);
  assert.match(template, /Unverified areas/);
});
```

- [ ] **Step 2: Run the test and confirm the templates are missing**

```bash
node --test scripts/contribution-contract.test.mjs
```

Expected: non-zero exit.

- [ ] **Step 3: Write the task and verification documents**

`docs/contributing/task-contract.md` defines this exact shape:

```markdown
# Objective
# Context
# In scope
# Out of scope
# Allowed files or boundaries
# Required behavior
# Failure behavior
# Acceptance criteria
# Commands
# Evidence
# Constraints
# Open questions
```

`docs/contributing/verification-report.md` defines:

```markdown
## Objective
## Changed behavior
## Files changed
## Verification performed
## Acceptance criteria
## Unverified areas
## Known limitations
## Follow-up issues
```

`CONTRIBUTING.md` links to both and requires isolated branches or worktrees for agentic tasks.

- [ ] **Step 4: Add typed GitHub issue forms**

The engineering form includes a required dropdown:

```yaml
- type: dropdown
  id: risk
  attributes:
    label: Risk level
    options:
      - R0 — text or obvious link correction
      - R1 — lesson or focused exercise
      - R2 — package logic or website behavior
      - R3 — schema, graph, or template publisher
      - R4 — authentication, publication, or release tooling
  validations:
    required: true
```

The curriculum form additionally requires competency IDs, prerequisites, assessment alignment, and learner misconception risks.

- [ ] **Step 5: Add the pull-request evidence checklist and architecture index**

The PR template must require:

```markdown
## Implementation status

- [ ] The task contract is unchanged or its approved amendment is linked
- [ ] The diff stays within the allowed boundary

## Verification evidence

| Command | Exit | Evidence |
|---|---:|---|

## Independent review

- [ ] Required risk-level review completed

## Unverified areas

State them explicitly. Do not write “none” without checking the task contract.
```

`docs/architecture/README.md` links the approved design, ADR directory, and implementation plans.

- [ ] **Step 6: Run tests and commit**

```bash
node --test scripts/contribution-contract.test.mjs
pnpm check
git add CONTRIBUTING.md docs/architecture/README.md docs/contributing .github/ISSUE_TEMPLATE .github/pull_request_template.md scripts/contribution-contract.test.mjs
git commit -m "docs: add task and verification contracts"
```

### Task 7: Complete the WP-00–01 verification gate

**Files:**
- Create: `scripts/verify-wp-00-01.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: all WP-00–01 root commands and policy tests
- Produces: `pnpm verify:wp-00-01` and a clean evidence report for the next work package

- [ ] **Step 1: Write the failing gate test**

```js
// scripts/wp-00-01-gate.test.mjs
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

test('WP-00–01 gate command succeeds', () => {
  const result = spawnSync('node', ['scripts/verify-wp-00-01.mjs'], {
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
```

- [ ] **Step 2: Run the test and confirm the gate module is missing**

```bash
node --test scripts/wp-00-01-gate.test.mjs
```

Expected: non-zero exit.

- [ ] **Step 3: Implement the gate as a sequence of exact commands**

```js
// scripts/verify-wp-00-01.mjs
import { runPipeline } from './run-pipeline.mjs';

await runPipeline([
  'format:check',
  'lint',
  'typecheck',
  'policy:check',
  'test:bootstrap',
]);
```

Add:

```json
{
  "scripts": {
    "test:bootstrap": "node --test scripts/*.test.mjs",
    "verify:wp-00-01": "node scripts/verify-wp-00-01.mjs",
    "verify": "node scripts/run-pipeline.mjs check test:bootstrap"
  }
}
```

Vitest remains the domain test runner from WP-02 onward; `test:bootstrap` ensures pre-install and governance tests remain visible.

- [ ] **Step 4: Run the complete gate from a clean installation**

```bash
rm -rf node_modules
pnpm install --frozen-lockfile
pnpm verify:wp-00-01
```

On Windows, use PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
pnpm install --frozen-lockfile
pnpm verify:wp-00-01
```

Expected: all commands exit `0`.

- [ ] **Step 5: Review and commit**

```bash
git status --short
git diff --check
git add scripts/verify-wp-00-01.mjs scripts/wp-00-01-gate.test.mjs package.json
git commit -m "test: add bootstrap governance gate"
```

WP-00–01 exit evidence must include the exact Node and pnpm versions, fresh-install result, root command results, and confirmation that `verify:templates` and `verify:release` still fail closed until their owning work packages replace them.
