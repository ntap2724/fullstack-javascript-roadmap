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
- Create: `.prettierignore`
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `eslint.config.mjs`
- Create: `prettier.config.mjs`
- Create: `vitest.config.ts`
- Create: `scripts/config-contract.test.mjs`
- Modify: `package.json`
- Modify (Prettier-only): `scripts/pin-toolchain.mjs`
- Modify (Prettier plus the exact YAML-indentation regex normalization authorized below):
  `scripts/toolchain.test.mjs`
- Modify only if the direct `globals` dependency is missing: `pnpm-workspace.yaml`
- Modify only if the direct `globals` dependency is missing: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: exact dependencies from Task 2
- Produces: root `check`, `test`, and `test:bootstrap` scripts used by every later plan; strict typed linting for TypeScript; untyped JavaScript linting whose ESM and CommonJS globals remain distinct

For the resumed Task 3 execution, preserve the pre-amendment RED evidence before changing
`.prettierignore` or `eslint.config.mjs`:

```bash
pnpm format:check
pnpm lint
```

Expected:

```text
pnpm format:check
└── exit 1 on the nine canonical plan/specification files, pnpm-lock.yaml,
    scripts/pin-toolchain.mjs, and scripts/toolchain.test.mjs

pnpm lint
└── exit 2 because @typescript-eslint/await-thenable requires type
    information while linting eslint.config.mjs
```

Record each command, exit status, stdout, and stderr in the Task 3 report. These failures are
the known configuration defects; do not turn them into warnings.

After the first Task 3 plan amendment was applied but before this second amendment, preserve
this additional evidence:

```text
node --test scripts/config-contract.test.mjs
└── exit 0, 8/8 passing

pnpm lint
└── exit 1 with exactly five errors:
    ├── three core no-regex-spaces reports on YAML-indentation regex literals
    └── two @typescript-eslint/no-dynamic-delete reports in Task 2's approved
        case-insensitive npm_execpath cleanup
```

The existing MJS and CJS `require` distinction passed in that 8/8 run and must remain
passing. The second amendment removes the structural source of the two TypeScript-rule
errors without suppressing either rule.

- [ ] **Step 1: Write the failing configuration contract test**

```js
// scripts/config-contract.test.mjs
import { ESLint } from 'eslint';
import { readFile } from 'node:fs/promises';
import { getFileInfo } from 'prettier';
import test from 'node:test';
import assert from 'node:assert/strict';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const eslint = new ESLint({ cwd: process.cwd() });

function severityOf(ruleSetting) {
  if (Array.isArray(ruleSetting)) return ruleSetting[0];
  return ruleSetting ?? 0;
}

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
  assert.equal(packageJson.scripts['test:bootstrap'], 'node --test scripts/*.test.mjs');
});

test('Prettier ownership excludes only canonical governance docs and the root lockfile', async () => {
  const cases = [
    ['docs/superpowers/specs/2026-07-26-fullstack-javascript-roadmap-design.md', true],
    ['docs/superpowers/plans/2026-07-26-wp-00-01-bootstrap-governance.md', true],
    ['pnpm-lock.yaml', true],
    ['scripts/pin-toolchain.mjs', false],
    ['scripts/toolchain.test.mjs', false],
    ['eslint.config.mjs', false],
  ];

  for (const [filePath, expectedIgnored] of cases) {
    const info = await getFileInfo(filePath, {
      ignorePath: '.prettierignore',
    });
    assert.equal(info.ignored, expectedIgnored, filePath);
  }
});

test('globals is a direct dependency with exact catalog and lock resolution', async () => {
  const packageJson = await readJson('package.json');
  const workspace = await readFile('pnpm-workspace.yaml', 'utf8');
  const lockfile = await readFile('pnpm-lock.yaml', 'utf8');

  assert.equal(packageJson.devDependencies?.globals, 'catalog:');
  assert.match(workspace, /^  globals: 17\.7\.0$/m);
  assert.match(
    lockfile,
    /importers:\r?\n\r?\n  \.:[\s\S]*?\n      globals:\r?\n        specifier: 'catalog:'\r?\n        version: 17\.7\.0(?:\r?\n|$)/,
  );
});

test('TypeScript keeps type-aware linting without CommonJS globals', async () => {
  const config = await eslint.calculateConfigForFile('vitest.config.ts');

  assert.equal(config.languageOptions.parserOptions.projectService, true);
  assert.equal(config.rules['@typescript-eslint/await-thenable'][0], 2);
  assert.equal(config.languageOptions.globals.require, undefined);
});

test('MJS and CJS lint without project-information parser failures', async () => {
  const [mjsResult] = await eslint.lintText('void 0;\n', {
    filePath: 'scripts/config-contract-fixture.mjs',
  });
  const [cjsResult] = await eslint.lintText('void 0;\n', {
    filePath: 'scripts/config-contract-fixture.cjs',
  });

  assert.equal(mjsResult.fatalErrorCount, 0);
  assert.equal(cjsResult.fatalErrorCount, 0);

  const mjsConfig = await eslint.calculateConfigForFile(
    'scripts/config-contract-fixture.mjs',
  );
  const cjsConfig = await eslint.calculateConfigForFile(
    'scripts/config-contract-fixture.cjs',
  );

  assert.equal(mjsConfig.languageOptions.parserOptions.projectService, false);
  assert.equal(cjsConfig.languageOptions.parserOptions.projectService, false);
});

test('strict TypeScript rules stop at the untyped JavaScript boundary', async () => {
  const [typescriptConfig, mjsConfig, cjsConfig] = await Promise.all([
    eslint.calculateConfigForFile('vitest.config.ts'),
    eslint.calculateConfigForFile('scripts/pin-toolchain.mjs'),
    eslint.calculateConfigForFile('scripts/config-contract-fixture.cjs'),
  ]);

  assert.equal(
    severityOf(typescriptConfig.rules['@typescript-eslint/no-dynamic-delete']),
    2,
  );
  assert.equal(severityOf(mjsConfig.rules['@typescript-eslint/no-dynamic-delete']), 0);
  assert.equal(severityOf(cjsConfig.rules['@typescript-eslint/no-dynamic-delete']), 0);
  assert.equal(severityOf(mjsConfig.rules['no-regex-spaces']), 2);
});

test('require is undefined in MJS and defined in CJS', async () => {
  const source = "require('node:fs');\n";
  const [mjsResult] = await eslint.lintText(source, {
    filePath: 'scripts/config-contract-fixture.mjs',
  });
  const [cjsResult] = await eslint.lintText(source, {
    filePath: 'scripts/config-contract-fixture.cjs',
  });

  const mjsRequireErrors = mjsResult.messages.filter(
    (message) => message.ruleId === 'no-undef' && message.message.includes("'require'"),
  );
  const cjsRequireErrors = cjsResult.messages.filter(
    (message) => message.ruleId === 'no-undef' && message.message.includes("'require'"),
  );

  assert.equal(mjsRequireErrors.length, 1);
  assert.equal(cjsRequireErrors.length, 0);
});
```

