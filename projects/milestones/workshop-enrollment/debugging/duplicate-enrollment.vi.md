# Debugging Task — Duplicate Enrollment

> Người dùng đôi khi tạo hai lượt đăng ký khi nhấn nút nhiều lần trong mạng chậm.

## Triệu chứng

Khi kết nối mạng chậm, người dùng nhấn nút "Đăng ký" nhiều lần trước khi nhận phản hồi. Kết quả: hai hoặc nhiều bản ghi enrollment được tạo cho cùng một người dùng và workshop, hoặc ứng dụng hiển thị lỗi không rõ ràng.

## Yêu cầu điều tra

Learner phải truy vết sự cố qua từng tầng và báo cáo phát hiện tại mỗi điểm:

### 1. Trạng thái submit của nút

- Nút có bị vô hiệu hóa sau lần nhấn đầu tiên không?
- Trạng thái "đang gửi" có được hiển thị cho người dùng không?
- Nếu không, đây là tầng đầu tiên cần kiểm tra.

### 2. Yêu cầu trùng lặp

- Trình duyệt có gửi nhiều request HTTP giống nhau không?
- Kiểm tra Network tab hoặc log API để xác nhận số lượng request thực tế.

### 3. Quyết định idempotency của API

- API có phát hiện và xử lý yêu cầu trùng lặp không?
- Nếu hai request đến gần như đồng thời, API xử lý như thế nào?
- Ghi rõ quyết định: API nên trả 409 hay 201 cho yêu cầu thứ hai?

### 4. Ràng buộc unique

- Bảng enrollment có composite primary key hoặc unique constraint không?
- Constraint này có thực sự ngăn bản ghi trùng lặp ở tầng database không?
- Nếu có, lỗi constraint violation được xử lý như thế nào?

### 5. Transaction

- Enrollment có chạy trong transaction không?
- Capacity check và insert có atomic không?
- Race condition giữa hai request đồng thời được giải quyết ở đâu?

### 6. Ánh xạ lỗi

- Lỗi từ tầng database (constraint violation) được ánh xạ thành HTTP response gì?
- Frontend nhận được response gì và hiển thị ra sao?
- Có trường hợp nào lỗi bị nuốt (swallowed) không?

### 7. Regression test

- Viết một test tái hiện kịch bản submit trùng lặp.
- Test phải fail trước khi fix và pass sau khi fix.
- Test phải chạy được trong CI mà không cần database thực (hoặc dùng test database).

## Yêu cầu báo cáo

Báo cáo phải bao gồm:

1. **Root cause**: Tầng nào gây ra lỗi và tại sao
2. **Evidence**: Log, screenshot, hoặc test output chứng minh root cause
3. **Fix**: Thay đổi cụ thể ở tầng nào, tại sao chọn fix này thay vì các lựa chọn khác
4. **Regression test**: Test mới và cách chạy
5. **Phòng ngừa**: Làm sao để lỗi tương tự không xuất hiện ở tính năng khác
