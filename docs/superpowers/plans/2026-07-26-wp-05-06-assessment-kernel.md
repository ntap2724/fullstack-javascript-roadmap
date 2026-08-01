# WP-05–06 Exercise, Rubric, Evidence, and Remediation Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Release 0 assessment kernel that materializes learner exercises, executes commands without a shell, distinguishes template health from learner completion, evaluates critical rubrics, validates evidence manifests, and returns actionable remediation.

**Architecture:** `command-runner` is the only package allowed to execute metadata commands. `exercise-contract` owns schemas and path constraints; `exercise-runner` materializes starter files and composes baseline or learner verification. `rubric-schema` and `evidence-schema` remain pure domain packages. `assessment-core` evaluates rubric scores and maps failed criteria to versioned remediation without depending on the website or GitHub.

**Tech Stack:** TypeScript strict mode, Zod 4, Vitest projects, `cross-spawn`, `picomatch`, Node.js filesystem and crypto APIs, YAML metadata, Markdown hints, and JSON evidence manifests.

## Global Constraints

- Metadata commands use `CommandSpec`; never execute curriculum strings with `shell: true`
- Baseline verification proves starter integrity; learner verification may intentionally fail before the learner implements the task
- Exercise tests check behavior and contracts, not reference-solution shape
- Every starter must fail at least one learner-facing test for the intended reason
- Every exercise has at least one edge or negative case
- Editable-path enforcement is fail closed and path-normalized
- Rubric completion is criterion-based; a high total score cannot hide a critical failure
- Evidence trust attestations remain explicit, independent, and never collapse into a generic `verified` boolean
- Remediation identifies the exact failed criterion, related competency, learning resources, and retake requirement
- Public solutions remain outside learner starter materialization
- Package code never imports Astro, Starlight, React, Express, or template-publication code

## OW0002 Task 0 plan-amendment contract

`WP05_ONLY_EXECUTION_BOUNDARY`

This combined document is the implementation plan for two release work packages, but the current execution boundary is deliberately split. The executable WP-05 scope is Tasks 1–5 and the exercise-only acceptance gate immediately after Task 5. Tasks 6–8 are retained below as reference material for WP-06; they are not part of this dispatch, must not be implemented or substantively redesigned here, and must not receive a WP-05 commit, writer token, or acceptance claim.

`WP06_DEFERRED_NOT_AUTHORIZED`

At the WP-05 checkpoint, stop after the Task 5 exercise gate, record the result, and request the later WP-06 owner to authorize Tasks 6–8. The split exit gate is therefore:

1. WP-05 owns and verifies command execution, the exercise contract, safe materialization/reopen, learner protection, the real closure exercise, the public verifier, and the exercise-only acceptance evidence in Tasks 1–5.
2. WP-06 owns the rubric, evidence, remediation, and deferred Tasks 6–8. The deferred task text may be consulted later, but its file maps, tests, fixtures, and commit commands are non-executable until WP-06 issues its own bounded authority.
3. No step in this document authorizes changes to the Release 0 master plan, WP-07/08 plans, curriculum, source code, tests, fixtures, package manifests, lockfiles, `.claude`, or release workflows during this plan amendment. The amendment itself changes only this plan and the WP-09 consumer plan named by OW0002.

### Catalog, package, and root-config ownership

- Future Task 1 and Task 2 implementation owns the exact catalog/package dependency changes. Do not use a root dependency-install shortcut, do not mutate the root manifest as a side effect of authoring, and do not introduce an unpinned dependency range.
- Add `cross-spawn: 7.0.6` and `picomatch: 4.0.5` to the root `pnpm-workspace.yaml` catalog only in their respective future package tasks; declare them as `catalog:` in the package-local manifests, update `pnpm-lock.yaml` from those manifests, and include both catalog and lockfile changes in the corresponding future commit.
- `@types/cross-spawn` and `@types/picomatch` are package-local decisions: retain them only when the package-local strict TypeScript check proves that declarations are required, and if retained pin their exact catalog entries in the same future package task. Never install them with a root `pnpm add` command.
- The root `vitest.config.ts` already discovers package and tooling projects through its existing globs. Preserve it and its globs; package-local `vitest.config.ts` files remain required. No task in this plan may list the root config as a modification or add it to a future commit command.

### T0_COMMAND_RUNNER_SAFETY — locked runner contract

The master public names and result fields are frozen. Task 1 must preserve these exact interfaces and must not add a result field, rename a field, or change the return type:

```ts
export interface CommandSpec {
  command: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
}

export interface CommandResult {
  command: CommandSpec;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export function runCommand(spec: CommandSpec): Promise<CommandResult>;
```

The implementation and tests must additionally prove all of the following:

- Every process is launched with `shell: false`, an argv array, an explicit contained cwd, and deterministic executable resolution. A `.cmd` command is resolved through an explicit platform rule rather than shell interpolation; a literal argument containing metacharacters is never re-parsed as syntax.
- `timeoutMs` is validated as a finite positive integer no greater than 900000 milliseconds. The cwd is realpath-checked and contained by the caller-provided workspace before spawn.
- `error`, `exit`, `close`, timeout, output overflow, and cleanup races share one settlement gate. A result is settled once only, and `close` is the completion event after all bounded cleanup has been confirmed.
- Unix timeout cleanup uses an operation-owned process group with bounded graceful and forced phases. Windows timeout cleanup uses direct `taskkill.exe` argv for the descendant tree, also with bounded graceful and forced phases. Completion before confirmed descendant cleanup is forbidden.
- A spawn failure, output-limit failure, or unconfirmed cleanup is an internal typed runner error. The runner does not add that error to `CommandResult`; each caller maps it to a stable fail-closed diagnostic without leaking a raw exception or platform-specific stack.
- UTF-8 stdout and stderr capture is bounded to 1048576 bytes per stream. Overflow terminates the owned process tree, waits for confirmed cleanup, and rejects with the typed output-limit failure. Normal exit and confirmed timeout cleanup resolve the locked `CommandResult` shape.
- Focused tests cover normal exit, non-zero exit, literal metacharacters, missing executable, spawn failure, bounded timeout, a child that spawns a child, a SIGTERM-resistant child, descendant cleanup failure, output flood, signal/close races, and platform-appropriate process-tree behavior. Windows evidence must not be described as Linux evidence and Linux-only evidence must not be used to claim Windows behavior.

### T0_PATH_POLICY_CANONICAL — host-independent paths and allow-only globs

Path validation is a lexical contract independent of the host OS. Normalize only after validation of the raw string and use POSIX separators for the canonical representation. Reject empty paths, NUL and all control characters, absolute paths, drive-absolute paths, drive-relative forms such as `C:answer.js`, UNC roots, device roots, `.` and `..` segments, empty segments created by repeated separators, reserved DOS device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, and `LPT1`–`LPT9`, case-insensitive), trailing dots or spaces, colon aliases, and any segment whose realpath or reparse-point resolution escapes the declared root. A path that is lexically safe but resolves through a symlink, junction, mount, or case-folded alias outside the root is unsafe.

Editable patterns are an allow-only grammar rooted beneath a declared learner directory. Literal segments, `*`, `?`, and a narrowly prefix-rooted recursive suffix such as `src/**` are permitted. Negation (`!`), braces, extglobs, unrooted global `**`, mixed allow/negate sets, absolute roots, and patterns that can match a parent or sibling directory are invalid. Every candidate is normalized and containment-checked before matching. Tests cover Windows drive, drive-relative, UNC, device, control, reserved-name, trailing-dot/space, dot-segment, symlink/junction/reparse, case-alias, recursive-suffix, and glob-bypass cases.

### T0_WORKSPACE_LIFECYCLE — non-destructive materialization and reopen

Source, staging, output, manifest, enumeration, and command-cwd boundaries are realpath- and reparse-safe. A missing target may be materialized. An existing valid workspace is reopened without replacing learner files. An existing invalid workspace or a non-empty unknown target is an error; it is never recursively deleted and never silently replaced.

Materialization validates the source and output parents, creates an operation-owned sibling staging directory, copies only the allowlisted starter/open-test regular files without dereferencing links, writes and validates the staging manifest, and atomically promotes the staging directory when the filesystem supports the operation. On every failure path, cleanup may remove only the staging directory owned by that operation. Existing learner content remains byte-for-byte preserved when staging, validation, promotion, or cleanup fails. Tests cover an existing output, partial copy, rollback, failed promotion, source/output aliases, and junction/symlink/reparse attacks.

### T0_AUTHORITATIVE_BASELINE — fresh source truth and learner persistence

A learner workspace manifest is provenance/cache evidence, never the sole truth. On every open or verify, derive an authoritative protected-file manifest freshly from the trusted exercise source, strictly validate schema version, exercise identity, exercise version, normalized unique paths, byte counts, and hashes, and compare it to the workspace manifest. Fail closed on tampering, replayed manifests, deletion, addition, modification, rename, duplicate path, case alias, or symlink/reparse alias. Baseline mode always uses a fresh disposable materialization; learner mode reopens persistent state and never overwrites learner files.

### T0_PUBLIC_VERIFIER_SURFACES — independent starter and stable CLI

The public workspace materializes starter code, open tests, and the owned package/test harness only. Solutions, walkthroughs, and hints never enter learner materialization. Every learner workspace exposes `pnpm verify`; baseline infrastructure verification is a separate internal mode, and the same learner verifier must fail the starter for the intended reason and pass an overlaid reference solution automatically. The closure exercise must include an edge/negative case and enforce its declared forbidden dependencies/APIs or remove those unenforced fields from the metadata example.

The import-safe machine entry point is:

```text
pnpm exec tsx tooling/verify-exercise/src/main.ts <exercise-root> <workspace> <baseline|learner> --json
```

Machine mode emits exactly one JSON value on stdout, emits no pnpm lifecycle noise, owns its stderr explicitly, and uses stable exits: `0` for passed verification, `1` for expected validation/verification failure, `2` for usage failure, and `3` for internal failure. The human wrapper remains the public root script `exercise:verify` and may render readable diagnostics; CI and machine parsers use the direct command above, not lifecycle output. Missing, existing-valid, existing-invalid, and non-empty-unknown workspaces each have explicit tests and diagnostics.

### T0_EXERCISE_OWNERSHIP — curriculum closure and documentation map

Task 5 binds the real exercise through the existing curriculum ownership surfaces: the closure lesson's `exercises` reference and the closure assessment's `artifact` reference. The orchestration/tooling adapter validates those references and the exercise contract without reversing dependencies into curriculum domain packages. Task 5 creates and link-checks these future tracked documentation paths: `docs/authoring/exercises.md`, `docs/learner/exercise-workflow.md`, and `docs/maintainers/verifier-failures.md`. `docs/authoring/remediation.md` remains WP-06 deferred and must not be created or claimed by WP-05; WP-07-owned template-publication documentation remains out of scope.

Canonical ownership fields are the lesson exercises reference and the assessment artifact reference.

The Task 5 evidence matrix must cover invalid YAML/schema, unsafe cwd/path/glob, source and workspace reparse/case aliases, existing output, partial copy/rollback, corrupt/tampered/replayed baseline, protected add/delete/modify/rename, solution exclusion, intended starter failure, the closure edge case, automated reference-solution pass, spawn/cleanup/output failures, strict CLI usage/stream/exit behavior, and internal errors. Every diagnostic links to the correct authoring, learner, or maintainer document.

### Amendment verification and future-task handoff

Each future task file map must name every file it creates or modifies, its focused test command, its broader verification command, and a commit command containing only that task's owned paths. The root catalog/lockfile changes are future Task 1/2 implementation work, not this documentation commit. Before the WP-05 checkpoint, run the focused contract probes, strict UTF-8/LF/no-BOM checks, formatting, `git diff --check`, package-local checks/tests, `pnpm check`, and the relevant `pnpm verify`/exercise verifier commands required by the task. Do not claim the deferred WP-06 tasks are implemented or verified from WP-05 evidence.

---

## File map