- [ ] **Step 2: Run the focused tests and verify the amended contract is RED**

```bash
node --test scripts/config-contract.test.mjs
```

Expected in the resumed Task 3 execution: non-zero exit with nine tests discovered. The new
rule-boundary test must fail specifically because
`@typescript-eslint/no-dynamic-delete` is still effective for an MJS or CJS path while
`strictTypeChecked` remains global. The other eight tests must preserve their prior passing
state. Record the exact command, exit status, relevant assertion failure, and observed count.
The failure must not come from a syntax error or invalid fixture.

- [ ] **Step 3: Establish the formatter ownership boundary and strict compiler configuration**

Create the root-anchored ignore file exactly:

```text
/docs/superpowers/
/pnpm-lock.yaml
```

The leading `/` characters are required. `docs/superpowers/` is excluded because approved
design and implementation-plan documents must not be reformatted incidentally; it remains
subject to placeholder, fence-balance, link, schema, and review checks. `pnpm-lock.yaml` is
excluded because pnpm owns its generated serialization. Do not add broader Markdown, YAML,
docs, or scripts patterns, and do not exclude either Task 2 script.

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

- [ ] **Step 4: Add typed TypeScript and separate untyped ESM/CommonJS lint configuration**

```js
// eslint.config.mjs
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/.generated/**', '**/.tmp/**'] },
  eslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin,
      },
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
  {
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.nodeBuiltin,
      },
    },
  },
  {
    files: ['**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
);
```

The TypeScript block owns `strictTypeChecked`; do not spread or extend that configuration
globally. TypeScript and TSX retain strict type-checked rules with project information.
JavaScript, MJS, and CJS retain core ESLint correctness rules without type-aware linting.
The approved MJS and CJS `disableTypeChecked` overrides remain explicit, as do
`globals.nodeBuiltin` for MJS and `globals.node` for CJS.

Do not add a rule-specific waiver for `@typescript-eslint/no-dynamic-delete`, disable
`no-regex-spaces`, use a combined `**/*.{js,mjs,cjs}` override, disable `no-undef`, add
JavaScript to the TypeScript project, enable `allowJs` solely for linting, or grant CommonJS
globals to ESM files.

The current repository contains no first-party `.js` files, so Task 3 adds no repository-wide
`.js` override. If a later package adds `.js`, its package-scoped configuration must use
`globals.nodeBuiltin` when that package has `"type": "module"` and `globals.node` only when it
has `"type": "commonjs"`.

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

- [ ] **Step 5: Prove the structural lint boundary and normalize only the affected regexes**

