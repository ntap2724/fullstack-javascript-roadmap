# Change Request — Multiple Workshop Sessions

> Mỗi workshop có thể có nhiều session với lịch và sức chứa riêng; enrollment chuyển từ workshop sang session.

## Mô tả thay đổi

Hiện tại, mỗi workshop là một sự kiện duy nhất với một thời điểm bắt đầu và một sức chứa. Yêu cầu thay đổi: mỗi workshop có thể có nhiều session, mỗi session có lịch riêng và sức chứa riêng. Người dùng đăng ký vào session cụ thể thay vì workshop chung.

## Yêu cầu phân tích tác động

Learner phải phân tích tác động của thay đổi này trên toàn bộ stack. KHÔNG viết code triển khai — chỉ phân tích và đề xuất.

### 1. Data model

- Bảng nào cần thay đổi? Bảng nào cần thêm?
- Mối quan hệ giữa workshop, session, và enrollment thay đổi như thế nào?
- Ràng buộc unique hiện tại có còn đúng không? Cần thay đổi gì?
- Capacity check chuyển từ workshop sang session ảnh hưởng gì đến query?

### 2. Migration

- Migration nào cần viết? Thứ tự thực hiện?
- Dữ liệu hiện tại được migrate như thế nào?
- Có cần migration ngược (rollback) không?

### 3. API

- Endpoint nào thay đổi? Endpoint nào thêm mới?
- Request/response schema nào cần cập nhật?
- Authorization có thay đổi không? Admin quản lý session như thế nào?

### 4. Query keys và caching

- Query key hiện tại có còn đúng không?
- Cache invalidation thay đổi như thế nào?
- Workshop list có cần hiển thị session count không?

### 5. UI routes

- Route nào thay đổi? Route nào thêm mới?
- Workshop detail page hiển thị session list như thế nào?
- Enrollment flow thay đổi ra sao (chọn workshop → chọn session)?

### 6. Authorization

- Admin tạo session cho workshop — authorization check ở đâu?
- Learner hủy enrollment của session — ownership check thay đổi không?
- Có role mới cần thêm không?

### 7. Tests

- Test nào cần cập nhật?
- Test mới nào cần viết cho session-specific behavior?
- Concurrent enrollment vào session có cần test riêng không?

## Yêu cầu báo cáo

Báo cáo phải bao gồm:

1. **Impact matrix**: Bảng liệt kê file/module bị ảnh hưởng và loại thay đổi
2. **Migration plan**: Thứ tự migration với lý do
3. **API contract diff**: Thay đổi request/response schema
4. **Risk assessment**: Rủi ro lớn nhất và cách giảm thiểu
5. **Sequencing**: Thứ tự triển khai đề xuất (backend trước hay frontend trước?)