```text
packages/command-runner/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/run-command.ts
├── src/index.ts
└── test/run-command.test.ts

packages/exercise-contract/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/schema.ts
├── src/paths.ts
├── src/types.ts
├── src/index.ts
└── test/*.test.ts

packages/exercise-runner/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/load-exercise.ts
├── src/materialize.ts
├── src/open-workspace.ts
├── src/baseline-manifest.ts
├── src/verify-editable-paths.ts
├── src/verify-exercise.ts
├── src/index.ts
└── test/*.test.ts

packages/rubric-schema/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/schema.ts
├── src/evaluate.ts
├── src/index.ts
└── test/rubric.test.ts

packages/evidence-schema/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/schema.ts
├── src/trust.ts
├── src/index.ts
└── test/evidence.test.ts

packages/assessment-core/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/remediation.ts
├── src/result.ts
├── src/index.ts
└── test/assessment.test.ts

exercises/javascript/ex-js-closure-counter/
├── exercise.yaml
├── README.vi.md
├── starter/
│   ├── package.json
│   ├── src/counter.js
│   ├── test/infrastructure.test.js
├── tests/open/counter.contract.test.js
├── hints/01-concept.md
├── hints/02-diagnostic.md
├── hints/03-structure.md
├── walkthrough/README.vi.md
└── solution/src/counter.js

tooling/verify-exercise/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/main.ts
└── test/cli.test.ts
```

## Shared interfaces produced by this plan

```ts
export type VerificationMode = 'baseline' | 'learner';

export interface ExerciseWorkspace {
  exerciseId: string;
  root: string;
  baselineManifestPath: string;
}

export interface VerificationStepResult {
  id: string;
  required: boolean;
  command: CommandResult;
}

export interface ExerciseVerificationReport {
  exerciseId: string;
  mode: VerificationMode;
  status: 'passed' | 'failed' | 'internal-error';
  steps: readonly VerificationStepResult[];
  diagnostics: readonly Diagnostic[];
}
```

```ts
export type RubricScore = 0 | 1 | 2 | 3;

export interface CriterionResult {
  criterionId: string;
  critical: boolean;
  required: boolean;
  score: RubricScore | null;
  status: 'passed' | 'failed' | 'missing';
}

export interface RubricEvaluation {
  status: 'passed' | 'needs-remediation';
  criteria: readonly CriterionResult[];
  blockingCriterionIds: readonly string[];
}
```

```ts
export type EvidenceTrustLevel =
  | 'self-reported'
  | 'repository-verifiable'
  | 'ci-verified'
  | 'externally-observable'
  | 'human-reviewed';

export type EvidenceAttestations = readonly EvidenceTrustLevel[];
```

### Task 1: Implement an argv-based, timeout-aware command runner

**Files:**
- Create: `packages/command-runner/package.json`
- Create: `packages/command-runner/tsconfig.json`
- Create: `packages/command-runner/vitest.config.ts`
- Create: `packages/command-runner/src/run-command.ts`
- Create: `packages/command-runner/src/index.ts`
- Create: `packages/command-runner/test/run-command.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Preserve: root `vitest.config.ts` and its existing workspace globs; do not edit it

**Interfaces:**
- Consumes: shared `CommandSpec` and `CommandResult` names from the master plan
- Produces: `runCommand(spec: CommandSpec): Promise<CommandResult>`

- [ ] **Step 1: Register exact `cross-spawn` dependencies through the catalog**

In the future Task 1 implementation, add this exact catalog entry to `pnpm-workspace.yaml`, keep the package dependency package-local, and update `pnpm-lock.yaml` from the resulting manifests:

```yaml
catalog:
  cross-spawn: 7.0.6
```

The package manifest below must use `cross-spawn: catalog:`. Keep `@types/cross-spawn` package-local and catalog-pinned only if the strict package check proves it is required. Do not run a root dependency-install shortcut; the catalog, package manifest, and lockfile are the owned Task 1 changes and must be reviewed together.

- [ ] **Step 2: Create the package manifest and a failing success-path test**

```json
{
  "name": "@roadmap/command-runner",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check": "tsc --project tsconfig.json",
    "test": "vitest run --config vitest.config.ts"
  },
  "dependencies": {
    "cross-spawn": "catalog:"
  },
  "devDependencies": {
    "@types/cross-spawn": "catalog:",
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

```ts
// packages/command-runner/test/run-command.test.ts
import { describe, expect, it } from 'vitest';
import { runCommand } from '../src/index.js';

const nodeCommand = process.execPath;

const spec = (source: string, timeoutMs = 5_000) => ({
  command: nodeCommand,
  args: ['--input-type=module', '--eval', source],
  cwd: process.cwd(),
  timeoutMs,
});

describe('runCommand', () => {
  it('captures stdout, stderr, exit code, and elapsed time without a shell', async () => {
    const result = await runCommand(spec("console.log('out'); console.error('err')"));
    expect(result.exitCode).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toBe('out\n');
    expect(result.stderr).toBe('err\n');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 3: Run the focused test and confirm the missing export failure**

Run:

```bash
pnpm --filter @roadmap/command-runner test
```

Expected: FAIL because `../src/index.js` does not exist.

- [ ] **Step 4: Implement the locked interfaces and single-settlement process-tree runner**

Implement `packages/command-runner/src/run-command.ts` with the exact `CommandSpec`, `CommandResult`, and `runCommand(spec: CommandSpec): Promise<CommandResult>` declarations in the OW0002 contract above. The implementation must validate the spec and realpath-contained cwd before spawning, resolve `.cmd` commands through the documented deterministic platform rule, and launch only this shape:

```ts
const child = spawn(spec.command, [...spec.args], {
  cwd: validatedCwd,
  env: process.env,
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
  detached: process.platform !== 'win32',
});
```

Capture UTF-8 output through a byte-counted `appendBounded` helper with a 1048576-byte limit per stream. Use one `settleOnce` gate with explicit `closed`, `cleanupConfirmed`, `timedOut`, and `failure` state. The `error` event rejects a typed spawn failure; `exit` records status; `close` is observed but cannot resolve until descendant cleanup is confirmed; timeout and output overflow call the platform-specific tree terminator; and every timer/listener is cleared by the one settlement path. A normal close or confirmed timeout resolves the unchanged `CommandResult`; a spawn, output-limit, or cleanup-confirmation failure rejects a typed internal runner error.

The Unix terminator targets the detached process group with bounded graceful and forced phases. The Windows terminator invokes `taskkill.exe` with direct argv `['/PID', String(pid), '/T']`, waits for the bounded grace period, then uses `['/PID', String(pid), '/T', '/F']` if the tree remains alive. A final bounded liveness check must succeed before `cleanupConfirmed` becomes true. No implementation may use shell interpolation, recursive workspace deletion, unbounded output accumulation, or a result shape that hides an internal failure.

- [ ] **Step 5: Add failure, literal-argument, missing-command, timeout, and forced-termination tests**

Append:

```ts
it('preserves a non-zero exit code', async () => {
  const result = await runCommand(spec('process.exit(7)'));
  expect(result.exitCode).toBe(7);
  expect(result.timedOut).toBe(false);
});

it('passes metacharacters as literal arguments rather than shell syntax', async () => {
  const result = await runCommand({
    command: nodeCommand,
    args: ['--input-type=module', '--eval', 'console.log(process.argv[1])', '&& echo injected'],
    cwd: process.cwd(),
    timeoutMs: 5_000,
  });
  expect(result.stdout).toBe('&& echo injected\n');
  expect(result.stderr).toBe('');
});

it('rejects when the executable cannot be started', async () => {
  await expect(
    runCommand({ command: 'roadmap-command-that-does-not-exist', args: [], cwd: process.cwd(), timeoutMs: 500 }),
  ).rejects.toThrow();
});

it('marks and terminates commands that exceed the timeout', async () => {
  const result = await runCommand(spec('setTimeout(() => {}, 10_000)', 50));
  expect(result.timedOut).toBe(true);
  expect(result.exitCode).not.toBe(0);
  expect(result.durationMs).toBeLessThan(2_000);
});

it('does not leave a child alive when it installs a SIGTERM handler', async () => {
  const source = `
    process.on('SIGTERM', () => {});
    setInterval(() => process.stdout.write('alive\\n'), 25);
  `;
  const result = await runCommand(spec(source, 50));
  expect(result.timedOut).toBe(true);
  expect(result.durationMs).toBeLessThan(2_000);
});
```

The last test is cross-platform: Unix exercises the grace-period escalation, while Windows may terminate on the first signal. Both environments must prove the process is gone before the promise resolves.

Also add real-process tests for a child that spawns a grandchild (the grandchild must be gone before the promise resolves), a child that floods stdout/stderr (the typed output-limit failure must be stable and bounded), a cleanup path whose confirmation fails (the promise must reject rather than resolve a partial result), and an `error`/`exit`/`close` race (the promise must settle exactly once). Keep the Windows tree assertions separate from the Unix process-group assertions; neither platform's evidence may be generalized to the other.

- [ ] **Step 6: Run package checks and commit**

Run:

```bash
pnpm --filter @roadmap/command-runner check
pnpm --filter @roadmap/command-runner test
```

Expected: PASS with the success, failure, literal-argument, spawn, timeout, descendant, output-limit, cleanup, race, and platform-appropriate tests.

Commit:

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml packages/command-runner
git commit -m "feat: add shell-free command runner"
```

### Task 2: Define the exercise contract and safe path rules

**Files:**
- Create: `packages/exercise-contract/package.json`
- Create: `packages/exercise-contract/tsconfig.json`
- Create: `packages/exercise-contract/vitest.config.ts`
- Create: `packages/exercise-contract/src/schema.ts`
- Create: `packages/exercise-contract/src/paths.ts`
- Create: `packages/exercise-contract/src/types.ts`
- Create: `packages/exercise-contract/src/index.ts`
- Create: `packages/exercise-contract/test/schema.test.ts`
- Create: `packages/exercise-contract/test/paths.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Preserve: root `vitest.config.ts` and its existing workspace globs; do not edit it

**Interfaces:**
- Consumes: `CommandSpec`, competency/artifact ID conventions, and `Diagnostic`
- Produces: `ExerciseDefinitionSchema`, `ExerciseDefinition`, `normalizeRelativePath`, `isSafeRelativePath`, and `matchesEditablePath`

- [ ] **Step 1: Register exact `picomatch` dependencies through the catalog and create the package manifest**

In the future Task 2 implementation, add this exact catalog entry to `pnpm-workspace.yaml`, keep the package dependency package-local, and update `pnpm-lock.yaml` from the resulting manifests:

```yaml
catalog:
  picomatch: 4.0.5
```

The package manifest below must use `picomatch: catalog:`. Keep `@types/picomatch` package-local and catalog-pinned only if the strict package check proves it is required. Do not run a root dependency-install shortcut; the catalog, package manifest, and lockfile are the owned Task 2 changes and must be reviewed together.

```json
{
  "name": "@roadmap/exercise-contract",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check": "tsc --project tsconfig.json",
    "test": "vitest run --config vitest.config.ts"
  },
  "dependencies": {
    "@roadmap/command-runner": "workspace:*",
    "picomatch": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "@types/picomatch": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

- [ ] **Step 2: Write failing schema tests for a valid contract and forbidden shell strings**

```ts
// packages/exercise-contract/test/schema.test.ts
import { describe, expect, it } from 'vitest';
import { ExerciseDefinitionSchema } from '../src/index.js';

const validExercise = {
  schemaVersion: 1,
  id: 'ex-js-closure-counter',
  version: '1.0.0',
  title: 'Xây bộ đếm có trạng thái riêng',
  type: 'focused-exercise',
  language: 'javascript',
  competencies: ['js.scope.lexical', 'js.function.closure'],
  requiredLevel: {
    'js.scope.lexical': 'implement',
    'js.function.closure': 'implement',
  },
  prerequisites: ['js.function.values'],
  commands: {
    baseline: [{ id: 'infrastructure', required: true, command: 'pnpm', args: ['test:infrastructure'], cwd: '.', timeoutMs: 60_000 }],
    learner: [{ id: 'contract', required: true, command: 'pnpm', args: ['test'], cwd: '.', timeoutMs: 60_000 }],
  },
  constraints: {
    editablePaths: ['src/**'],
    forbiddenDependencies: [],
    forbiddenApis: ['globalThis'],
  },
  evidence: ['test-report', 'source-diff', 'explanation'],
  hints: [
    { level: 1, path: 'hints/01-concept.md' },
    { level: 2, path: 'hints/02-diagnostic.md' },
    { level: 3, path: 'hints/03-structure.md' },
  ],
};

describe('ExerciseDefinitionSchema', () => {
  it('accepts an argv-based focused exercise contract', () => {
    expect(ExerciseDefinitionSchema.parse(validExercise)).toEqual(validExercise);
  });

  it('rejects a shell command string in place of argv metadata', () => {
    const invalid = structuredClone(validExercise) as Record<string, unknown>;
    invalid.commands = { learner: ['pnpm test && rm -rf .'] };
    expect(() => ExerciseDefinitionSchema.parse(invalid)).toThrow();
  });

  it('requires increasing, unique progressive hint levels', () => {
    const invalid = structuredClone(validExercise);
    invalid.hints = [
      { level: 1, path: 'hints/a.md' },
      { level: 1, path: 'hints/b.md' },
    ];
    expect(() => ExerciseDefinitionSchema.parse(invalid)).toThrow();
  });


  it('rejects command working directories and hint paths that escape the exercise root', () => {
    const invalidCommand = structuredClone(validExercise);
    invalidCommand.commands.learner[0]!.cwd = '../outside';
    expect(() => ExerciseDefinitionSchema.parse(invalidCommand)).toThrow();

    const invalidHint = structuredClone(validExercise);
    invalidHint.hints[0]!.path = '../../answer.md';
    expect(() => ExerciseDefinitionSchema.parse(invalidHint)).toThrow();
  });
});
```

- [ ] **Step 3: Write failing traversal and editable-path tests**

```ts
// packages/exercise-contract/test/paths.test.ts
import { describe, expect, it } from 'vitest';
import { isSafeRelativePath, matchesEditablePath, normalizeRelativePath } from '../src/index.js';

describe('exercise path rules', () => {
  it.each(['src/counter.js', 'src\\counter.js'])('normalizes %s to POSIX form', (input) => {
    expect(normalizeRelativePath(input)).toBe('src/counter.js');
  });

  it.each([
    '../secret', '/absolute', 'C:\\secret', 'C:secret', '\\\\server\\share\\secret', '\\\\?\\C:\\secret',
    'src/../../secret', 'src//secret', 'src/./secret', 'src/CON.txt', 'src/file. ', 'src/file.\\t', '\u0000secret', '',
  ])('rejects unsafe relative path %s', (input) => {
    expect(isSafeRelativePath(input)).toBe(false);
  });

  it('matches editable globs after normalization', () => {
    expect(matchesEditablePath('src\\counter.js', ['src/**'])).toBe(true);
    expect(matchesEditablePath('test/counter.test.js', ['src/**'])).toBe(false);
  });

  it.each(['**', '!src/**', '{src,test}/**', 'src/@(counter|answer).js', 'src/**/../secret'])('rejects non-allow-only pattern %s', (pattern) => {
    expect(matchesEditablePath('src/counter.js', [pattern])).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests and confirm the package is absent**

Run:

```bash
pnpm --filter @roadmap/exercise-contract test
```

Expected: FAIL because the source modules do not exist.

- [ ] **Step 5: Implement the Zod contract**

```ts
// packages/exercise-contract/src/schema.ts
import { z } from 'zod';
import { isSafeRelativePath } from './paths.js';

const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
const CompetencyIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/);
const ExerciseIdSchema = z.string().regex(/^ex-[a-z0-9]+(?:-[a-z0-9]+)*$/);
const RelativePathSchema = z.string().min(1).refine(isSafeRelativePath, 'Path must stay within the exercise root');

export const MasteryLevelSchema = z.enum(['recognize', 'explain', 'implement', 'diagnose', 'design-and-justify']);

export const CommandDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  required: z.boolean(),
  command: z.string().min(1),
  args: z.array(z.string()),
  cwd: RelativePathSchema,
  timeoutMs: z.number().int().positive().max(15 * 60_000),
}).strict();

