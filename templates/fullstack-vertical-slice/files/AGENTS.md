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

- Delete, skip, weaken, loosen, or rewrite a learner test to make a command pass
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

## Tests you may extend but must not weaken

```text
apps/api/test/learner.test.ts       add cases; keep LEARNER_API_ENROLLMENT_001 intact
apps/web/test/learner.test.tsx      add cases; keep LEARNER_WEB_ENROLLMENT_001 intact
```

## Files that are not yours to change

```text
apps/api/test/infrastructure.test.ts
apps/web/test/infrastructure.test.tsx
packages/contracts/test/**
packages/database/test/**
scripts/verify-learner.mjs
.roadmap/**
```

If one of these seems wrong, say so and explain why. Do not edit around it.

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
