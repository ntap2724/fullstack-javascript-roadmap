# Bộ đếm có trạng thái riêng

## Mục tiêu

Hoàn thiện `createCounter` trong tệp learner công khai `src/counter.js`. Mỗi
lần gọi factory phải tạo một counter độc lập; function được trả về tăng số
đếm lên một và trả về giá trị mới.

Ví dụ hành vi cần đạt:

```js
const first = createCounter();
const second = createCounter();

first(); // 1
first(); // 2
second(); // 1
```

Bài tập tập trung vào lexical scope và closure. Bề mặt được phép chỉnh sửa
chỉ khớp `src/**`; open test, hạ tầng và các tệp được bảo vệ nằm ngoài vùng
learner.

## Luồng baseline và learner

Verifier tạo hoặc mở lại workspace, chạy command `infrastructure` để kiểm tra
hạ tầng, rồi lưu baseline manifest. Baseline là mốc bảo vệ các tệp không được
chỉnh sửa; khi workspace đã tồn tại, verifier reopen và giữ nguyên byte learner.

Sau khi thử bài, chạy verifier công khai ở chế độ learner:

```text
pnpm --config.verifyDepsBeforeRun=false verify
```

Learner chỉ nên sửa `src/counter.js`. Không tạo dependency, lockfile hay file
generated mới trong workspace. Chạy kiểm tra hạ tầng trước nếu cần:

```text
pnpm --config.verifyDepsBeforeRun=false test:infrastructure
```

## Hướng dẫn tiến dần

Đọc `hints/01-concept.md`, rồi `hints/02-diagnostic.md`, sau đó
`hints/03-structure.md` khi cần. Walkthrough giải thích các ý tưởng sau khi
đã thử giải quyết bài tập.

## Phạm vi nội dung

`solution/`, các hint, walkthrough, metadata và test không được materialize
thành nội dung learner công khai. Reference solution chỉ là một cách kiểm tra
nội bộ; learner có thể dùng bất kỳ implementation nào thỏa contract quan sát
được.
