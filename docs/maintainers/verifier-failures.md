# Verifier failure guide

Verifier phải fail closed khi không đọc được metadata, không chứng minh được
source/output boundary, không mở được workspace, hoặc không dọn được process
do mình sở hữu. Public diagnostic dùng stable code và không đưa raw exception,
absolute path, command line hay stack trace vào output learner.

## Stable exit triage

- `exit 0`: verification passed; giữ report và workspace làm evidence.
- `exit 1`: expected exercise, workspace, command, output hoặc cleanup failure;
  dùng stable code để phân loại, không tự xoá foreign content.
- `exit 2`: usage hoặc invocation sai; sửa command shape trước khi điều tra
  exercise.
- `exit 3`: internal boundary failure; dừng và escalate, không suy diễn rằng
  cleanup đã thành công.

## Phân loại xử lý

- `EXERCISE_LOAD_001` và `EXERCISE_SCHEMA_001`: author sửa metadata hoặc fixture
  rồi chạy lại loader.
- `EXERCISE_WORKSPACE_001`, `EXERCISE_WORKSPACE_002`, và
  `EXERCISE_OUTPUT_002`: giữ nguyên workspace, kiểm tra baseline và nội dung
  lạ; không tự động xoá dữ liệu chưa chứng minh ownership.
- `EXERCISE_COMMAND_001` và `EXERCISE_COMMAND_002`: learner xem test report,
  timeout và contract. Không suy diễn từ một exit code thành cleanup thành
  công.
- `EXERCISE_COMMAND_003`, `EXERCISE_COMMAND_004`, và
  `EXERCISE_COMMAND_005`: maintainer điều tra spawn boundary, output limit,
  process tree và ownership token bằng gate bảo vệ.
- `EXERCISE_INTERNAL_001`: giữ diagnostic opaque và ghi evidence môi trường ở
  kênh bảo trì được bảo vệ.

Nếu cleanup không chứng minh được ownership, hoặc trạng thái process/output
không rõ (uncertain cleanup), dừng thao tác phá huỷ và escalate cho maintainer.
Không nới timeout, không retry vô hạn, không xoá unknown path để ép green.

Quy trình workspace learner nằm ở
[learner workflow](../learner/exercise-workflow.md). Quy tắc viết exercise và
ownership declaration nằm ở [authoring guide](../authoring/exercises.md).
