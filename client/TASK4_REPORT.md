# Báo cáo nghiệm thu TASK 4 — 25/11/2026

Nhánh `tv3/frontend-complete`; Backend tham chiếu `d5f89812966dafa6cafdd2a0ac0b5d14d0436e9e`.
Checkpoint TASK 1–3: `3eff3637c7df13df8aac7d9c14955b4566f3c34f`.
Chỉ triển khai TASK 4; giữ giao diện Sân Nhà, React/Vite và CSS hiện có.

## 1. RV-01 đến RV-05

| Phát hiện | Kết quả |
|---|---|
| RV-01 | CUSTOMER tự gửi `is_venue_issue=true` khi chưa báo sự cố nhận 403. Manager/Admin được gửi yêu cầu hợp lệ. |
| RV-02 | Sự cố hiệu lực là cờ hiện có hoặc yêu cầu hợp lệ của nhân viên. `false` không mở lại ca hỏng. Dời thành công xóa cả hai trường sự cố, giữ ca cũ UNAVAILABLE khi có sự cố, ca mới BOOKED; kiểm tra trạng thái ca cũ và ghi lịch sử. |
| RV-03 | Refund mới cần đúng payment PAID và số tiền phù hợp. Retry refund đã tồn tại trả bản ghi cũ, kể cả sau khi hoàn tất, không thêm audit trùng. |
| RV-04 | Guest, CUSTOMER và manager khác cơ sở không đọc được venue/court/schedule ngừng hoạt động. Owner và ADMIN vẫn đọc được dữ liệu quản lý. |
| RV-05 | Danh mục theo name ASC, id ASC; booking/refund/user theo created_at DESC, id ASC; audit theo created_at DESC, id DESC; payment/reschedule history theo created_at ASC, id ASC. Lọc trước phân trang. |

Đối chiếu API.md, CONTRACT.md, BACKEND_STATUS.md, ACCEPTANCE.md và đọc mã Backend tại đúng commit tham chiếu qua GitHub; không tải `server/` vào workspace.

## 2. Chức năng hoàn thành

- POS `/manager/counter`: chọn cơ sở/sân/ngày, xem lịch quá khứ; phân biệt ca kết thúc/đang diễn ra/chưa bắt đầu bằng giờ server. Danh sách booking lọc và phân trang qua Backend.
- Walk-in: validate tên 2–120 ký tự sau trim, điện thoại tùy chọn tối đa 30 ký tự; chỉ CASH/BANK_TRANSFER, xác nhận đã thu tiền; cho bán ca đang diễn ra còn chưa kết thúc. Mock ghi CONFIRMED/BOOKED/PAID cùng một lần lưu.
- Gia hạn: đọc lại booking, cấu hình sân/cơ sở và lịch; chỉ ca ngay kế tiếp cùng ngày, dùng giá thực tế, không nhảy ca đã chiếm. Booking EXTENSION giữ thông tin khách và liên kết cha; chi tiết cho phép mở booking cha/con.
- Complete: modal xác nhận, chỉ CONFIRMED không sự cố đã hết giờ; retry an toàn, giữ slot BOOKED. Khách được đánh giá sau khi manager complete.
- Hậu mãi `/manager/requests`: hai khu vực booking và refund, mỗi khu vực có bộ lọc/phân trang riêng; REPORT/REFUND có lý do và modal cảnh báo tác động.
- Dời lịch: một component và một nghiệp vụ mock chung CUSTOMER/VENUE_MANAGER/ADMIN; giữ điều kiện cùng cơ sở/bộ môn/giá, đích trống trong tương lai, không đồng thời refund. Nhân viên có lựa chọn dời do sự cố.
- Refund: chi tiết, thông tin khách/cơ sở/sân/số tiền/lý do/thời gian; duyệt gửi APPROVED, hệ thống chuyển PROCESSING và ghi hai audit; hoàn tất sandbox cập nhật payment, booking, refund và slot cùng một lần lưu.
- Admin `/admin`: đúng bốn trường thống kê API; tìm/lọc/phân trang tài khoản, khóa/mở/cấp/hạ quyền có xác nhận, bảo vệ ADMIN và manager còn cơ sở; thu hồi phiên mock cũ trên mọi cập nhật quyền/trạng thái.
- Admin vận hành: toàn hệ thống, có dữ liệu inactive; dùng lại modal reason/expected_version của TASK 2 qua các endpoint `/admin/.../status`; bảo vệ HELD/BOOKED và phiên bản cũ.
- Audit: lọc actor_id/entity_id/action, phân trang, mới nhất trước, xem trước/sau và redaction đệ quy thông tin bí mật.
- Loading/empty/error/retry độc lập; hủy/bỏ response cũ qua hook chung; khóa submit khi đang ghi, không tự retry khi lỗi mạng/5xx làm kết quả chưa xác định. Nút retry trong form dùng `type=button`.