After applying the Step 4 configuration, run:

```bash
node --test scripts/config-contract.test.mjs
pnpm lint
```

Expected intermediate evidence:

```text
node --test scripts/config-contract.test.mjs
└── exit 0, 9/9 passing

pnpm lint
└── exit 1 with exactly three no-regex-spaces errors:
    ├── two in scripts/config-contract.test.mjs
    └── one in scripts/toolchain.test.mjs
```

The TypeScript rule-scope regression and the MJS/CommonJS global-distinction regression must
both pass. If lint reports any different remaining set, stop and diagnose it rather than
broadening this amendment.

Before changing the Task 2 test regex, run:

```bash
node --test scripts/toolchain.test.mjs
```

Expected: 7/7 passing. Then preserve core `no-regex-spaces` and change only the spelling of
the three affected YAML-indentation regex literals:

```js
// scripts/config-contract.test.mjs
assert.match(workspace, /^ {2}globals: 17\.7\.0$/m);
assert.match(
  lockfile,
  /importers:\r?\n\r?\n {2}\.:[\s\S]*?\n {6}globals:\r?\n {8}specifier: 'catalog:'\r?\n {8}version: 17\.7\.0(?:\r?\n|$)/,
);

// scripts/toolchain.test.mjs
assert.match(
  lockfile,
  /importers:\r?\n\r?\n {2}\.:[\s\S]*?\n {6}'@types\/node':\r?\n {8}specifier: 24\.13\.3\r?\n {8}version: 24\.13\.3(?:\r?\n|$)/,
);
```

These are exact semantic-preserving transformations:

```text
two literal ASCII spaces   → one literal ASCII space followed by {2}
six literal ASCII spaces   → one literal ASCII space followed by {6}
eight literal ASCII spaces → one literal ASCII space followed by {8}
```

Do not change anchors, groups, alternatives, escapes, surrounding text, flags, or expected
match widths. Do not use `\s`, `\s+`, `\s{N}`, tabs, or a broader character class. This
regex normalization is the only authorized non-Prettier Task 2 source change in Task 3.
Do not refactor Task 2 implementation or assertions.

Rerun:

```bash
node --test scripts/toolchain.test.mjs
```

Expected: the same 7/7 behavioral assertions pass after the representation-only change.

- [ ] **Step 6: Confirm the exact direct globals dependency, add root scripts, and format owned source**

Task 2 already declares `globals` directly in the root `devDependencies` through the strict
default catalog, whose exact value and root-lock resolution are both 17.7.0. Preserve that
direct declaration and record the three assertions from Step 1. Do not churn the dependency
graph merely to replace an already-direct exact catalog dependency.

If this task is re-executed in a state where `package.json.devDependencies.globals` is absent,
add it with:

```bash
pnpm add -Dw --save-exact globals@17.7.0
```

In that case, commit the resulting `package.json`, `pnpm-workspace.yaml`, and
`pnpm-lock.yaml` changes and require the final root importer to resolve 17.7.0. Never rely on
a transitive copy.

Set these scripts in `package.json`:

```json
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint .",
    "typecheck": "tsc --project tsconfig.json",
    "check": "node scripts/run-pipeline.mjs format:check lint typecheck",
    "test": "node --test scripts/*.test.mjs",
    "test:bootstrap": "node --test scripts/*.test.mjs"
  }
}
```

Task 4 creates `run-pipeline.mjs`; do not run `pnpm check` before Task 4. Format all
Prettier-owned source:

```bash
pnpm format
```

Expected: canonical files under `docs/superpowers/` and the generated root lockfile remain
unchanged by Prettier, while both Task 2 scripts remain formatter-covered.
`scripts/pin-toolchain.mjs` receives formatting-only changes.
`scripts/toolchain.test.mjs` receives formatting plus only the exact regex spelling change
from Step 5. Inspect their diff and do not mix in behavioral refactoring or remove an
assertion.

- [ ] **Step 7: Run focused and full GREEN verification**

Run the focused configuration tests first, then the complete verification sequence:

```bash
node --test scripts/config-contract.test.mjs
pnpm format:check
pnpm lint
pnpm typecheck
node --test scripts/toolchain.test.mjs
node scripts/pin-toolchain.mjs
node --test scripts/toolchain.test.mjs
pnpm test:bootstrap
pnpm install --frozen-lockfile
git diff --check
```

Expected: every command exits `0` with no formatter or linter warnings. The focused Task 3
file has 9/9 passing tests. The Task 2 toolchain tests pass 7/7 before and after the direct pin
invocation. The bootstrap count changes from the prior 9/9 baseline to 18/18 because Task 3
adds nine `scripts/*.test.mjs` tests. Record the actual observed counts rather than reusing a
stale expectation, and include:

