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
- Create: `.pnpm-version`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `scripts/pin-toolchain.mjs`
- Create: `scripts/toolchain.test.mjs`
- Create: `docs/decisions/0001-toolchain.md`
- Create: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: an installed, security-supported Node.js 24.x runtime and an approved stable pnpm release
- Produces: exact runtime records independently checked against the active tools, an ESM private workspace root, and a frozen dependency graph whose direct Node typings remain on the exact Node 24 line

- [ ] **Step 1: Capture the old fail-open pnpm mutation result**

Run this command before changing `scripts/toolchain.test.mjs`:

```bash
node --input-type=module -e 'import assert from "node:assert/strict"; const pinned = "latest"; const packageJson = { packageManager: "pnpm@latest" }; assert.equal(packageJson.packageManager, `pnpm@${pinned}`);'
```

Expected: exit `0`, with empty stdout and stderr. Record this exact evidence in the Task 2 report:

```text
Before fix:
.pnpm-version  = latest
packageManager = pnpm@latest
old canonical test exit status = 0
```

Because this command uses only in-memory values, it does not mutate repository files. Confirm
the working tree remains unchanged before adding the regressions:

```bash
git diff --check
git status --short
```

- [ ] **Step 2: Add the exact-pin policy regressions before changing production or dependency policy**

Use an independent test-side observer rather than importing `scripts/pin-toolchain.mjs`,
because importing the pin script would rewrite repository files. Replace the pnpm-pin test
semantics in `scripts/toolchain.test.mjs`. The complete import and common-helper block is:

```js
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

async function text(filePath) {
  return (await readFile(filePath, 'utf8')).trim();
}

test('Node.js runtime is an exact 24.x version and matches .node-version', async () => {
  const pinned = await text('.node-version');
  assert.match(pinned, /^24\.\d+\.\d+$/);
  assert.equal(process.versions.node, pinned);
});

test('workspace policy rejects cycles and empty filters', async () => {
  const workspace = await text('pnpm-workspace.yaml');
  assert.match(workspace, /disallowWorkspaceCycles:\s*true/);
  assert.match(workspace, /failIfNoMatch:\s*true/);
});
```

Add these exact pnpm observer and policy definitions:

```js
const EXACT_STABLE_SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function resolveActivePnpmVersion() {
  const npmExecPath = process.env.npm_execpath;
  let command;
  let args;

  if (npmExecPath) {
    command = process.execPath;
    args = [npmExecPath, '--version'];
  } else if (process.platform === 'win32') {
    command = process.env.ComSpec ?? 'cmd.exe';
    args = ['/d', '/s', '/c', 'corepack pnpm --version'];
  } else {
    command = 'corepack';
    args = ['pnpm', '--version'];
  }

  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    windowsHide: process.platform === 'win32' && !npmExecPath,
  });
  const diagnostic = [
    `stdout:\n${result.stdout ?? ''}`,
    `stderr:\n${result.stderr ?? ''}`,
    `error:\n${result.error?.stack ?? String(result.error ?? '')}`,
  ].join('\n');

  assert.ifError(result.error);
  assert.equal(result.status, 0, diagnostic);

  const active = (result.stdout ?? '').trim();
  assert.notEqual(active, '', diagnostic);
  assert.match(active, EXACT_STABLE_SEMVER, diagnostic);
  return active;
}

function assertPnpmPinContract(packageJson, pinned, active) {
  assert.match(pinned, EXACT_STABLE_SEMVER);
  assert.match(active, EXACT_STABLE_SEMVER);
  assert.equal(pinned, active);
  assert.equal(packageJson.packageManager, `pnpm@${active}`);
}

test('packageManager pins the exact active pnpm version', async () => {
  const packageJson = JSON.parse(await text('package.json'));
  const pinned = await text('.pnpm-version');
  const active = resolveActivePnpmVersion();

  assertPnpmPinContract(packageJson, pinned, active);
});

test('pnpm pin policy rejects latest even when repository records agree', () => {
  const active = resolveActivePnpmVersion();

  assert.throws(
    () =>
      assertPnpmPinContract(
        { packageManager: 'pnpm@latest' },
        'latest',
        active,
    ),
    (error) => {
      assert.equal(error.code, 'ERR_ASSERTION');
      assert.equal(error.actual, 'latest');
      assert.match(error.message, /expected to match|did not match/i);
      return true;
    },
  );
});

test('direct Node typings stay on the exact Node 24 line', async () => {
  const packageJson = JSON.parse(await text('package.json'));
  const nodeTypesVersion = packageJson.devDependencies?.['@types/node'];

  assert.match(
    nodeTypesVersion,
    /^24\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
  );
  assert.equal(nodeTypesVersion, '24.13.3');

  const lockfile = await text('pnpm-lock.yaml');
  assert.match(
    lockfile,
    /importers:\r?\n\r?\n  \.:[\s\S]*?\n      '@types\/node':\r?\n        specifier: 24\.13\.3\r?\n        version: 24\.13\.3(?:\r?\n|$)/,
  );
});
```

