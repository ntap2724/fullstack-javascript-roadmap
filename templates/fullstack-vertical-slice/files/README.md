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

`pnpm verify:baseline` stays green throughout. It asserts scaffolding — construction, routing,
headers, wire schemas, package boundaries, configuration parsing — and never the unfinished
behavior itself, so implementing the milestone turns `pnpm verify` green without turning the
baseline red.

The failure you should see names two stable diagnostic codes:

```text
LEARNER_API_ENROLLMENT_001   the API enrollment endpoint still answers 501
LEARNER_WEB_ENROLLMENT_001   the web Enroll workflow does not exist yet
```

Both appear on every run, because `pnpm test:learner` runs the API suite and the web suite even
when the API suite fails first. If you instead see `LEARNER_RUNNER_001` or `LEARNER_RUNNER_002`,
the runner itself could not execute — that is a setup problem, not the expected learner failure.

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

The infrastructure tests are yours to maintain as the architecture moves — they
assert scaffolding, not unfinished behavior, so implementing the milestone should
not turn them red. Updating one because it no longer describes your architecture is
normal work. Updating one because it went red is not. See `AGENTS.md`.

## What you must not defeat

```text
apps/api/test/learner.test.ts     the API enrollment contract
apps/web/test/learner.test.tsx    the web enrollment contract
scripts/verify-learner.mjs        the learner-contract runner
package.json                      the verify:baseline / test:learner / verify contract
.github/workflows/verify.yml      the baseline and learner-contract jobs
.roadmap/                         generated provenance for this template
```

Do not weaken the existing learner assertions to obtain a green run, and do not
reach the same result indirectly — by pointing the `learner-contract` job at
`pnpm verify:baseline`, by narrowing its trigger, or by rewriting `verify` to stop
at the baseline. The commands exist to tell you the truth about your code.

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
- `pnpm verify:baseline` cũng phải luôn xanh về sau: nó chỉ kiểm tra phần khung (scaffolding), nên
  khi bạn hoàn thành enrollment nó vẫn xanh.
- `pnpm verify` sẽ **thất bại** cho đến khi bạn hoàn thành phần enrollment. Đó là điều bình thường.
- Hai mã `LEARNER_API_ENROLLMENT_001` và `LEARNER_WEB_ENROLLMENT_001` là phần việc của bạn.
  Mã `LEARNER_RUNNER_001` hoặc `LEARNER_RUNNER_002` nghĩa là môi trường chạy sai, không phải bài học.
- Không được xóa hoặc làm yếu các bài kiểm tra learner, `scripts/verify-learner.mjs`,
  `package.json`, hay `.github/workflows/verify.yml` để có kết quả xanh. Các bài kiểm tra
  infrastructure thì được phép cập nhật khi kiến trúc thay đổi — xem `AGENTS.md`.
- Kho này là bản xem trước kỹ thuật. Hoàn thành nó không có nghĩa là bạn đã sẵn sàng đi làm.
