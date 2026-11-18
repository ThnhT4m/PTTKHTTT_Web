# Kế hoạch phát triển 4 tuần

Kế hoạch chuyển nội dung PDF thành đầu việc có thể giao cho 3 người, cập nhật theo ảnh: bỏ sinh lịch tự động, bảo vệ trạng thái bằng ADMIN và audit, xử lý xung đột sửa thông tin/trạng thái. Base hiện là điểm bắt đầu tích hợp; bảng này dùng để theo dõi hoàn thiện, không tự khẳng định mọi tiêu chí đã nghiệm thu.

## 1. Phân quyền sở hữu mã nguồn

| Người | Thư mục chính | Trách nhiệm |
|---|---|---|
| TV1 — Backend Core | `server/src/db`, `config`, `lib`, `middlewares`; modules `auth`, `venues`, `timeslots`, `reviews`, `admin`; Docker/Knex | Schema, migration/seed, RBAC/ownership, metadata/version, status ADMIN/audit, API danh mục và quản trị |
| TV2 — Booking Engine | modules `bookings`, `payments`, `aftersales`; `jobs` | Transaction giữ chỗ, thanh toán idempotent, cron, POS, complete/extend, dời/hoàn |
| TV3 — Frontend | Toàn bộ `client` | 3 layout, 9 nhóm màn hình, API client, state, form, countdown và xử lý lỗi |
| Cả nhóm | `docs`, contract, test tích hợp | Chốt JSON và trạng thái, nghiệm thu, cập nhật báo cáo |

TV1 sở hữu helper khóa/audit dùng chung; TV2 sử dụng, không viết một quy tắc khóa khác trong module riêng. Thay đổi contract phải được cập nhật trước khi merge để TV3 không dựa vào response cũ.

## 2. Tuần 1 — nền tảng và hợp đồng

| TV1 | TV2 | TV3 |
|---|---|---|
| Docker PostgreSQL 16, cấu hình Knex; migration 10 bảng; seed đủ 3 role, 2 manager, 3 cơ sở; ERD/DBML | Review FK/CHECK/partial index; thống nhất giá snapshot, transaction boundary và thứ tự khóa; chốt JSON booking/payment/refund | Vite + Router, CSS token/BEM, Customer/Manager/Admin layout; trang login/register và danh sách cơ sở |
| Auth JWT/bcrypt, user active/token_version; requireAuth/requireRole/ownership | Tạo khung booking/payment/aftersales theo Controller → Service → Query | API client dùng envelope, trạng thái loading/error/empty; guard route theo role |
| Version optimistic locking + helper audit; thống nhất admin-only status | Định nghĩa lỗi conflict và retry; thống nhất held_until/server_time | Shared StatusBadge, SlotBadge, Modal, CountdownTimer |

Điểm chốt cuối tuần: chạy fresh clone bằng README; frontend gọi được login và danh mục thật; có API contract, nguồn ERD; manager1 không thể thao tác cơ sở manager2.

## 3. Tuần 2 — timetable cố định, đặt online và thanh toán

| TV1 | TV2 | TV3 |
|---|---|---|
| CRUD metadata venue/court; validation hold 1–10, lead >=10; PATCH với expected_version | Online atomic hold và 409 khi slot đã chiếm; held_until theo cấu hình cơ sở | Danh sách/lọc/chi tiết venue/court; lịch theo ngày và chú giải 4 trạng thái |
| GET slot theo ngày; không triển khai generate-slots; kiểm tra timetable cố định và chống overlap DB | Payment attempts, sandbox confirm idempotent; deadline kiểm tra ở server; cron nhả hold 30 giây/lần | Checkout nhận deadline từ server; khóa nút khi hết hạn; xử lý confirm success/conflict/expired |
| ADMIN status venue/court/slot có reason, version, audit và kiểm tra đơn liên quan | Kiểm thử đồng thời booking–booking, payment–expiry và booking–status | Manager metadata form không có field status; xử lý 409 bằng tải lại dữ liệu |

