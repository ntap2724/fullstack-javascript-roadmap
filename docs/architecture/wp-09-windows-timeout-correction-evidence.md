# WP-09 Windows Timeout Correction — Hosted Recheck Evidence

## Classification

Category C: Pre-existing Windows hosted test resource/timeout issue.

## Old Main SHA

`d00c70abfbfda410a0b320319972c0ee4193153b`

## Correction SHA

`277e10fc5b91444e1d8eb6b1357df84763634194`

Parent: `d00c70abfbfda410a0b320319972c0ee4193153b` (append-only descendant)

## Freeze Ref

`refs/guard/wp-09/freeze-windows-timeout-correction` → `277e10f`

All previous `refs/guard/wp-09/*` refs preserved and untouched.

## Change Summary

| Property | Value |
|----------|-------|
| File | `packages/command-runner/test/run-command.test.ts` |
| Line | 434 |
| Before | `});` |
| After | `}, 15_000);` |
| Effect | Vitest test-level timeout increased from default 5,000ms to 15,000ms |
| Internal command timeout | `timeoutMs: 5_000` — unchanged |
| Assertions | Unchanged |
| Production code | Zero changes |

## Publication Action

| Action | Detail |
|--------|--------|
| Branch | `release-0/wp-09-windows-timeout-correction` |
| PR | #4 |
| Push time | 2026-08-16T13:44:40Z |

## Workflow Evidence

### Pull Request Workflow (run 31950689330)

| Job | Status | Conclusion |
|-----|--------|------------|
| verify (ubuntu-24.04) | completed | success |
| verify (windows-2025) | completed | success |

### Verify Release Workflow (run 31950968100)

Dispatched via `workflow_dispatch` on branch `release-0/wp-09-windows-timeout-correction`.

| Job | Status | Conclusion |
|-----|--------|------------|
| platform (ubuntu-24.04) | completed | success |
| platform (windows-2025) | completed | success |
| browser | completed | success |
| aggregate | completed | success |

Key step results within the Windows platform job:
- `pnpm verify:release` — success
- `write-platform-report.mjs windows-2025` — success

Key step results within the aggregate job:
- `collect-release-evidence.mjs` — success
- `verify-release-0.mjs .tmp/release-evidence` — success

### Main Workflow (on main at d00c70a)

Run 31945624182: **success**

## Previous Failure

- Test: `resolves a Windows .cmd executable through cross-spawn on Windows`
- File: `packages/command-runner/test/run-command.test.ts:418`
- Failure: timeout after 5000ms (Vitest test-level timeout)
- Root cause: Windows-2025 CI runner process spawn latency exceeds default 5000ms envelope

## Resolution Proof

The correction was verified as resolving the timeout without:
- Skipped execution (test runs and passes)
- Retries added (none present in diff)
- Changed assertions (all `expect()` calls identical)
- Changed command behavior (`timeoutMs: 5_000`, `args`, `command`, `cwd` all unchanged)

## Integrity Verification

| Check | Result |
|-------|--------|
| Source hash at freeze | `ba031239f7ee1c2cc3793ed7fd73e4acf77f4d4b` |
| No source changes after freeze | Confirmed (empty diff against HEAD) |
| No guard mutation | All existing guards preserved; new ref additive only |
| No unauthorized mutation | Only authorized file changed |
| Remote mutation | origin/main unchanged at `d00c70a` |

## Dual Review Packets

| Agent | Verdict | Isolation |
|-------|---------|-----------|
| Fresh Reviewer | REVIEW_PASS | Worktree (isolated) |
| Fresh Verifier | VERIFICATION_PASS | Worktree (isolated) |
| Owner Gate | GATE_PASS | Primary main |