```text
Focused Task 3 configuration tests   <observed>/<observed>
Task 2 toolchain tests before pin     <observed>/<observed>
Task 2 toolchain tests after pin      <observed>/<observed>
Bootstrap tests                       <observed>/<observed>
Direct pin invocation                 exit 0
Frozen install                        exit 0
Formatter check                       exit 0
Lint                                  exit 0
Typecheck                             exit 0
Git whitespace check                  exit 0
```

Preserve this full evidence trail in the report:

```text
Before first Task 3 amendment
├── format:check failed on canonical docs, lockfile, and Task 2 scripts
└── lint failed from typed parser requirements on MJS

After first Task 3 amendment
├── focused configuration tests passed 8/8
└── lint failed with exactly five remaining rule errors

After second Task 3 amendment
├── strict TypeScript rules apply only to TS/TSX
├── JavaScript rule scopes are finite and explicit
├── exact YAML-indentation regexes satisfy no-regex-spaces
└── all required final commands exit 0
```

The Task 3 reviewer must inspect the Task 2 script diff and confirm that the pin script has
only Prettier changes, the toolchain test has only Prettier changes plus the exact
literal-space spelling change, and no intended behavior or assertion was removed. Treat any
of these as Important:

- `strictTypeChecked` affects MJS, CJS, or ordinary JavaScript
- TypeScript no longer receives strict type-checked linting
- `no-regex-spaces` is disabled or downgraded
- a broad JavaScript rule waiver is introduced
- an `.mjs` file receives CommonJS globals
- a CJS file loses its CommonJS globals
- a source script becomes excluded from Prettier
- a Task 2 regex changes matching semantics
- Task 2 receives any additional non-Prettier behavioral change
- Task 2 focused verification is not rerun
- the canonical plan, generated brief, implementation, and report disagree

- [ ] **Step 8: Commit**

```bash
git add .prettierignore tsconfig.base.json tsconfig.json eslint.config.mjs prettier.config.mjs vitest.config.ts scripts/config-contract.test.mjs scripts/pin-toolchain.mjs scripts/toolchain.test.mjs package.json
# Only when Step 6 had to add the missing direct dependency:
git add pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "build: add strict repository checks"
```

### Task 4: Implement the fail-closed root pipeline and public command contract

**Files:**
- Create: `scripts/run-pipeline.mjs`
- Create: `scripts/run-pipeline.test.mjs`
- Create: `scripts/unavailable-command.mjs`
- Modify: `.prettierignore`
- Modify: `scripts/config-contract.test.mjs`
- Modify: `package.json`
- Update in ignored SDD state: `.superpowers/sdd/2026-07-26-wp-00-01-bootstrap-governance/task-4-report.md`
- Update in ignored SDD state: `.superpowers/sdd/2026-07-26-wp-00-01-bootstrap-governance/progress.md`

**Interfaces:**
- Consumes: named npm scripts from `package.json`
- Produces: `runPipeline(scriptNames): Promise<void>` and the stable root public commands
- Preserves: source files remain formatter-owned while the repository-root `.superpowers/`
  generated SDD workspace is outside Prettier ownership

The original Task 4 implementation commit is:

```text
c521e38
```

Do not amend, squash, or rewrite it. The following human-approved continuation adds a
plan-amendment commit and an implementation-fix commit on top of the existing history.

The root formatter ownership boundary is exactly:

```text
/docs/superpowers/
/pnpm-lock.yaml
/.superpowers/
```

The three root-anchored entries have distinct meanings:

```text
/docs/superpowers/
└── Canonical plans and specifications that must not be reformatted
    incidentally by implementation tasks

/pnpm-lock.yaml
└── Root generated lockfile whose formatting is owned by pnpm

/.superpowers/
└── Root-local generated SDD execution state, including briefs, reports,
    ledgers, review packages, and temporary evidence
```

Do not broaden these patterns to `docs/`, `.superpowers`, `**/.superpowers/`, `*.md`, or
`scripts/`. Do not move the SDD workspace, change Git ignore policy, reformat generated
evidence, remove `format:check` from `pnpm verify`, turn formatter failures into warnings,
or add an environment-dependent bypass. Canonical `docs/superpowers/` documents and the
generated root `pnpm-lock.yaml` remain outside Prettier ownership for their existing
reasons; source scripts and configuration remain formatter-owned.

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

- [ ] **Step 7: Commit the human-approved canonical plan correction separately**

Before changing `.prettierignore`, commit only this canonical plan correction:

```bash
git add docs/superpowers/plans/2026-07-26-wp-00-01-bootstrap-governance.md
git commit -m "docs: exclude SDD workspace from Task 4 formatting"
```

Record the exact plan-amendment commit hash in the ignored Task 4 report and ledger, then
regenerate the Task 4 brief. The ledger must contain an entry equivalent to:

