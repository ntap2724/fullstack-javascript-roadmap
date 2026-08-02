# Walkthrough: closure và private state

Khi `createCounter` chạy, JavaScript tạo một lexical environment riêng cho
lần gọi đó. Function được trả về giữ binding trong environment này bằng
closure, vì vậy mỗi instance giữ state riêng ngay cả sau khi factory kết thúc.

Nếu đặt biến đếm ở global scope hoặc ở module scope, mọi lần gọi factory sẽ
đọc và thay đổi cùng một state. Counter thứ hai khi đó không bắt đầu từ một,
và contract về tính độc lập sẽ thất bại.

Reference implementation trong `solution/` minh họa một cách làm, nhưng đó
không phải là implementation duy nhất hợp lệ. Bất kỳ code nào giữ private
state riêng cho từng instance và trả đúng giá trị theo contract đều có thể
được chấp nhận.
