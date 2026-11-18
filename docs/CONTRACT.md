# Hợp đồng tích hợp base

Tài liệu nội bộ dùng chung khi dựng base; hướng dẫn đầy đủ ở README.md và docs/API.md.

## Công nghệ / quy ước

- ESM JavaScript, Node >=22; Express 4; Knex/pg; React 19 + Vite.
- API thành công: `{ success: true, data, server_time: ISO }`; lỗi `{ success: false, error: { code, message, details? }, server_time: ISO }`.
- Tiền là integer VND. UUID cho mọi id. `slot_date` YYYY-MM-DD và giờ HH:mm:ss theo Asia/Ho_Chi_Minh; lấy mốc `start_at`/`end_at` qua SQL `(slot_date + start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh'`.
- Auth: `req.user = { id, full_name, email, role, is_active, token_version }`. Role CUSTOMER / VENUE_MANAGER / ADMIN.
- Request PATCH thông tin/trạng thái dùng `expected_version` (integer >=1). Giá booking chốt `total_amount` khi tạo đơn.
- Áp dụng ảnh thay M3: không có endpoint/nút generate-slots, timetable cố định 06–22, 60 phút. Seed nạp lịch demo từ hôm qua đến 30 ngày sau; không có cron sinh lịch.
- Chỉ ADMIN đổi trạng thái trực tiếp của venue/court/slot, reason bắt buộc, audit trong cùng transaction. Manager không được gửi `status` trong PATCH thông tin.
- Booking/payment/expire/reschedule/refund vẫn chuyển trạng thái slot theo nghiệp vụ; manager được xử lý sự cố trong phạm vi cơ sở và có audit.
- Cấm đổi trạng thái bảo trì/ngưng venue/court khi còn đơn PENDING/CONFIRMED chưa kết thúc; trả 409 cần xử lý đơn trước.

## Shared server exports (TV1 cung cấp)

- `src/config/env.js`: `env = { port, nodeEnv, databaseUrl, jwtSecret, jwtExpiresIn, clientOrigin, paymentSandboxEnabled }`.
- `src/db/knex.js`: named `db` là Knex instance.
- `src/lib/http.js`: `AppError(status, code, message, details?)`, `asyncHandler(fn)`, `ok(res, data, status=200)`; `errorHandler(err, req, res, next)`.
- `src/middlewares/auth.js`: `requireAuth`, `requireRole(roles)`.
- `src/middlewares/venueOwner.js`: `assertVenueOwner(user, venue)` synchronous throws 403 unless ADMIN or matching manager; `requireVenueOwner` factory optional.
- `src/lib/audit.js`: `writeAudit(trx, { actorId, action, entityType, entityId, before, after, reason })`.
- `src/lib/locking.js`: `lockVenueCourts(trx, courtIds)` locks parent venues ordered by id first, then courts ordered by id; returns array courts enriched with `venue_status`, `manager_id`, `payment_hold_minutes`, `minimum_online_booking_lead_minutes`. `lockSlots(trx, ids)` locks slots ordered id returns enriched `start_at`, `end_at` (Date or ISO), `court_id`, date/time. `assertOperational(court)` throws 409 if venue/court not ACTIVE. All transactions lock venues -> courts -> slots ordered by UUID. Lookup booking/slot to find court id before locks; re-read and lock booking AFTER slots, confirm time_slot_id unchanged, else 409 retry.
- `src/modules/{auth,venues,timeslots,reviews,admin}/<name>.routes.js`: default Express Router.
- TV2 same default export for `bookings`, `payments`, `aftersales`. `holdExpiration.job.js`: `expireHolds()` + `startHoldExpirationJob()` returns scheduled task. Job locks each group venue/court/slot then booking, rechecks HELD deadline.

## Schema fields