export const ExerciseDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  id: ExerciseIdSchema,
  version: SemverSchema,
  title: z.string().min(1),
  type: z.enum(['focused-exercise', 'mechanism-lab', 'debugging-task', 'refactoring-task', 'change-request']),
  language: z.enum(['javascript', 'typescript', 'html-css', 'sql', 'mixed']),
  competencies: z.array(CompetencyIdSchema).min(1),
  requiredLevel: z.record(CompetencyIdSchema, MasteryLevelSchema),
  prerequisites: z.array(CompetencyIdSchema),
  commands: z.object({
    baseline: z.array(CommandDefinitionSchema).min(1),
    learner: z.array(CommandDefinitionSchema).min(1),
  }).strict(),
  constraints: z.object({
    editablePaths: z.array(RelativePathSchema).min(1),
    forbiddenDependencies: z.array(z.string()),
    forbiddenApis: z.array(z.string()),
  }).strict(),
  evidence: z.array(z.enum(['test-report', 'source-diff', 'explanation', 'observation-report', 'debugging-report'])).min(1),
  hints: z.array(z.object({
    level: z.number().int().min(1).max(5),
    path: RelativePathSchema,
  }).strict()).superRefine((hints, context) => {
    const levels = hints.map((hint) => hint.level);
    if (new Set(levels).size !== levels.length || levels.some((level, index) => index > 0 && level <= levels[index - 1]!)) {
      context.addIssue({ code: 'custom', message: 'Hint levels must be unique and strictly increasing' });
    }
  }),
}).strict().superRefine((definition, context) => {
  for (const competency of Object.keys(definition.requiredLevel)) {
    if (!definition.competencies.includes(competency)) {
      context.addIssue({ code: 'custom', path: ['requiredLevel', competency], message: 'Required level must reference a declared competency' });
    }
  }
});
```

```ts
// packages/exercise-contract/src/types.ts
import type { z } from 'zod';
import type { ExerciseDefinitionSchema } from './schema.js';

export type ExerciseDefinition = z.infer<typeof ExerciseDefinitionSchema>;
export type ExerciseCommandDefinition = ExerciseDefinition['commands']['baseline'][number];
```

- [ ] **Step 6: Implement cross-platform path safety**

```ts
// packages/exercise-contract/src/paths.ts
import picomatch from 'picomatch';

const CONTROL_OR_NUL = `[\\u0000-\\u001f\\u007f]`;
const RESERVED_DOS_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\..*)?$/i;

export function normalizeRelativePath(input: string): string {
  return input.replaceAll('\\', '/');
}

export function isSafeRelativePath(input: string): boolean {
  if (input.length === 0 || new RegExp(CONTROL_OR_NUL).test(input)) return false;
  if (/^[A-Za-z]:/.test(input) || /^(?:\\\\|\\/\\/)/.test(input) || input.startsWith('/') || input.startsWith('\\')) return false;
  const normalized = normalizeRelativePath(input);
  const segments = normalized.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) return false;
  if (segments.some((segment) => /[. ]$/.test(segment) || RESERVED_DOS_NAME.test(segment))) return false;
  return true;
}

function isAllowOnlyPattern(pattern: string): boolean {
  if (!isSafeRelativePath(pattern)) return false;
  if (pattern.startsWith('!') || /[{}]/.test(pattern) || /(?:^|[\\/])[!@+?*][(]/.test(pattern)) return false;
  const segments = normalizeRelativePath(pattern).split('/');
  if (segments.length < 2 && segments[0] === '**') return false;
  if (segments.slice(0, -1).some((segment) => segment.includes('**'))) return false;
  return segments[segments.length - 1] !== '**' || segments.length > 1;
}

export function matchesEditablePath(candidate: string, patterns: readonly string[]): boolean {
  if (!isSafeRelativePath(candidate)) return false;
  const normalized = normalizeRelativePath(candidate);
  return patterns.some((pattern) => isAllowOnlyPattern(pattern) && picomatch(pattern, {
    dot: true,
    nonegate: true,
    nobrace: true,
    noext: true,
  })(normalized));
}
```

```ts
// packages/exercise-contract/src/index.ts
export * from './paths.js';
export * from './schema.js';
export * from './types.js';
```

- [ ] **Step 7: Run package verification and commit**

Run:

```bash
pnpm --filter @roadmap/exercise-contract check
pnpm --filter @roadmap/exercise-contract test
```

Expected: PASS with all schema and path cases.

Commit:

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml packages/exercise-contract
git commit -m "feat: define safe exercise contracts"
```

### Task 3: Load, materialize, and reopen learner workspaces without solutions

**Files:**
- Create: `packages/exercise-runner/package.json`
- Create: `packages/exercise-runner/tsconfig.json`
- Create: `packages/exercise-runner/vitest.config.ts`
- Create: `packages/exercise-runner/src/load-exercise.ts`
- Create: `packages/exercise-runner/src/materialize.ts`
- Create: `packages/exercise-runner/src/open-workspace.ts`
- Create: `packages/exercise-runner/src/baseline-manifest.ts`
- Create: `packages/exercise-runner/src/index.ts`
- Create: `packages/exercise-runner/test/materialize.test.ts`
- Create: `packages/exercise-runner/test/open-workspace.test.ts`
- Create: `fixtures/exercises/valid/minimal/**`
- Preserve: root `vitest.config.ts` and its existing workspace globs; do not edit it

**Interfaces:**
- Consumes: `ExerciseDefinitionSchema`, safe path helpers, `ValidationOutcome<T>`, and YAML parsing selected in WP-02
- Produces: `loadExercise(sourceRoot)`, `materializeExercise(sourceRoot, outputRoot)`, `openExerciseWorkspace(sourceRoot, outputRoot)`, `ExerciseWorkspace`, and baseline-manifest helpers

- [ ] **Step 1: Create the package manifest and failing materialization tests**

```json
{
  "name": "@roadmap/exercise-runner",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check": "tsc --project tsconfig.json",
    "test": "vitest run --config vitest.config.ts"
  },
  "dependencies": {
    "@roadmap/command-runner": "workspace:*",
    "@roadmap/exercise-contract": "workspace:*",
    "@roadmap/validation-core": "workspace:*",
    "yaml": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

```ts
// packages/exercise-runner/test/materialize.test.ts
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { materializeExercise } from '../src/index.js';

const fixture = new URL('../../../fixtures/exercises/valid/minimal/', import.meta.url);

describe('materializeExercise', () => {
  it('copies starter and open tests, excludes solutions, and writes a baseline manifest', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-exercise-'));
    const result = await materializeExercise(fixture, output);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await readFile(path.join(output, 'src/counter.js'), 'utf8')).toContain('createCounter');
    expect(await readFile(path.join(output, 'test/open/counter.contract.test.js'), 'utf8')).toContain(
      'independent',
    );
    await expect(stat(path.join(output, 'solution'))).rejects.toThrow();
    await expect(stat(path.join(output, 'hints'))).rejects.toThrow();

    const manifest = JSON.parse(await readFile(result.value.baselineManifestPath, 'utf8'));
    expect(manifest.exerciseId).toBe('ex-js-closure-counter');
    expect(manifest.files.map((entry: { path: string }) => entry.path)).toEqual(
      expect.arrayContaining(['src/counter.js', 'test/open/counter.contract.test.js']),
    );
  });
});
```

```ts
// packages/exercise-runner/test/open-workspace.test.ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { materializeExercise, openExerciseWorkspace } from '../src/index.js';

const fixture = new URL('../../../fixtures/exercises/valid/minimal/', import.meta.url);

