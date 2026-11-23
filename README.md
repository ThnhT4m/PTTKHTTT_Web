# SportBooking — hệ thống đặt sân đa cơ sở

Monorepo cho dự án nhóm 3 người. Backend cập nhật theo PDF phân công mới ngày 23/11/2026: bổ sung sinh lịch và quyền quản lý cơ sở/sân/slot. Thay đổi lần này chỉ thuộc backend và tài liệu; frontend hiện có chưa được cập nhật theo các API mới. Backend Node.js + Express + PostgreSQL/Knex; frontend React + Vite + React Router, CSS thuần theo BEM. Đây là mã nguồn để phát triển và demo tại máy, chưa phải bản triển khai production.

## Những điểm đã chốt từ tài liệu

| Nội dung | Cách áp dụng trong base |
|---|---|
| Sinh lịch M3 | `POST /api/venues/:id/generate-slots`: 06:00–22:00, ca 60 phút, tối đa 30 ngày mỗi lần, giới hạn ngày cuối không quá hôm nay + 30 ngày Việt Nam. |
| Nguồn lịch | Seed nạp dữ liệu demo. Manager/Admin chủ động sinh thêm lịch qua M3; gọi lặp không ghi đè giá, trạng thái hoặc booking đã có. |
| Sửa thông tin sân | Manager chỉ sửa thông tin các cơ sở/sân do mình quản lý. |
| Sửa trực tiếp trạng thái | Manager đúng cơ sở hoặc ADMIN, qua endpoint `/status`, bắt buộc lý do, `expected_version`, audit và kiểm tra đơn liên quan. |
| Đổi trạng thái trong giao dịch | Hệ thống vẫn thay đổi slot khi giữ chỗ, thanh toán, hết hạn, dời sân, sự cố và hoàn tiền. |
| Xung đột cập nhật | Kiểm tra phiên bản để tránh ghi đè dữ liệu; khóa dòng PostgreSQL để bảo vệ nghiệp vụ. |
| Số bảng | 9 bảng nghiệp vụ theo PDF và bảng thứ 10 `audit_logs` để đáp ứng yêu cầu nhật ký trong ảnh. |

“Quyền cao nhất” được hiểu là role `ADMIN`. Trạng thái vận hành của venue/court được tách khỏi trạng thái giao dịch của time slot. Manager đổi trạng thái qua API riêng có kiểm soát; không gửi status trong PATCH metadata. Không được mở/khóa thủ công slot đang có booking hiệu lực.

## Chạy dự án

Cần Node.js 22+, npm và Docker có Docker Compose. Chạy các lệnh tại thư mục gốc `SportBooking`:

```bash
npm ci
cp server/.env.example server/.env
docker compose up -d --wait db
npm run db:migrate
npm run db:seed
npm run dev:server
```

Lệnh trên chỉ chạy backend. Để chạy cả ứng dụng dùng `npm run dev`.

Frontend: `http://localhost:5173`. API: `http://localhost:4000/api`. Kiểm tra cấu hình cổng và kết nối PostgreSQL trong `server/.env` nếu máy đang sử dụng các cổng này.

Trên PowerShell, thay lệnh `cp` bằng `Copy-Item server/.env.example server/.env`. Docker Compose cần hỗ trợ `--wait`; nếu dùng phiên bản cũ, chạy `docker compose up -d db` rồi đợi `docker compose ps` báo database healthy trước khi migrate. Khi đổi cổng PostgreSQL, cập nhật cả `DATABASE_URL` trong `server/.env` và `TEST_DATABASE_URL` khi chạy test. Khi đổi cổng API, sao chép `client/.env.example` thành `client/.env` và sửa `VITE_PROXY_TARGET`.

Không đưa file `.env` lên Git. Thay `JWT_SECRET` trước khi dùng ngoài môi trường local. Chỉ bật `PAYMENT_SANDBOX_ENABLED` cho demo; API xác nhận thanh toán hiện mô phỏng kết quả và không kết nối ngân hàng/cổng thanh toán.

