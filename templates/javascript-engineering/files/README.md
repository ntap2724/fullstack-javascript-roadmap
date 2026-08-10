# JavaScript Engineering Starter

Template version {{TEMPLATE_VERSION}}, curriculum release {{CURRICULUM_VERSION}}.

This is your working repository for the JavaScript engineering baseline milestone. You own this
repository: commit to it, break it, and fix it.

## Requirements

- Node.js 24 (the exact pinned version is in `.node-version`)
- pnpm (the exact pinned version is in `package.json` under `packageManager`)

## Setup

```bash
corepack enable
pnpm install --frozen-lockfile
```

## The two verification commands

These are different on purpose, and the difference matters.

| Command                | What it runs                             | When it should pass                                      |
| ---------------------- | ---------------------------------------- | -------------------------------------------------------- |
| `pnpm verify:baseline` | syntax check, infrastructure test, build | Immediately, on a fresh clone, before you write anything |
| `pnpm verify`          | syntax check, learner test, build        | Only once you have completed the milestone               |

`pnpm verify:baseline` proves the repository itself is healthy: the toolchain resolves, the
project builds, and the scaffolding works. It must pass the moment you clone. If it fails on a
fresh clone, that is a bug in the starter, not in your work.

`pnpm verify` includes `test/learner.test.js`, which asserts behavior you have not written yet.
**It is expected to fail until you implement the milestone.** A failing `pnpm verify` on day one
is the correct starting state, not a problem to route around.

## What to edit

- `src/index.js` — your implementation. This is the file the milestone is about.
- `test/learner.test.js` — you may add cases, but do not delete or weaken the existing ones.

## What not to edit

- `test/infrastructure.test.js` — proves the scaffolding works
- `scripts/build.mjs` — the build step
- `.roadmap/` — generated provenance for this template

## Evidence

Record your verification in `evidence/`. See `evidence/README.md` for what belongs there.
Evidence is a record of what you actually ran, not a description of what you intended to run.

## Curriculum

This starter belongs to the `project-javascript-engineering-baseline` entry point of curriculum
release {{CURRICULUM_VERSION}}. Return to the curriculum for the milestone brief, the acceptance
criteria, and the competency map.

## Ghi chú cho người học (Vietnamese learning pointers)

Phần giải thích và mã nguồn trong kho này dùng tiếng Anh, vì đó là ngôn ngữ bạn sẽ đọc trong tài
liệu kỹ thuật thực tế. Một vài điểm cần nhớ:

- `pnpm verify:baseline` phải chạy đúng ngay từ đầu. Nếu nó hỏng, đó là lỗi của starter.
- `pnpm verify` sẽ **thất bại** cho đến khi bạn hoàn thành phần việc của mình. Đó là điều bình thường.
- Không được xóa hoặc làm yếu bài kiểm tra để có kết quả xanh. Hãy sửa mã nguồn, đừng sửa bài kiểm tra.
- Ghi lại bằng chứng thật trong thư mục `evidence/`: lệnh bạn đã chạy và kết quả thật sự.