```text
Task 4: human-approved plan amendment — the repository-root .superpowers
directory is generated, Git-ignored SDD execution state and is outside
Prettier ownership; canonical docs and source-code ownership boundaries
remain unchanged
```

Do not force-add the ignored report, ledger, brief, or any other `.superpowers/` content.

- [ ] **Step 8: Extend the behavioral Prettier ownership regression before the fix**

Extend the existing Prettier ownership test in `scripts/config-contract.test.mjs`; do not
add a plain-text comparison of `.prettierignore`. Import the additional helpers:

```js
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
```

Replace the existing Prettier ownership test with behavior equivalent to:

```js
test('Prettier ownership excludes only root governance and generated-state boundaries', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join('.superpowers', 'sdd', 'prettier-regression-'),
  );
  const generatedArtifact = path.join(
    temporaryDirectory,
    `generated-${randomUUID()}.md`,
  );

  try {
    await writeFile(generatedArtifact, '# generated Prettier regression artifact\n');

    const cases = [
      [
        'docs/superpowers/specs/2026-07-26-fullstack-javascript-roadmap-design.md',
        true,
      ],
      [
        'docs/superpowers/plans/2026-07-26-wp-00-01-bootstrap-governance.md',
        true,
      ],
      ['pnpm-lock.yaml', true],
      [generatedArtifact, true],
      ['scripts/pin-toolchain.mjs', false],
      ['scripts/toolchain.test.mjs', false],
      ['eslint.config.mjs', false],
    ];

    for (const [filePath, expectedIgnored] of cases) {
      const info = await getFileInfo(filePath, {
        ignorePath: path.resolve('.prettierignore'),
      });
      assert.equal(info.ignored, expectedIgnored, filePath);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
```

This creates and removes only its uniquely named temporary directory and generated file
under the root `.superpowers/sdd/` workspace. It must not open, rewrite, or delete an
existing brief, report, ledger, review package, or evidence artifact.

- [ ] **Step 9: Run the focused regression and preserve RED evidence**

Before adding `/.superpowers/`, run:

```bash
node --test scripts/config-contract.test.mjs
```

Expected: non-zero exit caused by the generated root `.superpowers` artifact reporting
`ignored === false` when the assertion requires `true`. Record the exact command, exit
status, actual test count, relevant failure message, generated temporary path, and
confirmation that the temporary directory was removed in `finally`. The failure must not
come from a syntax error or missing dependency.

Also preserve the existing pre-fix evidence:

```text
pnpm verify
└── exit 1 because a generated, Git-ignored Task 4 brief is formatter-owned
```

Do not reformat the Task 4 brief to make this command green.

- [ ] **Step 10: Add the minimal root formatter boundary**

Add exactly this third line to the root `.prettierignore`:

```text
/.superpowers/
```

The resulting file must be:

```text
/docs/superpowers/
/pnpm-lock.yaml
/.superpowers/
```

Do not modify existing SDD artifacts merely to satisfy formatting.

- [ ] **Step 11: Correct unavailable-command evidence with current replays**

Run these commands separately:

```bash
pnpm verify:templates
pnpm verify:release
```

Each command must exit `2`. For each, append the exact command, exit status, current
stdout, and current stderr to the Task 4 report. If the original channel-separated output
was not retained, label the evidence exactly:

```text
current replay evidence; original historical channel-separated capture unavailable
```

Remove or explicitly correct the inaccurate exit-`1` claims. Do not call either command
successful or passing. Use the Task 4 contract already defined above:

```text
Command executed as designed and returned the intentional unavailable or
not-yet-implemented status 2
```

A fresh replay does not replace or reinterpret a historical capture.

- [ ] **Step 12: Run complete GREEN verification**

Run the focused ownership test first, followed by the complete Task 4 verification:

```bash
node --test scripts/config-contract.test.mjs
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:bootstrap
pnpm verify
pnpm verify:templates
pnpm verify:release
git diff --check
```

Expected: the focused test, formatting, lint, typecheck, bootstrap tests, full verifier,
and `git diff --check` exit `0`; `verify:templates` and `verify:release` each execute as
designed and exit `2`. Record actual test counts rather than carrying forward earlier
counts without verification.

Also confirm:

- no existing SDD artifact was reformatted;
- no `.superpowers/` content became tracked;
- source scripts and `eslint.config.mjs` remain formatter-owned through the behavioral
  assertions;
- the worktree contains no unintended tracked changes; and
- Task 2 focused tests remain passing if Task 2-owned source or configuration changed.

- [ ] **Step 13: Commit the implementation fix separately**

After GREEN verification:

```bash
git add .prettierignore scripts/config-contract.test.mjs
git commit -m "chore: exclude SDD scratch from formatting"
```

Do not include ignored Task 4 evidence in the commit, and do not amend `c521e38`.

- [ ] **Step 14: Finish the Task 4 report and scoped independent re-review**

