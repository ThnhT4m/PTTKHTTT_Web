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

Gửi JWT qua `Authorization: Bearer <token>`. Server kiểm tra tài khoản còn hoạt động và phiên bản token trên mỗi request cần đăng nhập. Logout làm token cũ hết hiệu lực. Không gửi role/is_active trong request đăng ký; role ban đầu là CUSTOMER. Mật khẩu ít nhất 8 ký tự và tối đa 72 byte UTF-8 cho cả đăng ký/đăng nhập; ký tự tiếng Việt/emoji có thể dùng nhiều byte. Không trim mật khẩu và không chấp nhận phần đuôi bị bcrypt cắt ngầm.

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

## 2. Danh mục và sinh lịch — M2, M3

| Method | Endpoint | Quyền / ghi chú |
|---|---|---|
| GET | `/venues` | Danh sách; bộ lọc bên dưới |
| GET | `/venues/:id` | Chi tiết cơ sở và sân; khách chỉ thấy sân ACTIVE |
| GET | `/venues/:id/courts` | Lọc sân theo môn, min_price, max_price; có phân trang |
| GET | `/courts/:id` | Chi tiết sân |
| GET | `/courts/:id/slots?date=YYYY-MM-DD` | Lịch theo ngày, bao gồm deadline HELD |
| POST | `/venues` | Manager/Admin; manager sở hữu cơ sở tạo mới |
| PATCH | `/venues/:id` | Manager của cơ sở/Admin; sửa metadata |
| POST | `/venues/:id/courts` | Manager của cơ sở/Admin |
| PATCH | `/courts/:id` | Manager của cơ sở/Admin; sửa metadata |

`GET /venues` hỗ trợ `q`, `district`, `sport_type`, `min_price`, `max_price`, `mine=true`, `limit`, `offset`. `mine=true` dùng để lấy cơ sở của manager đã đăng nhập. Sport type: `FOOTBALL`, `BADMINTON`, `TENNIS`, `PICKLEBALL`, `BASKETBALL`.

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

`payment_hold_minutes` phải là integer 1–10. Mọi PATCH dùng phiên bản phải gửi version mới nhất; gửi phiên bản cũ trả 409 và không ghi đè. Trường `status` trong PATCH thông tin bị từ chối; sử dụng API `/status` riêng cho manager đúng cơ sở hoặc ADMIN.

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

Theo PDF mới đã xác nhận ngày 23/11/2026, bổ sung các API sau. Tất cả yêu cầu JWT của manager đúng cơ sở hoặc ADMIN:

| Method | Endpoint | Body / kết quả |
|---|---|---|
| POST | `/venues/:id/generate-slots` | `{start_date?,days?,court_ids?}`; sinh ca 60 phút 06:00–22:00 |
| PATCH | `/slots/:id` | `{expected_version,price}`; chỉnh giá ca chưa bắt đầu, AVAILABLE/UNAVAILABLE, không có booking hiệu lực |
| PATCH | `/venues/:id/status` | `{expected_version,status,reason}`; ACTIVE/INACTIVE/MAINTENANCE |
| PATCH | `/courts/:id/status` | Cùng body và trạng thái venue |
| PATCH | `/slots/:id/status` | `{expected_version,status,reason}`; AVAILABLE/UNAVAILABLE |
| DELETE | `/venues/:id` | `{expected_version,reason}`; xóa mềm về INACTIVE |
| DELETE | `/courts/:id` | Cùng body; xóa mềm về INACTIVE |

Sinh lịch mặc định từ ngày Việt Nam hiện tại, 30 ngày. `days` integer 1–30; `start_date` đúng định dạng YYYY-MM-DD, không trước hôm nay; ngày cuối không quá hôm nay + 30 ngày. Ví dụ không gửi start_date để chạy được vào ngày demo:

```json
{ "days": 30, "court_ids": ["55555555-5555-4555-8555-555555555551"] }
```