describe('openExerciseWorkspace', () => {
  it('reuses a matching workspace without replacing learner edits', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-open-'));
    const created = await materializeExercise(fixture, output);
    if (!created.ok) throw new Error('Fixture must materialize');

    const learnerSource = 'export const learnerChange = true;\n';
    await writeFile(path.join(output, 'src/counter.js'), learnerSource);
    const reopened = await openExerciseWorkspace(fixture, output);

    expect(reopened.ok).toBe(true);
    expect(await readFile(path.join(output, 'src/counter.js'), 'utf8')).toBe(learnerSource);
  });

  it('fails closed on an existing workspace from another exercise version', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-mismatch-'));
    const created = await materializeExercise(fixture, output);
    if (!created.ok) throw new Error('Fixture must materialize');

    const manifest = JSON.parse(await readFile(created.value.baselineManifestPath, 'utf8'));
    manifest.exerciseVersion = '9.9.9';
    await writeFile(created.value.baselineManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const reopened = await openExerciseWorkspace(fixture, output);
    expect(reopened.ok).toBe(false);
    if (!reopened.ok) expect(reopened.diagnostics[0]?.code).toBe('EXERCISE_WORKSPACE_001');
  });

  it('rejects a non-empty unknown workspace without deleting its sentinel file', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-unknown-output-'));
    const sentinel = path.join(output, 'do-not-delete.txt');
    await writeFile(sentinel, 'learner content\n');

    const reopened = await openExerciseWorkspace(fixture, output);
    expect(reopened.ok).toBe(false);
    if (!reopened.ok) expect(reopened.diagnostics[0]?.code).toBe('EXERCISE_OUTPUT_002');
    expect(await readFile(sentinel, 'utf8')).toBe('learner content\n');
  });
});
```

- [ ] **Step 2: Create a minimal valid fixture and confirm the tests fail**

Create `fixtures/exercises/valid/minimal/exercise.yaml` from the valid Task 2 metadata and add:

```js
// fixtures/exercises/valid/minimal/starter/src/counter.js
export function createCounter() {
  throw new Error('Learner implementation required');
}
```

```json
// fixtures/exercises/valid/minimal/starter/package.json
{
  "private": true,
  "type": "module",
  "scripts": {
    "test:infrastructure": "node --test test/infrastructure.test.js",
    "test": "node --test",
    "verify": "node --test test/open"
  }
}
```

```js
// fixtures/exercises/valid/minimal/tests/open/counter.contract.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCounter } from '../../src/counter.js';

test('counter instances preserve independent state', () => {
  const first = createCounter();
  const second = createCounter();
  assert.equal(first(), 1);
  assert.equal(first(), 2);
  assert.equal(second(), 1);
});
```

```js
// fixtures/exercises/valid/minimal/solution/src/counter.js
export function createCounter() {
  let value = 0;
  return () => ++value;
}
```

Run:

```bash
pnpm --filter @roadmap/exercise-runner test -- materialize.test.ts open-workspace.test.ts
```

Expected: FAIL because the runner exports do not exist.

- [ ] **Step 3: Implement exercise loading with structured YAML failures**

```ts
// packages/exercise-runner/src/load-exercise.ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExerciseDefinitionSchema, type ExerciseDefinition } from '@roadmap/exercise-contract';
import { failure, success, type ValidationOutcome } from '@roadmap/validation-core';
import { parse } from 'yaml';

export function resolveExerciseRoot(sourceRoot: string | URL): string {
  return sourceRoot instanceof URL ? fileURLToPath(sourceRoot) : path.resolve(sourceRoot);
}

export async function loadExercise(
  sourceRoot: string | URL,
): Promise<ValidationOutcome<ExerciseDefinition>> {
  const root = resolveExerciseRoot(sourceRoot);
  const file = path.join(root, 'exercise.yaml');
  try {
    const text = await readFile(file, 'utf8');
    const parsed = ExerciseDefinitionSchema.safeParse(parse(text));
    if (!parsed.success) {
      return failure(parsed.error.issues.map((issue) => ({
        code: 'EXERCISE_SCHEMA_001',
        severity: 'error' as const,
        location: { file, pointer: `/${issue.path.join('/')}` },
        observed: issue.input,
        expected: 'Exercise metadata conforming to schema version 1',
        reason: issue.message,
        remediation: 'Correct exercise.yaml at the reported pointer',
        documentation: 'docs/authoring/exercises.md',
      })));
    }
    return success(parsed.data);
  } catch (error) {
    return failure([{
      code: 'EXERCISE_LOAD_001',
      severity: 'error',
      location: { file },
      observed: error instanceof Error ? error.message : String(error),
      expected: 'Readable UTF-8 YAML exercise metadata',
      reason: 'The exercise contract could not be loaded',
      remediation: 'Restore exercise.yaml and ensure it is readable YAML',
      documentation: 'docs/authoring/exercises.md',
    }]);
  }
}
```

- [ ] **Step 4: Implement deterministic baseline-manifest helpers**

```ts
// packages/exercise-runner/src/baseline-manifest.ts
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

export interface BaselineFileRecord {
  path: string;
  bytes: number;
  sha256: string;
}

export interface ExerciseBaselineManifest {
  schemaVersion: 1;
  exerciseId: string;
  exerciseVersion: string;
  files: readonly BaselineFileRecord[];
}

export async function hashFile(file: string, relativePath: string): Promise<BaselineFileRecord> {
  const bytes = await readFile(file);
  return {
    path: relativePath,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export async function writeBaselineManifest(
  file: string,
  manifest: ExerciseBaselineManifest,
): Promise<void> {
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export async function readBaselineManifest(file: string): Promise<ExerciseBaselineManifest> {
  const value: unknown = JSON.parse(await readFile(file, 'utf8'));
  if (
    typeof value !== 'object' || value === null ||
    !('schemaVersion' in value) || value.schemaVersion !== 1 ||
    !('exerciseId' in value) || typeof value.exerciseId !== 'string' ||
    !('exerciseVersion' in value) || typeof value.exerciseVersion !== 'string' ||
    !('files' in value) || !Array.isArray(value.files)
  ) {
    throw new Error('Invalid exercise baseline manifest');
  }
  return value as ExerciseBaselineManifest;
}
```

The reader must also reject duplicate or non-canonical paths, invalid byte counts, malformed lowercase SHA-256 values, missing source identity/version, and any record that is not present in the freshly derived authoritative source manifest. The manifest is cache/provenance evidence and never replaces source-derived protected-file truth.

- [ ] **Step 5: Implement allowlisted materialization and non-destructive workspace reopening**

```ts
// packages/exercise-runner/src/materialize.ts
import { cp, mkdir, mkdtemp, readdir, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { normalizeRelativePath } from '@roadmap/exercise-contract';
import { failure, success, type ValidationOutcome } from '@roadmap/validation-core';
import { hashFile, writeBaselineManifest } from './baseline-manifest.js';
import { loadExercise, resolveExerciseRoot } from './load-exercise.js';

export interface ExerciseWorkspace {
  exerciseId: string;
  root: string;
  baselineManifestPath: string;
}

async function listRegularFiles(root: string, current = root): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${absolute}`);
    if (entry.isDirectory()) output.push(...await listRegularFiles(root, absolute));
    if (entry.isFile()) output.push(normalizeRelativePath(path.relative(root, absolute)));
  }
  return output.sort();
}

function pathFailure(location: string, error: unknown): ValidationOutcome<never> {
  return failure([{
    code: 'EXERCISE_PATH_001',
    severity: 'error',
    location: { file: location },
    observed: error instanceof Error ? error.message : String(error),
    expected: 'Regular files under starter/ and tests/open/ with no symlinks or traversal',
    reason: 'Exercise publication input contains an unsafe or unreadable path',
    remediation: 'Remove symlinks and restore the required starter and open-test directories',
    documentation: 'docs/authoring/exercises.md',
  }]);
}

export async function materializeExercise(
  sourceRootInput: string | URL,
  outputRoot: string,
): Promise<ValidationOutcome<ExerciseWorkspace>> {
  const loaded = await loadExercise(sourceRootInput);
  if (!loaded.ok) return loaded;

  const sourceRoot = await realpath(resolveExerciseRoot(sourceRootInput));
  const starterRoot = path.join(sourceRoot, 'starter');
  const openTestsRoot = path.join(sourceRoot, 'tests', 'open');
  const resolvedOutput = path.resolve(outputRoot);
  if (resolvedOutput === sourceRoot || resolvedOutput.startsWith(`${sourceRoot}${path.sep}`)) {
    return failure([{
      code: 'EXERCISE_OUTPUT_001',
      severity: 'error',
      location: { file: resolvedOutput },
      observed: resolvedOutput,
      expected: 'An output directory outside the exercise source',
      reason: 'Materialization would overwrite source files',
      remediation: 'Choose a fresh temporary or learner workspace directory',
      documentation: 'docs/authoring/exercises.md',
    }]);
  }

  let stagingRoot: string | undefined;
  try {
    stagingRoot = await mkdtemp(path.join(
      path.dirname(resolvedOutput),
      `.roadmap-stage-${path.basename(resolvedOutput)}-`,
    ));
    const outputState = await inspectOutputState(resolvedOutput);
    if (outputState !== 'missing') {
      throw new Error(`EXERCISE_OUTPUT_002: refusing to replace ${outputState} output`);
    }
    await listRegularFiles(starterRoot);
    await listRegularFiles(openTestsRoot);
    await mkdir(stagingRoot, { recursive: true });
    await cp(starterRoot, stagingRoot, { recursive: true, dereference: false });
    await cp(openTestsRoot, path.join(stagingRoot, 'test', 'open'), {
      recursive: true,
      dereference: false,
    });

    const files = await listRegularFiles(stagingRoot);
    const records = await Promise.all(
      files.map((file) => hashFile(path.join(stagingRoot, file), file)),
    );
    const metadataRoot = path.join(stagingRoot, '.roadmap');
    await mkdir(metadataRoot, { recursive: true });
    const baselineManifestPath = path.join(metadataRoot, 'exercise-baseline.json');
    await writeBaselineManifest(baselineManifestPath, {
      schemaVersion: 1,
      exerciseId: loaded.value.id,
      exerciseVersion: loaded.value.version,
      files: records,
    });
    await validateAuthoritativeManifest(stagingRoot, sourceRoot, loaded.value);
    await rename(stagingRoot, resolvedOutput);
    return success({
      exerciseId: loaded.value.id,
      root: resolvedOutput,
      baselineManifestPath: path.join(resolvedOutput, '.roadmap', 'exercise-baseline.json'),
    });
  } catch (error) {
    if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true });
    return pathFailure(sourceRoot, error);
  }
}
```

`inspectOutputState` must classify the target as missing, matching-valid, invalid, or non-empty-unknown without deleting it. `validateAuthoritativeManifest` must derive protected-file truth from the trusted source, reject reparse aliases, and compare normalized unique paths, bytes, hashes, exercise identity, and version before `rename` promotes the operation-owned sibling stage. The catch block may remove only the stage created by this invocation; it must preserve every pre-existing learner file.

```ts
// packages/exercise-runner/src/open-workspace.ts
import { access } from 'node:fs/promises';
import path from 'node:path';
import { failure, success, type ValidationOutcome } from '@roadmap/validation-core';
import { readBaselineManifest } from './baseline-manifest.js';
import { loadExercise } from './load-exercise.js';
import { materializeExercise, type ExerciseWorkspace } from './materialize.js';

export async function openExerciseWorkspace(
  sourceRoot: string | URL,
  outputRoot: string,
): Promise<ValidationOutcome<ExerciseWorkspace>> {
  const definition = await loadExercise(sourceRoot);
  if (!definition.ok) return definition;

  const root = path.resolve(outputRoot);
  const baselineManifestPath = path.join(root, '.roadmap', 'exercise-baseline.json');
  try {
    await access(baselineManifestPath);
  } catch {
    return materializeExercise(sourceRoot, root);
  }

  try {
    const baseline = await readBaselineManifest(baselineManifestPath);
    const authoritative = await deriveAuthoritativeManifest(sourceRoot, definition.value);
    if (!manifestsMatchExactly(baseline, authoritative)) {
      return failure([{
        code: 'EXERCISE_WORKSPACE_001',
        severity: 'error',
        location: { file: baselineManifestPath },
        observed: `${baseline.exerciseId}@${baseline.exerciseVersion}`,
        expected: `${authoritative.exerciseId}@${authoritative.exerciseVersion} with identical protected paths and hashes`,
        reason: 'The existing learner workspace manifest is not authoritative for the trusted exercise source',
        remediation: 'Move learner files aside and reopen a fresh workspace after repairing the manifest',
        documentation: 'docs/learner/exercise-workflow.md',
      }]);
    }
    return success({ exerciseId: definition.value.id, root, baselineManifestPath });
  } catch (error) {
    return failure([{
      code: 'EXERCISE_WORKSPACE_002',
      severity: 'error',
      location: { file: baselineManifestPath },
      observed: error instanceof Error ? error.message : String(error),
      expected: 'A readable versioned exercise baseline manifest',
      reason: 'The existing learner workspace metadata is invalid',
      remediation: 'Recover the workspace metadata or move learner files before recreating the workspace',
      documentation: 'docs/learner/exercise-workflow.md',
    }]);
  }
}
```

- [ ] **Step 6: Prove symlink rejection on Windows and Unix**

Append to `materialize.test.ts`:

```ts
import { cp, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

it('returns EXERCISE_PATH_001 for a selected source symlink', async () => {
  const source = await mkdtemp(path.join(tmpdir(), 'roadmap-exercise-source-'));
  await cp(fileURLToPath(fixture), source, { recursive: true });

  if (process.platform === 'win32') {
    await symlink(
      path.join(source, 'solution', 'src'),
      path.join(source, 'starter', 'src', 'answer-directory'),
      'junction',
    );
  } else {
    await symlink(
      path.join(source, 'solution', 'src', 'counter.js'),
      path.join(source, 'starter', 'src', 'answer.js'),
      'file',
    );
  }

  const output = await mkdtemp(path.join(tmpdir(), 'roadmap-exercise-output-'));
  const result = await materializeExercise(source, output);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_PATH_001');
});
```

The Windows branch uses a directory junction, which does not require silently skipping the test when file-symlink privileges are unavailable.

- [ ] **Step 7: Export the package, run tests, and commit**

```ts
// packages/exercise-runner/src/index.ts
export * from './baseline-manifest.js';
export * from './load-exercise.js';
export * from './materialize.js';
export * from './open-workspace.js';
```

Run:

```bash
pnpm --filter @roadmap/exercise-runner check
pnpm --filter @roadmap/exercise-runner test
```

Commit:

```bash
git add packages/exercise-runner fixtures/exercises
git commit -m "feat: materialize persistent exercise workspaces"
```


### Task 4: Protect learner workspaces and execute baseline or learner command sets

**Files:**
- Create: `packages/exercise-runner/src/verify-editable-paths.ts`
- Create: `packages/exercise-runner/src/verify-exercise.ts`
- Create: `packages/exercise-runner/test/verify-editable-paths.test.ts`
- Create: `packages/exercise-runner/test/verify-exercise.test.ts`
- Modify: `packages/exercise-runner/src/index.ts`

**Interfaces:**
- Consumes: persistent workspace, exercise definition, baseline manifest, `runCommand`, and editable globs
- Produces: `verifyEditablePaths`, `verifyExercise`, `VerificationMode`, and `ExerciseVerificationReport`

- [ ] **Step 1: Write failing tests for allowed changes, protected tests, and injected symlinks**

```ts
// packages/exercise-runner/test/verify-editable-paths.test.ts
import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { materializeExercise, verifyEditablePaths } from '../src/index.js';

const fixture = new URL('../../../fixtures/exercises/valid/minimal/', import.meta.url);

describe('verifyEditablePaths', () => {
  it('allows changes under src/** and rejects changes to open tests', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-editable-'));
    const materialized = await materializeExercise(fixture, output);
    expect(materialized.ok).toBe(true);
    if (!materialized.ok) return;

    await writeFile(path.join(output, 'src/counter.js'), 'export const changed = true;\n');
    expect((await verifyEditablePaths(materialized.value, ['src/**'])).ok).toBe(true);

    const testFile = path.join(output, 'test/open/counter.contract.test.js');
    await writeFile(testFile, `${await readFile(testFile, 'utf8')}\n// modified\n`);
    const rejected = await verifyEditablePaths(materialized.value, ['src/**']);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.diagnostics[0]?.code).toBe('EXERCISE_EDITABLE_001');
  });

  it('rejects a symlink added after materialization', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-editable-link-'));
    const materialized = await materializeExercise(fixture, output);
    if (!materialized.ok) throw new Error('Fixture must materialize');

    if (process.platform === 'win32') {
      await symlink(path.join(output, 'src'), path.join(output, 'linked-src'), 'junction');
    } else {
      await symlink(path.join(output, 'src/counter.js'), path.join(output, 'answer.js'), 'file');
    }

    const result = await verifyEditablePaths(materialized.value, ['src/**']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_EDITABLE_002');
  });
});
```

- [ ] **Step 2: Implement baseline diffing with fail-closed symlink handling**

```ts
// packages/exercise-runner/src/verify-editable-paths.ts
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { matchesEditablePath, normalizeRelativePath } from '@roadmap/exercise-contract';
import { failure, success, type ValidationOutcome } from '@roadmap/validation-core';
import { readBaselineManifest } from './baseline-manifest.js';
import type { ExerciseWorkspace } from './materialize.js';

