# Bàn giao backend theo PDF mới — 23/11/2026

Nguồn yêu cầu: “BẢNG PHÂN CÔNG CHI TIẾT DỰ ÁN - HỆ THỐNG ĐẶT SÂN THỂ THAO (MULTI-VENUE)(1).pdf”. Đã xác nhận áp dụng PDF mới: bổ sung sinh lịch 30 ngày và quyền quản lý, thay cho quy ước cũ trong source. Phạm vi code chỉ server; client không sửa.

| Module | Backend hiện có và bổ sung |
|---|---|
| M1 — Auth/RBAC | Đăng ký CUSTOMER, login/logout/me; mật khẩu tối đa 72 byte UTF-8 để không bị bcrypt cắt ngầm; JWT và token_version; khóa/đổi quyền thu hồi phiên; ownership theo venue. |
| M2 — Venue/Court | Tạo/đọc/sửa, lọc sân/cơ sở; xóa mềm INACTIVE; manager đúng cơ sở/admin đổi status có reason/version/audit; khách không thấy sân ngưng phục vụ. |
| M3 — Slot | Sinh ca 60 phút 06–22, tối đa 30 ngày/lần và ngày cuối <= hôm nay + 30; không trùng/ghi đè khi gọi lặp hoặc đồng thời; GET lịch; PATCH giá ca tương lai chưa đặt; khóa/mở status có ownership và booking guard. |
| M4 — Online | Atomic hold, lead >=10 phút, hold 1–10 phút theo cơ sở, trả held_until/server_time; audit giữ chỗ. |
| M5 — Payment | Nhiều attempts, sandbox confirm idempotent; PAID/CONFIRMED/BOOKED atomic, recheck deadline tại UPDATE BOOKED và rollback nếu quá hạn; đóng attempts còn lại thành FAILED. |
| M6 — Expiration | Cron mỗi 30 giây, khóa/recheck deadline; EXPIRED/AVAILABLE, failed payments và audit cùng transaction. |
| M7 — Walk-in/Complete | Walk-in cho ca đang chạy chưa hết giờ; thu tại quầy; complete sau end_at, gọi lặp an toàn. |
| M8 — Extension | Đúng ca liền kề AVAILABLE cùng sân; đơn con EXTENSION, payment và parent_booking_id. |
| M9 — Reschedule | Khóa cả hai slot, đổi đơn/slot/lịch sử trong transaction; tự dời mở slot cũ, sự cố khóa slot cũ. |
| M10 — Refund | Báo sự cố, REQUESTED→APPROVED→PROCESSING→COMPLETED; hoàn tất atomic payment/booking/slot; refund list/detail có scope và retry yêu cầu an toàn. |
| M11 — Review | Chỉ chủ đơn COMPLETED, rating 1–5, một review/booking. |
| M12 — Admin | Users/khóa/cấp quyền manager, overview doanh thu, audit; list filters và limit/offset. |

API phục vụ hậu kiểm: GET /bookings/:id/history trả attempts, lịch sử dời, refund và review; quyền như booking detail. HTTP JSON hỏng/body quá lớn giữ envelope lỗi chuẩn.

Schema giữ 9 bảng nghiệp vụ và bảng audit thứ 10 đã có; không thay migration ban đầu, không reset dữ liệu hiện có khi cập nhật code. M3 chạy trên schema hiện tại. `npm run db:seed` chỉ dùng cho demo và sẽ reset dữ liệu, không chạy để cập nhật backend trên DB đang cần giữ.

Chi tiết request/response: API.md; contract tích hợp: CONTRACT.md; request mẫu: postman_collection.json. Backend đổi trạng thái qua `/status`, PATCH metadata vẫn từ chối trường status. DELETE là xóa mềm để giữ lịch sử.

Giới hạn: thanh toán/hoàn tiền sandbox theo yêu cầu demo, chưa nối cổng tiền thật; dời cùng cơ sở/môn/giá (PDF chưa quy định đối soát chênh lệch); frontend chưa thêm form sinh lịch/status/giá. **Đã nghiệm thu bản cuối: 45/45 test đạt (38 HTTP/PostgreSQL + 7 unit), 0 fail, 0 skip**, qua log Terminal máy lúc 16:23 ngày 23/11/2026; kiểm tra cú pháp 43 file backend đạt. Ba test hồi quy mật khẩu/deadline cũng đã pass. Xem [VERIFICATION.md](VERIFICATION.md) và [log cuối](backend-verification-2026-11-23-final.txt). Không còn lỗi test đang mở trong suite.

Để chạy kiểm chứng từ Terminal máy sau khi cấp quyền, tại thư mục gốc repo chạy `npm run verify:backend`. Lệnh kiểm tra npm/Docker, cài dependency riêng workspace server, khởi động PostgreSQL, tạo database `_test` nếu chưa tồn tại, rồi chạy cú pháp và toàn bộ test backend. Chỉ database test được migrate/seed; không reset database phát triển và không build frontend. Kết quả lưu tại `backend-verification.log` trong repo (đã được bỏ qua bởi quy tắc Git `*.log`). Có thể đặt TEST_DATABASE_URL trỏ tới PostgreSQL có sẵn để không dùng Docker.