`court_ids` tùy chọn, không trùng, tối đa 100 sân, mọi ID phải thuộc cơ sở. Bỏ qua sân INACTIVE/MAINTENANCE; không có sân ACTIVE trả 409. Venue phải ACTIVE. Body `{}` mở cho mọi sân ACTIVE của cơ sở. Kết quả `data`: `{venue_id,start_date,end_date,court_count,created,skipped}`. Gọi lặp hoặc đồng thời không tạo trùng và không ghi đè giá/trạng thái/held_until/booking cũ. Chỉ sinh lịch khi được gọi, không có cron kéo dài lịch.

Đổi `courts.hourly_price` chỉ áp dụng cho ca sinh mới; ca đã tồn tại chỉnh giá qua PATCH slot. Giá booking/payment chốt theo slot lúc tạo đơn. DELETE giữ toàn bộ bản ghi, slot, booking và lịch sử; cùng điều kiện không có đơn PENDING/CONFIRMED chưa kết thúc như thay trạng thái. Gửi version cũ trả 409. Không chỉnh tùy ý ngày/giờ của ca.

## 3. Booking — M4, M7, M8

| Method | Endpoint | Actor / body |
|---|---|---|
| GET | `/bookings` | Customer: đơn của mình; manager: đơn trong cơ sở mình; admin: toàn bộ |
| GET | `/bookings/:id` | Cùng nguyên tắc phạm vi |
| GET | `/bookings/:id/history` | `{booking,payments,reschedules,refund,review}`; cùng phạm vi |
| POST | `/bookings/online` | Customer; `{time_slot_id}` |
| POST | `/bookings/walk-in` | Manager của cơ sở/Admin; `{time_slot_id,customer_name,customer_phone?,method}` |
| POST | `/bookings/:id/complete` | Manager của cơ sở/Admin; `{}` |
| POST | `/bookings/:id/extend` | Manager của cơ sở/Admin; `{method}` |

`GET /bookings` nhận `limit`, `offset`, `status`, `source`, `venue_id`, `court_id`, `date`, `has_issue=true/false`, `refund_status`. Mọi bộ lọc được AND với phạm vi role; gửi venue_id ngoài phạm vi không mở thêm quyền.

Chỉ booking PENDING còn chiếm slot HELD mới trả held_until; đơn EXPIRED/CONFIRMED/COMPLETED/CANCELLED_BY_VENUE trả null, kể cả khi slot cũ đang được khách khác giữ.

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

Confirm hợp lệ trước hạn cập nhật PAID → CONFIRMED → BOOKED trong một transaction. Deadline được kiểm tra lại bằng clock_timestamp() tại chính UPDATE chuyển slot sang BOOKED; nếu hết hạn trong lúc xử lý thì toàn bộ payment, booking và các attempt khác rollback, trả 409 HOLD_EXPIRED. Gọi lại cùng transaction code đã PAID trả thành công và không tạo payment thứ hai. Có thể có nhiều payment attempt nhưng chỉ một PAID payment/booking. Khi một attempt thành công, các attempt PENDING khác cùng booking chuyển FAILED trong cùng transaction.

Job 30 giây/lần chuyển PENDING sang EXPIRED và nhả HELD quá hạn về AVAILABLE trong transaction. API thanh toán kiểm tra deadline ngay khi confirm; không chấp nhận thanh toán muộn chỉ vì cron chưa chạy.

Đây không phải callback production. Cần cổng thanh toán thật, xác minh chữ ký, đối soát, chính sách retry và quản lý bí mật trước khi triển khai tiền thật.

## 5. Dời sân, sự cố và hoàn tiền — M9, M10

