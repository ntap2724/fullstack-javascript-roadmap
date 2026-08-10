# Baseline acceptance for the JavaScript engineering starter

This directory records what the generated repository must satisfy before publication. It is
source-side material: it is deliberately excluded from the published starter by the template
allowlist, which selects only `files/**`.

## Generated repository must

- Install with `pnpm install --frozen-lockfile` using only its own committed lockfile
- Pass `pnpm verify:baseline` on a fresh clone, with no monorepo packages on disk
- Contain `.roadmap/template-manifest.json` recording the source commit and toolchain
- Contain no solution files, private fixtures, secrets, or internal references

## Generated repository must not

- Resolve any `@roadmap/*` workspace package
- Depend on any file outside its own root
- Pass `pnpm verify` before the learner implements the milestone

## Why `verify:baseline` and `verify` differ

`verify:baseline` is the publication gate: it proves the scaffolding is healthy and must pass at
generation time. `verify` includes the learner test and must fail until the milestone is
implemented. Publication runs `verify:baseline` only. Running `verify` at publication time would
require shipping a completed solution, which is exactly what the allowlist exists to prevent.
