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

- Every process is launched with `shell: false`, an argv array, an explicit usable-directory cwd, and deterministic executable resolution. A `.cmd` command is resolved through an explicit platform rule rather than shell interpolation; a literal argument containing metacharacters is never re-parsed as syntax.
- `timeoutMs` is validated as a finite positive integer no greater than 900000 milliseconds. Task 1 validates that its final cwd is a real, usable directory; it does not claim workspace containment because the locked runner API has no workspace-root authority.
- `error`, `exit`, `close`, timeout, output overflow, and cleanup races share one settlement gate. A result is settled once only, and `close` is the completion event after all bounded cleanup has been confirmed.
- Unix timeout cleanup uses an operation-owned process group with bounded graceful and forced phases. Windows timeout cleanup uses direct `taskkill.exe` argv for the descendant tree, also with bounded graceful and forced phases. Completion before confirmed descendant cleanup is forbidden.
- A spawn failure, output-limit failure, or unconfirmed cleanup is an internal typed runner error. The runner does not add that error to `CommandResult`; each caller maps it to a stable fail-closed diagnostic without leaking a raw exception or platform-specific stack.
- UTF-8 stdout and stderr capture is bounded to 1048576 bytes per stream. Overflow terminates the owned process tree, waits for confirmed cleanup, and rejects with the typed output-limit failure. Normal exit and confirmed timeout cleanup resolve the locked `CommandResult` shape.
- Focused tests cover normal exit, non-zero exit, literal metacharacters, missing executable, spawn failure, bounded timeout, a child that spawns a child, a SIGTERM-resistant child, descendant cleanup failure, output flood, signal/close races, and platform-appropriate process-tree behavior. Windows evidence must not be described as Linux evidence and Linux-only evidence must not be used to claim Windows behavior.

Task 4 owns workspace containment. Its caller resolves the command cwd beneath the trusted workspace, asynchronously realpaths both the canonical workspace root and candidate, compares canonical paths with platform-appropriate case behavior, and rejects symlink, junction, reparse-point, and case-alias escapes before invoking `runCommand`. The runner receives only the locked four-field `CommandSpec` and performs its usable-directory validation at the process boundary.

### T0_PATH_POLICY_CANONICAL — host-independent paths and allow-only globs

Path validation is a lexical contract independent of the host OS. Normalize only after validation of the raw string and use POSIX separators for the canonical representation. Ordinary relative paths reject empty paths, NUL and all control characters, absolute paths, drive-absolute paths, drive-relative forms such as `C:answer.js`, UNC roots, device roots, `.` and `..` segments, empty segments created by repeated separators, reserved DOS device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, and `LPT1`–`LPT9`, case-insensitive), trailing dots or spaces, colon aliases, and any segment whose realpath or reparse-point resolution escapes the declared root. Only the separately named command-CWD schema permits the exact semantic workspace root `.`; it still rejects `./x`, `x/.`, `..`, and every other dot-segment alias. A path that is lexically safe but resolves through a symlink, junction, mount, or case-folded alias outside the root is unsafe.

Editable patterns are an allow-only grammar rooted beneath a declared learner directory. Literal segments, `*`, `?`, and a narrowly prefix-rooted recursive suffix such as `src/**` are permitted. Negation (`!`), braces, every extglob opener (`!(`, `@(`, `+(`, `?(`, `*(`) anywhere in any pattern segment, unrooted global `**`, mixed allow/negate sets, absolute roots, and patterns that can match a parent or sibling directory are invalid. Every candidate is normalized and containment-checked before matching. Tests cover Windows drive, drive-relative, UNC, device, control, reserved-name, trailing-dot/space, dot-segment, symlink/junction/reparse, case-alias, recursive-suffix, embedded-extglob, and glob-bypass cases.

The concrete-path and editable-pattern rules above are completed by a single Win32 host-independence matrix that both consuming packages implement identically. It closes the remaining Windows-portability gaps and weakens no requirement already stated.

**Win32-invalid characters in concrete segments.** Every concrete path segment — in concrete evidence paths and in concrete exercise paths alike — additionally rejects the Windows-reserved characters `<`, `>`, `"`, `|`, `?`, and `*`. The existing rejection of `:`, `/`, `\`, and of all control characters is unchanged and remains in force; the new characters are added to that rejection, not substituted for it. A concrete segment never permits a glob operator, so `?` and `*` are literal-invalid there. The exercise side already rejects `?` and `*` through its glob-operator guard, and the evidence side rejects them under this same rule, so the two concrete validators share one character contract.

**Reserved DOS device aliases, ASCII and superscript.** The reserved device-name rejection covers `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, and `LPT1`–`LPT9`, case-insensitively for the ASCII letters, and additionally the superscript aliases `COM¹`, `COM²`, `COM³`, `LPT¹`, `LPT²`, and `LPT³` — code points U+00B9, U+00B2, and U+00B3 — both bare and carrying an ordinary extension, such as `COM¹.txt`, `com².log`, and `LPT³.json`. The superscript forms are matched by explicit code point, never by Unicode normalization or by digit-value folding. The rejection must not overreach onto legitimate names: `com10`, `lpt0`, `console`, `compile`, `auxiliary`, and `nullable` remain valid.

**Trailing dot and trailing space.** A segment ending in a `.` or in a space is rejected. This existing rule is restated here so the completed matrix reads as a whole.

**Editable glob patterns stay expressive.** `*` and `?` are not globally banned; they are the operators the editable grammar exists to permit, and `src/*.ts`, `src/file?.ts`, `src/**`, and `src/nested/**` remain valid editable patterns. Editable patterns still reject the literal characters `<`, `>`, `"`, and `|`, and reject both the ASCII and the superscript reserved device forms on their concrete literal prefix segments under the existing prefix policy. This completion weakens no existing editable-pattern restriction: negation rejection, brace rejection, every extglob-opener rejection, bracket-expression rejection, the prefix-rooted terminal-recursive-suffix restriction, the concrete-prefix restriction, and fail-closed handling of the whole runtime pattern set all remain in force.

**Non-goals of this contract.** This matrix adds no path-length limit, no Unicode normalization, no case-fold collision analysis, and no realpath or reparse-point behavior change. It does not alter evidence identifiers, remediation, deployment records, the generated-schema consumer boundary, the curriculum graph, or any WP-07 concern.

This portability contract is consumed by two packages that must agree — `packages/exercise-contract/src/paths.ts` in WP-05 and `packages/evidence-schema/src/schema.ts` in WP-06. They reach agreement by independent implementation of this one written contract, deliberately not through a shared package dependency: `evidence-schema` does not depend on `exercise-contract`, and a future contributor must not consolidate the duplication into such a dependency. The WP-05 `exercise-contract` package is already accepted; a tracked change to it is authorized under this correction only for this exact path-portability defect and for nothing else.

### T0_WORKSPACE_LIFECYCLE — non-destructive materialization and reopen

Source, staging, output, manifest, enumeration, and command-cwd boundaries are realpath- and reparse-safe. Output creation is missing-only: an existing empty directory is still existing/unknown and is rejected. An existing valid workspace is reopened without replacing learner files. An existing invalid workspace or any non-empty unknown target is an error; it is never recursively deleted and never silently replaced.

Materialization validates the source and output parents, creates an operation-owned sibling staging directory, copies only the allowlisted starter/open-test regular files without dereferencing links, writes and validates the staging manifest, and promotes without clobbering a target. The portable path validates the sibling stage, then acquires the final path through an exclusive non-recursive reservation, populates only that operation-owned target without overwrite, and retains an ownership token/inventory. A proven platform no-replace primitive may optimize promotion, but ordinary rename-over-target semantics are never treated as no-clobber. On every failure path, cleanup may remove an owned stage or reserved target only while the token and exact inventory prove ownership; unexpected content makes cleanup refuse and emit a stable failure. Existing learner content remains byte-for-byte preserved when staging, validation, promotion, or cleanup fails. Tests cover existing-empty output, an absent child beneath a temporary parent for normal success, target appearance after inspection, reservation collision, partial copy/rollback, failed promotion, unexpected-content cleanup refusal, source/output aliases, and Windows/Linux junction/symlink/reparse attacks.

### T0_AUTHORITATIVE_BASELINE — fresh source truth and learner persistence

A learner workspace manifest is provenance/cache evidence, never the sole truth. `ExerciseWorkspace` carries a readonly canonical `sourceRoot` captured by materialize/open after realpath and source/output alias checks; it is not learner-controlled. At the start of every `verifyExercise`, freshly derive an authoritative protected-file manifest from that source root and the loaded definition, strictly validate schema version, exercise identity, exercise version, normalized unique paths, byte counts, and hashes, and compare authoritative source, cached workspace manifest, and current workspace before any command. Fail closed on tampering, replayed manifests, deletion, addition, modification, rename, duplicate path, case alias, or symlink/reparse alias, and prove that `runCommand` is not called on each mismatch. Baseline mode always uses a fresh disposable materialization; learner mode reopens persistent state and never overwrites learner files.

### T0_PUBLIC_VERIFIER_SURFACES — independent starter and stable CLI

The public workspace materializes starter code, open tests, and the owned package/test harness only. Solutions, walkthroughs, and hints never enter learner materialization. Every learner workspace exposes `pnpm verify`; baseline infrastructure verification is a separate internal mode, and the same learner verifier must fail the starter for the intended reason and pass an overlaid reference solution automatically. Release 0 has no planned forbidden-dependency/API enforcement path, so `forbiddenDependencies` and `forbiddenApis` must be empty arrays in the schema fixture and Task 5 metadata; non-empty arrays fail schema validation until a later authorized task supplies real enforcement. The closure exercise still includes a behavioral edge/negative case.

The import-safe machine entry point is:

```text
pnpm exec tsx tooling/verify-exercise/src/main.ts <exercise-root> <workspace> <baseline|learner> --json
```

Machine mode emits exactly one JSON value on stdout, emits no pnpm lifecycle noise, owns its stderr explicitly, and uses stable exits: `0` for passed verification, `1` for expected validation/verification failure, `2` for usage failure, and `3` for internal failure. Output mode is selected independently of full argument validity: any invocation containing `--json`, including duplicate, reordered, or otherwise malformed usage, receives exactly one JSON usage/error value on stdout with empty stderr; invocations without `--json` retain human output. The human wrapper remains the public root script `exercise:verify` and may render readable diagnostics; CI and machine parsers use the direct command above, not lifecycle output. Missing, existing-valid, existing-invalid, and non-empty-unknown workspaces each have explicit tests and diagnostics.

### T0_EXERCISE_OWNERSHIP — curriculum closure and documentation map

Task 5 binds the real exercise through the existing curriculum ownership surfaces: the closure lesson's `exercises` reference and the closure assessment's `artifact` reference. The orchestration/tooling adapter validates those references and the exercise contract without reversing dependencies into curriculum domain packages. Task 5 creates and link-checks these future tracked documentation paths: `docs/authoring/exercises.md`, `docs/learner/exercise-workflow.md`, and `docs/maintainers/verifier-failures.md`. `docs/authoring/remediation.md` remains WP-06 deferred and must not be created or claimed by WP-05; WP-07-owned template-publication documentation remains out of scope.

Canonical ownership fields are the lesson exercises reference and the assessment artifact reference. Task 5's exact commit recipe must include both declared curriculum paths alongside the exercise/tooling/docs paths, and the same-task reference-resolution test remains required.

The Task 5 evidence matrix must cover invalid YAML/schema, unsafe cwd/path/glob, source and workspace reparse/case aliases, existing output, partial copy/rollback, corrupt/tampered/replayed baseline, protected add/delete/modify/rename, solution exclusion, intended starter failure, the closure edge case, automated reference-solution pass, spawn/cleanup/output failures, strict CLI usage/stream/exit behavior, and internal errors. Every diagnostic links to the correct authoring, learner, or maintainer document.

### Amendment verification and future-task handoff

Each future task file map must name every file it creates or modifies, its focused test command, its broader verification command, and a commit command containing only that task's owned paths. The root catalog/lockfile changes are future Task 1/2 implementation work, not this documentation commit. Before the WP-05 checkpoint, run the focused contract probes, strict UTF-8/LF/no-BOM checks, formatting, `git diff --check`, package-local checks/tests, `pnpm check`, and the relevant `pnpm verify`/exercise verifier commands required by the task. Do not claim the deferred WP-06 tasks are implemented or verified from WP-05 evidence.

## WP-06 Phase-B Task-0 canonical amendment — WP06_PHASE_B_AUTHORIZED

### Activation, authority, and historical boundary

The human-authorized WP-06 Phase-B branch activates Tasks 6–8 after the accepted takeover and the owner’s Task 0 dispatch. This Task 0 amendment changes only this plan. It creates no package, fixture, generated schema, documentation guide, lockfile, product behavior, or verification evidence for Tasks 6–8.

The earlier WP-05 Task 0 contract, its WP-05 execution boundary, and the WP-05 exit gate remain historical WP-05 authority. The marker WP06_DEFERRED_NOT_AUTHORIZED described the completed WP-05 dispatch and its authority limit. It no longer labels Tasks 6–8 as inactive on this separately authorized WP-06 Phase-B branch. The active Task 6–8 specifications in this amendment supersede only stale illustrative WP-06 file maps, snippets, commands, and status wording; they do not alter Tasks 1–5, accepted WP-05 interfaces, WP-05 package ownership, or the original WP-05 acceptance evidence.

Tasks 6–8 now carry the marker WP06_PHASE_B_AUTHORIZED. That marker authorizes future bounded WP-06 task dispatches only. It does not assert that Task 0 implemented, tested, generated, or verified any future task.