Seed dùng cho dữ liệu phát triển. Không chạy seed trên cơ sở dữ liệu chứa dữ liệu cần giữ. Lệnh seed tạo dữ liệu phục vụ cả trường hợp hai quản lý khác cơ sở.

| Email | Mật khẩu demo | Vai trò |
|---|---|---|
| `customer@example.com` | `Demo@12345` | CUSTOMER |
| `customer2@example.com` | `Demo@12345` | CUSTOMER (kiểm thử đồng thời) |
| `manager1@example.com` | `Demo@12345` | VENUE_MANAGER |
| `manager2@example.com` | `Demo@12345` | VENUE_MANAGER |
| `admin@example.com` | `Demo@12345` | ADMIN |

## Luồng demo đề xuất

1. Customer đăng nhập, lọc cơ sở, chọn sân/ngày và giữ một ca còn trống. Server trả `held_until` và `server_time`; giao diện đếm ngược theo hai mốc này.
2. Tạo payment và xác nhận sandbox trước hạn. Payment, booking, slot cùng chuyển sang `PAID / CONFIRMED / BOOKED` trong transaction.
3. Manager tạo cơ sở/sân, sinh lịch, chỉnh giá slot chưa đặt và đổi trạng thái có lý do trong cơ sở mình; tạo walk-in, gia hạn hoặc xác nhận hoàn thành đơn đã qua giờ kết thúc. Các API mới thao tác qua Postman/backend, frontend chưa bổ sung form tương ứng.
4. Customer đánh giá đơn COMPLETED, hoặc dời đơn CONFIRMED sang ca tương thích còn trống trong cùng cơ sở.
5. Manager báo sự cố, customer yêu cầu hoàn tiền; manager duyệt rồi xác nhận đã hoàn. Audit giữ vết đủ chuỗi trạng thái.
6. Admin kiểm tra nhật ký, đổi trạng thái có lý do và thử gửi phiên bản cũ để thấy lỗi `409`.

## Cấu trúc và trách nhiệm

```text
SportBooking/
├── docker-compose.yml
├── package.json
├── docs/                         Hợp đồng API, ERD, kế hoạch và nghiệm thu
├── server/
│   ├── knexfile.js
│   ├── .env.example
│   └── src/
│       ├── config/               Cấu hình môi trường
│       ├── db/                   Migrations, seeds, Knex
│       ├── lib/                  HTTP errors, audit, quy ước khóa
│       ├── middlewares/          JWT, RBAC, quyền sở hữu
│       ├── jobs/                 Quét giữ chỗ hết hạn 30 giây/lần
│       └── modules/
│           ├── auth/             TV1: M1
│           ├── venues/           TV1: M2
│           ├── timeslots/        TV1: M3 sinh lịch/giá/status
│           ├── reviews/          TV1: M11
│           ├── admin/            TV1: M12
│           ├── bookings/         TV2: M4, M7, M8
│           ├── payments/         TV2: M5
│           └── aftersales/       TV2: M9, M10
└── client/                       TV3
    └── src/
        ├── components/
        ├── layouts/
        ├── pages/
        └── styles/
```

Mỗi module backend đi theo Controller → Service → Repository/Query. Quy tắc giao dịch thuộc service; kiểm tra quyền và validation luôn được thực thi phía server. Tên/thư mục cụ thể có thể tổ chức gọn trong base nhưng phải giữ ranh giới nghiệp vụ này khi mở rộng.

## Kiểm tra

Nghiệm thu cuối ngày 23/11/2026 lúc 16:23 Việt Nam trên Terminal máy: **45/45 test đạt (38 integration PostgreSQL + 7 unit), 0 fail, 0 skip**, cùng kiểm tra cú pháp **43 file backend**. Đã bao gồm ba test hồi quy sau đợt sửa cuối. Bằng chứng trong [docs/VERIFICATION.md](docs/VERIFICATION.md).

Trên Terminal Linux của máy đã có quyền Docker và mạng npm, có thể chạy toàn bộ kiểm chứng backend bằng một lệnh:

