# Learner exercise workflow

Verifier materialize workspace từ `starter/` và `tests/open/`, sau đó ghi
`.roadmap/exercise-baseline.json`. Baseline là infrastructure snapshot: nó bảo
vệ các file không được sửa và xác nhận source đã được materialize đúng. Learner
verification là bước khác, chạy command public trên workspace hiện tại.

Với closure counter, chạy verifier từ workspace learner:

```text
pnpm --config.verifyDepsBeforeRun=false verify
```

Chỉ chỉnh các path khớp `editablePaths`, trong bài này là `src/**`. Starter
được thiết kế để fail ở contract test vì `createCounter` chưa hoàn thiện; đó
là failure có chủ đích, không phải lý do để đổi protection. Workspace đã tồn
tại sẽ được reopen và byte learner không bị ghi đè. Workspace rỗng, unknown,
hoặc baseline hỏng phải được giữ nguyên và báo lỗi ổn định.

Đọc [exercise README](../../exercises/javascript/ex-js-closure-counter/README.vi.md),
sau đó dùng hint theo thứ tự tăng dần. `solution/`, `hints/`, `walkthrough/`,
`exercise.yaml`, test và metadata là nội dung author/reference; chúng bị loại
khỏi materialized learner workspace. Reference solution chỉ dùng để kiểm tra
verifier, không phải file learner cần sao chép.

Cách thiết kế metadata và path nằm trong
[authoring guide](../authoring/exercises.md). Nếu command không chạy hoặc
workspace không chứng minh được ownership, giữ nguyên content và chuyển stable
code cho maintainer theo [failure guide](../maintainers/verifier-failures.md).