## 3. File tạo/sửa riêng TASK 4

Không di chuyển toàn bộ cấu trúc dự án; tách luồng dời lịch khỏi component khách hàng và giữ re-export tương thích.

Tạo mới:

```text
client/TASK4_REPORT.md
client/src/components/admin/Audits.jsx
client/src/components/admin/Operations.jsx
client/src/components/admin/Users.jsx
client/src/components/workflows/ActionModal.jsx
client/src/components/workflows/BookingFilters.jsx
client/src/components/workflows/BookingTable.jsx
client/src/components/workflows/CounterModals.jsx
client/src/components/workflows/IssueModal.jsx
client/src/components/workflows/RefundDetail.jsx
client/src/components/workflows/RescheduleModal.jsx
client/src/components/workflows/ResourceState.jsx
client/src/hooks/useWorkflowResource.js
client/src/mocks/admin.js
client/src/mocks/aftersales.js
client/src/mocks/counter.js
client/src/mocks/order.js
client/src/mocks/rules.js
client/src/services/admin.js
client/src/services/operations.js
client/src/styles/operations.css
client/src/utils/operations.js
client/src/utils/redact.js
client/tests/operations.browser.mjs
client/tests/operations.regression.test.js
client/tests/operations.test.js
```

Sửa:

```text
client/src/components/customer/BookingActions.jsx
client/src/components/customer/BookingDetail.jsx
client/src/components/customer/ResourceState.jsx
client/src/components/manager/OperationModal.jsx
client/src/mocks/customer.js
client/src/mocks/handler.js
client/src/mocks/store.js
client/src/pages/admin/Admin.jsx
client/src/pages/manager/Counter.jsx
client/src/pages/manager/Requests.jsx
client/tests/browser.mjs
client/tests/customer.test.js
client/tests/mock.test.js
```

## 4. Đối chiếu API

Tất cả dùng API client và store chung; API mode gửi request, chỉ đọc lại dữ liệu sau thành công, không tự dựng các chuyển trạng thái nghiệp vụ.

| API | UI / mock TASK 4 |
|---|---|
| GET `/venues?mine=true`, `/venues/:id/courts`, `/courts/:id/slots?date=...` | POS/hậu mãi đúng phạm vi manager; lịch gồm ngày quá khứ |
| GET `/bookings` | venue_id/court_id/date/status/source/has_issue theo nhu cầu, limit/offset tại API |
| POST `/bookings/walk-in` | Bán ca và ghi payment tại quầy |
| POST `/bookings/:id/extend` | Ca liền kề, body `{method}`, booking con |
| POST `/bookings/:id/complete` | Body `{}`, guard thời gian/sự cố và idempotency |
| GET `/bookings/:id`, `/bookings/:id/history` | Chi tiết, payment/reschedule/refund/review và liên kết cha/con |
| POST `/bookings/:id/venue-issue` | REPORT hoặc REFUND, lý do 5–1000 ký tự sau trim |
| POST `/bookings/:id/reschedule` | Chung ba role, xử lý RV-01/02 |
| POST `/bookings/:id/refund-request` | Giữ chức năng khách hàng, sửa RV-03 |
| GET `/refunds`, `/refunds/:id` | Lọc status/venue_id/booking_id, phân trang, chi tiết |
| PATCH `/refunds/:id/status` | Chỉ gửi APPROVED hoặc COMPLETED; không gửi PROCESSING trực tiếp |
| GET `/admin/overview` | total_venues, total_bookings, total_users, total_revenue từ PAID |
| GET `/admin/users` | q/role/is_active/limit/offset |
| PATCH `/admin/users/:id/status` | is_active hoặc role CUSTOMER/VENUE_MANAGER; thu hồi phiên |
| GET `/venues` dành cho ADMIN | Toàn hệ thống, gồm inactive, không mine=true |
| PATCH `/admin/venues/:id/status`, `/admin/courts/:id/status`, `/admin/slots/:id/status` | reason/expected_version, dùng lại guard TASK 2 |
| GET `/admin/audit-logs` | actor_id/entity_id/action/limit/offset, redaction trước/sau |
| POST `/payments/create`, `/payments/confirm` | Chưa triển khai, mock trả 501; UI vẫn khóa payment online |

Endpoint ngoài phạm vi mock vẫn báo chưa hỗ trợ, không trả thành công giả.

## 5–6. Kiểm thử thực tế

Môi trường: Windows PowerShell, Node v24.15.0, npm 11.12.1, Chrome headless; không thêm dependency.