Điểm chốt cuối tuần: TC-01 → TC-04 chạy trên PostgreSQL thật. Hai cửa sổ khách cùng đặt chỉ một bên thành công. Cấu hình hold 5 phút trả đúng deadline, 15 phút bị từ chối.

## 4. Tuần 3 — tại quầy, hậu mãi và đánh giá

| TV1 | TV2 | TV3 |
|---|---|---|
| Review đúng chủ đơn COMPLETED, unique/rating; admin overview/users/audit | Walk-in bán ca đang chạy; complete idempotent sau end_at; extension ca liền kề | My bookings, POS và nút complete theo thời gian; form review |
| Review quyền manager theo mọi loại tài nguyên; lọc audit không lộ bí mật | Dời lịch cùng cơ sở/môn/giá, phân biệt slot cũ AVAILABLE/UNAVAILABLE; record lịch sử | Manager venues và requests; không có nút sinh lịch hoặc tự sửa trạng thái |
| Hoàn thiện index/constraint và audit coverage | Báo sự cố; refund-request; duyệt → tự PROCESSING → COMPLETED trong transaction | Hiển thị đủ nhãn refund, lựa chọn dời/hoàn chỉ khi có sự cố; xử lý lỗi rollback/conflict |

Điểm chốt cuối tuần: TC-05 → TC-09; không có đơn hoàn thành sớm, không tự refund khi chưa có sự cố, không gia hạn vào ca đã giữ/đặt/khóa.

## 5. Tuần 4 — tích hợp, nghiệm thu và báo cáo

| TV1 | TV2 | TV3 |
|---|---|---|
| TC-10 xuyên suốt endpoints; security review; kiểm tra version/audit rollback | Stress/race nhỏ có chủ đích, idempotency, refund order, rollback; xử lý lỗi mới phát hiện | Hoàn thiện 9 nhóm màn hình, responsive, keyboard/form feedback, thông báo 401/403/409 |
| Xuất ERD và thống kê khớp schema; kiểm tra seed/reset fresh | Thu bằng chứng DB trước/sau giao dịch và log kết quả | Demo trên 2 trình duyệt, chụp các bước, kiểm tra countdown không lệch khi reload |
| Cùng nhóm hoàn thiện README/API/limitations/báo cáo | Cùng nhóm chạy lại toàn bộ acceptance sau thay đổi | Cùng nhóm diễn tập demo và ghi vấn đề còn mở |

Điểm chốt cuối tuần: có bảng kết quả từng TC gồm ngày chạy, môi trường, dữ liệu test, kết quả, bằng chứng và người thực hiện. Mọi lỗi chưa xử lý được phải ghi rõ ảnh hưởng; không dùng “build pass” thay cho test race condition.

## 6. Checklist bàn giao giữa các thành viên

- TV1 → TV2: migration đã chạy, seed ID mẫu, helper khóa/audit, auth req.user và ownership đã chốt.
- TV2 → TV3: response success/error, trường dữ liệu list/detail, deadline và trạng thái; ví dụ confirmed/completed/expired/issue/refund.
- TV3 → backend: JSON gửi thực tế, cách xử lý 409, thao tác nào refresh data; không tự dựng status hợp lệ từ UI.
- Khi đổi field/status: sửa CONTRACT/API trước, cập nhật migration nếu cần, cập nhật client và acceptance trong cùng thay đổi.
- Không chỉnh trực tiếp DB production để qua demo; test thời gian bằng fixture kiểm thử riêng có kiểm soát.

## 7. Những việc cần chốt sau base

1. Quy trình nạp timetable cố định ngoài lịch seed; ảnh yêu cầu bỏ sinh lịch nên không tự thêm lại endpoint cũ.
2. Cổng thanh toán thật và chính sách hoàn tiền/đối soát, retry, notification.
3. Chính sách dời khác giá hoặc khác cơ sở, phí và phân bổ doanh thu.
4. Phân trang, tìm kiếm, lưu ảnh, vận hành bảo mật, backup và triển khai.