Append the fix-round evidence to the existing ignored Task 4 report with these clearly
separated sections:

```text
Original Task 4 implementation evidence
Pre-fix formatter failure
Human-approved plan amendment
Regression RED evidence
Configuration GREEN evidence
Fresh unavailable-command exit evidence
```

Include the plan-amendment and implementation-fix hashes, exact commands, exit statuses,
actual test counts, relevant stdout and stderr, generated temporary path, cleanup
confirmation, and remaining limitations. Do not claim that the canonical plan was
unmodified, that either unavailable command passed, or that a non-zero status is success.

Dispatch an independent scoped re-review after the evidence is complete. The reviewer must
verify:

1. `/.superpowers/` is root-anchored and excludes only the root SDD execution workspace.
2. Source scripts remain formatter-covered.
3. The regression exercises Prettier's actual ignore behavior and does not use existing SDD
   artifacts as disposable fixtures.
4. RED evidence predates the ignore change.
5. `pnpm verify` exits `0`.
6. `verify:templates` and `verify:release` are each accurately reported as exit `2`, and
   neither non-zero result is mislabeled as passing.
7. The inaccurate report statements are corrected.
8. No tracked source or implementation behavior changed outside this approved Task 4
   amendment.

Treat a broad `**/.superpowers/` exclusion, formatter-ignored source scripts, rewritten
existing SDD evidence, an exit-`2` result reported as exit `0`, removal of formatting from
the root verification pipeline, or missing behavioral regression coverage as Important.
Task 4 is complete only when the scoped reviewer reports both specification compliance and
task quality with no open Critical or Important findings.

- [ ] **Step 15: Amend the canonical plan for a self-contained SDD fixture**

The first independent Task 4 review found that the Step 8 fixture calls `mkdtemp()` beneath
`.superpowers/sdd/` and therefore passes only when an active SDD controller has already
created those ignored parent directories. A clean checkout may contain neither
`.superpowers/` nor `.superpowers/sdd/`; root verification must not depend on controller
state.

Commit only this second canonical Task 4 correction:

```bash
git add docs/superpowers/plans/2026-07-26-wp-00-01-bootstrap-governance.md
git commit -m "docs: make Task 4 SDD fixture self-contained"
```

Record the exact commit hash in the ignored Task 4 report and ledger, then regenerate the
Task 4 brief. The ledger must contain an entry equivalent to:

```text
Task 4: human-approved fix-round amendment — configuration tests must create
their own missing root .superpowers/sdd fixture parents, track directory
ownership, and remove only test-owned directories when empty; clean-checkout
behavior must have permanent regression coverage
```

The fixture may create only `<root>/.superpowers`, `<root>/.superpowers/sdd`, and its own
uniquely named temporary child. It must track which parents it created, remove only
test-owned parents when they remain empty, and never recursively remove `.superpowers` or
`.superpowers/sdd`. Existing briefs, reports, ledgers, review packages, and other SDD
artifacts remain untouched. Do not amend or rewrite `c521e38`, `4b2e46a`, or `2823b76`.
Do not force-add ignored execution state or change ignore policy.

- [ ] **Step 16: Extract the current fixture behavior without changing semantics**

Before adding the missing-parent regression, refactor the direct `mkdtemp()` setup in
`scripts/config-contract.test.mjs` into a test-only helper. The initial extraction must
preserve the current assumption that `.superpowers/sdd/` already exists:

```js
async function withTemporarySddArtifact(rootDirectory, prefix, callback) {
  const temporaryDirectory = await mkdtemp(
    path.join(rootDirectory, '.superpowers', 'sdd', prefix),
  );
  const generatedArtifact = path.join(
    temporaryDirectory,
    `generated-${randomUUID()}.md`,
  );

  try {
    await writeFile(generatedArtifact, '# generated Prettier regression artifact\n');
    return await callback(generatedArtifact);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
```

Apply it to the existing Prettier ownership test:

```js
test('Prettier ownership excludes only root governance and generated-state boundaries', async () => {
  await withTemporarySddArtifact(
    process.cwd(),
    'prettier-regression-',
    async (generatedArtifact) => {
      const cases = [
        [
          'docs/superpowers/specs/2026-07-26-fullstack-javascript-roadmap-design.md',
          true,
        ],
        [
          'docs/superpowers/plans/2026-07-26-wp-00-01-bootstrap-governance.md',
          true,
        ],
        ['pnpm-lock.yaml', true],
        [generatedArtifact, true],
        ['scripts/pin-toolchain.mjs', false],
        ['scripts/toolchain.test.mjs', false],
        ['eslint.config.mjs', false],
      ];

      for (const [filePath, expectedIgnored] of cases) {
        const info = await getFileInfo(filePath, {
          ignorePath: path.resolve('.prettierignore'),
        });
        assert.equal(info.ignored, expectedIgnored, filePath);
      }
    },
  );
});
```

