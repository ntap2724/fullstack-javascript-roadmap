# Authoring exercises

Tài liệu này là checklist cho author khi thêm một exercise vào curriculum.
Nguồn canonical là `exercise.yaml`, starter, open test và reference solution;
public verifier phải chạy cùng một contract mà learner sẽ sử dụng.

## Metadata, layout và policy

Trong `exercise.yaml`, giữ `id` theo grammar của exercise, `version` là semver,
competency/prerequisite trỏ tới declaration đã tồn tại, và evidence mô tả
artifact quan sát được. Layout tối thiểu gồm `starter/`, `tests/open/`,
`hints/`, `walkthrough/` và `solution/`; chỉ starter và open test mới đi vào
workspace learner theo allowlist của materializer.

`editablePaths` phải là các pattern normalized dùng dấu `/`, không chứa `..`,
không có alias viết hoa/viết thường, và phản ánh đúng public surface (ví dụ
`src/**`). Pattern rỗng phải bị từ chối hoặc có policy `empty-policy` rõ ràng; không dùng
glob để vô tình mở toàn bộ workspace. `forbiddenDependencies` và
`forbiddenApis` chỉ được khai báo khi verifier thật sự enforce chúng; không
publish một policy mà pipeline không kiểm tra.

## Commands và curriculum references

Mỗi phần tử trong `commands` cần `id`, `required`, executable, `cwd`, timeout
và `args` tách rời. Không nội suy shell. Với tooling của Release 0, mọi `pnpm` command phải
giữ `--config.verifyDepsBeforeRun=false` trước script được gọi. Kiểm tra
starter phải thất bại vì lý do học tập dự kiến; open test chỉ assert behavior,
không assert tên biến hay cấu trúc của reference solution.

Khi thêm exercise vào lesson hoặc assessment, chỉ sửa declaration ở
`curriculum/`. Dùng curriculum loader/graph thật để xác nhận lesson
`exercises` và assessment `artifact` cùng resolve tới exercise ID; kiểm tra
explicit missing, stale và reversed reference trước khi handoff.

Ví dụ canonical là
[closure counter](../../exercises/javascript/ex-js-closure-counter/README.vi.md).
Quy trình learner nằm ở
[learner workflow](../learner/exercise-workflow.md). Stable diagnostic, cleanup
và escalation thuộc về
[maintainer failure guide](../maintainers/verifier-failures.md), không được
chữa bằng cách nới protection trong author content.