`EXACT_STABLE_SEMVER` intentionally rejects `latest`, `next`, `10`, `10.2`,
`v10.2.3`, `^10.2.3`, `~10.2.3`, `>=10.2.3`, `10.2.3-beta.1`, and
`10.2.3+metadata`.

Add this regression to the same file. It makes a fake lifecycle pnpm executable return
`latest`, requires the pin script to fail, and proves all three target files retain their
exact original bytes:

```js
test('pin script rejects a non-exact pnpm version before writing files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-toolchain-invalid-pnpm-'));
  const packageJsonPath = path.join(root, 'package.json');
  const nodeVersionPath = path.join(root, '.node-version');
  const pnpmVersionPath = path.join(root, '.pnpm-version');
  const fakePnpmPath = path.join(root, 'fake-pnpm.mjs');
  const originalPackageJson =
    `${JSON.stringify(
      {
        name: 'pin-toolchain-invalid-pnpm',
        version: '0.0.0',
        private: true,
        type: 'module',
        engines: { node: '>=24 <25' },
        packageManager: 'pnpm@11.9.0',
      },
      null,
      2,
    )}\n`;
  const originalNodeVersion = 'sentinel-node\n';
  const originalPnpmVersion = 'sentinel-pnpm\n';

  try {
    await writeFile(packageJsonPath, originalPackageJson);
    await writeFile(nodeVersionPath, originalNodeVersion);
    await writeFile(pnpmVersionPath, originalPnpmVersion);
    await writeFile(fakePnpmPath, "process.stdout.write('latest\\n');\n");

    const script = fileURLToPath(new URL('./pin-toolchain.mjs', import.meta.url));
    const env = { ...process.env };

    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === 'npm_execpath') {
        delete env[key];
      }
    }

    env.npm_execpath = fakePnpmPath;

    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
      env,
      shell: false,
    });
    const diagnostic = [
      `stdout:\n${result.stdout ?? ''}`,
      `stderr:\n${result.stderr ?? ''}`,
      `error:\n${result.error?.stack ?? String(result.error ?? '')}`,
    ].join('\n');

    assert.notEqual(result.status, 0, diagnostic);
    assert.match(result.stderr ?? '', /exact stable pnpm version/i);
    assert.deepEqual(await readFile(packageJsonPath), Buffer.from(originalPackageJson));
    assert.deepEqual(await readFile(nodeVersionPath), Buffer.from(originalNodeVersion));
    assert.deepEqual(await readFile(pnpmVersionPath), Buffer.from(originalPnpmVersion));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

Add the direct-invocation regression below. It resolves the pin script by absolute path,
removes every case variant of `npm_execpath`, includes stdout, stderr, and `result.error`
in its failure message, and never touches repository pin files:

```js
test('pin script resolves pnpm without npm_execpath', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-toolchain-'));

  try {
    await writeFile(
      path.join(root, 'package.json'),
      `${JSON.stringify(
        {
          name: 'pin-toolchain-regression',
          version: '0.0.0',
          private: true,
          type: 'module',
          engines: { node: '>=24 <25' },
        },
        null,
        2,
      )}\n`,
    );

    const script = fileURLToPath(new URL('./pin-toolchain.mjs', import.meta.url));
    const env = { ...process.env };

    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === 'npm_execpath') {
        delete env[key];
      }
    }

    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
      env,
      shell: false,
    });
    const diagnostic = [
      `stdout:\n${result.stdout ?? ''}`,
      `stderr:\n${result.stderr ?? ''}`,
      `error:\n${result.error?.stack ?? String(result.error ?? '')}`,
    ].join('\n');

    assert.equal(result.status, 0, diagnostic);

    const nodeVersion = (await readFile(path.join(root, '.node-version'), 'utf8')).trim();
    const pnpmVersion = (await readFile(path.join(root, '.pnpm-version'), 'utf8')).trim();
    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

    assert.equal(nodeVersion, process.versions.node);
    assert.match(pnpmVersion, EXACT_STABLE_SEMVER);
    assert.equal(packageJson.packageManager, `pnpm@${pnpmVersion}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run the new regressions and verify RED**

Run:

```bash
node --test scripts/toolchain.test.mjs
```

Expected in fix round 1: non-zero exit. The invalid-output regression fails because the
current pin script exits `0` after accepting and writing `latest`; the direct Node typings
assertion fails because the current declaration is `catalog:` and resolves to 26.1.1. Capture
the exact command, exit status, stdout, and stderr in the Task 2 report.

Also prove that the amended canonical test itself exits non-zero for the same
`latest`/`pnpm@latest` mutation without modifying repository files:

```powershell
$FixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) "roadmap-pnpm-mutation-$([guid]::NewGuid())"