async function listWorkspaceFiles(root: string, current = root): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name === '.roadmap') continue;
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${absolute}`);
    if (entry.isDirectory()) output.push(...await listWorkspaceFiles(root, absolute));
    if (entry.isFile()) output.push(normalizeRelativePath(path.relative(root, absolute)));
  }
  return output.sort();
}

export async function verifyEditablePaths(
  workspace: ExerciseWorkspace,
  editablePaths: readonly string[],
): Promise<ValidationOutcome<readonly string[]>> {
  try {
    const baseline = await readBaselineManifest(workspace.baselineManifestPath);
    const baselineByPath = new Map(baseline.files.map((file) => [file.path, file.sha256]));
    const currentPaths = await listWorkspaceFiles(workspace.root);
    const allPaths = [...new Set([...baselineByPath.keys(), ...currentPaths])].sort();
    const changed: string[] = [];

    for (const relativePath of allPaths) {
      let currentHash: string | undefined;
      try {
        const bytes = await readFile(path.join(workspace.root, relativePath));
        currentHash = createHash('sha256').update(bytes).digest('hex');
      } catch {
        currentHash = undefined;
      }
      if (currentHash !== baselineByPath.get(relativePath)) changed.push(relativePath);
    }

    const forbidden = changed.filter((candidate) => !matchesEditablePath(candidate, editablePaths));
    if (forbidden.length > 0) {
      return failure(forbidden.map((candidate) => ({
        code: 'EXERCISE_EDITABLE_001',
        severity: 'error' as const,
        location: { file: candidate },
        observed: candidate,
        expected: `A changed path matching one of: ${editablePaths.join(', ')}`,
        reason: 'The learner modified or deleted a protected path',
        remediation: 'Restore the protected file and place implementation changes in an editable path',
        documentation: 'docs/learner/exercise-workflow.md',
      })));
    }
    return success(changed);
  } catch (error) {
    return failure([{
      code: 'EXERCISE_EDITABLE_002',
      severity: 'error',
      location: { file: workspace.root },
      observed: error instanceof Error ? error.message : String(error),
      expected: 'A regular-file workspace with readable baseline metadata',
      reason: 'Protected-path verification could not safely enumerate the workspace',
      remediation: 'Remove symlinks and repair the .roadmap baseline manifest before retrying',
      documentation: 'docs/learner/exercise-workflow.md',
    }]);
  }
}
```

- [ ] **Step 3: Write failing baseline-versus-learner verification tests**

```ts
// packages/exercise-runner/test/verify-exercise.test.ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadExercise, materializeExercise, verifyExercise } from '../src/index.js';

const fixture = new URL('../../../fixtures/exercises/valid/minimal/', import.meta.url);

describe('verifyExercise', () => {
  it('passes baseline infrastructure while learner verification remains failed', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-verify-'));
    const definition = await loadExercise(fixture);
    const workspace = await materializeExercise(fixture, output);
    expect(definition.ok && workspace.ok).toBe(true);
    if (!definition.ok || !workspace.ok) return;

    const baseline = await verifyExercise(definition.value, workspace.value, 'baseline');
    const learner = await verifyExercise(definition.value, workspace.value, 'learner');
    expect(baseline.status).toBe('passed');
    expect(learner.status).toBe('failed');
  });

  it('does not execute commands after a protected test is changed', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-protected-'));
    const definition = await loadExercise(fixture);
    const workspace = await materializeExercise(fixture, output);
    if (!definition.ok || !workspace.ok) throw new Error('Fixture must load');

    await writeFile(path.join(output, 'test/open/counter.contract.test.js'), '// removed\n');
    const report = await verifyExercise(definition.value, workspace.value, 'learner');
    expect(report.status).toBe('failed');
    expect(report.steps).toHaveLength(0);
    expect(report.diagnostics[0]?.code).toBe('EXERCISE_EDITABLE_001');
  });
});
```

Add focused cases for tampered and replayed manifests, protected deletion, addition, rename, case alias, and reparse alias. Each case must fail before `runCommand` is called and must retain the stable diagnostic location and remediation.

- [ ] **Step 4: Implement protected-path verification, contained working directories, and command composition**

```ts
// packages/exercise-runner/src/verify-exercise.ts
import path from 'node:path';
import type { CommandResult } from '@roadmap/command-runner';
import { runCommand } from '@roadmap/command-runner';
import type { ExerciseDefinition } from '@roadmap/exercise-contract';
import type { Diagnostic } from '@roadmap/validation-core';
import type { ExerciseWorkspace } from './materialize.js';
import { verifyEditablePaths } from './verify-editable-paths.js';

export type VerificationMode = 'baseline' | 'learner';

export interface VerificationStepResult {
  id: string;
  required: boolean;
  command: CommandResult;
}

export interface ExerciseVerificationReport {
  exerciseId: string;
  mode: VerificationMode;
  status: 'passed' | 'failed' | 'internal-error';
  steps: readonly VerificationStepResult[];
  diagnostics: readonly Diagnostic[];
}

function resolveWorkspaceDirectory(root: string, relative: string): string {
  const resolved = path.resolve(root, relative);
  const relationship = path.relative(root, resolved);
  if (relationship === '..' || relationship.startsWith(`..${path.sep}`) || path.isAbsolute(relationship)) {
    throw new Error(`Command working directory escapes workspace: ${relative}`);
  }
  return resolved;
}

export async function verifyExercise(
  definition: ExerciseDefinition,
  workspace: ExerciseWorkspace,
  mode: VerificationMode,
): Promise<ExerciseVerificationReport> {
  const steps: VerificationStepResult[] = [];
  const diagnostics: Diagnostic[] = [];
  try {
    const protectedPaths = await verifyEditablePaths(
      workspace,
      definition.constraints.editablePaths,
    );
    if (!protectedPaths.ok) {
      return {
        exerciseId: definition.id,
        mode,
        status: 'failed',
        steps,
        diagnostics: protectedPaths.diagnostics,
      };
    }

    for (const step of definition.commands[mode]) {
      const command = await runCommand({
        command: step.command,
        args: step.args,
        cwd: resolveWorkspaceDirectory(workspace.root, step.cwd),
        timeoutMs: step.timeoutMs,
      });
      steps.push({ id: step.id, required: step.required, command });
      if (step.required && (command.exitCode !== 0 || command.timedOut)) {
        diagnostics.push({
          code: command.timedOut ? 'EXERCISE_COMMAND_002' : 'EXERCISE_COMMAND_001',
          severity: 'error',
          location: { file: workspace.root, pointer: `/commands/${mode}/${step.id}` },
          observed: { exitCode: command.exitCode, timedOut: command.timedOut, stderr: command.stderr },
          expected: 'Required verification command exits 0 within its timeout',
          reason: command.timedOut ? 'The verification command timed out' : 'The verification command failed',
          remediation: `Run ${step.command} ${step.args.join(' ')} in the learner workspace and fix the reported failure`,
          documentation: 'docs/learner/exercise-workflow.md',
        });
        break;
      }
    }
    return {
      exerciseId: definition.id,
      mode,
      status: diagnostics.length === 0 ? 'passed' : 'failed',
      steps,
      diagnostics,
    };
  } catch (error) {
    return {
      exerciseId: definition.id,
      mode,
      status: 'internal-error',
      steps,
      diagnostics: [{
        code: 'EXERCISE_INTERNAL_001',
        severity: 'error',
        location: { file: workspace.root },
        observed: error instanceof Error ? error.message : String(error),
        expected: 'Verifier completes normally within the learner workspace',
        reason: 'The exercise verifier crashed',
        remediation: 'Report the verifier crash with the exercise and template versions',
        documentation: 'docs/maintainers/verifier-failures.md',
      }],
    };
  }
}
```