### Canonical WP-06 file ownership and supporting-scope allocation

All later create, modify, and preserve paths are listed here and in the active files list for the owning task. No supporting scope item is prose-only.

#### Task 6 ownership — rubric schema and S1/S2/S3/S4/S7

Create:

- packages/rubric-schema/package.json
- packages/rubric-schema/tsconfig.json
- packages/rubric-schema/vitest.config.ts
- packages/rubric-schema/src/schema.ts
- packages/rubric-schema/src/evaluate.ts
- packages/rubric-schema/src/json-schema.ts
- packages/rubric-schema/src/index.ts
- packages/rubric-schema/test/rubric.test.ts
- packages/rubric-schema/generated/rubric.schema.json
- fixtures/rubric/invalid/critical-criterion-below-threshold.json

Modify in Task 6 only:

- scripts/generate-json-schema.ts, extending the existing curriculum generator with the rubric package generator and committed rubric artifact
- package.json, extending the existing schema:check dirty-diff path list with packages/rubric-schema/generated/rubric.schema.json
- pnpm-lock.yaml, only the Task-6 package importer resolution after the Task-6 manifest exists

Preserve:

- pnpm-workspace.yaml and vitest.config.ts
- packages/command-runner/**, packages/exercise-contract/**, packages/exercise-runner/**, all apps/**, curriculum/**, exercises/**, templates/**, release/CI/publication surfaces, and WP-07+ work

#### Task 7 ownership — evidence schema and S1/S2/S3/S4/S7

Create:

- packages/evidence-schema/package.json
- packages/evidence-schema/tsconfig.json
- packages/evidence-schema/vitest.config.ts
- packages/evidence-schema/src/schema.ts
- packages/evidence-schema/src/trust.ts
- packages/evidence-schema/src/json-schema.ts
- packages/evidence-schema/src/index.ts
- packages/evidence-schema/test/evidence.test.ts
- packages/evidence-schema/generated/evidence-manifest.schema.json
- fixtures/evidence/invalid/manifest-version-mismatch.json

Modify in Task 7 only:

- scripts/generate-json-schema.ts, incrementally adding the evidence package generator and committed evidence-manifest artifact to the existing root path
- package.json, incrementally adding packages/evidence-schema/generated/evidence-manifest.schema.json to the existing schema:check dirty-diff coverage
- pnpm-lock.yaml, only the Task-7 package importer resolution after the Task-7 manifest exists

Preserve:

- pnpm-workspace.yaml and vitest.config.ts
- the Task-6 public package surface after its accepted commit
- packages/command-runner/**, packages/exercise-contract/**, packages/exercise-runner/**, apps/**, curriculum/**, exercises/**, templates/**, release/CI/publication surfaces, and WP-07+ work

#### Task 8 ownership — assessment composition and S1/S2/S3/S4/S5/S6/S7

Create:

- packages/assessment-core/package.json
- packages/assessment-core/tsconfig.json
- packages/assessment-core/vitest.config.ts
- packages/assessment-core/src/remediation.ts
- packages/assessment-core/src/result.ts
- packages/assessment-core/src/json-schema.ts
- packages/assessment-core/src/index.ts
- packages/assessment-core/test/assessment.test.ts
- packages/assessment-core/generated/remediation-catalog.schema.json
- fixtures/assessment/closure-counter-remediation.yaml
- docs/authoring/remediation.md

Modify in Task 8 only:

- scripts/generate-json-schema.ts, incrementally adding the assessment package generator and committed remediation-catalog artifact to the existing root path
- package.json, incrementally adding packages/assessment-core/generated/remediation-catalog.schema.json to the existing schema:check dirty-diff coverage
- pnpm-lock.yaml, only the Task-8 package importer resolution after the Task-8 manifest exists
- tooling/verify-exercise/test/cli.test.ts, only its documentation-boundary assertion so docs/authoring/remediation.md is expected, link-checked, and no longer required to be absent; preserve every WP-05 behavior assertion

Preserve:

- pnpm-workspace.yaml and vitest.config.ts
- every WP-05 runtime package source and test, including packages/command-runner/**, packages/exercise-contract/**, packages/exercise-runner/**, their public interfaces, apps/**, curriculum/**, exercises/**, templates/**, release/CI/publication surfaces, and WP-07+ work

S1 is the per-task pnpm-lock.yaml importer update above. S2 is the three package-owned json-schema.ts files and generated artifacts. S3 is the existing scripts/generate-json-schema.ts and existing root package.json schema:check coverage, extended incrementally in the owning task without a new generator or public command. S4 is the two exact JSON negative fixtures and the Task-8 YAML fixture. S5 is docs/authoring/remediation.md in Task 8. S6 is the narrow Task-8 tooling/verify-exercise/test/cli.test.ts assertion update. S7 is the package-manifest workspace dependencies and canonical schema imports in all three future packages.

### Canonical interfaces, stable IDs, and dependency direction

- rubric-schema and evidence-schema are pure domain packages. They must not import Astro, Starlight, React, Express, GitHub, application, template, or any WP-05 package.
- rubric-schema depends on @roadmap/curriculum-schema: workspace:* and zod: catalog:. It imports CompetencyIdSchema and ArtifactIdSchema from @roadmap/curriculum-schema. It owns and exports CriterionIdSchema for criterion IDs; it does not recreate competency or artifact regex authority.
- evidence-schema depends on @roadmap/curriculum-schema: workspace:* and zod: catalog:. It imports ArtifactIdSchema for milestone and artifact identity; it does not recreate artifact regex authority.
- assessment-core depends on @roadmap/rubric-schema: workspace:*, @roadmap/curriculum-schema: workspace:*, @roadmap/validation-core: workspace:*, and zod: catalog:. Its test-only YAML parsing dependency is yaml: catalog: in the package-local manifest. It imports CriterionIdSchema from rubric-schema and CompetencyIdSchema and ArtifactIdSchema from curriculum-schema.
- Each fixture-reading package declares @types/node: catalog:, typescript: catalog:, and vitest: catalog: as package-local development dependencies; assessment-core also declares yaml: catalog: for its YAML fixture parser.
- assessment-core uses the canonical Diagnostic, ValidationOutcome, failure, and success shapes from @roadmap/validation-core. Missing coverage for any required or critical criterion yields ASSESSMENT_REMEDIATION_001 with severity error and documentation docs/authoring/remediation.md.
- Keep the accepted public names exactly: RubricSchema, Rubric, RubricSubmissionSchema, evaluateRubric, RubricEvaluation, EvidenceManifestSchema, EvidenceManifest, EvidenceTrustLevel, EvidenceAttestations, satisfiesTrustRequirement, RemediationCatalogSchema, RemediationCatalog, validateRemediationCoverage, AssessmentResult, and createAssessmentResult.
- Rubric evaluation remains criterion-level: a missing score, a required score below 2, or a critical score below 2 blocks independently. No total or average score can override a blocker.
- Evidence attestations remain independent membership claims. Do not add a generic verified boolean, compareTrustLevel function, or total trust ordering.
- rubric-schema owns a closed evidence-reference compatibility contract. Its explicit literal set is test-report, source-diff, explanation, observation-report, and debugging-report; it is a compatibility boundary for the accepted WP-05 reference strings, not authority for a direct dependency on a WP-05 package.

### Required future RED, GREEN, fixture, and generated-schema evidence

Each future task begins with a genuine focused RED using its named repository fixture before production implementation, then performs the smallest coherent GREEN change. The RED must be preserved as evidence of the missing behavior; product implementation, generated output, and package-manager changes occur only in the corresponding future task, never in Task 0.

- Task 6 reads fixtures/rubric/invalid/critical-criterion-below-threshold.json from the repository in packages/rubric-schema/test/rubric.test.ts. The fixture demonstrates a critical criterion below threshold while another criterion is high; the test proves the critical criterion blocks independently. The focused test also covers missing required scores, unknown criterion IDs, and rubric-version mismatch.
- Task 7 reads fixtures/evidence/invalid/manifest-version-mismatch.json from the repository in packages/evidence-schema/test/evidence.test.ts. The focused test proves the named manifest version mismatch is rejected in addition to mutable commits, invalid attestation claims, duplicates, traversal, and insecure URLs.
- Task 8 reads fixtures/assessment/closure-counter-remediation.yaml from the repository in packages/assessment-core/test/assessment.test.ts using the package-local yaml dependency. The test verifies deterministic remediation composition and the required/critical-coverage failure. Inline helpers are permitted only for behavior not already expressed by the canonical fixture.

Each package owns one deterministic draft-2020-12 JSON Schema generator:

- generateRubricJsonSchema in packages/rubric-schema/src/json-schema.ts produces packages/rubric-schema/generated/rubric.schema.json from RubricSchema.
- generateEvidenceManifestJsonSchema in packages/evidence-schema/src/json-schema.ts produces packages/evidence-schema/generated/evidence-manifest.schema.json from EvidenceManifestSchema.
- generateRemediationCatalogJsonSchema in packages/assessment-core/src/json-schema.ts produces packages/assessment-core/generated/remediation-catalog.schema.json from RemediationCatalogSchema.

Each package test reads its committed generated JSON artifact and compares it exactly with its package-owned generator result, following the existing curriculum-schema generated-schema test pattern. The existing root scripts/generate-json-schema.ts imports these generators alongside generateCurriculumJsonSchema and writes all currently owned artifacts. The existing root schema:check command generates the curriculum artifact plus every currently committed WP-06 artifact, then performs one dirty diff over exactly those artifact paths. Generated artifacts are committed, visually inspected as data, and schema generation/check evidence is fresh after each task’s final relevant edit.

### Future task sequence, exact verification, and bounded commits

#### Task 6 — WP06_PHASE_B_AUTHORIZED

1. Add the Task-6 package files and the required JSON fixture in a RED state. Run pnpm --filter @roadmap/rubric-schema test -- rubric.test.ts and record its failing critical-threshold fixture assertion before implementation.
2. Implement the canonical stable-ID imports, the rubric-owned CriterionIdSchema, closed evidence-reference compatibility literals, strict schemas, independent criterion gate, generated-schema function, artifact comparison test, and incremental root generator/check wiring.
3. Run pnpm --filter @roadmap/rubric-schema check, pnpm --filter @roadmap/rubric-schema test, and pnpm schema:check. Inspect the generated rubric artifact and run strict byte and git diff review before staging.
4. Stage only these owned paths, never a broad directory:

~~~text
git add packages/rubric-schema/package.json packages/rubric-schema/tsconfig.json packages/rubric-schema/vitest.config.ts packages/rubric-schema/src/schema.ts packages/rubric-schema/src/evaluate.ts packages/rubric-schema/src/json-schema.ts packages/rubric-schema/src/index.ts packages/rubric-schema/test/rubric.test.ts packages/rubric-schema/generated/rubric.schema.json fixtures/rubric/invalid/critical-criterion-below-threshold.json scripts/generate-json-schema.ts package.json pnpm-lock.yaml
git commit -m "feat: evaluate critical rubric criteria"
~~~

#### Task 7 — WP06_PHASE_B_AUTHORIZED

1. Add the Task-7 package files and required JSON fixture in a RED state. Run pnpm --filter @roadmap/evidence-schema test -- evidence.test.ts and record its failing manifest-version-mismatch fixture assertion before implementation.
2. Implement canonical ArtifactIdSchema imports, independent trust attestations, strict evidence manifest validation, generated-schema function, artifact comparison test, and the incremental existing root generator/check extension.
3. Run pnpm --filter @roadmap/evidence-schema check, pnpm --filter @roadmap/evidence-schema test, and pnpm schema:check. Inspect the generated evidence-manifest artifact and run strict byte and git diff review before staging.
4. Stage only these owned paths, never a broad directory:

~~~text
git add packages/evidence-schema/package.json packages/evidence-schema/tsconfig.json packages/evidence-schema/vitest.config.ts packages/evidence-schema/src/schema.ts packages/evidence-schema/src/trust.ts packages/evidence-schema/src/json-schema.ts packages/evidence-schema/src/index.ts packages/evidence-schema/test/evidence.test.ts packages/evidence-schema/generated/evidence-manifest.schema.json fixtures/evidence/invalid/manifest-version-mismatch.json scripts/generate-json-schema.ts package.json pnpm-lock.yaml
git commit -m "feat: validate independent evidence attestations"
~~~

#### Task 8 — WP06_PHASE_B_AUTHORIZED

1. Add the Task-8 package files, YAML fixture, remediation guide, and narrow documentation-boundary test update in a RED state. Run pnpm --filter @roadmap/assessment-core test -- assessment.test.ts and pnpm --filter @roadmap/verify-exercise test -- cli.test.ts; record the missing required/critical remediation diagnostic and the WP-05 documentation-boundary expectation before implementation.
2. Implement the canonical stable-ID imports, remediation catalog, deterministic assessment result, ASSESSMENT_REMEDIATION_001 error diagnostic, generated-schema function, committed artifact comparison test, YAML fixture loading, guide, narrow CLI test update, and incremental existing root generator/check extension.
3. Run the inherited preservation gate:

~~~text
pnpm --filter @roadmap/command-runner test
pnpm --filter @roadmap/exercise-contract test
pnpm --filter @roadmap/exercise-runner test
pnpm --filter @roadmap/verify-exercise test -- cli.test.ts
pnpm --filter @roadmap/rubric-schema check
pnpm --filter @roadmap/rubric-schema test
pnpm --filter @roadmap/evidence-schema check
pnpm --filter @roadmap/evidence-schema test
pnpm --filter @roadmap/assessment-core check
pnpm --filter @roadmap/assessment-core test
pnpm schema:check
pnpm check
pnpm test
pnpm verify
~~~

The Task-6 critical-threshold fixture, Task-7 manifest-version-mismatch fixture, Task-8 YAML fixture, and every focused negative assertion are mandatory negative controls. Record their actual platform-specific outcomes; never generalize Windows or Linux evidence that was not run.

4. Inspect all three generated artifacts, complete strict byte/diff review, then stage only these owned paths:

~~~text
git add packages/assessment-core/package.json packages/assessment-core/tsconfig.json packages/assessment-core/vitest.config.ts packages/assessment-core/src/remediation.ts packages/assessment-core/src/result.ts packages/assessment-core/src/json-schema.ts packages/assessment-core/src/index.ts packages/assessment-core/test/assessment.test.ts packages/assessment-core/generated/remediation-catalog.schema.json fixtures/assessment/closure-counter-remediation.yaml docs/authoring/remediation.md tooling/verify-exercise/test/cli.test.ts scripts/generate-json-schema.ts package.json pnpm-lock.yaml
git commit -m "feat: produce criterion-level remediation"
~~~

No future task may amend, rewrite history, integrate to main, mutate a remote, publish, or stage a broad directory. One coherent accepted commit is required per future task or accepted correction.

### WP-06 exit checkpoint — distinct from the historical WP-05 exit gate

Before WP-07 may consume any WP-06 interface, the WP-06 owner must record:

- focused Task 6–8 RED/GREEN evidence and the exact invalid-fixture outcomes
- package checks/tests, root checks, schema:check, and the Task-8 inherited preservation gate with actual command exits
- inspection of all three committed generated-schema artifacts and fresh generator/dirty-diff evidence
- strict UTF-8/no-BOM/zero-CR/final-LF and complete changed-path inventory evidence for every accepted task
- clean index, worktree, and non-ignored-untracked evidence
- independent semantic review and independent verification after the writer freezes
- explicit known limitations, unverified claims, and platform boundaries rather than inferred passing claims

The historical WP-05 exit gate remains unchanged and does not run or certify this WP-06 checkpoint.

---

## WP06-POST-AUDIT-CORRECTION — post-audit closeout correction amendment

### Identity, authority, and historical boundary

This amendment records the post-audit WP-06 closeout correction whose identity is `WP06-POST-AUDIT-CORRECTION`. It is not Task 9; `TASK9_NOT_DISPATCHED` and `TASK9_NOT_AUTHORIZED` remain in force, and the identity "Task 9" must not be used for this work in any file, commit message, or report.

Its governing authorities are the human ruling `HR0001` (remediation competency semantics) and the owner's post-audit adjudication. Where the two differ, `HR0001` governs.

Task 8's historical acceptance at `191ff7458add6751d75a178208ddc0260552118f`, its acceptance evidence, `R0060`, and revision 106 remain immutable and are not reopened. This correction supersedes only the terminal WP-06 branch identity and the final completion claim. Every WP-05 statement, the WP-05 execution boundary, the WP-05 exit gate, and the accepted Tasks 6–8 history are preserved verbatim; nothing above is renumbered, rewritten, or deleted.

This amendment is additive and documentary. It changes no product code, no test, no fixture, no generated output, no package manifest, no lockfile, and no documentation implementation. The amendment commit itself changes exactly one tracked path — this plan. The corrections below define required behavior for a later product-correction dispatch that is not yet issued.

The audit finding set is closed. No deferred audit item remains.

### Accepted finding H4 — evidence path host-independence (Critical)

`EvidenceManifestSchema` `artifacts[].path` is governed by the same host-independent lexical contract as `T0_PATH_POLICY_CANONICAL`. That inheritance was previously unstated for WP-06 evidence paths, and the canonical Task 7 evidence path regex is weaker than both the shipped code and that policy. The correction states the inheritance and closes the gap.

The evidence path rule must reject, **in every path segment**:

- the reserved DOS device names `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, and `LPT1`–`LPT9`, case-insensitive, whether bare or followed by any extension. This is the same `(?:\..*)?` trailing semantics already used by `RESERVED_DOS_NAME` in `packages/exercise-contract/src/paths.ts`, so `CON`, `con`, `CON.md`, and `CON.foo.md` are all rejected;
- any segment ending in a dot or a space.

Legitimate names that merely share a reserved prefix must remain accepted. At least these must be proven accepted: `evidence/console.md`, `evidence/conform/notes.md`, `evidence/auxiliary.md`, `evidence/nullable.md`, `evidence/com10/notes.md`, and `evidence/lpt0/notes.md`.

Every input rejected today must stay rejected: traversal, `.` and `..` segments, absolute paths, drive-absolute paths, drive-relative forms, UNC roots, backslash separators, repeated separators, a trailing separator, the empty string, URL and `mailto:` forms, and all control characters including `\u0000`, `\u001f`, `\u007f`, `\u0085`, `\u2028`, `\u2029`.

The runtime schema and the generated schema must express **exactly equivalent** rules. Two observed implementation constraints force how this is written, and both are binding:

1. The rule must extend the **single existing** `path` pattern rather than add a second `.regex()` call. A second call restructures the emitted schema into `allOf:[{pattern},{pattern}]`, which breaks the artifact test at `packages/evidence-schema/test/evidence.test.ts:128` because that test reads `properties.artifacts.items.properties.path.pattern` directly.
2. Case-insensitivity must be an explicit **flagless** character-class construction. `z.toJSONSchema` silently discards a regex `i` flag, so a flagged pattern would emit a case-sensitive generated schema that diverges from runtime.

A broad unverified regex is forbidden. Each accepted and rejected case above requires its own negative or positive test rather than a single sweeping assertion.

### Accepted finding H2 — a deployment record must name an endpoint (Important)

`deployment` remains **optional**, consistent with design `§17.3` ("Deployment URLs where applicable"). The canonical Task 7 snippet is defective only in that it permits a *present* `deployment` object carrying neither `frontend` nor `api`.

A present `deployment` record must carry at least one of `frontend` or `api`. The justification is design `§17.2` together with the design risk-register entry "Evidence inflation | Self-report labeled verified | Explicit trust levels": a record that claims `externally-observable` while naming nothing observable is unfalsifiable.

The generated schema must express the identical rule as `anyOf:[{required:["frontend"]},{required:["api"]}]` on the `deployment` subschema. Because `z.toJSONSchema` drops a `superRefine`, the package generator must re-add this explicitly, following the existing `verificationSchema.not` precedent at `packages/evidence-schema/src/json-schema.ts:74`.

An absent `deployment`, a `frontend`-only record, and an `api`-only record all remain valid. `deployment` itself is not required.

### Accepted finding H1c — a remediation entry must offer a learning resource (Important)

A remediation entry must provide **at least one resource across the union of `lessons` and `exercises`**. `retake` remains separately constrained by `.min(1)`. The canonical Task 8 entry schema is defective only in that it permits `lessons: []` together with `exercises: []`.

Requiring **both** arrays to be nonempty is rejected. The plan's own canonical schema deliberately writes `lessons` and `exercises` without `.min(1)` while writing `retake` with an explicit minimum, and `docs/authoring/remediation.md:49-51` directs authors to require only what is needed to recover the failed criterion.

The requirement follows from the Global Constraint "Remediation identifies the exact failed criterion, related competency, learning resources, and retake requirement", design `§13.4` ("Required competencies without remediation routes"), and `docs/authoring/remediation.md:36`, which establishes that a blocking failure is never covered by a generic recommendation.

The generated schema must express the identical rule as an `anyOf` over `lessons` and `exercises` with `minItems: 1`, again re-added explicitly by the package generator because `z.toJSONSchema` drops the runtime refinement.

### Remediation competency semantics — human ruling `HR0001` (authoritative)

`HR0001` settles the Release 0 contract for competency semantics:

- `rubric.criteria[].competency` is the competency **assessed by** the rubric criterion.
- `remediation.entries[].competency` is the **primary related competency the learner should revisit**.
- The two values **MAY differ**.
- **No runtime or generated-schema equality invariant is authorized.**

The recorded human rationale:

- the approved design speaks of **related** competencies;
- this canonical plan says **related competency**, not identical competency;
- exact equality would incorrectly forbid remediation through a **prerequisite or foundational** competency;
- a future mechanically validated relationship would require an explicit **curriculum-graph-aware contract**, not an equality shortcut.

Four constraints remain in force. The remediation entry competency must:

1. satisfy the canonical `CompetencyIdSchema`;
2. be presented as the **primary remediation competency**;
3. be accompanied by at least one concrete learning resource across the union of `lessons` and `exercises` — this is the same requirement stated above for H1c, not a second differing rule;
4. **never** be described as an authenticated graph relationship unless such a relationship was actually validated.

Constraint 4 is a **claim-integrity requirement**, not merely an implementation note. No code, generated schema, or documentation may assert or imply that the entry competency has been verified to stand in any graph relationship to the criterion competency, because Release 0 performs no such validation.

This correction adds **no competency-equality requirement** and **no exact-cover requirement**. Both were considered and rejected: the first by human ruling `HR0001`, and the second by owner adjudication confirmed by the human. In particular, an otherwise valid catalog is **not** rejected merely because it contains an entry unused by the current rubric.

### Accepted finding H3 — generated-schema consumer boundary (Moderate)

One policy governs all three generated artifacts. Each Draft 2020-12 artifact is **structural prevalidation only**, and every supported ingestion path must be:

```text
JSON Schema structural prevalidation → canonical Zod runtime parser
```

The runtime parser is what enforces the cross-item invariants the JSON Schema cannot express. The plan previously mandated three generated artifacts while stating the consumer boundary for none of the rubric or evidence artifacts.

The rubric and evidence generated schemas each require a root `$comment` naming their exact unexpressible invariant — cross-object uniqueness of `criteria[].id` and of `artifacts[].id` respectively — following the existing Task 8 precedent at `packages/assessment-core/src/json-schema.ts:15-16`.

The boundary statement in `docs/authoring/remediation.md:42-47` must be generalized so it covers all three artifacts rather than the remediation catalog alone.

`uniqueItems` is **forbidden** for this purpose. It compares whole array elements, so it accepts two objects that share an `id` but differ elsewhere. Using it would create false coverage while leaving the divergence in place.

### Required verification and bounded commits for the future product correction

The product-correction dispatch, when issued, owns exactly these paths:

```text
packages/evidence-schema/src/schema.ts
packages/evidence-schema/src/json-schema.ts
packages/evidence-schema/generated/evidence-manifest.schema.json
packages/evidence-schema/test/evidence.test.ts
packages/rubric-schema/src/json-schema.ts
packages/rubric-schema/generated/rubric.schema.json
packages/rubric-schema/test/rubric.test.ts
packages/assessment-core/src/remediation.ts
packages/assessment-core/src/json-schema.ts
packages/assessment-core/generated/remediation-catalog.schema.json
packages/assessment-core/test/assessment.test.ts
docs/authoring/remediation.md
```

That dispatch must record:

- genuine RED before implementation, with actual recorded command output rather than an asserted expectation;
- exact negative tests for each accepted finding, at both the runtime and generated-schema boundaries;
- a required **positive** test proving that a catalog entry whose competency differs from the rubric criterion's competency is **accepted**, locking `HR0001` in against future regression;
- focused verification: the three package `check` and `test` commands, plus `pnpm schema:generate`, `pnpm schema:check`, and `pnpm --filter @roadmap/verify-exercise test -- cli.test.ts`;
- the final gate, run once: `pnpm check`, `pnpm test`, `pnpm verify`;
- one coherent commit per accepted correction, with no amend, no rebase, no history rewrite, no broad directory staging, no integration, and no remote mutation.

No product code, fixture, generated output, package manifest, lockfile, or documentation implementation is changed by this amendment commit itself.

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
├── src/json-schema.ts
├── src/index.ts
├── test/rubric.test.ts
└── generated/rubric.schema.json

packages/evidence-schema/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/schema.ts
├── src/trust.ts
├── src/json-schema.ts
├── src/index.ts
├── test/evidence.test.ts
└── generated/evidence-manifest.schema.json

packages/assessment-core/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/remediation.ts
├── src/result.ts
├── src/json-schema.ts
├── src/index.ts
├── test/assessment.test.ts
└── generated/remediation-catalog.schema.json

fixtures/
├── rubric/invalid/critical-criterion-below-threshold.json
├── evidence/invalid/manifest-version-mismatch.json
└── assessment/closure-counter-remediation.yaml

scripts/generate-json-schema.ts (incrementally modified by Tasks 6, 7, and 8)
package.json (existing schema:check coverage incrementally modified by Tasks 6, 7, and 8)
pnpm-lock.yaml (the corresponding importer only, modified by Tasks 6, 7, and 8)
docs/authoring/remediation.md (created by Task 8)
tooling/verify-exercise/test/cli.test.ts (narrow documentation-boundary update in Task 8)

Preserve for WP-06:
pnpm-workspace.yaml
vitest.config.ts
packages/command-runner/**
packages/exercise-contract/**
packages/exercise-runner/**
apps/**
curriculum/**
exercises/**
templates/**
WP-07+ and release/CI/publication surfaces

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
  readonly sourceRoot: string;
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

Implement `packages/command-runner/src/run-command.ts` with the exact `CommandSpec`, `CommandResult`, and `runCommand(spec: CommandSpec): Promise<CommandResult>` declarations in the OW0002 contract above. The implementation must validate the spec and confirm that cwd is a real, usable directory before spawning; it must not claim workspace containment at this API boundary. Task 4 performs the asynchronous realpath containment proof before calling the runner. Resolve `.cmd` commands through the documented deterministic platform rule, and launch only this shape:

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
    learner: [{ id: 'contract', required: true, command: 'pnpm', args: ['verify'], cwd: '.', timeoutMs: 60_000 }],
  },
  constraints: {
    editablePaths: ['src/**'],
    forbiddenDependencies: [],
    forbiddenApis: [],
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

  it('permits the semantic workspace root only for command cwd', () => {
    expect(ExerciseDefinitionSchema.parse(validExercise).commands.learner[0]!.cwd).toBe('.');

    for (const cwd of ['./x', 'x/.', '..', 'x/../y']) {
      const invalidCommand = structuredClone(validExercise);
      invalidCommand.commands.learner[0]!.cwd = cwd;
      expect(() => ExerciseDefinitionSchema.parse(invalidCommand)).toThrow();
    }

    const invalidHint = structuredClone(validExercise);
    invalidHint.hints[0]!.path = '.';
    expect(() => ExerciseDefinitionSchema.parse(invalidHint)).toThrow();

    const invalidEditable = structuredClone(validExercise);
    invalidEditable.constraints.editablePaths = ['.'];
    expect(() => ExerciseDefinitionSchema.parse(invalidEditable)).toThrow();
  });

  it('rejects unenforced forbidden dependency and API policy arrays', () => {
    const invalidApiPolicy = structuredClone(validExercise);
    invalidApiPolicy.constraints.forbiddenApis = ['globalThis'];
    expect(() => ExerciseDefinitionSchema.parse(invalidApiPolicy)).toThrow();

    const invalidDependencyPolicy = structuredClone(validExercise);
    invalidDependencyPolicy.constraints.forbiddenDependencies = ['some-package'];
    expect(() => ExerciseDefinitionSchema.parse(invalidDependencyPolicy)).toThrow();
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
    '.', './secret', '../secret', '/absolute', 'C:\\secret', 'C:secret', '\\\\server\\share\\secret', '\\\\?\\C:\\secret',
    'src/..', 'src/../../secret', 'src//secret', 'src/./secret', 'src/CON.txt', 'src/file. ', 'src/file.\\t', '\u0000secret', '',
  ])('rejects unsafe relative path %s', (input) => {
    expect(isSafeRelativePath(input)).toBe(false);
  });

  it('matches editable globs after normalization', () => {
    expect(matchesEditablePath('src\\counter.js', ['src/**'])).toBe(true);
    expect(matchesEditablePath('test/counter.test.js', ['src/**'])).toBe(false);
  });

  it.each([
    '**', '!src/**', '{src,test}/**', 'src/@(counter|answer).js', 'src/foo@(counter|answer).js',
    'src/foo?(counter).js', 'src/foo+(counter).js', 'src/foo*(counter).js', 'src/foo!(counter).js',
    'src/**/../secret',
  ])('rejects non-allow-only pattern %s', (pattern) => {
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
const CommandCwdSchema = z.string().refine(
  (input) => input === '.' || isSafeRelativePath(input),
  'Command cwd must be the semantic workspace root or a safe relative directory',
);

export const MasteryLevelSchema = z.enum(['recognize', 'explain', 'implement', 'diagnose', 'design-and-justify']);

export const CommandDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  required: z.boolean(),
  command: z.string().min(1),
  args: z.array(z.string()),
  cwd: CommandCwdSchema,
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
  if (definition.constraints.forbiddenDependencies.length > 0) {
    context.addIssue({
      code: 'custom',
      path: ['constraints', 'forbiddenDependencies'],
      message: 'Release 0 does not support non-empty forbidden dependency policy arrays',
    });
  }
  if (definition.constraints.forbiddenApis.length > 0) {
    context.addIssue({
      code: 'custom',
      path: ['constraints', 'forbiddenApis'],
      message: 'Release 0 does not support non-empty forbidden API policy arrays',
    });
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
  if (pattern.startsWith('!') || /[{}]/.test(pattern) || /[!@+?*]\(/.test(pattern)) return false;
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
- Create: `packages/exercise-runner/src/materialization-filesystem.ts`
- Create: `packages/exercise-runner/src/open-workspace.ts`
- Create: `packages/exercise-runner/src/workspace-paths.ts`
- Create: `packages/exercise-runner/src/baseline-manifest.ts`
- Create: `packages/exercise-runner/src/index.ts`
- Create: `packages/exercise-runner/test/materialize.test.ts`
- Create: `packages/exercise-runner/test/materialization-filesystem.test.ts`
- Create: `packages/exercise-runner/test/open-workspace.test.ts`
- Create: `fixtures/exercises/valid/minimal/**`
- Preserve: root `vitest.config.ts` and its existing workspace globs; do not edit it

**Interfaces:**
- Consumes: `ExerciseDefinitionSchema`, safe path helpers, `ValidationOutcome<T>`, and YAML parsing selected in WP-02
- Produces: `loadExercise(sourceRoot)`, `materializeExercise(sourceRoot, outputRoot)`, `openExerciseWorkspace(sourceRoot, outputRoot)`, `ExerciseWorkspace`, the internal operation adapter, and typed baseline/path helpers

### Task 3/4 internal helper and module map — contract excerpt

The following TypeScript blocks are signature-only contract excerpts, not paste-ready standalone `.ts` bodies. Their implementation bodies are supplied by the named Task 3/4 steps below. Every central symbol used by the displayed Task 3/4 snippets is either defined in its named owner module or imported from that module. These signatures are the implementation contract; implementations must not invent a second ownership model.

```ts
// packages/exercise-runner/src/baseline-manifest.ts
import type { ExerciseDefinition } from '@roadmap/exercise-contract';
import type { Diagnostic } from '@roadmap/validation-core';

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

export interface WorkspaceFileManifest {
  schemaVersion: 1;
  files: readonly BaselineFileRecord[];
}

export type ManifestComparisonResult =
  | { ok: true; changed: readonly string[] }
  | { ok: false; diagnostics: readonly Diagnostic[] };

export async function hashFile(file: string, relativePath: string): Promise<BaselineFileRecord>;
export async function writeBaselineManifest(
  file: string,
  manifest: ExerciseBaselineManifest,
): Promise<void>;
export async function readBaselineManifest(file: string): Promise<ExerciseBaselineManifest>;
export async function deriveAllowlistedManifest(
  sourceRoot: string,
  definition: ExerciseDefinition,
): Promise<ExerciseBaselineManifest>;
export async function deriveAuthoritativeManifest(
  sourceRoot: string,
  definition: ExerciseDefinition,
): Promise<ExerciseBaselineManifest>;
export async function deriveWorkspaceManifest(workspaceRoot: string): Promise<WorkspaceFileManifest>;
export async function validateAuthoritativeManifest(
  stageRoot: string,
  sourceRoot: string,
  definition: ExerciseDefinition,
  options: { excludedStagePaths: readonly string[] },
): Promise<void>;
export function manifestsMatchExactly(
  left: ExerciseBaselineManifest,
  right: ExerciseBaselineManifest,
): boolean;
export function compareManifestTriplet(
  authoritative: ExerciseBaselineManifest,
  cached: ExerciseBaselineManifest,
  current: WorkspaceFileManifest,
  editablePaths: readonly string[],
): ManifestComparisonResult;
```

```ts
// packages/exercise-runner/src/materialization-filesystem.ts
export type OutputState = 'missing' | 'existing-empty' | 'matching-valid' | 'invalid' | 'non-empty-unknown';
export type OutputDiagnosticCode = 'EXERCISE_OUTPUT_002' | 'EXERCISE_OUTPUT_003';

export class ExerciseOutputError extends Error {
  readonly diagnosticCode: OutputDiagnosticCode;
  readonly cleanupFailures?: readonly CleanupFailureDetail[];
  constructor(
    diagnosticCode: OutputDiagnosticCode,
    message: string,
    cleanupFailures?: readonly CleanupFailureDetail[],
  );
}

export interface CleanupFailureDetail {
  readonly side: 'stage' | 'reservation';
  readonly message: string;
}

export interface OwnedStage {
  readonly root: string;
  readonly ownershipToken: string;
  /** Normalized stage-relative paths for token/control metadata only. */
  readonly controlPaths: readonly string[];
}

export interface OwnedReservation {
  readonly root: string;
  readonly ownershipToken: string;
  readonly expectedInventory: readonly string[];
  /** Normalized target-relative paths for token/control metadata only. */
  readonly controlPaths: readonly string[];
}

export interface OwnedCleanupOptions {
  readonly requireOwnershipToken: true;
  readonly refuseUnexpectedContent: true;
  readonly allowPartialOwnedInventory: true;
}

export interface MaterializeFilesystemAdapter {
  inspectOutputState(target: string): Promise<OutputState>;
  createOwnedStage(
    parent: string,
    prefix: string,
    starterRoot: string,
    openTestsRoot: string,
  ): Promise<OwnedStage>;
  reserveMissingDirectory(
    target: string,
    expectedInventory: readonly string[],
  ): Promise<OwnedReservation>;
  populateReservedDirectory(
    stage: OwnedStage,
    reservation: OwnedReservation,
    options: {
      noOverwrite: true;
      sourceControlPaths: readonly string[];
      targetControlPaths: readonly string[];
    },
  ): Promise<void>;
  validateOwnedInventory(reservation: OwnedReservation): Promise<void>;
  removeOwnedStage(
    stage: OwnedStage,
    expectedInventory: readonly string[],
    options: { controlPaths: readonly string[] },
  ): Promise<void>;
  finalizeOwnedReservation(
    reservation: OwnedReservation,
    options: { expectedInventory: readonly string[]; controlPaths: readonly string[] },
  ): Promise<void>;
  cleanupOwnedMaterialization(
    stage: OwnedStage | undefined,
    reservation: OwnedReservation | undefined,
    options: OwnedCleanupOptions,
  ): Promise<void>;
}

export function createProductionMaterializeFilesystemAdapter(): MaterializeFilesystemAdapter;
```

```ts
// packages/exercise-runner/src/workspace-paths.ts
export async function assertSourceOutputAreDisjoint(
  canonicalSourceRoot: string,
  outputRoot: string,
): Promise<void>;
```

```ts
// packages/exercise-runner/src/materialize.ts
import {
  ExerciseOutputError,
  createProductionMaterializeFilesystemAdapter,
  type MaterializeFilesystemAdapter,
  type OwnedReservation,
  type OwnedStage,
} from './materialization-filesystem.js';
import {
  deriveAuthoritativeManifest,
  hashFile,
  validateAuthoritativeManifest,
  writeBaselineManifest,
} from './baseline-manifest.js';

export async function materializeExercise(
  sourceRootInput: string | URL,
  outputRoot: string,
): Promise<ValidationOutcome<ExerciseWorkspace>>;

/** @internal; omitted from src/index.ts and package exports. */
export async function materializeExerciseWithFilesystemForTest(
  sourceRootInput: string | URL,
  outputRoot: string,
  filesystem: MaterializeFilesystemAdapter,
): Promise<ValidationOutcome<ExerciseWorkspace>>;
```

```ts
// packages/exercise-runner/src/open-workspace.ts
import {
  deriveAuthoritativeManifest,
  manifestsMatchExactly,
  readBaselineManifest,
} from './baseline-manifest.js';
import { assertSourceOutputAreDisjoint } from './workspace-paths.js';
```

```ts
// packages/exercise-runner/src/verify-editable-paths.ts
import {
  compareManifestTriplet,
  deriveAuthoritativeManifest,
  deriveWorkspaceManifest,
  readBaselineManifest,
} from './baseline-manifest.js';
```

The package-local materialization tests import the internal adapter module directly and cover its operation contracts; the public index exports only the public two-argument materializer, workspace type, loader, manifest reader/writer, opener, and verifier surfaces. The new internal modules are package-local and are not package exports.

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
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ExerciseOutputError,
  createProductionMaterializeFilesystemAdapter,
  type MaterializeFilesystemAdapter,
} from '../src/materialization-filesystem.js';
import {
  materializeExercise,
  materializeExerciseWithFilesystemForTest,
} from '../src/materialize.js';

const fixture = new URL('../../../fixtures/exercises/valid/minimal/', import.meta.url);

type LifecycleFailureMode =
  | 'target-appears-during-reservation'
  | 'partial-population'
  | 'stage-cleanup-refusal'
  | 'finalization-failure'
  | 'unexpected-reservation-content';

interface OperationTrace {
  events: string[];
  stageRoot?: string;
  stageControlPaths?: readonly string[];
  reservationRoot?: string;
  reservationControlPaths?: readonly string[];
  stageAbsentAtFinalization?: boolean;
  partialLearnerEntryCreatedAtFailure?: boolean;
}

function createTestOnlyLifecycleFilesystemAdapter(
  failureMode: LifecycleFailureMode | undefined,
  trace: OperationTrace,
): MaterializeFilesystemAdapter {
  const production = createProductionMaterializeFilesystemAdapter();
  return {
    inspectOutputState: async (target) => {
      trace.events.push('inspect');
      return production.inspectOutputState(target);
    },
    createOwnedStage: async (parent, prefix, starterRoot, openTestsRoot) => {
      trace.events.push('stage:create');
      const stage = await production.createOwnedStage(parent, prefix, starterRoot, openTestsRoot);
      trace.stageRoot = stage.root;
      trace.stageControlPaths = stage.controlPaths;
      return stage;
    },
    reserveMissingDirectory: async (target, expectedInventory) => {
      trace.events.push('reserve:begin');
      if (failureMode === 'target-appears-during-reservation') {
        await mkdir(target);
        await writeFile(path.join(target, 'foreign-target.txt'), 'preserve exact target bytes\n');
        trace.reservationRoot = target;
      }
      try {
        const reservation = await production.reserveMissingDirectory(target, expectedInventory);
        trace.reservationRoot = reservation.root;
        trace.reservationControlPaths = reservation.controlPaths;
        trace.events.push('reserve:success');
        return reservation;
      } catch (error) {
        trace.events.push(failureMode === 'target-appears-during-reservation'
          ? 'reserve:collision'
          : 'reserve:failure');
        throw error;
      }
    },
    populateReservedDirectory: async (stage, reservation, options) => {
      trace.events.push('populate:begin');
      let partialEntry: string | undefined;
      try {
        if (failureMode === 'partial-population') {
          // Delete a later expected source entry, then delegate to production. Its
          // streaming copy must create the first learner entry before discovering
          // the missing later source and translating the real operation failure.
          const learnerEntries = reservation.expectedInventory.filter(
            (entry) => !reservation.controlPaths.includes(entry),
          );
          const firstEntry = learnerEntries[0];
          const laterEntry = learnerEntries[1];
          if (!firstEntry || !laterEntry) throw new Error('fixture must contain at least two learner entries');
          partialEntry = firstEntry;
          await rm(path.join(stage.root, laterEntry), { force: true });
        }
        await production.populateReservedDirectory(stage, reservation, options);
        trace.events.push('populate:success');
      } catch (error) {
        if (partialEntry) {
          trace.partialLearnerEntryCreatedAtFailure = await stat(
            path.join(reservation.root, partialEntry),
          ).then(
            () => true,
            () => false,
          );
        }
        trace.events.push('populate:failure');
        throw error;
      }
    },
    validateOwnedInventory: async (reservation) => {
      trace.events.push('inventory:begin');
      if (failureMode === 'unexpected-reservation-content') {
        await writeFile(path.join(reservation.root, 'foreign-reservation.txt'), 'preserve exact reservation bytes\n');
      }
      try {
        await production.validateOwnedInventory(reservation);
        trace.events.push('inventory:success');
      } catch (error) {
        trace.events.push('inventory:failure');
        throw error;
      }
    },
    removeOwnedStage: async (stage, expectedInventory, options) => {
      trace.events.push('stage:cleanup:begin');
      if (failureMode === 'stage-cleanup-refusal') {
        await writeFile(path.join(stage.root, 'foreign-stage.txt'), 'preserve exact stage bytes\n');
      }
      try {
        await production.removeOwnedStage(stage, expectedInventory, options);
        trace.events.push('stage:cleanup:success');
      } catch (error) {
        trace.events.push('stage:cleanup:refusal');
        throw error;
      }
    },
    finalizeOwnedReservation: async (reservation, options) => {
      trace.events.push('finalize:begin');
      try {
        if (failureMode === 'finalization-failure') {
          if (!trace.stageRoot) throw new Error('stage root must be recorded before finalization');
          trace.stageAbsentAtFinalization = await stat(trace.stageRoot).then(
            () => false,
            () => true,
          );
          throw new ExerciseOutputError('EXERCISE_OUTPUT_003', 'real finalization failure after stage cleanup');
        }
        await production.finalizeOwnedReservation(reservation, options);
        trace.events.push('finalize:success');
      } catch (error) {
        trace.events.push('finalize:failure');
        throw error;
      }
    },
    cleanupOwnedMaterialization: async (stage, reservation, options) => {
      trace.events.push('cleanup:begin');
      try {
        await production.cleanupOwnedMaterialization(stage, reservation, options);
        trace.events.push('cleanup:success');
      } catch (error) {
        trace.events.push('cleanup:refused');
        throw error;
      }
    },
  };
}

async function runLifecycleCase(failureMode: LifecycleFailureMode) {
  const parent = await mkdtemp(path.join(tmpdir(), `roadmap-${failureMode}-`));
  const output = path.join(parent, 'workspace');
  const sentinel = path.join(parent, 'unrelated.sentinel');
  await writeFile(sentinel, 'preserve unrelated content\n');
  const trace: OperationTrace = { events: [] };
  const adapter = createTestOnlyLifecycleFilesystemAdapter(failureMode, trace);
  const result = await materializeExerciseWithFilesystemForTest(fixture, output, adapter);
  return { parent, output, sentinel, trace, result };
}

describe('materializeExercise actual filesystem lifecycle', () => {
  it('records the production operation order on success', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-lifecycle-success-'));
    const output = path.join(parent, 'workspace');
    const trace: OperationTrace = { events: [] };
    const result = await materializeExerciseWithFilesystemForTest(
      fixture,
      output,
      createTestOnlyLifecycleFilesystemAdapter(undefined, trace),
    );
    expect(result.ok).toBe(true);
    expect(trace.events).toEqual([
      'inspect',
      'stage:create',
      'reserve:begin',
      'reserve:success',
      'populate:begin',
      'populate:success',
      'inventory:begin',
      'inventory:success',
      'stage:cleanup:begin',
      'stage:cleanup:success',
      'finalize:begin',
      'finalize:success',
    ]);
    if (!result.ok) return;
    const stageControlPaths = trace.stageControlPaths;
    const reservationControlPaths = trace.reservationControlPaths;
    if (!stageControlPaths || stageControlPaths.length === 0) {
      throw new Error('adapter-backed success test requires actual stage control paths');
    }
    if (!reservationControlPaths || reservationControlPaths.length === 0) {
      throw new Error('adapter-backed success test requires actual reservation control paths');
    }
    const manifest = JSON.parse(await readFile(result.value.baselineManifestPath, 'utf8'));
    const manifestPaths = new Set(manifest.files.map((entry: { path: string }) => entry.path));
    for (const controlPath of [...stageControlPaths, ...reservationControlPaths]) {
      expect(manifestPaths.has(controlPath)).toBe(false);
      await expect(stat(path.join(output, controlPath))).rejects.toThrow();
    }
  });

  it('keeps the public wrapper exactly two-argument and writes a normal workspace', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-exercise-'));
    const output = path.join(parent, 'workspace');
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

  it('rejects an existing empty output as existing/unknown without deleting it', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-existing-empty-'));
    const output = path.join(parent, 'workspace');
    await mkdir(output);
    const result = await materializeExercise(fixture, output);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_OUTPUT_002');
    expect((await readdir(output)).length).toBe(0);
    expect((await readdir(parent)).filter((entry) => entry.startsWith('.roadmap-stage-'))).toEqual([]);
  });

  const lifecycleCases = [
    {
      failureMode: 'target-appears-during-reservation',
      expectedCode: 'EXERCISE_OUTPUT_002',
      expectedEvents: ['inspect', 'stage:create', 'reserve:begin', 'reserve:collision', 'cleanup:begin', 'cleanup:success'],
    },
    {
      failureMode: 'partial-population',
      expectedCode: 'EXERCISE_OUTPUT_003',
      expectedEvents: ['inspect', 'stage:create', 'reserve:begin', 'reserve:success', 'populate:begin', 'populate:failure', 'cleanup:begin', 'cleanup:success'],
    },
    {
      failureMode: 'stage-cleanup-refusal',
      expectedCode: 'EXERCISE_OUTPUT_003',
      expectedEvents: ['inspect', 'stage:create', 'reserve:begin', 'reserve:success', 'populate:begin', 'populate:success', 'inventory:begin', 'inventory:success', 'stage:cleanup:begin', 'stage:cleanup:refusal', 'cleanup:begin', 'cleanup:refused'],
    },
    {
      failureMode: 'finalization-failure',
      expectedCode: 'EXERCISE_OUTPUT_003',
      expectedEvents: ['inspect', 'stage:create', 'reserve:begin', 'reserve:success', 'populate:begin', 'populate:success', 'inventory:begin', 'inventory:success', 'stage:cleanup:begin', 'stage:cleanup:success', 'finalize:begin', 'finalize:failure', 'cleanup:begin', 'cleanup:success'],
    },
    {
      failureMode: 'unexpected-reservation-content',
      expectedCode: 'EXERCISE_OUTPUT_003',
      expectedEvents: ['inspect', 'stage:create', 'reserve:begin', 'reserve:success', 'populate:begin', 'populate:success', 'inventory:begin', 'inventory:failure', 'cleanup:begin', 'cleanup:refused'],
    },
  ] as const;

  it.each(lifecycleCases)('proves the real %s lifecycle boundary and ownership cleanup', async ({ failureMode, expectedCode, expectedEvents }) => {
    const { output, sentinel, trace, result } = await runLifecycleCase(failureMode);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe(expectedCode);
    expect(trace.events).toEqual(expectedEvents);
    expect(await readFile(sentinel, 'utf8')).toBe('preserve unrelated content\n');

    if (failureMode === 'target-appears-during-reservation') {
      expect(await readFile(path.join(output, 'foreign-target.txt'), 'utf8')).toBe('preserve exact target bytes\n');
      expect(trace.events).not.toContain('populate:begin');
    }
    if (failureMode === 'partial-population') {
      expect(trace.partialLearnerEntryCreatedAtFailure).toBe(true);
      expect(trace.reservationRoot).toBeTruthy();
      expect(await stat(output).then(() => true, () => false)).toBe(false);
      expect(trace.stageRoot && await stat(trace.stageRoot).then(() => true, () => false)).toBe(false);
    }
    if (failureMode === 'stage-cleanup-refusal') {
      expect(trace.stageRoot).toBeTruthy();
      expect(await readFile(path.join(trace.stageRoot!, 'foreign-stage.txt'), 'utf8')).toBe('preserve exact stage bytes\n');
      expect(await stat(output).then(() => true, () => false)).toBe(false);
    }
    if (failureMode === 'finalization-failure') {
      expect(trace.stageAbsentAtFinalization).toBe(true);
      expect(await stat(output).then(() => true, () => false)).toBe(false);
    }
    if (failureMode === 'unexpected-reservation-content') {
      expect(await readFile(path.join(output, 'foreign-reservation.txt'), 'utf8')).toBe('preserve exact reservation bytes\n');
      expect(await stat(trace.stageRoot!).then(() => true, () => false)).toBe(false);
    }
  });
});

```

```ts
// packages/exercise-runner/test/materialization-filesystem.test.ts
import { describe, expect, it } from 'vitest';
import { createProductionMaterializeFilesystemAdapter } from '../src/materialization-filesystem.js';

describe('materialization filesystem adapter', () => {
  it('owns every actual lifecycle operation and exposes no phase callback', () => {
    const adapter = createProductionMaterializeFilesystemAdapter();
    expect(Object.keys(adapter).sort()).toEqual([
      'cleanupOwnedMaterialization',
      'createOwnedStage',
      'finalizeOwnedReservation',
      'inspectOutputState',
      'populateReservedDirectory',
      'removeOwnedStage',
      'reserveMissingDirectory',
      'validateOwnedInventory',
    ]);
    expect(Object.keys(adapter)).not.toContain('faultHook');
  });
});
```

The production adapter is the only implementation of the real filesystem operations. `createOwnedStage` creates the token-owned sibling and prepares the allowlisted stage contents; the observable lifecycle log therefore has the required high-level order `inspect -> stage:create -> reserve -> populate -> inventory -> stage:cleanup -> finalize`. `populateReservedDirectory` streams expected entries through no-overwrite copy operations so a missing later source can leave a known earlier learner entry before the operation returns its typed failure. The five-case matrix delegates every wrapped method to the production adapter and changes state only immediately before the named real operation: target bytes appear before exclusive reserve, a later stage source is removed before streaming population, foreign stage content appears before stage removal, finalization fails only after production stage removal, and foreign reserved content appears before production inventory validation. No generic phase callback or pre-operation fault hook remains.

The matrix asserts exact event arrays, exact diagnostic codes, stage/target state at failure, and unrelated-content preservation. Only the target-appeared exclusive collision maps to `EXERCISE_OUTPUT_002`; all non-collision lifecycle failures map to `EXERCISE_OUTPUT_003`. The normal success test must use a no-failure adapter instance and assert the complete seven-operation event order; the focused adapter test verifies the production surface has actual operation methods and no fault-injection field.

```ts
// packages/exercise-runner/test/open-workspace.test.ts
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { materializeExercise, openExerciseWorkspace } from '../src/index.js';

const fixture = new URL('../../../fixtures/exercises/valid/minimal/', import.meta.url);

describe('openExerciseWorkspace', () => {
  it('reuses a matching workspace without replacing learner edits', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-open-'));
    const output = path.join(parent, 'workspace');
    const created = await materializeExercise(fixture, output);
    if (!created.ok) throw new Error('Fixture must materialize');

    const learnerSource = 'export const learnerChange = true;\n';
    await writeFile(path.join(output, 'src/counter.js'), learnerSource);
    const reopened = await openExerciseWorkspace(fixture, output);

    expect(reopened.ok).toBe(true);
    expect(await readFile(path.join(output, 'src/counter.js'), 'utf8')).toBe(learnerSource);
  });

  it('fails closed on an existing workspace from another exercise version', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-mismatch-'));
    const output = path.join(parent, 'workspace');
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
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-unknown-output-'));
    const output = path.join(parent, 'workspace');
    await mkdir(output);
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
import { readFile, realpath, writeFile } from 'node:fs/promises';
import type { ExerciseDefinition } from '@roadmap/exercise-contract';

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

export async function deriveAuthoritativeManifest(
  sourceRoot: string,
  definition: ExerciseDefinition,
): Promise<ExerciseBaselineManifest> {
  const canonicalSourceRoot = await realpath(sourceRoot);
  return deriveAllowlistedManifest(canonicalSourceRoot, definition);
}
```

`deriveAllowlistedManifest` walks only the trusted `starter/` and `tests/open/` regular files, rejects symlink/junction/reparse aliases, and records the source identity/version from the loaded definition. The reader must also reject duplicate or non-canonical paths, invalid byte counts, malformed lowercase SHA-256 values, missing source identity/version, and any record that is not present in the freshly derived authoritative source manifest. The manifest is cache/provenance evidence and never replaces source-derived protected-file truth.

- [ ] **Step 4a: Implement the package-local actual-operation filesystem adapter**

Create `materialization-filesystem.ts` as the sole owner of output-state inspection, token-owned sibling-stage creation, exclusive target reservation, no-overwrite population, inventory validation, stage removal, reservation finalization, and ownership-aware rollback. `createOwnedStage(parent, prefix, starterRoot, openTestsRoot)` creates a unique sibling with an ownership token, copies only the allowlisted trees without dereferencing links, and creates the token-owned `.roadmap` directory before returning normalized stage-relative `controlPaths`. `reserveMissingDirectory` uses an exclusive non-recursive create beneath the already-realpathed parent; only the expected EEXIST/target-appeared branch becomes `ExerciseOutputError('EXERCISE_OUTPUT_002', ...)`, while every other lifecycle uncertainty becomes `ExerciseOutputError('EXERCISE_OUTPUT_003', ...)`.

`populateReservedDirectory` receives separate source and target control-path allowlists and must stream only the exact learner/manifest inventory through no-overwrite copy operations. A real missing/reparse source can therefore leave a known earlier learner entry before returning typed `EXERCISE_OUTPUT_003`, while stage token/control metadata is never copied or hashed. `validateOwnedInventory` rejects foreign, duplicate, or reparse content, permits missing expected entries only for the explicit partial-owned rollback path, and keeps control paths separate from learner inventory. `removeOwnedStage` and `finalizeOwnedReservation` refuse any content outside their ownership token and expected inventory; finalization is a no-replace operation and may not rely on ordinary rename-over-target behavior. `cleanupOwnedMaterialization` attempts stage and reservation cleanup independently, deletes only token-proven subsets, preserves unproven content, accumulates asymmetric `CleanupFailureDetail` values, and rethrows one typed aggregate `EXERCISE_OUTPUT_003` when either side remains unsafe. The adapter never exposes a phase callback or generic fault injector. Its thrown typed errors are the only output-lifecycle inputs consumed by materialize.ts; source enumeration errors continue across the `ValidationOutcome` boundary as `EXERCISE_PATH_001`.

- [ ] **Step 5: Implement allowlisted materialization and non-destructive workspace reopening**

```ts
// packages/exercise-runner/src/materialize.ts
import { readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { normalizeRelativePath } from '@roadmap/exercise-contract';
import { failure, success, type ValidationOutcome } from '@roadmap/validation-core';
import {
  hashFile,
  validateAuthoritativeManifest,
  writeBaselineManifest,
} from './baseline-manifest.js';
import { loadExercise, resolveExerciseRoot } from './load-exercise.js';
import {
  ExerciseOutputError,
  createProductionMaterializeFilesystemAdapter,
  type MaterializeFilesystemAdapter,
  type OwnedReservation,
  type OwnedStage,
} from './materialization-filesystem.js';

export interface ExerciseWorkspace {
  exerciseId: string;
  root: string;
  readonly sourceRoot: string;
  baselineManifestPath: string;
}

const productionFilesystemAdapter = createProductionMaterializeFilesystemAdapter();

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

function outputFailure(error: ExerciseOutputError): ValidationOutcome<never> {
  const code = error.diagnosticCode;
  return failure([{
    code,
    severity: 'error',
    location: { file: 'workspace-output' },
    observed: error.message,
    expected: code === 'EXERCISE_OUTPUT_002'
      ? 'An absent output path or a target that appeared during exclusive reservation'
      : 'An operation-owned reservation and sibling stage with exact inventory',
    reason: code === 'EXERCISE_OUTPUT_002'
      ? 'Materialization would replace an existing or concurrently appearing output'
      : 'Non-destructive output finalization or owned cleanup could not be proven safe',
    remediation: 'Preserve unexpected content, recover the owned reservation, and retry with a fresh absent child path',
    documentation: 'docs/authoring/exercises.md',
  }]);
}

/** @internal Test-only seam; the public wrapper below remains exactly two-argument. */
export async function materializeExerciseWithFilesystemForTest(
  sourceRootInput: string | URL,
  outputRoot: string,
  filesystem: MaterializeFilesystemAdapter,
): Promise<ValidationOutcome<ExerciseWorkspace>> {
  return materializeExerciseCore(sourceRootInput, outputRoot, filesystem);
}

export async function materializeExercise(
  sourceRootInput: string | URL,
  outputRoot: string,
): Promise<ValidationOutcome<ExerciseWorkspace>> {
  return materializeExerciseCore(sourceRootInput, outputRoot, productionFilesystemAdapter);
}

async function materializeExerciseCore(
  sourceRootInput: string | URL,
  outputRoot: string,
  filesystem: MaterializeFilesystemAdapter,
): Promise<ValidationOutcome<ExerciseWorkspace>> {
  const loaded = await loadExercise(sourceRootInput);
  if (!loaded.ok) return loaded;

  const sourceRoot = await realpath(resolveExerciseRoot(sourceRootInput));
  const starterRoot = path.join(sourceRoot, 'starter');
  const openTestsRoot = path.join(sourceRoot, 'tests', 'open');
  const resolvedOutput = path.resolve(outputRoot);
  const outputParent = await realpath(path.dirname(resolvedOutput));
  if (resolvedOutput === sourceRoot || resolvedOutput.startsWith(`${sourceRoot}${path.sep}`) || outputParent === sourceRoot || outputParent.startsWith(`${sourceRoot}${path.sep}`)) {
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

  let stagingRoot: OwnedStage | undefined;
  let reservation: OwnedReservation | undefined;
  try {
    const outputState = await filesystem.inspectOutputState(resolvedOutput);
    if (outputState !== 'missing') {
      throw new ExerciseOutputError(
        'EXERCISE_OUTPUT_002',
        `refusing to replace existing ${outputState} output`,
      );
    }
    stagingRoot = await filesystem.createOwnedStage(
      path.dirname(resolvedOutput),
      `.roadmap-stage-${path.basename(resolvedOutput)}-`,
      starterRoot,
      openTestsRoot,
    );

    const allStageFiles = await listRegularFiles(stagingRoot.root);
    const stageControlPaths = new Set(
      stagingRoot.controlPaths.map((controlPath) => normalizeRelativePath(controlPath)),
    );
    const learnerFiles = allStageFiles.filter((file) => !stageControlPaths.has(file));
    const records = await Promise.all(
      learnerFiles.map((file) => hashFile(path.join(stagingRoot!.root, file), file)),
    );
    const metadataRoot = path.join(stagingRoot.root, '.roadmap');
    // createOwnedStage creates the owned metadata directory; it is included in
    // the exact inventory after the manifest is written below.
    const baselineManifestPath = path.join(metadataRoot, 'exercise-baseline.json');
    await writeBaselineManifest(baselineManifestPath, {
      schemaVersion: 1,
      exerciseId: loaded.value.id,
      exerciseVersion: loaded.value.version,
      files: records,
    });
    const stageInventory = [...learnerFiles, '.roadmap/exercise-baseline.json'];
    await validateAuthoritativeManifest(stagingRoot.root, sourceRoot, loaded.value, {
      excludedStagePaths: [
        ...stagingRoot.controlPaths,
        '.roadmap/exercise-baseline.json',
      ],
    });
    reservation = await filesystem.reserveMissingDirectory(resolvedOutput, stageInventory);
    await filesystem.populateReservedDirectory(stagingRoot, reservation, {
      noOverwrite: true,
      sourceControlPaths: stagingRoot.controlPaths,
      targetControlPaths: reservation.controlPaths,
    });
    await filesystem.validateOwnedInventory(reservation);
    const ownedStage = stagingRoot;
    if (!ownedStage) throw new ExerciseOutputError('EXERCISE_OUTPUT_003', 'staging ownership was lost before finalization');
    await filesystem.removeOwnedStage(ownedStage, stageInventory, { controlPaths: ownedStage.controlPaths });
    stagingRoot = undefined;
    await filesystem.finalizeOwnedReservation(reservation, {
      expectedInventory: stageInventory,
      controlPaths: reservation.controlPaths,
    });
    reservation = undefined;
    return success({
      exerciseId: loaded.value.id,
      root: resolvedOutput,
      sourceRoot,
      baselineManifestPath: path.join(resolvedOutput, '.roadmap', 'exercise-baseline.json'),
    });
  } catch (error) {
    try {
      await filesystem.cleanupOwnedMaterialization(
        stagingRoot,
        reservation,
        {
          requireOwnershipToken: true,
          refuseUnexpectedContent: true,
          allowPartialOwnedInventory: true,
        },
      );
    } catch (cleanupError) {
      return outputFailure(new ExerciseOutputError(
        'EXERCISE_OUTPUT_003',
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      ));
    }
    if (error instanceof ExerciseOutputError) return outputFailure(error);
    return pathFailure(sourceRoot, error);
  }
}
```

The public materializeExercise wrapper remains exactly two-argument and delegates to materializeExerciseCore with productionFilesystemAdapter. The @internal materializeExerciseWithFilesystemForTest seam is exported only from src/materialize.ts for package-local tests, is omitted from src/index.ts and package exports, and delegates to the same core with a supplied MaterializeFilesystemAdapter. The core invokes the adapter for every filesystem lifecycle operation; the test adapter never passes a third argument to the public wrapper. `createOwnedStage` creates the token-owned sibling, copies only the allowlisted starter/open-test trees, and creates the owned metadata directory before returning the stage handle, so stage preparation is part of the observed `stage:create` operation rather than an untracked filesystem side effect.

The `inspectOutputState` adapter operation runs before `createOwnedStage` creates any sibling stage. An existing-empty, matching-valid, invalid, or non-empty-unknown target returns a typed ExerciseOutputError with EXERCISE_OUTPUT_002 directly, without stage creation or deletion. `reserveMissingDirectory` uses an exclusive, non-recursive reservation beneath the already-realpathed parent, receives the exact final inventory derived from the validated stage, and translates only its expected EEXIST/target-appeared collision into ExerciseOutputError with EXERCISE_OUTPUT_002 while preserving the target; other reservation, population, stage-cleanup, or finalization uncertainty is represented as ExerciseOutputError with EXERCISE_OUTPUT_003. Source enumeration and reparse failures that are not output-lifecycle failures remain mapped through EXERCISE_PATH_001.

`createOwnedStage` returns normalized stage-relative `controlPaths` for token/control metadata. The core enumerates the stage, excludes those paths before hashing or writing baseline records, derives `stageInventory` from learner files plus only the explicit baseline-manifest path, and passes the stage and target control paths separately to population. `validateAuthoritativeManifest` receives an explicit `excludedStagePaths` option containing the stage controls and generated manifest; no exclusion relies on an undocumented filename convention. `populateReservedDirectory` copies only the learner inventory and declared manifest, never stage control metadata, and `validateOwnedInventory` confirms the token and every expected learner file while separately allowing only declared target control paths.

After population and owned-target validation, `removeOwnedStage` must remove the sibling stage using its exact learner inventory and stage control paths before finalizing the reservation. `cleanupOwnedMaterialization` attempts stage and reservation rollback independently, even when one side refuses: it deletes only token-proven subsets, allows missing expected entries during partial-owned rollback, preserves any path outside expected inventory plus control paths, and accumulates `CleanupFailureDetail` values before throwing one typed `ExerciseOutputError('EXERCISE_OUTPUT_003', ...)` aggregate if either side remains unsafe. Thus stage-cleanup refusal preserves foreign stage content while still rolling back a safe reservation, and foreign reserved-target content preserves the target while still removing a safe stage. Only after stage cleanup and reservation finalization succeed are the local stage and reservation handles cleared and success returned. The portable path never treats ordinary rename-over-target behavior as no-clobber; a proven platform no-replace primitive may be an optimization only. The adapter must translate only an exclusive target-appearance/EEXIST collision to EXERCISE_OUTPUT_002; non-collision reservation, population, inventory, cleanup, and finalization errors are typed EXERCISE_OUTPUT_003, while source enumeration and reparse failures remain EXERCISE_PATH_001.

```ts
// packages/exercise-runner/src/open-workspace.ts
import { access, realpath } from 'node:fs/promises';
import path from 'node:path';
import { failure, success, type ValidationOutcome } from '@roadmap/validation-core';
import {
  deriveAuthoritativeManifest,
  manifestsMatchExactly,
  readBaselineManifest,
} from './baseline-manifest.js';
import { loadExercise, resolveExerciseRoot } from './load-exercise.js';
import { materializeExercise, type ExerciseWorkspace } from './materialize.js';
import { assertSourceOutputAreDisjoint } from './workspace-paths.js';

export async function openExerciseWorkspace(
  sourceRoot: string | URL,
  outputRoot: string,
): Promise<ValidationOutcome<ExerciseWorkspace>> {
  const definition = await loadExercise(sourceRoot);
  if (!definition.ok) return definition;

  const root = path.resolve(outputRoot);
  const canonicalSourceRoot = await realpath(resolveExerciseRoot(sourceRoot));
  await assertSourceOutputAreDisjoint(canonicalSourceRoot, root);
  const baselineManifestPath = path.join(root, '.roadmap', 'exercise-baseline.json');
  try {
    await access(baselineManifestPath);
  } catch {
    return materializeExercise(sourceRoot, root);
  }

  try {
    const baseline = await readBaselineManifest(baselineManifestPath);
    const authoritative = await deriveAuthoritativeManifest(canonicalSourceRoot, definition.value);
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
    return success({ exerciseId: definition.value.id, root, sourceRoot: canonicalSourceRoot, baselineManifestPath });
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

  const outputParent = await mkdtemp(path.join(tmpdir(), 'roadmap-exercise-output-'));
  const output = path.join(outputParent, 'workspace');
  const result = await materializeExercise(source, output);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_PATH_001');
});
```

The Windows branch uses a directory junction, which does not require silently skipping the test when file-symlink privileges are unavailable.

- [ ] **Step 7: Export the package, run tests, and commit**

```ts
// packages/exercise-runner/src/index.ts
export {
  readBaselineManifest,
  writeBaselineManifest,
  type BaselineFileRecord,
  type ExerciseBaselineManifest,
} from './baseline-manifest.js';
export * from './load-exercise.js';
export {
  materializeExercise,
  type ExerciseWorkspace,
} from './materialize.js';
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
import { loadExercise, materializeExercise, verifyEditablePaths } from '../src/index.js';

const fixture = new URL('../../../fixtures/exercises/valid/minimal/', import.meta.url);

describe('verifyEditablePaths', () => {
  it('allows changes under src/** and rejects changes to open tests', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-editable-'));
    const output = path.join(parent, 'workspace');
    const materialized = await materializeExercise(fixture, output);
    const definition = await loadExercise(fixture);
    expect(materialized.ok && definition.ok).toBe(true);
    if (!materialized.ok || !definition.ok) return;

    await writeFile(path.join(output, 'src/counter.js'), 'export const changed = true;\n');
    expect((await verifyEditablePaths(materialized.value, definition.value, ['src/**'])).ok).toBe(true);

    const testFile = path.join(output, 'test/open/counter.contract.test.js');
    await writeFile(testFile, `${await readFile(testFile, 'utf8')}\n// modified\n`);
    const rejected = await verifyEditablePaths(materialized.value, definition.value, ['src/**']);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.diagnostics[0]?.code).toBe('EXERCISE_EDITABLE_001');
  });

  it('rejects a symlink added after materialization', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-editable-link-'));
    const output = path.join(parent, 'workspace');
    const materialized = await materializeExercise(fixture, output);
    if (!materialized.ok) throw new Error('Fixture must materialize');
    const definition = await loadExercise(fixture);
    if (!definition.ok) throw new Error('Fixture definition must load');

    if (process.platform === 'win32') {
      await symlink(path.join(output, 'src'), path.join(output, 'linked-src'), 'junction');
    } else {
      await symlink(path.join(output, 'src/counter.js'), path.join(output, 'answer.js'), 'file');
    }

    const result = await verifyEditablePaths(materialized.value, definition.value, ['src/**']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_EDITABLE_002');
  });
});
```

- [ ] **Step 2: Implement baseline diffing with fail-closed symlink handling**

```ts
// packages/exercise-runner/src/verify-editable-paths.ts
import { matchesEditablePath, type ExerciseDefinition } from '@roadmap/exercise-contract';
import { failure, success, type ValidationOutcome } from '@roadmap/validation-core';
import {
  compareManifestTriplet,
  deriveAuthoritativeManifest,
  deriveWorkspaceManifest,
  readBaselineManifest,
} from './baseline-manifest.js';
import type { ExerciseWorkspace } from './materialize.js';

export async function verifyEditablePaths(
  workspace: ExerciseWorkspace,
  definition: ExerciseDefinition,
  editablePaths: readonly string[],
): Promise<ValidationOutcome<readonly string[]>> {
  try {
    const authoritative = await deriveAuthoritativeManifest(workspace.sourceRoot, definition);
    const cached = await readBaselineManifest(workspace.baselineManifestPath);
    const current = await deriveWorkspaceManifest(workspace.root);
    const manifestCheck = compareManifestTriplet(authoritative, cached, current, editablePaths);
    if (!manifestCheck.ok) return failure(manifestCheck.diagnostics);

    const authoritativeByPath = new Map(authoritative.files.map((file) => [file.path, file.sha256]));
    const currentByPath = new Map(current.files.map((file) => [file.path, file.sha256]));
    const allPaths = [...new Set([...authoritativeByPath.keys(), ...currentByPath.keys()])].sort();
    const changed: string[] = [];

    for (const relativePath of allPaths) {
      if (currentByPath.get(relativePath) !== authoritativeByPath.get(relativePath)) changed.push(relativePath);
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

`deriveAuthoritativeManifest` realpaths the trusted `sourceRoot` and derives the protected starter/open-test records from the loaded definition on every call. `compareManifestTriplet` strictly validates the authoritative source manifest and cached manifest, then compares the current workspace manifest against authoritative records for every protected path while allowing only declared editable-path changes. It rejects source/cache identity or version drift, cached replay, duplicate/non-canonical paths, byte/hash drift, protected deletion/addition/rename/case alias, and reparse aliases before any command can run. The returned failure is stable and includes the manifest path and remediation; it is not converted into a learner success merely because the altered cache agrees with the workspace.

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
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-verify-'));
    const output = path.join(parent, 'workspace');
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
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-protected-'));
    const output = path.join(parent, 'workspace');
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

Add focused cases after a successful open for a tampered manifest hash, a replayed manifest from another exercise/version, protected deletion, protected addition, protected rename, a case-only alias, and a Unix symlink or Windows junction/reparse alias. Each case spies on or injects the locked runner boundary, proves `runCommand` is not called, and retains the stable manifest/protected-path diagnostic location and remediation. The test fixture must first establish a valid opened workspace, then mutate only the named manifest or workspace state so the fresh source derivation—not a failed initial open—causes the pre-command rejection.

- [ ] **Step 4: Implement protected-path verification, contained working directories, and command composition**

```ts
// packages/exercise-runner/src/verify-exercise.ts
import { realpath, stat } from 'node:fs/promises';
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

async function resolveWorkspaceDirectory(root: string, relative: string): Promise<string> {
  const canonicalRoot = await realpath(root);
  const resolved = await realpath(path.resolve(canonicalRoot, relative));
  const comparableRoot = process.platform === 'win32' ? canonicalRoot.toLowerCase() : canonicalRoot;
  const comparableResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const comparableRelationship = path.relative(comparableRoot, comparableResolved);
  if (comparableRelationship === '..' || comparableRelationship.startsWith(`..${path.sep}`) || path.isAbsolute(comparableRelationship)) {
    throw new Error(`Command working directory escapes workspace: ${relative}`);
  }
  if (!(await stat(resolved)).isDirectory()) throw new Error(`Command working directory is not a directory: ${relative}`);
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
      definition,
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
        cwd: await resolveWorkspaceDirectory(workspace.root, step.cwd),
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

Add command-CWD tests for a normal root `.` directory, a safe nested directory, a Unix symlink escape, a Windows junction/reparse escape, and a case-only alias. Each escape must be rejected by the asynchronous caller-side realpath comparison before `runCommand` is entered; Task 1's runner tests cover only usable-directory validation and must not claim workspace containment.

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
      args: [verify]
      cwd: .
      timeoutMs: 60000
constraints:
  editablePaths: [src/**]
  forbiddenDependencies: []
  forbiddenApis: []
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
    "test": "node --test",
    "verify": "node --test test/open"
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

Bind this exercise through the existing curriculum ownership surfaces in the same future Task 5 implementation: add the exercise reference to `curriculum/lessons/lesson-js-closure-private-state.md` and the artifact reference to `curriculum/assessments/assessment-js-closure.md`. The orchestration/tooling adapter must validate that both references resolve to `ex-js-closure-counter` without adding curriculum-package dependencies to `exercise-runner`. Release 0 has no forbidden-dependency/API enforcement path, so both policy arrays remain empty and the schema's negative test rejects any non-empty value; do not publish `globalThis` or any other unenforced claim.

The same Task 5 integration test must resolve both curriculum references to `ex-js-closure-counter` and fail if either the lesson `exercises` reference or assessment `artifact` reference is missing, stale, or reversed.

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
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-cli-'));
    const workspace = path.join(parent, 'workspace');
    const { stdout } = await run(workspace, 'baseline');
    expect(JSON.parse(stdout).status).toBe('passed');
  });

  it('reopens rather than rematerializes an existing learner workspace', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-cli-persist-'));
    const workspace = path.join(parent, 'workspace');
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
  const machine = argv.includes('--json');
  const validFormat = formatArgs.length === 0 || (formatArgs.length === 1 && formatArgs[0] === '--json');
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

The module must be import-safe: importing it must not parse argv, spawn a process, write lifecycle noise, or terminate the caller. Machine mode writes exactly one JSON value to stdout and no raw exception to stderr; human mode is the only mode that formats readable diagnostics. Any invocation containing `--json` is machine mode even when usage is malformed, duplicated, reordered, or contains an unknown argument. `emit` is the sole output path so usage, expected validation failure, and internal failure retain exits `2`, `1`, and `3` respectively. Add CLI tests for duplicate `--json`, `--json` before the positional arguments, reordered format arguments, and unknown arguments with and without `--json`, asserting one JSON stdout value and empty stderr for every machine-requested form.

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

Expected: the direct machine baseline exits `0` with one JSON value; the direct machine learner executes the metadata's `pnpm verify` command and exits `1` with `EXERCISE_COMMAND_001` because the starter intentionally has no learner implementation; the human wrapper prints readable output without being used as a machine parser. Add focused tests for usage exit `2`, internal exit `3`, empty/owned stderr, one-value stdout, missing targets, valid reopens, invalid manifests, non-empty unknown targets, and reference-solution overlay.

- [ ] **Step 8: Install the reference source only in the temporary workspace and prove learner mode passes**

```bash
node --input-type=module --eval "import { copyFile } from 'node:fs/promises'; await copyFile('exercises/javascript/ex-js-closure-counter/solution/src/counter.js', '.tmp/exercise/src/counter.js')"
pnpm exec tsx tooling/verify-exercise/src/main.ts exercises/javascript/ex-js-closure-counter .tmp/exercise learner --json
```

Expected: exit `0`, status `passed`, and the CLI does not replace the copied implementation before verification.

The integration test must perform this reference overlay automatically in its temporary workspace and invoke the same learner verifier used for the starter assertion; a separate reference-only verifier or a manually inspected result is not sufficient.

Commit:

```bash
git add exercises/javascript/ex-js-closure-counter tooling/verify-exercise package.json docs/authoring/exercises.md docs/learner/exercise-workflow.md docs/maintainers/verifier-failures.md curriculum/lessons/lesson-js-closure-private-state.md curriculum/assessments/assessment-js-closure.md
git commit -m "feat: add progressive closure exercise workflow"
```

### WP-05 exercise-only acceptance gate — `WP05_ONLY_EXECUTION_BOUNDARY`

Before leaving WP-05, run the direct machine baseline and learner commands, verify the starter's intended failure, overlay the reference solution and rerun the identical learner verifier, check the edge/negative case, confirm protected-file and non-destructive workspace behavior, and link-check the three WP-05 authoring/learner/maintainer documents. This gate does not evaluate rubrics, evidence trust, remediation, or any other WP-06 concern.


### Task 6: Define criterion-based rubrics and evaluation — `WP06_PHASE_B_AUTHORIZED`

> **WP06_PHASE_B_AUTHORIZED:** Active only under a separately bounded WP-06 writer dispatch after this Task 0 plan amendment is accepted. Task 0 itself does not implement, test, commit, or claim Task 6.

**Files (Task 6 ownership):**
- Create: `packages/rubric-schema/package.json`
- Create: `packages/rubric-schema/tsconfig.json`
- Create: `packages/rubric-schema/vitest.config.ts`
- Create: `packages/rubric-schema/src/schema.ts`
- Create: `packages/rubric-schema/src/evaluate.ts`
- Create: `packages/rubric-schema/src/json-schema.ts`
- Create: `packages/rubric-schema/src/index.ts`
- Create: `packages/rubric-schema/test/rubric.test.ts`
- Create: `packages/rubric-schema/generated/rubric.schema.json`
- Create: `fixtures/rubric/invalid/critical-criterion-below-threshold.json`
- Modify incrementally: `scripts/generate-json-schema.ts` and root `package.json` only in the existing schema:generate/schema:check path
- Modify: `pnpm-lock.yaml` only for the Task-6 package importer after the manifest exists
- Preserve: root `vitest.config.ts`, `pnpm-workspace.yaml`, all WP-05 runtime package sources/tests, apps, curriculum, exercises, templates, release/CI/publication surfaces, and WP-07+ work

**Interfaces:**
- Consumes: `CompetencyIdSchema` and `ArtifactIdSchema` from `@roadmap/curriculum-schema`, a rubric-owned `CriterionIdSchema`, and explicit closed evidence-reference compatibility values
- Produces: `RubricSchema`, `Rubric`, `RubricSubmissionSchema`, `evaluateRubric`, and `RubricEvaluation`

- [ ] **Step 1: Write failing tests for critical, required, and missing criteria**

```ts
// packages/rubric-schema/test/rubric.test.ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  evaluateRubric,
  RubricSchema,
  RubricSubmissionSchema,
} from '../src/index.js';

interface CriticalCriterionFixture {
  readonly rubric: unknown;
  readonly submission: unknown;
}

async function readCriticalCriterionFixture(): Promise<CriticalCriterionFixture> {
  return JSON.parse(
    await readFile(
      new URL(
        '../../../fixtures/rubric/invalid/critical-criterion-below-threshold.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as CriticalCriterionFixture;
}

// This inline helper covers version and unknown-key behavior beyond the canonical fixture.
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
  it('fails when the repository fixture has a critical criterion below 2 regardless of another score', async () => {
    const fixture = await readCriticalCriterionFixture();
    const fixtureRubric = RubricSchema.parse(fixture.rubric);
    const result = evaluateRubric(
      fixtureRubric,
      RubricSubmissionSchema.parse(fixture.submission),
    );
    expect(result.status).toBe('needs-remediation');
    expect(result.blockingCriterionIds).toEqual(['closure.private-state']);
  });

  it('requires each required criterion even when the critical criterion passes', () => {
    const result = evaluateRubric(rubric, {
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      scores: { 'closure.private-state': 2 },
    });
    expect(result.status).toBe('needs-remediation');
    expect(result.blockingCriterionIds).toEqual(['documentation.explanation']);
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
import { ArtifactIdSchema, CompetencyIdSchema } from '@roadmap/curriculum-schema';

const ScoreSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export const CriterionIdSchema = z.string().regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/);
const RubricArtifactIdSchema = ArtifactIdSchema.regex(
  /^rubric-/,
  'Rubric IDs must use the canonical rubric artifact family',
);
export const rubricEvidenceReferences = [
  'test-report',
  'source-diff',
  'explanation',
  'observation-report',
  'debugging-report',
] as const;
export const EvidenceReferenceSchema = z.enum(rubricEvidenceReferences);

export const RubricSchema = z.object({
  schemaVersion: z.literal(1),
  id: RubricArtifactIdSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: z.string().min(1),
  criteria: z.array(z.object({
    id: CriterionIdSchema,
    title: z.string().min(1),
    critical: z.boolean(),
    required: z.boolean(),
    competency: CompetencyIdSchema,
    evidence: z.array(EvidenceReferenceSchema).min(1),
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
  rubricId: RubricArtifactIdSchema,
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
git add packages/rubric-schema/package.json packages/rubric-schema/tsconfig.json packages/rubric-schema/vitest.config.ts packages/rubric-schema/src/schema.ts packages/rubric-schema/src/evaluate.ts packages/rubric-schema/src/json-schema.ts packages/rubric-schema/src/index.ts packages/rubric-schema/test/rubric.test.ts packages/rubric-schema/generated/rubric.schema.json fixtures/rubric/invalid/critical-criterion-below-threshold.json scripts/generate-json-schema.ts package.json pnpm-lock.yaml
git commit -m "feat: evaluate critical rubric criteria"
```

### Task 7: Define versioned evidence with independent trust attestations — `WP06_PHASE_B_AUTHORIZED`

> **WP06_PHASE_B_AUTHORIZED:** Active only under a separately bounded WP-06 writer dispatch after Task 6 is accepted. Task 0 itself does not implement, test, commit, or claim Task 7.

**Files (Task 7 ownership):**
- Create: `packages/evidence-schema/package.json`
- Create: `packages/evidence-schema/tsconfig.json`
- Create: `packages/evidence-schema/vitest.config.ts`
- Create: `packages/evidence-schema/src/schema.ts`
- Create: `packages/evidence-schema/src/trust.ts`
- Create: `packages/evidence-schema/src/json-schema.ts`
- Create: `packages/evidence-schema/src/index.ts`
- Create: `packages/evidence-schema/test/evidence.test.ts`
- Create: `packages/evidence-schema/generated/evidence-manifest.schema.json`
- Create: `fixtures/evidence/invalid/manifest-version-mismatch.json`
- Modify incrementally: `scripts/generate-json-schema.ts` and root `package.json` only in the existing schema:generate/schema:check path
- Modify: `pnpm-lock.yaml` only for the Task-7 package importer after the manifest exists
- Preserve: root `vitest.config.ts`, `pnpm-workspace.yaml`, accepted Task-6 interfaces, all WP-05 runtime package sources/tests, apps, curriculum, exercises, templates, release/CI/publication surfaces, and WP-07+ work

**Interfaces:**
- Consumes: `ArtifactIdSchema` from `@roadmap/curriculum-schema`, curriculum/template/milestone/repository versions, and explicit independent trust attestations
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
    "@roadmap/curriculum-schema": "workspace:*",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

```ts
// packages/evidence-schema/test/evidence.test.ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { EvidenceManifestSchema, satisfiesTrustRequirement } from '../src/index.js';

async function readManifestVersionMismatchFixture(): Promise<unknown> {
  return JSON.parse(
    await readFile(
      new URL(
        '../../../fixtures/evidence/invalid/manifest-version-mismatch.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as unknown;
}

// This inline helper covers unrelated URL, attestation, and duplicate behavior.
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
      id: 'evidence-architecture-overview',
      path: 'evidence/architecture/overview.md',
      attestations: ['repository-verifiable'],
    },
  ],
};

describe('EvidenceManifestSchema', () => {
  it('accepts a versioned evidence manifest', () => {
    expect(EvidenceManifestSchema.parse(valid)).toEqual(valid);
  });

  it('rejects the named repository manifest-version-mismatch fixture', async () => {
    const fixture = await readManifestVersionMismatchFixture();
    expect(() => EvidenceManifestSchema.parse(fixture)).toThrow();
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
import { ArtifactIdSchema } from '@roadmap/curriculum-schema';
import { evidenceTrustLevels } from './trust.js';

const TrustSchema = z.enum(evidenceTrustLevels);
const AttestationsSchema = z.array(TrustSchema).min(1).superRefine((attestations, context) => {
  if (new Set(attestations).size !== attestations.length) {
    context.addIssue({ code: 'custom', message: 'Attestations must be unique' });
  }
});
const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
const UrlSchema = z
  .string()
  .url()
  .and(z.string().regex(/^https:\/\//, 'Evidence URLs must use HTTPS'));
const RelativeEvidencePathSchema = z.string().regex(
  /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/,
  'Evidence paths must be repository-relative and cannot traverse',
);
const MilestoneIdSchema = ArtifactIdSchema.regex(
  /^milestone-/,
  'Milestone IDs must use the canonical milestone artifact family',
);
const EvidenceArtifactIdSchema = ArtifactIdSchema.regex(
  /^evidence-/,
  'Evidence artifact IDs must use the canonical evidence artifact family',
);

export const EvidenceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  curriculumVersion: SemverSchema,
  templateVersion: SemverSchema,
  milestoneId: MilestoneIdSchema,
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
    id: EvidenceArtifactIdSchema,
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
git add packages/evidence-schema/package.json packages/evidence-schema/tsconfig.json packages/evidence-schema/vitest.config.ts packages/evidence-schema/src/schema.ts packages/evidence-schema/src/trust.ts packages/evidence-schema/src/json-schema.ts packages/evidence-schema/src/index.ts packages/evidence-schema/test/evidence.test.ts packages/evidence-schema/generated/evidence-manifest.schema.json fixtures/evidence/invalid/manifest-version-mismatch.json scripts/generate-json-schema.ts package.json pnpm-lock.yaml
git commit -m "feat: validate independent evidence attestations"
```


### Task 8: Map failed rubric criteria to deterministic remediation — `WP06_PHASE_B_AUTHORIZED`

> **WP06_PHASE_B_AUTHORIZED:** Active only under a separately bounded WP-06 writer dispatch after Tasks 6 and 7 are accepted. Task 0 itself does not implement, test, commit, or claim Task 8.

**Files (Task 8 ownership):**
- Create: `packages/assessment-core/package.json`
- Create: `packages/assessment-core/tsconfig.json`
- Create: `packages/assessment-core/vitest.config.ts`
- Create: `packages/assessment-core/src/remediation.ts`
- Create: `packages/assessment-core/src/result.ts`
- Create: `packages/assessment-core/src/json-schema.ts`
- Create: `packages/assessment-core/src/index.ts`
- Create: `packages/assessment-core/test/assessment.test.ts`
- Create: `packages/assessment-core/generated/remediation-catalog.schema.json`
- Create: `fixtures/assessment/closure-counter-remediation.yaml`
- Create: `docs/authoring/remediation.md`
- Modify incrementally: `scripts/generate-json-schema.ts` and root `package.json` only in the existing schema:generate/schema:check path
- Modify: `pnpm-lock.yaml` only for the Task-8 package importer after the manifest exists
- Modify narrowly: `tooling/verify-exercise/test/cli.test.ts` so it expects and link-checks the new remediation guide instead of requiring it to be absent
- Preserve: root `vitest.config.ts`, `pnpm-workspace.yaml`, all WP-05 runtime package sources/tests and behavior, apps, curriculum, exercises, templates, release/CI/publication surfaces, and WP-07+ work

**Interfaces:**
- Consumes: `Rubric`, `RubricEvaluation`, the rubric-owned `CriterionIdSchema`, canonical `CompetencyIdSchema` and `ArtifactIdSchema`, canonical `Diagnostic`/ `ValidationOutcome`/ `failure`/ `success`, and remediation metadata
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
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { RubricSchema } from '@roadmap/rubric-schema';
import {
  createAssessmentResult,
  RemediationCatalogSchema,
  validateRemediationCoverage,
} from '../src/index.js';

async function readRemediationCatalogFixture() {
  return RemediationCatalogSchema.parse(
    parse(
      await readFile(
        new URL(
          '../../../fixtures/assessment/closure-counter-remediation.yaml',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
}

describe('createAssessmentResult', () => {
  it('returns exact remediation from the repository YAML fixture for each blocking criterion', async () => {
    const catalog = await readRemediationCatalogFixture();
    const result = createAssessmentResult({
      status: 'needs-remediation',
      criteria: [{ criterionId: 'closure.private-state', critical: true, required: true, score: 1, status: 'failed' }],
      blockingCriterionIds: ['closure.private-state'],
    }, catalog);
    expect(result.status).toBe('needs-remediation');
    expect(result.blocking).toEqual([
      {
        criterion: 'closure.private-state',
        competency: 'js.function.closure',
        lessons: ['lesson-js-closure-private-state'],
        exercises: ['ex-js-closure-counter'],
        retake: [
          'Restore independent state for each counter instance',
          'Add the negative independence test',
          'Update the technical explanation',
        ],
      },
    ]);
  });

  it('fails closed when a blocking criterion has no remediation entry', async () => {
    const catalog = await readRemediationCatalogFixture();
    expect(() => createAssessmentResult({
      status: 'needs-remediation',
      criteria: [{ criterionId: 'missing.entry', critical: true, required: true, score: 0, status: 'failed' }],
      blockingCriterionIds: ['missing.entry'],
    }, catalog)).toThrow(/No remediation entry/);
  });


  it('reports every required rubric criterion without remediation as an error', async () => {
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
    const catalog = await readRemediationCatalogFixture();
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
    "@roadmap/curriculum-schema": "workspace:*",
    "@roadmap/validation-core": "workspace:*",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:",
    "yaml": "catalog:"
  }
}
```

```ts
// packages/assessment-core/src/remediation.ts
import { CriterionIdSchema, type Rubric } from '@roadmap/rubric-schema';
import { ArtifactIdSchema, CompetencyIdSchema } from '@roadmap/curriculum-schema';
import { failure, success, type ValidationOutcome } from '@roadmap/validation-core';
import { z } from 'zod';

const LessonArtifactIdSchema = ArtifactIdSchema.regex(
  /^lesson-/,
  'Lesson IDs must use the canonical lesson artifact family',
);
const ExerciseArtifactIdSchema = ArtifactIdSchema.regex(
  /^ex-/,
  'Exercise IDs must use the canonical exercise artifact family',
);

export const RemediationCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(z.object({
    criterion: CriterionIdSchema,
    competency: CompetencyIdSchema,
    lessons: z.array(LessonArtifactIdSchema),
    exercises: z.array(ExerciseArtifactIdSchema),
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
pnpm --filter @roadmap/verify-exercise test -- cli.test.ts
pnpm --filter @roadmap/rubric-schema check
pnpm --filter @roadmap/rubric-schema test
pnpm --filter @roadmap/evidence-schema check
pnpm --filter @roadmap/evidence-schema test
pnpm --filter @roadmap/assessment-core check
pnpm --filter @roadmap/assessment-core test
pnpm schema:check
pnpm check
pnpm test
pnpm verify
```

Commit:

```bash
git add packages/assessment-core/package.json packages/assessment-core/tsconfig.json packages/assessment-core/vitest.config.ts packages/assessment-core/src/remediation.ts packages/assessment-core/src/result.ts packages/assessment-core/src/json-schema.ts packages/assessment-core/src/index.ts packages/assessment-core/test/assessment.test.ts packages/assessment-core/generated/remediation-catalog.schema.json fixtures/assessment/closure-counter-remediation.yaml docs/authoring/remediation.md tooling/verify-exercise/test/cli.test.ts scripts/generate-json-schema.ts package.json pnpm-lock.yaml
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

Stop after the exit gate. Record only a deferred handoff to the later WP-06 owner for rubric and evidence-trust review after that owner receives explicit authorization; do not perform or request that substantive WP-06 review from the WP-05 checkpoint.
