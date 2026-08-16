# Workshop Enrollment — Brief

## Tổng quan

Workshop Enrollment là một ứng dụng full-stack cho phép người học đăng ký tham gia các workshop. Ứng dụng minh họa các năng lực cốt lõi của Release 1: xác thực phiên, ủy quyền tài nguyên, ràng buộc quan hệ, giao dịch nguyên tử, và ánh xạ lỗi xuyên suốt stack.

## Vai trò và luồng công việc

```text
Người dùng ẩn danh (Anonymous)
├── Xem danh sách workshop đang mở
└── Tạo tài khoản hoặc đăng nhập

Người học (Learner)
├── Đăng ký khi còn chỗ
├── Hủy đăng ký của chính mình
└── Xem danh sách đăng ký của mình

Quản trị viên (Admin)
├── Tạo và cập nhật workshop
├── Đóng đăng ký
└── Xem số lượng người đăng ký
```

## Non-goals

Dự án này KHÔNG bao gồm:

- Thanh toán (Payments)
- Gửi email (Email delivery)
- Tổ chức đa thuê bao (Multi-tenant organizations)
- Hệ thống gợi ý (Recommendation systems)
- Cập nhật chỗ ngồi thời gian thực (Realtime seat updates)
- Ứng dụng mobile native (Native mobile application)

## Ràng buộc kỹ thuật

- Backend là điểm duy nhất thực thi ủy quyền
- Frontend authorization affordances KHÔNG phải là security controls
- Session cookies là `HttpOnly`, `Secure` trong production, host-only, `SameSite=Lax`
- CSRF protection là synchronizer token cho các request thay đổi trạng thái
- PostgreSQL constraints và transactions bảo vệ enrollment invariants
- Frontend checks KHÔNG bao giờ là capacity control duy nhất

## Starter

Dự án bắt đầu từ template `template-fullstack-vertical-slice` với cấu trúc:

- `apps/web` — React + Vite SPA
- `apps/api` — Express TypeScript API
- `packages/contracts` — Zod wire contracts
- `packages/database` — Drizzle schema và migrations