When `runCommand` rejects a typed spawn, output-limit, or cleanup error, `verifyExercise` must convert it to a stable `EXERCISE_COMMAND_003`/`EXERCISE_COMMAND_004`/`EXERCISE_COMMAND_005` diagnostic with the step pointer and remediation, never the raw error text. Only an unexpected verifier crash becomes `EXERCISE_INTERNAL_001`; all of these mappings remain fail closed and are covered by the Task 4 tests.

- [ ] **Step 5: Export, verify, and commit**

Add these exports to `packages/exercise-runner/src/index.ts`:

```ts
export * from './verify-editable-paths.js';
export * from './verify-exercise.js';
```

Run:

```bash
pnpm --filter @roadmap/exercise-runner check
pnpm --filter @roadmap/exercise-runner test
```

Commit:

```bash
git add packages/exercise-runner
git commit -m "feat: verify protected exercise workspaces"
```


### Task 5: Add a real progressive-disclosure JavaScript exercise and non-destructive CLI

**Files:**
- Create: `exercises/javascript/ex-js-closure-counter/**`
- Create: `tooling/verify-exercise/package.json`
- Create: `tooling/verify-exercise/tsconfig.json`
- Create: `tooling/verify-exercise/vitest.config.ts`
- Create: `tooling/verify-exercise/src/main.ts`
- Create: `tooling/verify-exercise/test/cli.test.ts`
- Create: `docs/authoring/exercises.md`
- Create: `docs/learner/exercise-workflow.md`
- Create: `docs/maintainers/verifier-failures.md`
- Modify: `curriculum/lessons/lesson-js-closure-private-state.md`
- Modify: `curriculum/assessments/assessment-js-closure.md`
- Modify: `package.json`
- Preserve: root `vitest.config.ts` and its existing workspace globs; do not edit it

**Interfaces:**
- Consumes: exercise loader, persistent workspace opener, verifier, and progressive-hint contract
- Produces: `pnpm exercise:verify -- <exercise-root> <workspace> <baseline|learner>` without replacing existing learner files

- [ ] **Step 1: Author the real exercise contract**

Create `exercise.yaml` with:

```yaml
schemaVersion: 1
id: ex-js-closure-counter
version: 1.0.0
title: Xây bộ đếm có trạng thái riêng
type: focused-exercise
language: javascript
competencies:
  - js.scope.lexical
  - js.function.closure
requiredLevel:
  js.scope.lexical: implement
  js.function.closure: implement
prerequisites:
  - js.function.values
commands:
  baseline:
    - id: infrastructure
      required: true
      command: pnpm
      args: [test:infrastructure]
      cwd: .
      timeoutMs: 60000
  learner:
    - id: contract
      required: true
      command: pnpm
      args: [test]
      cwd: .
      timeoutMs: 60000
constraints:
  editablePaths: [src/**]
  forbiddenDependencies: []
  forbiddenApis: [globalThis]
evidence:
  - test-report
  - source-diff
  - explanation
hints:
  - level: 1
    path: hints/01-concept.md
  - level: 2
    path: hints/02-diagnostic.md
  - level: 3
    path: hints/03-structure.md
```

- [ ] **Step 2: Author starter infrastructure and open contract tests**

```json
// starter/package.json
{
  "private": true,
  "type": "module",
  "scripts": {
    "test:infrastructure": "node --test test/infrastructure.test.js",
    "test": "node --test"
  }
}
```

```js
// starter/src/counter.js
export function createCounter() {
  throw new Error('Implement createCounter');
}
```

```js
// starter/test/infrastructure.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCounter } from '../src/counter.js';

test('starter exports createCounter', () => {
  assert.equal(typeof createCounter, 'function');
});
```

```js
// tests/open/counter.contract.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCounter } from '../../src/counter.js';

test('each counter preserves independent private state', () => {
  const first = createCounter();
  const second = createCounter();
  for (let expected = 1; expected <= 10; expected += 1) {
    assert.equal(first(), expected);
  }
  assert.equal(second(), 1);
});
```

The materializer copies this open test to `test/open/counter.contract.test.js`. It remains protected by the baseline manifest and fails for the intended missing implementation.

Bind this exercise through the existing curriculum ownership surfaces in the same future Task 5 implementation: add the exercise reference to `curriculum/lessons/lesson-js-closure-private-state.md` and the artifact reference to `curriculum/assessments/assessment-js-closure.md`. The orchestration/tooling adapter must validate that both references resolve to `ex-js-closure-counter` without adding curriculum-package dependencies to `exercise-runner`. Keep `forbiddenDependencies` and `forbiddenApis` only when the verifier enforces them with a focused negative test; otherwise remove those fields from the metadata contract rather than publishing unenforced claims.

- [ ] **Step 3: Author three genuinely progressive hints**

`hints/01-concept.md`:

```markdown
# Gợi ý 1: Khái niệm

Biến trạng thái phải thuộc lexical environment được tạo riêng mỗi lần gọi `createCounter`, không thuộc global scope.
```

`hints/02-diagnostic.md`:

```markdown
# Gợi ý 2: Chẩn đoán

Kiểm tra vị trí khai báo biến đếm. Nếu hai counter ảnh hưởng lẫn nhau, biến đang được chia sẻ ngoài lần gọi `createCounter`.
```

`hints/03-structure.md`:

```markdown
# Gợi ý 3: Cấu trúc

`createCounter` cần khai báo một biến cục bộ rồi trả về một function tăng và trả lại biến đó. Function trả về sẽ giữ lexical environment bằng closure.
```

- [ ] **Step 4: Add walkthrough and reference solution outside the starter**

```js
// solution/src/counter.js
export function createCounter() {
  let value = 0;
  return function next() {
    value += 1;
    return value;
  };
}
```

The walkthrough explains lexical environment, instance independence, why a global variable fails, and why the reference solution is not the only valid implementation.

- [ ] **Step 5: Write CLI integration tests for baseline output and workspace preservation**

```ts
// tooling/verify-exercise/test/cli.test.ts
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '../../..');
const source = path.join(root, 'exercises/javascript/ex-js-closure-counter');

async function run(workspace: string, mode: 'baseline' | 'learner') {
  return execFileAsync(process.execPath, [
    '--import',
    'tsx',
    'tooling/verify-exercise/src/main.ts',
    source,
    workspace,
    mode,
    '--json',
  ], { cwd: root });
}

describe('verify-exercise CLI', () => {
  it('returns JSON and exit 0 for baseline verification', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'roadmap-cli-'));
    const { stdout } = await run(workspace, 'baseline');
    expect(JSON.parse(stdout).status).toBe('passed');
  });

  it('reopens rather than rematerializes an existing learner workspace', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'roadmap-cli-persist-'));
    await run(workspace, 'baseline');
    const learnerSource = 'export function createCounter() { return () => 99; }\n';
    await writeFile(path.join(workspace, 'src/counter.js'), learnerSource);

    await run(workspace, 'baseline');
    expect(await readFile(path.join(workspace, 'src/counter.js'), 'utf8')).toBe(learnerSource);
  });
});
```

- [ ] **Step 6: Implement the CLI without shell interpolation or destructive rematerialization**

```ts
// tooling/verify-exercise/src/main.ts
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadExercise, openExerciseWorkspace, verifyExercise } from '@roadmap/exercise-runner';

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const [sourceArg, workspaceArg, modeArg, ...formatArgs] = argv;
  const machine = formatArgs.length === 1 && formatArgs[0] === '--json';
  const validFormat = formatArgs.length === 0 || machine;
  if (!sourceArg || !workspaceArg || (modeArg !== 'baseline' && modeArg !== 'learner') || !validFormat) {
    return emit({ status: 'usage-error', message: 'Usage: verify-exercise <exercise-root> <workspace> <baseline|learner> [--json]' }, machine, 2);
  }

  try {
    const source = path.resolve(sourceArg);
    const workspaceRoot = path.resolve(workspaceArg);
    const definition = await loadExercise(source);
    const workspace = await openExerciseWorkspace(source, workspaceRoot);
    if (!definition.ok || !workspace.ok) {
      const diagnostics = [
        ...(definition.ok ? [] : definition.diagnostics),
        ...(workspace.ok ? [] : workspace.diagnostics),
      ];
      return emit({ status: 'invalid', diagnostics }, machine, 1);
    }
    const report = await verifyExercise(definition.value, workspace.value, modeArg);
    return emit(report, machine, report.status === 'passed' ? 0 : 1);
  } catch (error) {
    return emit({
      status: 'internal-error',
      diagnostics: [{
        code: 'EXERCISE_INTERNAL_001',
        severity: 'error',
        location: { file: workspaceArg },
        observed: 'The verifier failed before it could produce a report',
        expected: 'A stable exercise verification report',
        reason: 'The exercise verifier encountered an internal failure',
        remediation: 'Report the failure without exposing the raw exception',
        documentation: 'docs/maintainers/verifier-failures.md',
      }],
    }, machine, 3);
  }
}

function emit(value: unknown, machine: boolean, exitCode: number): number {
  if (machine) console.log(JSON.stringify(value));
  else if (exitCode === 0) console.log(formatHuman(value));
  else console.error(formatHuman(value));
  return exitCode;
}

function formatHuman(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
```

The module must be import-safe: importing it must not parse argv, spawn a process, write lifecycle noise, or terminate the caller. Machine mode writes exactly one JSON value to stdout and no raw exception to stderr; human mode is the only mode that formats readable diagnostics. `emit` is the sole output path so usage, expected validation failure, and internal failure retain exits `2`, `1`, and `3` respectively.

- [ ] **Step 7: Wire the root script and prove baseline passes while learner mode fails**

```json
{
  "scripts": {
    "exercise:verify": "tsx tooling/verify-exercise/src/main.ts"
  }
}
```

Run from a clean `.tmp/exercise` path:

```bash
pnpm exec tsx tooling/verify-exercise/src/main.ts exercises/javascript/ex-js-closure-counter .tmp/exercise baseline --json
pnpm exec tsx tooling/verify-exercise/src/main.ts exercises/javascript/ex-js-closure-counter .tmp/exercise learner --json
pnpm exercise:verify -- exercises/javascript/ex-js-closure-counter .tmp/exercise baseline
```

Expected: the direct machine baseline exits `0` with one JSON value; the direct machine learner exits `1` with `EXERCISE_COMMAND_001` because the starter intentionally has no learner implementation; the human wrapper prints readable output without being used as a machine parser. Add focused tests for usage exit `2`, internal exit `3`, empty/owned stderr, one-value stdout, missing targets, valid reopens, invalid manifests, non-empty unknown targets, and reference-solution overlay.

- [ ] **Step 8: Install the reference source only in the temporary workspace and prove learner mode passes**

```bash
node --input-type=module --eval "import { copyFile } from 'node:fs/promises'; await copyFile('exercises/javascript/ex-js-closure-counter/solution/src/counter.js', '.tmp/exercise/src/counter.js')"
pnpm exec tsx tooling/verify-exercise/src/main.ts exercises/javascript/ex-js-closure-counter .tmp/exercise learner --json
```

Expected: exit `0`, status `passed`, and the CLI does not replace the copied implementation before verification.

The integration test must perform this reference overlay automatically in its temporary workspace and invoke the same learner verifier used for the starter assertion; a separate reference-only verifier or a manually inspected result is not sufficient.

Commit:

```bash
git add exercises/javascript/ex-js-closure-counter tooling/verify-exercise package.json docs/authoring/exercises.md docs/learner/exercise-workflow.md docs/maintainers/verifier-failures.md
git commit -m "feat: add progressive closure exercise workflow"
```

### WP-05 exercise-only acceptance gate — `WP05_ONLY_EXECUTION_BOUNDARY`

Before leaving WP-05, run the direct machine baseline and learner commands, verify the starter's intended failure, overlay the reference solution and rerun the identical learner verifier, check the edge/negative case, confirm protected-file and non-destructive workspace behavior, and link-check the three WP-05 authoring/learner/maintainer documents. This gate does not evaluate rubrics, evidence trust, remediation, or any other WP-06 concern.


### Task 6: Define criterion-based rubrics and evaluation — `WP06_DEFERRED_NOT_AUTHORIZED`

> **WP06_DEFERRED_NOT_AUTHORIZED:** Reference material only. Do not implement, test, commit, or claim this task under the WP-05 dispatch.