Run:

```bash
node --test scripts/config-contract.test.mjs
```

Expected in the current SDD worktree: the existing nine focused tests still pass. This is
test-infrastructure refactoring only; do not change `.prettierignore` or production
configuration.

- [ ] **Step 17: Add the missing-parent regression and preserve RED**

Import the operating-system temporary root and the filesystem operations needed by the
permanent lifecycle regression:

```js
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  rmdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
```

Add one focused test that uses the same helper as the real Prettier ownership test:

```js
test('temporary SDD fixtures own only paths they create', async () => {
  const syntheticRoot = await mkdtemp(path.join(tmpdir(), 'roadmap-sdd-fixture-'));
  const superpowersDirectory = path.join(syntheticRoot, '.superpowers');
  const sddDirectory = path.join(superpowersDirectory, 'sdd');

  try {
    await assert.rejects(stat(superpowersDirectory), { code: 'ENOENT' });
    await assert.rejects(stat(sddDirectory), { code: 'ENOENT' });

    let generatedArtifact;

    await withTemporarySddArtifact(
      syntheticRoot,
      'missing-parents-',
      async (artifactPath) => {
        generatedArtifact = artifactPath;
        assert.equal((await stat(superpowersDirectory)).isDirectory(), true);
        assert.equal((await stat(sddDirectory)).isDirectory(), true);
        assert.equal((await stat(artifactPath)).isFile(), true);
      },
    );

    await assert.rejects(stat(generatedArtifact), { code: 'ENOENT' });
    await assert.rejects(stat(sddDirectory), { code: 'ENOENT' });
    await assert.rejects(stat(superpowersDirectory), { code: 'ENOENT' });

    let callbackFailureArtifact;

    await assert.rejects(
      withTemporarySddArtifact(
        syntheticRoot,
        'callback-failure-',
        async (artifactPath) => {
          callbackFailureArtifact = artifactPath;
          throw new Error('fixture callback failure');
        },
      ),
      /fixture callback failure/,
    );

    await assert.rejects(stat(callbackFailureArtifact), { code: 'ENOENT' });
    await assert.rejects(stat(sddDirectory), { code: 'ENOENT' });
    await assert.rejects(stat(superpowersDirectory), { code: 'ENOENT' });

    await mkdir(superpowersDirectory);
    await mkdir(sddDirectory);

    const sentinelPath = path.join(superpowersDirectory, 'sentinel.txt');
    const sentinelBytes = Buffer.from([0x00, 0x7f, 0xff, 0x0a]);
    await writeFile(sentinelPath, sentinelBytes);

    await withTemporarySddArtifact(
      syntheticRoot,
      'existing-parents-',
      async (artifactPath) => {
        assert.equal((await stat(artifactPath)).isFile(), true);
      },
    );

    assert.equal((await stat(superpowersDirectory)).isDirectory(), true);
    assert.equal((await stat(sddDirectory)).isDirectory(), true);
    assert.deepEqual(await readFile(sentinelPath), sentinelBytes);
  } finally {
    await rm(syntheticRoot, { recursive: true, force: true });
  }
});
```

Before hardening the helper, run:

```bash
node --test scripts/config-contract.test.mjs
```

Expected RED: exit `1`, ten tests total, nine passing and the new lifecycle regression
failing with `ENOENT` from `mkdtemp()` beneath the missing synthetic
`.superpowers/sdd/` parent. Record the exact command, actual count, failure output,
synthetic-root path, and confirmation that the synthetic outer root was removed by its
`finally` block. The failure must not come from imports, syntax, a missing helper, an
invalid assertion, or a changed `.prettierignore`.

- [ ] **Step 18: Harden the helper with explicit directory ownership**

Add these test-only helpers:

```js
async function ensureDirectory(directoryPath, ownedDirectories) {
  try {
    const metadata = await stat(directoryPath);

    if (!metadata.isDirectory()) {
      throw new Error(`Expected a directory at ${directoryPath}`);
    }

    return;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  try {
    await mkdir(directoryPath);
    ownedDirectories.push(directoryPath);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;

    const metadata = await stat(directoryPath);

    if (!metadata.isDirectory()) {
      throw new Error(`Expected a directory at ${directoryPath}`);
    }
  }
}

async function removeOwnedDirectoryIfEmpty(directoryPath) {
  try {
    await rmdir(directoryPath);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTEMPTY') return;
    throw error;
  }
}
```

Then replace the extracted helper with:

