# API contract

Base URL: `http://localhost:4000/api`. JSON UTF-8. Mọi ID là UUID; tiền là số nguyên VND. Ngày/giờ của lịch sân theo `Asia/Ho_Chi_Minh`; các mốc tuyệt đối như `server_time`, `held_until`, `start_at`, `end_at` là ISO timestamp có múi giờ.

## Envelope và xác thực

Thành công:

```json
{
  "success": true,
  "data": {},
  "server_time": "2026-11-17T02:00:00.000Z"
}
```

Lỗi:

```json
{
  "success": false,
  "error": {
    "code": "EDIT_CONFLICT",
    "message": "Dữ liệu đã thay đổi, vui lòng tải lại.",
    "details": { "current": { "version": 3 } }
  },
  "server_time": "2026-11-17T02:00:00.000Z"
}
```

`details` là tùy chọn. Mã lỗi chi tiết trong ví dụ thể hiện mục đích; client xử lý chủ yếu bằng HTTP status và `error.code` thực tế server trả.

Health check: `GET /health` kiểm tra API và kết nối DB. Các route `/auth` giới hạn 100 request/15 phút theo IP trong base.

Gửi JWT qua `Authorization: Bearer <token>`. Server kiểm tra tài khoản còn hoạt động và phiên bản token trên mỗi request cần đăng nhập. Logout làm token cũ hết hiệu lực. Không gửi role/is_active trong request đăng ký; role ban đầu là CUSTOMER.

| HTTP status | Ý nghĩa |
|---|---|
| 200 / 201 | Đọc/cập nhật thành công / tạo tài nguyên |
| 400 | JSON hoặc dữ liệu không hợp lệ |
| 401 | Thiếu/sai/hết hiệu lực xác thực |
| 403 | Sai role, không phải chủ đơn/chủ cơ sở |
| 404 | Không tìm thấy tài nguyên |
| 409 | Ca đã bị chiếm, phiên bản cũ, sai trạng thái hoặc xung đột nghiệp vụ |
| 429 | Vượt giới hạn yêu cầu xác thực |

## 1. Auth — M1

| Method | Endpoint | Body / kết quả |
|---|---|---|
| POST | `/auth/register` | `{full_name,email,phone?,password}`; tạo CUSTOMER |
| POST | `/auth/login` | `{email,password}`; trả token và user |
| POST | `/auth/logout` | Cần auth; thu hồi token qua token_version |
| GET | `/auth/me` | Cần auth; thông tin người dùng hiện tại |

```json
{
  "full_name": "Nguyễn Minh Anh",
  "email": "anh@example.com",
  "phone": "0901234567",
  "password": "Demo@12345"
}
```

Ví dụ đăng nhập:

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"customer@example.com","password":"Demo@12345"}'
```

Ví dụ response đăng nhập thành công (token là giá trị minh họa):

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "11111111-1111-4111-8111-111111111111",
      "full_name": "Khách hàng Demo",
      "email": "customer@example.com",
      "role": "CUSTOMER",
      "is_active": true
    },
    "token": "<jwt>"
  },
  "server_time": "2026-11-17T02:00:00.000Z"
}
```

Object user có thể kèm phone/created_at/updated_at. Không trả `password_hash` hoặc `token_version` trong session public. Logout tăng token_version của tài khoản, thu hồi mọi phiên đang dùng cùng phiên bản, không chỉ tab hiện tại.

## 2. Danh mục và timetable — M2, M3 đã điều chỉnh

| Method | Endpoint | Quyền / ghi chú |
|---|---|---|
| GET | `/venues` | Danh sách; bộ lọc bên dưới |
| GET | `/venues/:id` | Chi tiết cơ sở và sân |
| GET | `/courts/:id` | Chi tiết sân |
| GET | `/courts/:id/slots?date=YYYY-MM-DD` | Lịch theo ngày, bao gồm deadline HELD |
| POST | `/venues` | Manager/Admin; manager sở hữu cơ sở tạo mới |
| PATCH | `/venues/:id` | Manager của cơ sở/Admin; sửa metadata |
| POST | `/venues/:id/courts` | Manager của cơ sở/Admin |
| PATCH | `/courts/:id` | Manager của cơ sở/Admin; sửa metadata |