try {
    New-Item -ItemType Directory -Path $FixtureRoot | Out-Null
    Copy-Item (Resolve-Path "scripts/toolchain.test.mjs") (Join-Path $FixtureRoot "toolchain.test.mjs")

    $Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText(
        (Join-Path $FixtureRoot "package.json"),
        "{`"packageManager`":`"pnpm@latest`"}`n",
        $Utf8NoBom
    )
    [System.IO.File]::WriteAllText(
        (Join-Path $FixtureRoot ".pnpm-version"),
        "latest`n",
        $Utf8NoBom
    )

    $StartInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $StartInfo.FileName = (Get-Command node).Source
    $StartInfo.WorkingDirectory = $FixtureRoot
    $StartInfo.UseShellExecute = $false
    $StartInfo.RedirectStandardOutput = $true
    $StartInfo.RedirectStandardError = $true
    $StartInfo.ArgumentList.Add("--test")
    $StartInfo.ArgumentList.Add("--test-name-pattern=packageManager pins the exact active pnpm version")
    $StartInfo.ArgumentList.Add("toolchain.test.mjs")

    $Process = [System.Diagnostics.Process]::new()
    $Process.StartInfo = $StartInfo
    [void]$Process.Start()
    $Stdout = $Process.StandardOutput.ReadToEnd()
    $Stderr = $Process.StandardError.ReadToEnd()
    $Process.WaitForExit()
    $MutationStatus = $Process.ExitCode

    "stdout:`n$Stdout"
    "stderr:`n$Stderr"
    "MUTATION_EXIT_STATUS=$MutationStatus"

    if ($MutationStatus -eq 0) {
        throw "Amended canonical test accepted latest/pnpm@latest"
    }
}
finally {
    Remove-Item -LiteralPath $FixtureRoot -Recurse -Force
}
```

Expected child exit: non-zero. Its output identifies the invalid exact-version contract.
Record the child exit status, stdout, and stderr in the Task 2 report, then run:

```bash
git diff --check
git status --short
```

Expected: no mutation remains beyond the intentional uncommitted fix files.

- [ ] **Step 4: Harden the pin script before any write**

```js
// scripts/pin-toolchain.mjs
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const EXACT_STABLE_SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function resolvePnpmVersion() {
  const npmExecPath = process.env.npm_execpath;

  if (npmExecPath) {
    return execFileSync(process.execPath, [npmExecPath, '--version'], {
      encoding: 'utf8',
      shell: false,
    }).trim();
  }

  if (process.platform === 'win32') {
    const commandProcessor = process.env.ComSpec ?? 'cmd.exe';

    return execFileSync(
      commandProcessor,
      ['/d', '/s', '/c', 'corepack pnpm --version'],
      {
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
      },
    ).trim();
  }

  return execFileSync('corepack', ['pnpm', '--version'], {
    encoding: 'utf8',
    shell: false,
  }).trim();
}