**Files:**
- Create: `packages/rubric-schema/package.json`
- Create: `packages/rubric-schema/tsconfig.json`
- Create: `packages/rubric-schema/vitest.config.ts`
- Create: `packages/rubric-schema/src/schema.ts`
- Create: `packages/rubric-schema/src/evaluate.ts`
- Create: `packages/rubric-schema/src/index.ts`
- Create: `packages/rubric-schema/test/rubric.test.ts`
- Preserve: root `vitest.config.ts` and its existing workspace globs; do not edit it

**Interfaces:**
- Consumes: stable criterion IDs and explicit evidence references
- Produces: `RubricSchema`, `Rubric`, `RubricSubmissionSchema`, `evaluateRubric`, and `RubricEvaluation`

- [ ] **Step 1: Write failing tests for critical, required, and missing criteria**

```ts
// packages/rubric-schema/test/rubric.test.ts
import { describe, expect, it } from 'vitest';
import { evaluateRubric, RubricSchema } from '../src/index.js';

const rubric = RubricSchema.parse({
  schemaVersion: 1,
  id: 'rubric-js-closure-counter',
  version: '1.0.0',
  title: 'Closure counter rubric',
  criteria: [
    {
      id: 'closure.private-state',
      title: 'Private state',
      critical: true,
      required: true,
      competency: 'js.function.closure',
      evidence: ['source-diff', 'test-report'],
      levels: {
        '0': 'State is global or absent',
        '1': 'State is local but instances interfere',
        '2': 'Each counter has independent private state and negative tests',
        '3': 'Meets level 2 and clearly explains lexical environment lifetime',
      },
    },
    {
      id: 'documentation.explanation',
      title: 'Explanation',
      critical: false,
      required: true,
      competency: 'js.function.closure',
      evidence: ['explanation'],
      levels: {
        '0': 'Missing', '1': 'Describes code only', '2': 'Explains mechanism', '3': 'Explains trade-offs and counterexample',
      },
    },
  ],
});

describe('evaluateRubric', () => {
  it('fails when a critical criterion is below 2 regardless of another score', () => {
    const result = evaluateRubric(rubric, {
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      scores: { 'closure.private-state': 1, 'documentation.explanation': 3 },
    });
    expect(result.status).toBe('needs-remediation');
    expect(result.blockingCriterionIds).toEqual(['closure.private-state']);
  });

  it('passes only when every required criterion is present and at least 2', () => {
    expect(evaluateRubric(rubric, {
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      scores: { 'closure.private-state': 2, 'documentation.explanation': 2 },
    }).status).toBe('passed');
  });


  it('rejects scores for criteria not declared by the rubric', () => {
    expect(() => evaluateRubric(rubric, {
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      scores: {
        'closure.private-state': 2,
        'documentation.explanation': 2,
        'unknown.criterion': 3,
      },
    })).toThrow(/Unknown rubric criterion: unknown\.criterion/);
  });

  it('rejects a submission for another rubric version', () => {
    expect(() => evaluateRubric(rubric, {
      rubricId: rubric.id,
      rubricVersion: '9.9.9',
      scores: { 'closure.private-state': 2, 'documentation.explanation': 2 },
    })).toThrow(/expected rubric-js-closure-counter@1\.0\.0/);
  });
});
```

- [ ] **Step 2: Implement strict schemas**

```ts
// packages/rubric-schema/src/schema.ts
import { z } from 'zod';

const ScoreSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const CriterionIdSchema = z.string().regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/);
const CompetencyIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/);

export const RubricSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^rubric-[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: z.string().min(1),
  criteria: z.array(z.object({
    id: CriterionIdSchema,
    title: z.string().min(1),
    critical: z.boolean(),
    required: z.boolean(),
    competency: CompetencyIdSchema,
    evidence: z.array(z.string().min(1)).min(1),
    levels: z.object({
      '0': z.string().min(1),
      '1': z.string().min(1),
      '2': z.string().min(1),
      '3': z.string().min(1),
    }).strict(),
  }).strict()).min(1),
}).strict().superRefine((rubric, context) => {
  const ids = rubric.criteria.map((criterion) => criterion.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['criteria'], message: 'Criterion IDs must be unique' });
});

export const RubricSubmissionSchema = z.object({
  rubricId: z.string(),
  rubricVersion: z.string(),
  scores: z.record(CriterionIdSchema, ScoreSchema),
}).strict();

export type Rubric = z.infer<typeof RubricSchema>;
export type RubricSubmission = z.infer<typeof RubricSubmissionSchema>;
export type RubricScore = z.infer<typeof ScoreSchema>;
```

- [ ] **Step 3: Implement evaluation without total-score shortcuts**

```ts
// packages/rubric-schema/src/evaluate.ts
import { RubricSubmissionSchema, type Rubric, type RubricScore, type RubricSubmission } from './schema.js';

export interface CriterionResult {
  criterionId: string;
  critical: boolean;
  required: boolean;
  score: RubricScore | null;
  status: 'passed' | 'failed' | 'missing';
}

export interface RubricEvaluation {
  status: 'passed' | 'needs-remediation';
  criteria: readonly CriterionResult[];
  blockingCriterionIds: readonly string[];
}

export function evaluateRubric(rubric: Rubric, submissionInput: RubricSubmission): RubricEvaluation {
  const submission = RubricSubmissionSchema.parse(submissionInput);
  if (submission.rubricId !== rubric.id || submission.rubricVersion !== rubric.version) {
    throw new Error(`Rubric submission targets ${submission.rubricId}@${submission.rubricVersion}, expected ${rubric.id}@${rubric.version}`);
  }

  const knownCriterionIds = new Set(rubric.criteria.map((criterion) => criterion.id));
  const unknownCriterionIds = Object.keys(submission.scores)
    .filter((criterionId) => !knownCriterionIds.has(criterionId))
    .sort();
  if (unknownCriterionIds.length > 0) {
    throw new Error(`Unknown rubric criterion: ${unknownCriterionIds.join(', ')}`);
  }

  const criteria = rubric.criteria.map((criterion): CriterionResult => {
    const score = submission.scores[criterion.id] ?? null;
    return {
      criterionId: criterion.id,
      critical: criterion.critical,
      required: criterion.required,
      score,
      status: score === null ? 'missing' : score >= 2 ? 'passed' : 'failed',
    };
  });
  const blockingCriterionIds = criteria
    .filter((criterion) => (criterion.required || criterion.critical) && criterion.status !== 'passed')
    .map((criterion) => criterion.criterionId);
  return {
    status: blockingCriterionIds.length === 0 ? 'passed' : 'needs-remediation',
    criteria,
    blockingCriterionIds,
  };
}
```

- [ ] **Step 4: Run the unknown-key and version-mismatch tests**

Run `pnpm --filter @roadmap/rubric-schema test -- rubric.test.ts` and require both explicit errors from Step 1.

- [ ] **Step 5: Export, verify, and commit**

```ts
// packages/rubric-schema/src/index.ts
export * from './evaluate.js';
export * from './schema.js';
```

Run:

```bash
pnpm --filter @roadmap/rubric-schema check
pnpm --filter @roadmap/rubric-schema test
```

Commit:

```bash
git add packages/rubric-schema
git commit -m "feat: evaluate critical rubric criteria"
```

### Task 7: Define versioned evidence with independent trust attestations — `WP06_DEFERRED_NOT_AUTHORIZED`

> **WP06_DEFERRED_NOT_AUTHORIZED:** Reference material only. Do not implement, test, commit, or claim this task under the WP-05 dispatch.

**Files:**
- Create: `packages/evidence-schema/package.json`
- Create: `packages/evidence-schema/tsconfig.json`
- Create: `packages/evidence-schema/vitest.config.ts`
- Create: `packages/evidence-schema/src/schema.ts`
- Create: `packages/evidence-schema/src/trust.ts`
- Create: `packages/evidence-schema/src/index.ts`
- Create: `packages/evidence-schema/test/evidence.test.ts`
- Preserve: root `vitest.config.ts` and its existing workspace globs; do not edit it

**Interfaces:**
- Consumes: curriculum, template, milestone, and immutable repository versions
- Produces: `EvidenceManifestSchema`, `EvidenceManifest`, `EvidenceTrustLevel`, `EvidenceAttestations`, and `satisfiesTrustRequirement`

- [ ] **Step 1: Create the package and write failing evidence tests**

```json
{
  "name": "@roadmap/evidence-schema",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check": "tsc --project tsconfig.json",
    "test": "vitest run --config vitest.config.ts"
  },
  "dependencies": {
    "zod": "catalog:"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

```ts
// packages/evidence-schema/test/evidence.test.ts
import { describe, expect, it } from 'vitest';
import { EvidenceManifestSchema, satisfiesTrustRequirement } from '../src/index.js';

const valid = {
  schemaVersion: 1,
  curriculumVersion: '0.1.0',
  templateVersion: '0.1.0',
  milestoneId: 'milestone-fullstack-vertical-slice',
  repository: {
    url: 'https://github.com/example/workshop-enrollment',
    commit: '0123456789abcdef0123456789abcdef01234567',
    attestations: ['repository-verifiable'],
  },
  verification: {
    ciRun: 'https://github.com/example/workshop-enrollment/actions/runs/123',
    status: 'passed',
    attestations: ['ci-verified'],
  },
  artifacts: [
    {
      id: 'architecture',
      path: 'evidence/architecture/overview.md',
      attestations: ['repository-verifiable'],
    },
  ],
};

describe('EvidenceManifestSchema', () => {
  it('accepts a versioned evidence manifest', () => {
    expect(EvidenceManifestSchema.parse(valid)).toEqual(valid);
  });

  it('rejects mutable branch names as repository commits', () => {
    expect(() => EvidenceManifestSchema.parse({
      ...valid,
      repository: { ...valid.repository, commit: 'main' },
    })).toThrow();
  });

  it('treats evidence attestations as independent capabilities, not a total order', () => {
    expect(satisfiesTrustRequirement(['self-reported'], 'ci-verified')).toBe(false);
    expect(satisfiesTrustRequirement(['human-reviewed'], 'ci-verified')).toBe(false);
    expect(satisfiesTrustRequirement(['externally-observable'], 'repository-verifiable')).toBe(false);
    expect(satisfiesTrustRequirement(['ci-verified', 'human-reviewed'], 'ci-verified')).toBe(true);
  });

  it('rejects a failed verification that claims ci-verified attestation', () => {
    expect(() => EvidenceManifestSchema.parse({
      ...valid,
      verification: { ...valid.verification, status: 'failed' },
    })).toThrow(/failed verification cannot claim ci-verified/);
  });

  it('rejects duplicate artifact IDs, traversal paths, insecure URLs, and duplicate attestations', () => {
    expect(() => EvidenceManifestSchema.parse({
      ...valid,
      artifacts: [valid.artifacts[0], valid.artifacts[0]],
    })).toThrow(/Artifact IDs must be unique/);
    expect(() => EvidenceManifestSchema.parse({
      ...valid,
      artifacts: [{ ...valid.artifacts[0], path: '../answer.md' }],
    })).toThrow();
    expect(() => EvidenceManifestSchema.parse({
      ...valid,
      repository: { ...valid.repository, url: 'http://example.com/repo' },
    })).toThrow();
    expect(() => EvidenceManifestSchema.parse({
      ...valid,
      repository: {
        ...valid.repository,
        attestations: ['repository-verifiable', 'repository-verifiable'],
      },
    })).toThrow(/Attestations must be unique/);
  });
});
```

- [ ] **Step 2: Implement independent trust-attestation semantics**

```ts
// packages/evidence-schema/src/trust.ts
export const evidenceTrustLevels = [
  'self-reported',
  'repository-verifiable',
  'ci-verified',
  'externally-observable',
  'human-reviewed',
] as const;

export type EvidenceTrustLevel = typeof evidenceTrustLevels[number];
export type EvidenceAttestations = readonly EvidenceTrustLevel[];

export function satisfiesTrustRequirement(
  actual: EvidenceAttestations,
  required: EvidenceTrustLevel,
): boolean {
  return actual.includes(required);
}
```

Do not add `compareTrustLevel`. Human review, CI execution, repository immutability, and external observability are different claims. One does not automatically prove another.

- [ ] **Step 3: Implement the strict manifest schema**

```ts
// packages/evidence-schema/src/schema.ts
import { z } from 'zod';
import { evidenceTrustLevels } from './trust.js';

