# Agent instructions for this starter repository

These rules apply to any AI assistant working in this repository, and to you when you decide what
to ask an assistant for. They exist so that the repository stays an honest record of what you can
actually do.

## What an assistant may do

- Explain a concept, an error message, a stack trace, or an unfamiliar API
- Diagnose a failing test, build, type error, or migration and describe the likely cause
- Run a declared command and report its **real** exit status and output
- Add a regression test that you explicitly asked for, alongside the existing tests
- Review your architecture, your package boundaries, and your diffs
- Point out gaps, weak assertions, missing edge cases, and security mistakes
- Suggest how to break a milestone into smaller, independently verifiable steps

## What an assistant must not do

- Delete, skip, weaken, loosen, or rewrite a learner test or any other verification
  control to make a command pass
- Weaken or reinterpret an acceptance contract so that an implementation appears to satisfy it
- Change acceptance criteria after the fact to match what was built
- Implement the whole milestone directly from the brief
- Print, echo, commit, or otherwise expose the contents of `.env` or any environment secret
- Claim that a command passed without running it and reading its actual output
- Replace PostgreSQL-specific verification with mocks or in-memory fakes when the acceptance
  criterion is database-specific

The fourth rule is the one that matters most. If an assistant writes the milestone for you, you
have produced a repository and learned nothing, and every piece of evidence you record about it is
false.

## Database-specific criteria

Some criteria are explicitly about PostgreSQL behavior: the unique enrollment invariant, the
capacity transaction, and relational constraints. Those must be verified against a real PostgreSQL
instance. A mocked query builder, a stubbed transaction, or an in-memory array proves nothing about
a constraint the database is supposed to enforce, and substituting one is a false pass.

## Verification controls you must not defeat

These decide whether this repository tells the truth about your work. Extend them
freely; never weaken, skip, delete, or route around them.

```text
apps/api/test/learner.test.ts     add cases; keep LEARNER_API_ENROLLMENT_001 intact
apps/web/test/learner.test.tsx    add cases; keep LEARNER_WEB_ENROLLMENT_001 intact
scripts/verify-learner.mjs        the aggregate learner-contract runner
package.json                      the verification-script contract described below
.github/workflows/verify.yml      the baseline and learner-contract jobs and their triggers
evidence/**                       the evidence requirements in evidence/README.md
.roadmap/**                       generated provenance for this template
```

In `package.json`: `verify:baseline` must keep running `check`,
`test:infrastructure`, and `build`, and must never reach the learner contract.
`verify` must keep running `verify:baseline` and then `test:learner`, joined with
`&&` so a failing learner contract fails the command.

Downgrading the `learner-contract` job to `pnpm verify:baseline`, narrowing its
trigger so it never runs, or adding `continue-on-error` is the same offence as
deleting the test. So is rewriting `verify` to stop at the baseline.

Acceptance contracts and rubric criteria are equally out of bounds. An assistant
may argue that a criterion is wrong; it may not restate the criterion to match
what was built.

## Infrastructure tests

```text
apps/api/test/infrastructure.test.ts
apps/web/test/infrastructure.test.tsx
packages/*/test/infrastructure.test.ts
packages/contracts/test/boundary.test.ts
packages/contracts/test/dependency-policy.test.ts
```

These prove the scaffolding, and scaffolding changes as you build. They **may** be
updated as your implementation evolves — that is ordinary work, not a bypass.

They must not be:

- deleted
- skipped, marked `.skip` or `.todo`, or commented out
- reduced: coverage that holds today must still hold afterwards
- made to require a running service or environment configuration, unless the
  criterion is genuinely database-specific
- rewritten to fit a failing implementation

The last point is the one that matters. Updating an infrastructure test because
the architecture moved is legitimate. Updating one because it went red is not.

If a control seems wrong, say so and explain why. Do not edit around it.

## Verification language

`implemented` means the code was written. `verified` means the declared checks were run, their real
output was read, and they passed. Never report the first as if it were the second.

A failing `pnpm verify` on an untouched starter is the **correct** state. Do not "fix" it by
changing the test, the runner, or the workflow. The only correct fix is implementing enrollment.

## Evidence

Evidence in `evidence/` must describe commands that were actually executed against a real commit.
A transcript of an imagined successful run is a fabrication even when the code happens to be
correct. `evidence/manifest.example.json` is an example with placeholder values; it is never
evidence.