- users: id, full_name, email, phone, password_hash, role, is_active, token_version, created_at, updated_at.
- sport_venues: id, manager_id, name, address, district, description, status, payment_hold_minutes, minimum_online_booking_lead_minutes, version, created_at, updated_at.
- courts: id, venue_id, name, sport_type (`FOOTBALL`, `BADMINTON`, `TENNIS`, `PICKLEBALL`, `BASKETBALL`), hourly_price, description, status, version, created_at, updated_at.
- time_slots: id, court_id, slot_date, start_time, end_time, price, status, held_until, version, created_at, updated_at. Fixed 60min full hours, exclusion overlap. Partial unique active booking per slot statuses PENDING/CONFIRMED/COMPLETED.
- bookings: id, time_slot_id, customer_id nullable for walk-in, customer_name nullable, customer_phone nullable, status, source (`ONLINE`,`WALK_IN`,`EXTENSION`), parent_booking_id nullable, total_amount, issue_reported_at nullable, issue_reason nullable, created_at, updated_at.
- payments: id, booking_id, method (`CASH`,`BANK_TRANSFER`,`CREDIT_CARD`,`E_WALLET`), transaction_code UNIQUE, status (`PENDING`,`PAID`,`FAILED`,`REFUNDED`), amount, created_at, updated_at. Partial unique one PAID payment per booking.
- booking_reschedules: id, booking_id, old_time_slot_id, new_time_slot_id, reason, is_venue_issue boolean, requested_by FK users, processed_by FK users nullable, created_at.
- refunds: id, booking_id UNIQUE, amount, status (`REQUESTED`,`APPROVED`,`PROCESSING`,`COMPLETED`), reason, requested_by, processed_by nullable, created_at, updated_at.
- reviews: id, booking_id UNIQUE, rating 1..5, comment, created_at.
- audit_logs: id, actor_id FK users nullable, action, entity_type, entity_id UUID nullable, before_data JSONB nullable, after_data JSONB nullable, reason nullable, created_at. Redact passwords/token hashes. Extra table justified by screenshot.

## API contracts

Auth: POST /auth/register `{full_name,email,phone?,password}`; POST /auth/login `{email,password}`; POST /auth/logout; GET /auth/me.
Venues: GET /venues `?q=&district=&sport_type=&min_price=&max_price=&mine=true`; GET /venues/:id; POST /venues (manager); PATCH /venues/:id `{expected_version,name?,address?,district?,description?,payment_hold_minutes?,minimum_online_booking_lead_minutes?}`; POST /venues/:id/courts; PATCH /courts/:id info same version; GET /courts/:id; GET /courts/:id/slots?date=YYYY-MM-DD returns slot array with start_at,end_at.
Admin: GET /admin/overview; GET /admin/users; PATCH /admin/users/:id/status `{is_active?,role?}`; GET /admin/audit-logs; PATCH /admin/venues/:id/status, /admin/courts/:id/status, /admin/slots/:id/status `{status,expected_version,reason}`. No DELETE routes: archive via admin status, preserve historical FKs.
Reviews: POST /bookings/:id/reviews `{rating,comment?}`.
TV2: GET /bookings (own customer or manager's venues; admin all) returns array flattened court_name,venue_name,start_at,end_at,court_id,venue_id,held_until,refund_status,refund_id,review_id,issue_reason and common booking fields. GET /bookings/:id same shape.
POST /bookings/online `{time_slot_id}` -> booking + held_until.
POST /bookings/walk-in `{time_slot_id,customer_name,customer_phone?,method}` -> booking.
POST /bookings/:id/complete `{}`; POST /bookings/:id/extend `{method}` -> new booking.
POST /payments/create `{booking_id,method}` -> payment (transaction_code generated server-side).
POST /payments/confirm `{transaction_code}` -> payment; only booking owner can use demo sandbox confirm, require PAYMENT_SANDBOX_ENABLED. Production integration intentionally absent.
POST /bookings/:id/reschedule `{new_time_slot_id,reason,is_venue_issue?:boolean}` -> booking. Same venue, sport, price only; CUSTOMER cannot claim venue issue unless reported on booking. Own confirmed booking and future target required.
POST /bookings/:id/venue-issue `{reason,action:'REPORT'|'REFUND'}` -> booking or refund. REPORT manager/admin flags issue and slot UNAVAILABLE atomically; REFUND manager/admin creates requested refund (customer request via below).
POST /bookings/:id/refund-request `{}` -> refund only booking owner and issue_reported_at exists.
PATCH /refunds/:id/status `{status:'APPROVED'|'COMPLETED'}` -> refund; on APPROVED persist APPROVED audit, then auto PROCESSING in same transaction with audit; on COMPLETED from PROCESSING atomically refund payment/cancel booking/slot UNAVAILABLE. Client shows REQUESTED->APPROVED->PROCESSING->COMPLETED via audit and labels.

All API paths relative `/api`. Base includes real core workflows; README must call out sandbox payment, seeded finite timetable, and production integrations still pending.