const TrustSchema = z.enum(evidenceTrustLevels);
const AttestationsSchema = z.array(TrustSchema).min(1).superRefine((attestations, context) => {
  if (new Set(attestations).size !== attestations.length) {
    context.addIssue({ code: 'custom', message: 'Attestations must be unique' });
  }
});
const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
const UrlSchema = z.string().url().refine(
  (url) => url.startsWith('https://'),
  'Evidence URLs must use HTTPS',
);
const RelativeEvidencePathSchema = z.string().regex(
  /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/,
  'Evidence paths must be repository-relative and cannot traverse',
);

export const EvidenceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  curriculumVersion: SemverSchema,
  templateVersion: SemverSchema,
  milestoneId: z.string().regex(/^milestone-[a-z0-9]+(?:-[a-z0-9]+)*$/),
  repository: z.object({
    url: UrlSchema,
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    attestations: AttestationsSchema,
  }).strict(),
  deployment: z.object({
    frontend: UrlSchema.optional(),
    api: UrlSchema.optional(),
    attestations: AttestationsSchema,
  }).strict().optional(),
  verification: z.object({
    ciRun: UrlSchema,
    status: z.enum(['passed', 'failed']),
    attestations: AttestationsSchema,
  }).strict(),
  artifacts: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    path: RelativeEvidencePathSchema,
    attestations: AttestationsSchema,
  }).strict()).min(1),
}).strict().superRefine((manifest, context) => {
  const artifactIds = manifest.artifacts.map((artifact) => artifact.id);
  if (new Set(artifactIds).size !== artifactIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['artifacts'],
      message: 'Artifact IDs must be unique',
    });
  }
  if (
    manifest.verification.status === 'failed' &&
    manifest.verification.attestations.includes('ci-verified')
  ) {
    context.addIssue({
      code: 'custom',
      path: ['verification', 'attestations'],
      message: 'A failed verification cannot claim ci-verified attestation',
    });
  }
});

export type EvidenceManifest = z.infer<typeof EvidenceManifestSchema>;
```

- [ ] **Step 4: Export, verify, and commit**

```ts
// packages/evidence-schema/src/index.ts
export * from './schema.js';
export * from './trust.js';
```

Run:

```bash
pnpm --filter @roadmap/evidence-schema check
pnpm --filter @roadmap/evidence-schema test
```

Commit:

```bash
git add packages/evidence-schema
git commit -m "feat: validate independent evidence attestations"
```


### Task 8: Map failed rubric criteria to deterministic remediation — `WP06_DEFERRED_NOT_AUTHORIZED`

> **WP06_DEFERRED_NOT_AUTHORIZED:** Reference material only. Do not implement, test, commit, or claim this task under the WP-05 dispatch.

**Files:**
- Create: `packages/assessment-core/package.json`
- Create: `packages/assessment-core/tsconfig.json`
- Create: `packages/assessment-core/vitest.config.ts`
- Create: `packages/assessment-core/src/remediation.ts`
- Create: `packages/assessment-core/src/result.ts`
- Create: `packages/assessment-core/src/index.ts`
- Create: `packages/assessment-core/test/assessment.test.ts`
- Create: `fixtures/assessment/closure-counter-remediation.yaml`
- Preserve: root `vitest.config.ts` and its existing workspace globs; do not edit it

**Interfaces:**
- Consumes: `RubricEvaluation`, competency IDs, and remediation metadata
- Produces: `RemediationCatalogSchema`, `createAssessmentResult`, and `AssessmentResult`

- [ ] **Step 1: Write the remediation fixture and failing test**

```yaml
# fixtures/assessment/closure-counter-remediation.yaml
schemaVersion: 1
entries:
  - criterion: closure.private-state
    competency: js.function.closure
    lessons:
      - lesson-js-closure-private-state
    exercises:
      - ex-js-closure-counter
    retake:
      - Restore independent state for each counter instance
      - Add the negative independence test
      - Update the technical explanation
```

```ts
// packages/assessment-core/test/assessment.test.ts
import { describe, expect, it } from 'vitest';
import { RubricSchema } from '@roadmap/rubric-schema';
import {
  createAssessmentResult,
  RemediationCatalogSchema,
  validateRemediationCoverage,
} from '../src/index.js';

const catalog = RemediationCatalogSchema.parse({
  schemaVersion: 1,
  entries: [{
    criterion: 'closure.private-state',
    competency: 'js.function.closure',
    lessons: ['lesson-js-closure-private-state'],
    exercises: ['ex-js-closure-counter'],
    retake: ['Restore independent state', 'Add negative test'],
  }],
});

describe('createAssessmentResult', () => {
  it('returns exact remediation for each blocking criterion', () => {
    const result = createAssessmentResult({
      status: 'needs-remediation',
      criteria: [{ criterionId: 'closure.private-state', critical: true, required: true, score: 1, status: 'failed' }],
      blockingCriterionIds: ['closure.private-state'],
    }, catalog);
    expect(result.status).toBe('needs-remediation');
    expect(result.blocking[0]?.competency).toBe('js.function.closure');
  });

  it('fails closed when a blocking criterion has no remediation entry', () => {
    expect(() => createAssessmentResult({
      status: 'needs-remediation',
      criteria: [{ criterionId: 'missing.entry', critical: true, required: true, score: 0, status: 'failed' }],
      blockingCriterionIds: ['missing.entry'],
    }, catalog)).toThrow(/No remediation entry/);
  });


  it('reports every required rubric criterion without remediation as an error', () => {
    const rubric = RubricSchema.parse({
      schemaVersion: 1,
      id: 'rubric-js-closure-counter',
      version: '1.0.0',
      title: 'Closure counter rubric',
      criteria: [{
        id: 'documentation.explanation',
        title: 'Explanation',
        critical: false,
        required: true,
        competency: 'js.function.closure',
        evidence: ['explanation'],
        levels: { '0': 'Missing', '1': 'Partial', '2': 'Meets', '3': 'Strong' },
      }],
    });
    const outcome = validateRemediationCoverage(rubric, catalog);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.diagnostics[0]).toEqual(expect.objectContaining({
        code: 'ASSESSMENT_REMEDIATION_001',
        severity: 'error',
      }));
    }
  });
});
```

- [ ] **Step 2: Create the package and implement schemas and result composition**

```json
{
  "name": "@roadmap/assessment-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "check": "tsc --project tsconfig.json",
    "test": "vitest run --config vitest.config.ts"
  },
  "dependencies": {
    "@roadmap/rubric-schema": "workspace:*",
    "@roadmap/validation-core": "workspace:*",
    "zod": "catalog:"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

```ts
// packages/assessment-core/src/remediation.ts
import type { Rubric } from '@roadmap/rubric-schema';
import { failure, success, type ValidationOutcome } from '@roadmap/validation-core';
import { z } from 'zod';

export const RemediationCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(z.object({
    criterion: z.string().min(1),
    competency: z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/),
    lessons: z.array(z.string().regex(/^lesson-[a-z0-9]+(?:-[a-z0-9]+)*$/)),
    exercises: z.array(z.string().regex(/^ex-[a-z0-9]+(?:-[a-z0-9]+)*$/)),
    retake: z.array(z.string().min(1)).min(1),
  }).strict()).min(1),
}).strict().superRefine((catalog, context) => {
  const ids = catalog.entries.map((entry) => entry.criterion);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['entries'], message: 'One remediation entry per criterion is allowed' });
});

export type RemediationCatalog = z.infer<typeof RemediationCatalogSchema>;

export function validateRemediationCoverage(
  rubric: Rubric,
  catalog: RemediationCatalog,
): ValidationOutcome<void> {
  const covered = new Set(catalog.entries.map((entry) => entry.criterion));
  const missing = rubric.criteria
    .filter((criterion) => (criterion.required || criterion.critical) && !covered.has(criterion.id))
    .sort((left, right) => left.id.localeCompare(right.id));

  if (missing.length > 0) {
    return failure(missing.map((criterion) => ({
      code: 'ASSESSMENT_REMEDIATION_001',
      severity: 'error' as const,
      location: { file: rubric.id, pointer: `/criteria/${criterion.id}` },
      observed: criterion.id,
      expected: 'One remediation entry for every required or critical criterion',
      reason: 'A blocking rubric failure would have no deterministic recovery path',
      remediation: `Add a remediation catalog entry for ${criterion.id}`,
      documentation: 'docs/authoring/remediation.md',
    })));
  }

  return success(undefined);
}
```

```ts
// packages/assessment-core/src/result.ts
import type { RubricEvaluation } from '@roadmap/rubric-schema';
import type { RemediationCatalog } from './remediation.js';

export interface AssessmentResult {
  status: 'passed' | 'needs-remediation';
  blocking: readonly RemediationCatalog['entries'][number][];
}

export function createAssessmentResult(evaluation: RubricEvaluation, catalog: RemediationCatalog): AssessmentResult {
  const byCriterion = new Map(catalog.entries.map((entry) => [entry.criterion, entry]));
  const blocking = evaluation.blockingCriterionIds.map((criterion) => {
    const entry = byCriterion.get(criterion);
    if (!entry) throw new Error(`No remediation entry for blocking criterion ${criterion}`);
    return entry;
  });
  return { status: evaluation.status, blocking };
}
```

- [ ] **Step 3: Run the remediation-coverage test**

Run `pnpm --filter @roadmap/assessment-core test -- assessment.test.ts`. The missing entry must produce `ASSESSMENT_REMEDIATION_001` with severity `error`; warning-only behavior is a test failure.

- [ ] **Step 4: Export, verify all assessment packages, and commit**

```ts
// packages/assessment-core/src/index.ts
export * from './remediation.js';
export * from './result.js';
```

Run:

```bash
pnpm --filter @roadmap/command-runner test
pnpm --filter @roadmap/exercise-contract test
pnpm --filter @roadmap/exercise-runner test
pnpm --filter @roadmap/rubric-schema test
pnpm --filter @roadmap/evidence-schema test
pnpm --filter @roadmap/assessment-core test
pnpm check
pnpm test
```

Commit:

```bash
git add packages/assessment-core fixtures/assessment
git commit -m "feat: produce criterion-level remediation"
```

## WP-05 exit gate — `WP05_ONLY_EXECUTION_BOUNDARY`

Run from a fresh clone:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm verify
pnpm exec tsx tooling/verify-exercise/src/main.ts exercises/javascript/ex-js-closure-counter .tmp/exercise baseline --json
```

Then run learner mode and require the expected non-zero result:

```bash
pnpm exec tsx tooling/verify-exercise/src/main.ts exercises/javascript/ex-js-closure-counter .tmp/exercise learner --json
```

Acceptance evidence must prove:

- Metadata cannot inject shell operators
- Timeout, missing-command, spawn, descendant-cleanup, output-limit, and race paths fail deterministically without raw exception leakage
- Canonical host-independent path and allow-only glob rules reject drive, UNC, device, control, reserved-name, alias, traversal, and negation/bypass inputs
- Existing unknown/non-empty output is preserved and rejected; owned sibling staging rolls back without deleting learner content
- Starter materialization excludes `solution/`
- A fresh authoritative baseline is compared on every open/verify, while baseline mode remains disposable and learner mode never overwrites persistent files
- Baseline infrastructure verification passes on incomplete learner work
- Learner verification fails for the intended missing implementation
- The same learner `pnpm verify` verifier fails the starter, passes the overlaid reference solution, and covers an edge/negative case
- Protected add/delete/modify/rename and reparse-alias changes are rejected before command execution
- The closure lesson `exercises` reference and closure assessment `artifact` reference resolve through the orchestration adapter
- The three WP-05 authoring/learner/maintainer documents exist and are link-checked; remediation documentation remains WP-06 deferred
- The direct machine CLI emits one JSON value on stdout with stable exits and the human root wrapper remains readable

Do not run or claim Tasks 6–8 from this gate. Their rubric, evidence, remediation, and Task 8 YAML consumer remain `WP06_DEFERRED_NOT_AUTHORIZED` reference material for the later WP-06 owner.

## WP-05 checkpoint

Stop after the exit gate. Request independent test-design review for command execution, protected-path detection, rubric false positives, and evidence trust semantics before starting template publication.