const nodeVersion = process.versions.node;
if (!nodeVersion.startsWith('24.')) {
  throw new Error(`Expected Node.js 24.x, observed ${nodeVersion}`);
}

const pnpmVersion = resolvePnpmVersion();
if (!EXACT_STABLE_SEMVER.test(pnpmVersion)) {
  throw new Error(
    `Expected an exact stable pnpm version (major.minor.patch), observed ${JSON.stringify(pnpmVersion)}`,
  );
}

await writeFile('.node-version', `${nodeVersion}\n`);
await writeFile('.pnpm-version', `${pnpmVersion}\n`);

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
packageJson.engines = { node: '>=24 <25' };
packageJson.packageManager = `pnpm@${pnpmVersion}`;
await writeFile('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
```

The `npm_execpath` branch is preferred inside a pnpm lifecycle. Outside a lifecycle, Windows
uses the explicitly selected command processor with the fixed internal literal
`corepack pnpm --version`; Linux invokes `corepack` directly. Every Node subprocess keeps
`shell: false`. Spawn errors, non-zero exits, empty output, and output that does not match
`EXACT_STABLE_SEMVER` are fatal. The exact-version check occurs before `.node-version`,
`.pnpm-version`, or `package.json` is written.

Do not use `shell: true`, `execSync`, direct `corepack.cmd` execution, a PowerShell-only
command, a pnpm-lifecycle requirement, or an assumed or hard-coded pnpm version. Do not
interpolate environment values, paths, user input, or package metadata into the fixed command
after `/c`. Do not derive the active version from `.pnpm-version`,
`package.json.packageManager`, the lockfile, a package range, or a registry tag.

Rerun the invalid-output regression:

```powershell
node --test --test-name-pattern="pin script rejects a non-exact pnpm version before writing files" scripts/toolchain.test.mjs
```

Expected: exit `0`; the child invocation fails for the exact-version contract and all three
fixture files retain their original bytes.

- [ ] **Step 5: Create the root workspace files and pin the active approved versions**

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
pnpm add -Dw --save-exact typescript zod vitest eslint @eslint/js typescript-eslint prettier yaml tsx globals
pnpm add -Dw --save-exact @types/node@24.13.3
```

The approved Node runtime is `24.18.0`, and the direct Node typings declaration must be the
literal exact version:

```json
{
  "devDependencies": {
    "@types/node": "24.13.3"
  }
}
```

When correcting an existing strict catalog, first change its `@types/node` value from 26.1.1
to 24.13.3 so the exact `pnpm add` command is accepted. If pnpm retains a `catalog:` reference
in `package.json`, replace only that direct reference with the literal `24.13.3`, then run:

```bash
pnpm install --lockfile-only
```

Allow `cleanupUnusedCatalogs: true` to remove the now-unused `@types/node` catalog entry. Do
not weaken `catalogMode: strict`. The root importer in `pnpm-lock.yaml` must record both
`specifier: 24.13.3` and `version: 24.13.3`. The commands and final edits must update both
`package.json` and `pnpm-lock.yaml`; no `latest`, range, prerelease, metadata, or Node 26
typings declaration is committed. Do not claim that `@types/node@24.13.3` models every API
added through Node 24.18.0; the purpose is to prevent Node 26-only APIs from being accepted
for the pinned Node 24 runtime.

- [ ] **Step 6: Write the toolchain ADR and verify consistency**

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
node scripts/pin-toolchain.mjs
node --test scripts/toolchain.test.mjs
pnpm install --frozen-lockfile
git diff --check
```

Expected: all commands exit `0`.

On Windows, also verify the actual direct command outside a pnpm lifecycle:

```powershell
$SavedNpmExecPath = $env:npm_execpath

try {
    Remove-Item Env:npm_execpath -ErrorAction SilentlyContinue
    node scripts/pin-toolchain.mjs

    if ($LASTEXITCODE -ne 0) {
        throw "Direct pin-toolchain invocation failed"
    }
}
finally {
    if ($null -ne $SavedNpmExecPath) {
        $env:npm_execpath = $SavedNpmExecPath
    }
}

node --test scripts/toolchain.test.mjs
pnpm install --frozen-lockfile
git diff --check
```

Expected: the direct invocation and all final verification commands exit `0`. The temporary
regressions write only inside their temporary directories; they never rewrite the repository's
real pin files or `package.json`.

Confirm and record:

```text
.node-version                 = 24.18.0
.pnpm-version                 = the independently observed active exact pnpm version
packageManager                = pnpm@<same independently observed active exact version>
devDependencies.@types/node   = 24.13.3
lockfile direct resolution    = 24.13.3
```

The direct invocation regression with every case variant of `npm_execpath` removed must remain
passing. Record the non-Windows fallback honestly as:

```text
Implemented and statically reviewed, but not executed in this Windows workspace
```

Do not call the Linux branch passed, failed, verified, or passing here. Its execution remains a
mandatory Release 0 requirement for the Linux job in WP-09 cross-platform CI.

- [ ] **Step 7: Commit**

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
- Create: `scripts/wp-00-01-gate.integration.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: all WP-00–01 root commands and policy tests
- Produces: `pnpm verify:wp-00-01` and a clean evidence report for the next work package

The `.integration.mjs` suffix is intentional so the direct gate test cannot match
`scripts/*.test.mjs` on any supported platform. Do not replace this finite execution design
with an environment-variable recursion guard, recursion-depth counter, timeout, conditional
test skipping, weakened gate assertion, omitted bootstrap tests, or a warning in place of a
failing verifier.

- [ ] **Step 1: Write the failing gate test**

```js
// scripts/wp-00-01-gate.integration.mjs
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
node --test scripts/wp-00-01-gate.integration.mjs
```

Expected: non-zero exit because `scripts/verify-wp-00-01.mjs` does not yet exist.

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
    "test:wp-00-01-gate": "node --test scripts/wp-00-01-gate.integration.mjs",
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
pnpm test:wp-00-01-gate
pnpm verify:templates
pnpm verify:release
```

On Windows, use PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
pnpm install --frozen-lockfile
pnpm verify:wp-00-01
pnpm test:wp-00-01-gate
pnpm verify:templates
pnpm verify:release
```

Expected: installation, `verify:wp-00-01`, and `test:wp-00-01-gate` exit `0`.
`verify:templates` and `verify:release` each exit `2`.

- [ ] **Step 5: Review and commit**

```bash
git status --short
git diff --check
git add scripts/verify-wp-00-01.mjs scripts/wp-00-01-gate.integration.mjs package.json
git commit -m "test: add bootstrap governance gate"
```

WP-00–01 exit evidence must include the exact Node and pnpm versions, fresh-install result,
`pnpm verify:wp-00-01`, `pnpm test:wp-00-01-gate`, and confirmation that
`verify:templates` and `verify:release` still fail closed with exit `2` until their owning work
packages replace them.