```js
async function withTemporarySddArtifact(rootDirectory, prefix, callback) {
  const superpowersDirectory = path.join(rootDirectory, '.superpowers');
  const sddDirectory = path.join(superpowersDirectory, 'sdd');
  const ownedDirectories = [];
  let temporaryDirectory;

  try {
    await ensureDirectory(superpowersDirectory, ownedDirectories);
    await ensureDirectory(sddDirectory, ownedDirectories);

    temporaryDirectory = await mkdtemp(path.join(sddDirectory, prefix));

    const generatedArtifact = path.join(
      temporaryDirectory,
      `generated-${randomUUID()}.md`,
    );
    await writeFile(generatedArtifact, '# generated Prettier regression artifact\n');

    return await callback(generatedArtifact);
  } finally {
    if (temporaryDirectory !== undefined) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }

    for (let index = ownedDirectories.length - 1; index >= 0; index -= 1) {
      await removeOwnedDirectoryIfEmpty(ownedDirectories[index]);
    }
  }
}
```

The two required parents are checked and created in order. A parent is recorded only after
successful creation by this invocation. A competing `EEXIST` is verified as a directory
but never claimed. Cleanup recursively removes only the unique `mkdtemp()` child, then
considers owned parents in reverse order with non-recursive `rmdir()`. Only `ENOENT` and
`ENOTEMPTY` are non-fatal during parent cleanup; all other filesystem errors propagate.
A directory not created by the current helper invocation is never removed.

- [ ] **Step 19: Run focused GREEN and the complete Task 4 verification**

Run:

```bash
node --test scripts/config-contract.test.mjs
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:bootstrap
pnpm verify
pnpm verify:templates
pnpm verify:release
git diff --check
git status --short
```

Expected: focused configuration tests pass 10/10; bootstrap and full verification pass
22/22; format, lint, typecheck, bootstrap, full verifier, and `git diff --check` exit `0`;
both unavailable verifiers execute as designed and exit `2`. Actual runner counts govern:
record and explain any difference rather than reporting expectations as observations.

Confirm that:

- the synthetic outer root and every unique test child are absent after their tests;
- no repository-root temporary fixture remains;
- no real brief, report, ledger, review package, or other SDD artifact was removed;
- no `.superpowers/` artifact became tracked;
- the tracked worktree contains only `scripts/config-contract.test.mjs` before commit; and
- the previous report hash
  `ec55c8b68b6a0af4391697fe2bc37c0407c937cbac0e4b13d17e523aae91a28b`
  is identified only as the pre-fix report hash.

- [ ] **Step 20: Commit the self-contained fixture fix separately**

After GREEN verification:

```bash
git add scripts/config-contract.test.mjs
git commit -m "test: make Task 4 SDD fixture self-contained"
```

Do not amend `c521e38`, `4b2e46a`, `2823b76`, or the new plan-amendment commit. Do not
include ignored Task 4 evidence, `.prettierignore`, production configuration, unrelated
formatting, or unrelated refactoring.

- [ ] **Step 21: Append fix-round evidence and run a scoped independent re-review**

Append fix-round 1 evidence to the ignored Task 4 report, clearly distinguishing:

```text
Original Task 4 implementation
First formatter-ownership amendment
Independent clean-checkout finding
Self-contained fixture plan amendment
Missing-parent RED
Ownership-aware helper GREEN
Final verification
```

Include the existing Task 4 implementation commit `c521e38`, the new plan-amendment and
implementation-fix hashes, exact commands and exit statuses, actual counts, RED `ENOENT`
output, GREEN output, cleanup assertions, remaining limitations, and the new report
SHA-256. Append matching progress evidence to the ignored ledger.

Generate the scoped fix diff from the head seen by the failed review (`2823b76`) through
the fix head. The independent re-review must verify:

1. The real Prettier test no longer assumes `.superpowers/sdd` exists.
2. The focused regression begins with both parents absent and preserves the genuine
   pre-fix `ENOENT`.
3. The helper creates only `<root>/.superpowers`, `<root>/.superpowers/sdd`, and its own
   unique child.
4. Directory ownership is explicit and recorded only after successful creation.
5. The temporary child is removed first; owned parents are considered in reverse order.
6. Existing parents are never removed, and sentinel bytes remain identical.
7. `.superpowers` and `sdd` are never recursively removed.
8. Cleanup runs on success and callback failure.
9. `ENOENT` and `ENOTEMPTY` alone are tolerated during parent cleanup; unexpected errors
   propagate.
10. The actual Prettier ignore behavior and source formatter ownership remain tested.
11. Focused and bootstrap counts are observed and reported accurately.
12. `pnpm verify` exits `0`; both unavailable verifiers remain accurately reported at
    exit `2`.
13. No active SDD evidence was used as disposable data or changed except the intended
    report and ledger append.
14. No unrelated tracked change was introduced.

Treat reliance on preexisting parents, recursive parent deletion, deletion of unowned
directories, active evidence used as a fixture, missing permanent regression, success-only
cleanup, swallowed unexpected filesystem errors, or expected counts reported as observed
as Important. Task 4 remains incomplete until both specification compliance and task
quality are approved with no open Critical or Important finding.

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
