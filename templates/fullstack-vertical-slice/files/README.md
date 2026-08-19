# Workshop Enrollment Starter

Template version {{TEMPLATE_VERSION}}, curriculum release {{CURRICULUM_VERSION}}.

**Status: technical preview.** This starter proves that the intended architecture, contracts, and
verification commands hold together. It is not a finished course, and finishing it does not make
you a Junior Fullstack developer. See [What this starter does not claim](#what-this-starter-does-not-claim).

This is your working repository for the Workshop Enrollment milestone. You own it: commit to it,
break it, and fix it.

## Prerequisites

| Requirement | Exact version                                        | Where it is pinned                 |
| ----------- | ---------------------------------------------------- | ---------------------------------- |
| Node.js     | the version in `.node-version`                       | `.node-version`                    |
| pnpm        | the version in `packageManager`                      | `package.json`                     |
| PostgreSQL  | 16 or newer, only once you reach the database module | not required for `verify:baseline` |

You do **not** need a running PostgreSQL server to install this repository or to run
`pnpm verify:baseline`. The baseline is deliberately database-free.

## Installation and verification

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify:baseline
```

On an untouched starter, `pnpm install --frozen-lockfile` and `pnpm verify:baseline` both exit `0`.
If either fails on a fresh clone, that is a defect in the starter, not in your work.

## The two verification commands

These differ on purpose, and the difference is the whole point of this repository.

| Command                | What it runs                            | Expected on an untouched starter |
| ---------------------- | --------------------------------------- | -------------------------------- |
| `pnpm verify:baseline` | `check`, `test:infrastructure`, `build` | **PASS** — exit `0`              |
| `pnpm verify`          | `verify:baseline`, then `test:learner`  | **FAIL** — non-zero exit         |

`pnpm verify:baseline` is the health check. It proves the toolchain resolves, the workspace
type-checks, the infrastructure tests pass, and every package builds. It must pass the moment you
clone.

`pnpm verify` additionally runs the learner contract, which asserts behavior you have not written
yet. **It is expected to fail until you implement enrollment.** A failing `pnpm verify` on day one
is the correct starting state, not a problem to route around.

The baseline does **not** pin the enrollment seam, so implementing enrollment turns `pnpm verify`
green without turning the baseline red.

Two baseline assertions in `apps/api/test/infrastructure.test.ts` will need your attention as you
go further. Updating them is expected work, not a bypass:

- It asserts `GET /api/workshops` returns `200`. Once that route reads from PostgreSQL, the
  database-free baseline can only stay green if `createApp()` accepts a workshop source and this
  test injects a fake one. The invariants that are genuinely about the database — the unique
  enrollment constraint, the capacity transaction — belong in a separate suite that requires a
  real server, not in the baseline.
- It asserts `loadConfig` returns exactly today's five variables. When you add a required variable,
  add it on both sides.

Both are transport-level assertions about scaffolding, so substituting a fake source is legitimate
there. See `AGENTS.md`.

The failure you should see names two stable diagnostic codes:

```text
LEARNER_API_ENROLLMENT_001   the API enrollment endpoint still answers 501
LEARNER_WEB_ENROLLMENT_001   the web Enroll workflow does not exist yet
```

Both appear on every run, because `pnpm test:learner` runs the API suite and the web suite even
when the API suite fails first. A `LEARNER_RUNNER_*` code instead means the runner itself could not
do its job — a setup problem, not the expected learner failure:

```text
LEARNER_RUNNER_001   this command was not run through pnpm
LEARNER_RUNNER_002   a suite hung, flooded its output, or was killed
LEARNER_RUNNER_003   a declared suite could not be found, so it was never evaluated
```

## Architecture map

```text
apps/web            React + Vite SPA. Owns UI state, URL state, forms, and API adapters.
apps/api            Express API. Owns HTTP transport, authentication, authorization, workflows.
packages/contracts  Shared Zod request/response schemas. Public wire shapes only.
packages/database   Drizzle schema, migrations, and adapters. Never imported by apps/web.
scripts             Repository-owned verification helpers.
evidence            Your milestone evidence. See evidence/README.md.
```

Local development ports: web `5173`, API `3000`, PostgreSQL `5432`.

Dependency direction is enforced, not merely documented:

- `apps/web` may resolve `@workshop/contracts` and nothing else under `@workshop/`.
  `packages/contracts/test/dependency-policy.test.ts` parses `apps/web/package.json` and every
  module under `apps/web/src/**` — including type-only imports, `export … from`, literal dynamic
  imports, and `import = require` — and fails if any of them reaches another internal package.
- `packages/contracts` must not depend on the database package, Drizzle, `pg`, or React, and its
  source must not name them. `packages/contracts/test/boundary.test.ts` reads both manifests and
  every module under `packages/contracts/src/**` and `packages/database/src/**`.

Both run inside `pnpm verify:baseline`, so crossing the boundary fails the health check.

## What is deliberately incomplete

These are the seams the milestone asks you to close. They are declared, not accidental.

| Location                                      | Current behavior                                     | What you must implement                                                 |
| --------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `POST /api/workshops/:workshopId/enrollments` | returns `501` with code `ENROLLMENT_NOT_IMPLEMENTED` | authenticated, transactional enrollment returning `201`                 |
| `GET /api/workshops`                          | returns a schema-valid **empty** list                | read real workshops from PostgreSQL                                     |
| web workshop list                             | renders loading, empty, and error states only        | render an `Enroll` control and a confirmed state                        |
| authentication                                | absent                                               | session creation, storage, and revocation                               |
| CSRF                                          | absent                                               | synchronizer token plus `Origin` validation for state-changing requests |
| migrations                                    | absent                                               | initial Drizzle migration                                               |

The `501` response is a declared contract seam. It is what an untouched starter
answers, not production behavior, and not an error to silence — `test/learner.test.ts`
requires a `201` from that same endpoint once you have implemented it. The
infrastructure suite deliberately does **not** pin either status, so completing the
milestone keeps `verify:baseline` green.

## What you may edit

```text
apps/api/src/**              your API implementation
apps/web/src/**              your web implementation
packages/contracts/src/**    extend wire schemas as the milestone requires
packages/database/src/**     schema, migrations, and adapters
evidence/**                  your own evidence records
```

You may **add** cases to `apps/api/test/learner.test.ts` and `apps/web/test/learner.test.tsx`.

The infrastructure tests are yours to maintain as the architecture moves. They assert scaffolding,
not unfinished behavior, so implementing enrollment does not turn them red — but two of them do
need updating when you move the workshop list onto PostgreSQL or add a required environment
variable, as described above. Updating one because your architecture changed is normal work.
Updating one to hide a defect in your code is not. See `AGENTS.md`.

## What you must not defeat

```text
apps/api/test/learner.test.ts        the API enrollment contract
apps/web/test/learner.test.tsx       the web enrollment contract
apps/*/package.json                  the test:learner script each suite is reached through
scripts/verify-learner.mjs           the learner-contract runner
package.json                         the verify:baseline / test:learner / verify contract
pnpm-workspace.yaml                  the projects the learner suites are found in
.github/workflows/verify.yml          the baseline and learner-contract jobs and their triggers
packages/contracts/test/dependency-policy.ts   the dependency-boundary implementation
.roadmap/                            generated provenance for this template
```

Do not weaken the existing learner assertions to obtain a green run, and do not reach the same
result indirectly — by pointing the `learner-contract` job at `pnpm verify:baseline`, by narrowing
its triggers, by rewriting `verify` to stop at the baseline, or by renaming a package so its suite
can no longer be found. The commands exist to tell you the truth about your code.

## Continuous integration

`.github/workflows/verify.yml` runs read-only, with `contents: read` and no credential
persistence.

- **baseline** runs on every event, including your first push, and runs `pnpm verify:baseline`.
  Your initial push is therefore green.
- **learner-contract** runs on pull requests and manual dispatch only, and runs `pnpm verify`. It
  stays red until you implement enrollment, which is exactly what it is for.

## Environment

Copy `.env.example` and fill in local values. `.env` is never committed and never published.

```bash
cp .env.example .env
```

`.env.example` contains placeholders only. It must never hold a real credential.

## Evidence workflow

1. Implement a milestone increment and run the declared commands.
2. Record what you actually ran and what actually happened in `evidence/`.
3. Reference the exact commit and the CI run for that commit.

`evidence/manifest.example.json` shows the required shape using unmistakable placeholder values.
It is an example, not evidence: copy it to `evidence/manifest.json` and replace every
`replace-me` value with something real. See `evidence/README.md`.

`implemented` means you wrote the code. `verified` means you ran the declared checks, read their
real output, and they passed. Never report the first as the second.

## Versions

| Item                  | Version                       |
| --------------------- | ----------------------------- |
| Template              | {{TEMPLATE_VERSION}}          |
| Curriculum release    | {{CURRICULUM_VERSION}}        |
| Milestone entry point | `project-workshop-enrollment` |

## What this starter does not claim

- It does **not** claim you are ready for a Junior Fullstack role.
- It does **not** claim you are job ready.
- It does **not** claim the Release 1 curriculum is complete or stable.
- It does **not** claim that passing `pnpm verify` alone demonstrates production competence.

Completing this milestone demonstrates one bounded, reviewable vertical slice. That is a real
result, and it is the only result being claimed.

## Ghi chú cho người học (Vietnamese learning pointers)

Toàn bộ tài liệu và mã nguồn trong kho này dùng tiếng Anh, vì đó là ngôn ngữ bạn sẽ đọc trong tài
liệu kỹ thuật thực tế. Một vài điểm cần nhớ:

- `pnpm verify:baseline` phải chạy đúng ngay từ đầu. Nếu nó hỏng, đó là lỗi của starter.
- `pnpm verify:baseline` không kiểm tra phần enrollment còn thiếu, nên khi bạn hoàn thành enrollment
  nó vẫn xanh. Riêng hai bài kiểm tra trong `apps/api/test/infrastructure.test.ts` (mã trạng thái
  `200` của `GET /api/workshops`, và danh sách biến môi trường của `loadConfig`) sẽ cần bạn cập nhật
  khi chuyển sang PostgreSQL hoặc khi thêm biến môi trường bắt buộc. Việc cập nhật đó là hợp lệ.
- `pnpm verify` sẽ **thất bại** cho đến khi bạn hoàn thành phần enrollment. Đó là điều bình thường.
- Hai mã `LEARNER_API_ENROLLMENT_001` và `LEARNER_WEB_ENROLLMENT_001` là phần việc của bạn.
  Các mã `LEARNER_RUNNER_001`, `LEARNER_RUNNER_002` hoặc `LEARNER_RUNNER_003` nghĩa là môi trường
  chạy sai, không phải bài học.
- Không được xóa hoặc làm yếu các bài kiểm tra learner, `scripts/verify-learner.mjs`,
  `package.json`, `pnpm-workspace.yaml`, hay `.github/workflows/verify.yml` để có kết quả xanh. Các
  bài kiểm tra infrastructure thì được phép cập nhật khi kiến trúc thay đổi — xem `AGENTS.md`.
- Kho này là bản xem trước kỹ thuật. Hoàn thành nó không có nghĩa là bạn đã sẵn sàng đi làm.