```bash
npm run verify:backend
```

Lệnh cài dependency workspace server, khởi động PostgreSQL, tạo database test nếu cần và chạy kiểm tra cú pháp/test; ghi kết quả vào `backend-verification.log`. Không build frontend, không reset dữ liệu phát triển. Suite sẽ reset database `_test` như mô tả bên dưới. Nếu dùng PostgreSQL ngoài Docker, đặt `TEST_DATABASE_URL` trước khi chạy.

Tạo database kiểm thử riêng một lần; bỏ qua lệnh `createdb` nếu đã có database này:

```bash
docker compose exec -T db createdb -U sportbooking sportbooking_test
npm run check:server
npm run test:unit
npm run test:integration
```

Suite mặc định dùng `postgres://sportbooking:sportbooking_dev@localhost:5432/sportbooking_test`, tự migrate/seed và reset dữ liệu trong database test. Có thể thay bằng `TEST_DATABASE_URL`; tên database bắt buộc kết thúc bằng `_test`. Không trỏ suite vào database phát triển hoặc dữ liệu cần giữ.

Chi tiết bằng chứng kiểm thử đã chạy được ghi trong báo cáo bàn giao. Danh sách tình huống và cách kiểm thử trên PostgreSQL thật: [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md). Không coi riêng việc build thành công là bằng chứng chống đặt trùng đồng thời.

## Tài liệu cho nhóm

- [Phạm vi backend theo PDF và bàn giao](docs/BACKEND_STATUS.md)
- [API và JSON mẫu](docs/API.md)
- [Kiến trúc, ERD, trạng thái và concurrency](docs/ARCHITECTURE.md)
- [ERD dạng PNG](docs/erd.png) và [nguồn DBML](docs/erd.dbml)
- [Postman collection](docs/postman_collection.json)
- [Kết quả kiểm chứng thực tế](docs/VERIFICATION.md)
- [Kế hoạch 4 tuần và chia việc](docs/IMPLEMENTATION_PLAN.md)
- [Kịch bản nghiệm thu TC-01 → TC-10 và phần bổ sung](docs/ACCEPTANCE.md)
- [Hợp đồng tích hợp của base](docs/CONTRACT.md)

## Giới hạn cần biết trước khi mở rộng

- Thanh toán là sandbox có xác thực chủ đơn. Chưa có webhook được ký, đối soát, giao dịch tiền thật hay tích hợp ngân hàng; không sử dụng API confirm này làm callback production.
- Dời sân chỉ hỗ trợ cùng cơ sở, cùng môn và cùng giá; chưa xử lý chênh lệch tiền hoặc quyết toán giữa cơ sở. Đây là giả định để khép kín nghiệp vụ chưa được PDF quy định.
- DELETE venue/court là xóa mềm (INACTIVE), yêu cầu `expected_version` và `reason`; giữ lịch sử và khóa ngoại. Manager đúng cơ sở hoặc ADMIN được thực hiện.
- Khi venue/court còn đơn PENDING/CONFIRMED chưa kết thúc, thao tác ngưng/bảo trì trực tiếp bị từ chối; cần xử lý sự cố/đơn liên quan trước.
- Đổi `courts.hourly_price` áp dụng cho slot sinh mới. Đổi giá slot tương lai chưa có đơn qua `PATCH /api/slots/:id`; slot đã tồn tại không bị ghi đè khi sinh lại. Booking luôn chốt `total_amount` khi tạo.
- Sinh lịch do manager/admin khởi tạo; không có cron tự kéo dài lịch. Khoảng ngày, sân hoạt động và quyền sở hữu đều kiểm tra ở backend.
- Danh sách cơ sở/sân, booking, refund, users và audit hỗ trợ `limit`/`offset` (1–300 bản ghi, mặc định 100). Rate limit theo nghiệp vụ ngoài auth, hoàn tiền thật, lưu ảnh, email/SMS, quan sát hệ thống và triển khai production là phần phát triển tiếp.