`GET /venues` hỗ trợ `q`, `district`, `sport_type`, `min_price`, `max_price`, `mine=true`. `mine=true` dùng để lấy cơ sở của manager đã đăng nhập. Sport type: `FOOTBALL`, `BADMINTON`, `TENNIS`, `PICKLEBALL`, `BASKETBALL`.

Ví dụ tạo cơ sở:

```json
{
  "name": "Trung tâm Thể thao Bình Thạnh",
  "address": "123 Điện Biên Phủ, TP.HCM",
  "district": "Bình Thạnh",
  "description": "Có khu thay đồ và bãi xe",
  "payment_hold_minutes": 5,
  "minimum_online_booking_lead_minutes": 10
}
```

Ví dụ tạo sân:

```json
{
  "name": "Cầu lông 01",
  "sport_type": "BADMINTON",
  "hourly_price": 120000,
  "description": "Sân trong nhà"
}
```

Ví dụ sửa thông tin sân:

```json
{
  "expected_version": 1,
  "name": "Cầu lông 01 — Nhà A",
  "hourly_price": 130000,
  "description": "Có quạt và khu ghế chờ"
}
```

PATCH cơ sở nhận `expected_version` và các trường tùy chọn `name`, `address`, `district`, `description`, `payment_hold_minutes`, `minimum_online_booking_lead_minutes`. PATCH sân nhận `expected_version` và các trường metadata được cho phép. Không đổi `venue_id` để chuyển sân giữa các cơ sở.

`payment_hold_minutes` phải là integer 1–10. Mọi PATCH dùng phiên bản phải gửi version mới nhất; gửi phiên bản cũ trả 409 và không ghi đè. Trường `status` trong PATCH thông tin bị từ chối; sử dụng API admin riêng.

