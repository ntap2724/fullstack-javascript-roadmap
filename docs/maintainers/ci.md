# CI Maintenance Guide

## Pull-request checks

Every pull request runs the same fast verification contract on two platforms:

| Check name              | Runner              | Command                                         |
| ----------------------- | ------------------- | ----------------------------------------------- |
| `verify (ubuntu-24.04)` | Ubuntu 24.04        | `pnpm install --frozen-lockfile && pnpm verify` |
| `verify (windows-2025)` | Windows Server 2025 | `pnpm install --frozen-lockfile && pnpm verify` |

## Reproducing a check locally

Run the exact same command the workflow executes:

```bash
pnpm install --frozen-lockfile
pnpm verify
```

The `verify` pipeline runs, in order:

1. `environment:verify` — confirms Node and pnpm match `.node-version` and `package.json#packageManager`
2. `check` — Prettier, ESLint, TypeScript, repository policy, Astro type-check
3. `test` — bootstrap tests (including CI policy tests) and Vitest unit tests
4. `content:validate:curriculum` — curriculum graph and schema validation
5. `docs:build` — Astro static build

## Design constraints

- **Fixed runner labels** (`ubuntu-24.04`, `windows-2025`) are intentional. Do not replace with `latest` or floating labels.
- **Browser downloads are excluded** from the fast pull-request contract. Chromium, Firefox, and WebKit only run on the main-branch and release-verification workflows.
- **A green badge without the referenced command log is not sufficient release evidence.** The badge proves the workflow ran; the log proves the exact commands passed.

## Workflow files

| File                 | Trigger              | Purpose                                        |
| -------------------- | -------------------- | ---------------------------------------------- |
| `pull-request.yml`   | `pull_request`       | Fast cross-platform check                      |
| `main.yml`           | `push` to `main`     | Full verification plus Chromium                |
| `scheduled.yml`      | Weekly cron + manual | Cross-platform release contract                |
| `verify-release.yml` | Manual dispatch      | Multi-platform, multi-browser release evidence |