| Method | Endpoint | Body / actor |
|---|---|---|
| POST | `/bookings/:id/reschedule` | Chủ đơn hoặc manager đúng cơ sở/admin; body bên dưới |
| POST | `/bookings/:id/venue-issue` | Manager đúng cơ sở/admin; `{reason,action}` |
| POST | `/bookings/:id/refund-request` | Chủ đơn đã được báo sự cố; `{}` |
| PATCH | `/refunds/:id/status` | Manager đúng cơ sở/admin; `{status}` |
| GET | `/refunds` | Chủ đơn/manager đúng cơ sở/admin; `status`, `booking_id`, `venue_id`, `limit`, `offset` |
| GET | `/refunds/:id` | Cùng phạm vi; ngoài quyền trả 403 |

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

Chỉ chấp nhận COMPLETED từ PROCESSING. Trong cùng transaction: refund COMPLETED, payment REFUNDED, booking CANCELLED_BY_VENUE, slot UNAVAILABLE. Cấm nhảy cóc/quay lui. Gọi lại xác nhận COMPLETED khi đã COMPLETED trả thành công để an toàn khi retry. Tối đa một refund/booking. Gửi lại refund-request trả chính refund đó, kể cả khi hoàn tất; xác nhận hoàn tất đồng thời chỉ ghi một sự kiện REFUND_COMPLETED. Không có API customer tự hủy đơn và đòi hoàn tiền khi chưa có sự cố.

## 6. Review — M11

`POST /bookings/:id/reviews`, CUSTOMER là chủ đơn:

```json
{ "rating": 5, "comment": "Sân sạch, nhân viên hỗ trợ nhanh." }
```

Chỉ khi booking COMPLETED, rating integer 1–5, tối đa một review/booking. Manager xác nhận complete trước khi khách có thể đánh giá.

## 7. Admin — M12 và trạng thái có kiểm soát

| Method | Endpoint | Body / kết quả |
|---|---|---|
| GET | `/admin/overview` | Số cơ sở, booking, doanh thu |
| GET | `/admin/users` | Tài khoản, không trả password hash |
| PATCH | `/admin/users/:id/status` | `{is_active?,role?}`; role chỉ CUSTOMER hoặc VENUE_MANAGER |
| GET | `/admin/audit-logs` | Nhật ký actor, thao tác, trước/sau, lý do |
| PATCH | `/admin/venues/:id/status` | `{status,expected_version,reason}` |
| PATCH | `/admin/courts/:id/status` | `{status,expected_version,reason}` |
| PATCH | `/admin/slots/:id/status` | `{status,expected_version,reason}` |

API user không tạo/cấp ADMIN hoặc hạ quyền ADMIN; không cho tự khóa tài khoản quản trị đang dùng, và không hạ manager còn sở hữu venue xuống CUSTOMER. GET users/audit hỗ trợ phân trang. Users lọc `q`, `role`, `is_active=true/false`; audit lọc `actor_id`, `entity_id`, `action`.

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


## 8. Phân trang và lỗi HTTP

Các danh sách venues, venue courts, bookings, refunds, users và audit giữ `data` là array để tương thích client hiện có. `limit` integer 1–300 (mặc định 100), `offset` integer 0–1000000 (mặc định 0). Lấy trang tiếp bằng offset + limit; không có total-count field. Thứ tự có ID làm khóa phụ để ổn định khi timestamp/tên bằng nhau. Các API list kiểm tra query theo whitelist; giá min phải <= max.

JSON hỏng trả HTTP 400 `INVALID_JSON`; body quá 64 KB trả 413 `PAYLOAD_TOO_LARGE`; đều giữ envelope `success:false`, `error`, `server_time`. Validation M3 trả 400 `VALIDATION_ERROR`/`INVALID_SCHEDULE_RANGE`/`INVALID_COURTS`; không hoạt động hoặc xung đột trả 409. `SLOT_PRICE_LOCKED` chặn sửa giá ca đang được giữ/đặt/đã bắt đầu.

Frontend không được sửa trong lần phát triển backend này. Các API mới được mô tả ở đây và có request mẫu trong Postman collection.