| Lệnh / bộ kiểm tra | Pass | Fail | Skip |
|---|---:|---:|---:|
| `npm.cmd test --workspace client` | 101 | 0 | 0 |
| Baseline unit/API TASK 1–3 giữ lại | 77 | 0 | 0 |
| Unit/API mới TASK 4 | 24 | 0 | 0 |
| `npm.cmd run test:browser --workspace client` | 39 | 0 | 0 |
| Baseline browser TASK 1–3 và HTTP fixture | 31 | 0 | 0 |
| Browser mới TASK 4 | 8 | 0 | 0 |
| Build mock `--outDir dist/mock` | Thành công | 0 | 0 |
| Build API `--outDir dist/api` | Thành công | 0 | 0 |

Các assertion 501 cũ của complete/extend phía CUSTOMER được thay bằng 403. Phía manager, walk-in body thiếu nhận 400, complete PENDING nhận 409, venue-issue thiếu lý do nhận 400. Payment online giữ 501. Assertion sai giá/cơ sở/bộ môn khi dời lịch sửa thành 400 theo Backend; mã trễ giờ đổi thành BOOKING_ALREADY_STARTED và fixture thay thời gian slot nguồn thay vì chỉ sửa trường hiển thị. Không bỏ test để che lỗi.

Browser xác nhận không có request `/api` hoặc cổng 4000 trong mock, không có JavaScript runtime exception. HTTP fixture của API-mode checkout vẫn xác nhận không gửi payment kể cả sửa thuộc tính disabled trong DOM. Browser complete dùng chuẩn bị fixture quá giờ trong test; ứng dụng không có endpoint đổi đồng hồ hoặc tự complete.

Chạy lại:

```powershell
npm.cmd test --workspace client
npm.cmd run test:browser --workspace client
$env:VITE_DATA_MODE='mock'
npm.cmd run build --workspace client -- --outDir dist/mock
$env:VITE_DATA_MODE='api'
npm.cmd run build --workspace client -- --outDir dist/api
git diff --check
git diff --cached --check
```

Chạy ứng dụng: đặt `$env:VITE_DATA_MODE='mock'` hoặc `'api'`, sau đó `npm.cmd run dev --workspace client`. API là mặc định khi không cấu hình biến môi trường. Tài khoản demo: customer@example.com, customer2@example.com, manager1@example.com, manager2@example.com, admin@example.com; cùng mật khẩu demo `Demo@12345` (chỉ dùng cho mock).

## 7. Screenshot cục bộ

Trong `client/test-artifacts/`, đã được Git ignore, không commit:

```text
task4-walk-in.png                task4-extension.png
task4-booking-history.png        task4-complete.png
task4-report-issue.png           task4-manager-reschedule.png
task4-refund-approve.png         task4-refund-complete.png
task4-refund-detail.png          task4-requests-desktop.png
task4-user-confirmation.png      task4-admin-status.png
task4-admin-audit.png            task4-counter-mobile.png
task4-requests-mobile.png        task4-admin-mobile.png
```

Đã kiểm tra trực quan ảnh desktop/mobile. Browser kiểm tra ba màn hình ở mobile 390×844 không tràn trang; modal giữ focus khi Tab và đóng bằng Escape. Hồi quy TASK 3 giữ kiểm tra tablet 820×1100.

## 8–9. Giới hạn và payment

- Chưa nghiệm thu tích hợp Backend/PostgreSQL thật: thuộc TASK 5. API build và HTTP fixture không thay thế nghiệm thu đó.
- Mock stage một bản sao rồi lưu một lần; rollback khi validation/storage thất bại. localStorage không thay thế transaction, row lock hoặc concurrency giữa nhiều tab trên PostgreSQL.
- Thứ tự so sánh tên mock dùng locale tiếng Việt; cần kiểm tra collation của database trong TASK 5.
- Payment online M5 chưa kích hoạt; `paymentEnabled=false`, create/confirm mock vẫn 501, không có cổng thanh toán thật. PAID tại quầy là CASH/BANK_TRANSFER thuộc TASK 4; refund được ghi rõ sandbox, không chuyển tiền thật.
- Không sửa Backend/database/migration/seed/Contract, không tải `server/`, không thay tài liệu phân công, không thêm dependency. Không triển khai TASK 5/6.

## 10. Git và bàn giao

- `git fetch origin` xác nhận main vẫn ở `d5f89812966dafa6cafdd2a0ac0b5d14d0436e9e`; không merge/rebase/reset/force push.
- Sparse Checkout giữ `client`, `docs`.
- Chỉ stage các file hợp lệ trong `client/`; rà soát staged diff, whitespace và file nhạy cảm trước commit. Không stage dist, node_modules, ảnh, .env riêng hoặc token.
- Commit TASK 4: `feat(tv3): complete POS, aftersales and admin workflows`.
- Push nhánh `origin/tv3/frontend-complete`, cập nhật mô tả PR hiện có: https://github.com/ThnhT4m/PTTKHTTT_Web/pull/1.
- SHA, trạng thái push và `git status -sb` sau bàn giao được ghi trong báo cáo cuối và PR. Giữ PR Draft, không Ready for review, không merge.