Ví dụ một slot trong `data`:

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "court_id": "00000000-0000-4000-8000-000000000002",
  "slot_date": "2026-11-18",
  "start_time": "18:00:00",
  "end_time": "19:00:00",
  "start_at": "2026-11-18T11:00:00.000Z",
  "end_at": "2026-11-18T12:00:00.000Z",
  "price": 120000,
  "status": "AVAILABLE",
  "held_until": null,
  "version": 1
}
```

Không có API `/generate-slots`, không có API chỉnh giờ tùy ý, không có DELETE vật lý. Nạp lịch demo bằng seed. Đổi `courts.hourly_price` chỉ đổi metadata, không tự cập nhật `time_slots.price` đã seed hoặc `total_amount` của đơn đã tạo. Sân mới chưa có slot; cần quy trình import/migration dữ liệu cố định được kiểm soát, không có endpoint sinh lịch runtime.

## 3. Booking — M4, M7, M8

| Method | Endpoint | Actor / body |
|---|---|---|
| GET | `/bookings` | Customer: đơn của mình; manager: đơn trong cơ sở mình; admin: toàn bộ |
| GET | `/bookings/:id` | Cùng nguyên tắc phạm vi |
| POST | `/bookings/online` | Customer; `{time_slot_id}` |
| POST | `/bookings/walk-in` | Manager của cơ sở/Admin; `{time_slot_id,customer_name,customer_phone?,method}` |
| POST | `/bookings/:id/complete` | Manager của cơ sở/Admin; `{}` |
| POST | `/bookings/:id/extend` | Manager của cơ sở/Admin; `{method}` |

Booking list/detail bổ sung các trường hiển thị `court_name`, `venue_name`, `start_at`, `end_at`, `court_id`, `venue_id`, `held_until`, `refund_status`, `refund_id`, `review_id`, `issue_reason` khi có.

Ví dụ giữ chỗ:

```json
{ "time_slot_id": "00000000-0000-4000-8000-000000000001" }
```

Dữ liệu phản hồi gồm booking PENDING, `held_until`; envelope có `server_time`. Frontend không lấy số phút cấu hình để tự tính lại deadline. Giữ chỗ chỉ thành công khi venue/court ACTIVE, slot AVAILABLE và còn đủ lead time trước giờ bắt đầu. Hai request đồng thời: đúng một request thành công, request còn lại 409.

Ví dụ walk-in:

```json
{
  "time_slot_id": "00000000-0000-4000-8000-000000000001",
  "customer_name": "Khách tại quầy",
  "customer_phone": "0901234567",
  "method": "CASH"
}
```

Walk-in có thể bán ca đang diễn ra nếu chưa hết giờ; chuyển thẳng CONFIRMED/BOOKED và lưu payment PAID. `customer_id` có thể null, lưu tên/số điện thoại khách tại quầy. Phương thức tại quầy: CASH hoặc BANK_TRANSFER.

Complete chỉ từ CONFIRMED và `end_at <= now`; gọi lại đơn COMPLETED trả thành công. Slot vẫn BOOKED để giữ lịch sử. Extend tạo đơn EXTENSION trỏ `parent_booking_id`, chỉ chọn đúng ca liền kề cùng sân đang AVAILABLE; không tự gom nhiều ca hoặc bỏ qua ca bị chiếm. Mỗi đơn cần xác nhận hoàn thành riêng.

## 4. Thanh toán sandbox — M5, M6

| Method | Endpoint | Body |
|---|---|---|
| POST | `/payments/create` | `{booking_id,method}` |
| POST | `/payments/confirm` | `{transaction_code}` |

Phương thức online: BANK_TRANSFER, CREDIT_CARD, E_WALLET. `transaction_code` được server tạo; không để client tự chọn mã giao dịch. Chỉ chủ booking được tạo/xác nhận payment demo; confirm yêu cầu bật `PAYMENT_SANDBOX_ENABLED`.

```json
{
  "booking_id": "00000000-0000-4000-8000-000000000003",
  "method": "BANK_TRANSFER"
}
```

```json
{ "transaction_code": "<mã được trả từ payments/create>" }
```

Confirm hợp lệ trước hạn cập nhật PAID → CONFIRMED → BOOKED trong một transaction. Gọi lại cùng transaction code đã PAID trả thành công và không tạo payment thứ hai. Có thể có nhiều payment attempt nhưng chỉ một PAID payment/booking.

Job 30 giây/lần chuyển PENDING sang EXPIRED và nhả HELD quá hạn về AVAILABLE trong transaction. API thanh toán kiểm tra deadline ngay khi confirm; không chấp nhận thanh toán muộn chỉ vì cron chưa chạy.

Đây không phải callback production. Cần cổng thanh toán thật, xác minh chữ ký, đối soát, chính sách retry và quản lý bí mật trước khi triển khai tiền thật.

## 5. Dời sân, sự cố và hoàn tiền — M9, M10

| Method | Endpoint | Body / actor |
|---|---|---|
| POST | `/bookings/:id/reschedule` | Chủ đơn hoặc manager đúng cơ sở/admin; body bên dưới |
| POST | `/bookings/:id/venue-issue` | Manager đúng cơ sở/admin; `{reason,action}` |
| POST | `/bookings/:id/refund-request` | Chủ đơn đã được báo sự cố; `{}` |
| PATCH | `/refunds/:id/status` | Manager đúng cơ sở/admin; `{status}` |

```json
{
  "new_time_slot_id": "00000000-0000-4000-8000-000000000004",
  "reason": "Đổi sang ca buổi tối",
  "is_venue_issue": false
}
```

Chỉ dời đơn CONFIRMED sang slot tương lai AVAILABLE, cùng cơ sở, cùng môn và cùng giá. Dời tự nguyện chỉ trước giờ bắt đầu ca cũ; đơn đang có yêu cầu refund không được đồng thời dời. Customer chỉ được đặt `is_venue_issue=true` khi manager/admin đã ghi nhận sự cố trên đơn. Khách chủ động dời: slot cũ AVAILABLE. Dời do sự cố: slot cũ UNAVAILABLE. Cập nhật cả hai slot, booking và lịch sử dời trong một transaction.

Báo sự cố:

```json
{ "reason": "Hệ thống đèn hỏng", "action": "REPORT" }
```

REPORT đánh dấu issue trên booking và chuyển slot sang UNAVAILABLE cùng transaction. Sau đó chủ đơn chọn dời sân hoặc gửi `/refund-request`. Manager có thể dùng `action: "REFUND"` để tạo yêu cầu hoàn tiền REQUESTED cho trường hợp được xử lý tại quầy.

```json
{ "status": "APPROVED" }
```

Khi duyệt, server lưu chuyển REQUESTED → APPROVED và sau đó tự chuyển PROCESSING trong cùng transaction, với hai audit entries. Vì vậy trạng thái hiện tại trả về có thể là PROCESSING; APPROVED vẫn được bảo toàn trong lịch sử. Không có nút/API để client tự nhảy PROCESSING.

```json
{ "status": "COMPLETED" }
```

Chỉ chấp nhận COMPLETED từ PROCESSING. Trong cùng transaction: refund COMPLETED, payment REFUNDED, booking CANCELLED_BY_VENUE, slot UNAVAILABLE. Cấm nhảy cóc/quay lui. Gọi lại xác nhận COMPLETED khi đã COMPLETED trả thành công để an toàn khi retry. Tối đa một refund/booking. Không có API customer tự hủy đơn và đòi hoàn tiền khi chưa có sự cố.

## 6. Review — M11

`POST /bookings/:id/reviews`, CUSTOMER là chủ đơn:

```json
{ "rating": 5, "comment": "Sân sạch, nhân viên hỗ trợ nhanh." }
```

Chỉ khi booking COMPLETED, rating integer 1–5, tối đa một review/booking. Manager xác nhận complete trước khi khách có thể đánh giá.

## 7. Admin — M12 và trạng thái được bảo vệ

| Method | Endpoint | Body / kết quả |
|---|---|---|
| GET | `/admin/overview` | Số cơ sở, booking, doanh thu |
| GET | `/admin/users` | Tài khoản, không trả password hash |
| PATCH | `/admin/users/:id/status` | `{is_active?,role?}`; role chỉ CUSTOMER hoặc VENUE_MANAGER |
| GET | `/admin/audit-logs` | Nhật ký actor, thao tác, trước/sau, lý do |
| PATCH | `/admin/venues/:id/status` | `{status,expected_version,reason}` |
| PATCH | `/admin/courts/:id/status` | `{status,expected_version,reason}` |
| PATCH | `/admin/slots/:id/status` | `{status,expected_version,reason}` |

API user không tạo/cấp ADMIN hoặc hạ quyền ADMIN; không cho tự khóa tài khoản quản trị đang dùng, và không hạ manager còn sở hữu venue xuống CUSTOMER. GET users tối đa 200 bản ghi, audit tối đa 100 bản ghi mới nhất; chưa có phân trang.

Venue/court: ACTIVE, INACTIVE, MAINTENANCE. Slot manual: AVAILABLE hoặc UNAVAILABLE; HELD/BOOKED do transaction nghiệp vụ tạo ra.

```json
{
  "status": "MAINTENANCE",
  "expected_version": 2,
  "reason": "Đóng sân để thay hệ thống đèn"
}
```

`reason` phải dài 5–1000 ký tự sau trim. Thay trạng thái venue/court bị từ chối nếu còn đơn PENDING/CONFIRMED chưa kết thúc. Slot đang có quyền giữ chỗ/booking không được mở lại thủ công để tạo lượt đặt trùng. Khi dùng version cũ hoặc gặp trạng thái không tương thích, API trả 409; cần tải lại dữ liệu và đánh giá lại thao tác.

Audit được ghi trong transaction cập nhật; nếu ghi audit thất bại, thay đổi cũng rollback. Các trường nhạy cảm như password/token hash không được đưa vào before/after.
