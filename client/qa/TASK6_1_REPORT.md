# Báo cáo TASK 6.1 — dữ liệu vận hành và tách QA

Ngày 27/11/2026, Asia/Saigon. Website **http://127.0.0.1:5176** đang chạy API thật với database **sportbooking**, không dùng database QA. Đã tách dữ liệu vận hành khỏi QA; sẵn sàng người dùng review.

## 1. Database trước/sau và dữ liệu bảo toàn

Trước: cổng 5176/4006 kết nối `sportbooking_tv3_1795754409141_6ab3ea_ui_test`, PostgreSQL 16.16/Docker cổng 55435. Có T5 Cơ sở tích hợp, T5 Biên validation, UI T5 Cơ sở, booking/payment/refund/review/audit của kiểm thử. Database sportbooking đã tồn tại nhưng **0 bảng public**, chưa có migration hoặc bản ghi. Đã kiểm tra trước khi khởi tạo; không seed lên dữ liệu có sẵn.

Sau: giữ schema gốc **10 bảng nghiệp vụ**, thêm hai bảng metadata Knex; migration 001_initial.js batch 1. Dùng nguyên migration/seed gốc trên DB đã xác nhận trống, không sửa server/migration/seed/Contract. Seed gốc có TRUNCATE nhưng chỉ được gọi sau kiểm tra DB rỗng và tất cả bảng nghiệp vụ rỗng; không gọi khi khởi động.

| Bảng nghiệp vụ | QA website trước (giữ nguyên) | sportbooking trước | sportbooking sau |
|---|---|---|---|
| users | 7 | 0 | 5 |
| sport_venues | 6 | 0 | 5 |
| courts | 11 | 0 | 11 |
| time_slots | 4064 | 0 | 5472 |
| bookings | 23 | 0 | 1 |
| payments | 17 | 0 | 0 |
| booking_reschedules | 5 | 0 | 0 |
| refunds | 3 | 0 | 0 |
| reviews | 2 | 0 | 0 |
| audit_logs | 75 | 0 | 16 |

Không chuyển các giao dịch kỹ thuật từ QA sang vận hành. Không xóa/truncate/reset DB cũ. 277 file bằng chứng TASK 5/6 đã đối chiếu SHA-256, 0 thay đổi; số bản ghi từng bảng của database review cũ không đổi. Các DB QA khác cũng không bị DROP/reset; harness mới chỉ CREATE tên mới. Dữ liệu vận hành lưu trong Docker volume **sportbooking-tv3-task5_sportbooking_pgdata**, mount /var/lib/postgresql/data; tên project Docker là lịch sử container, không đồng nghĩa website dùng QA DB.

## 2. Dữ liệu giữ lại/bổ sung và nguồn gốc

Giữ 5 tài khoản, 3 cơ sở và 6 sân do seed gốc tạo trong DB trống. Chỉnh 3 mô tả sang tiếng Việt tự nhiên qua API quản lý. Thêm Sân Nhà Bình Tân/3 sân qua API; thêm Sân Nhà Tân Bình/2 sân qua UI Manager, rồi sinh lịch 30 ngày qua Backend gốc. Tổng 5 khu vực, 11 sân đủ 5 bộ môn.

| Cơ sở | Khu vực | Số sân | Quản lý |
|---|---|---|---|
| Sân Nhà Bình Tân | Bình Tân | 3 | manager2 |
| Sân Nhà Tân Bình | Tân Bình | 2 | manager1 |
| Thể thao Bình Thạnh | Bình Thạnh | 2 | manager2 |
| Thể thao Quận 7 | Quận 7 | 2 | manager1 |
| Thể thao Thủ Đức | Thủ Đức | 2 | manager1 |

Giá minh họa: cầu lông 80–90 nghìn, pickleball 160 nghìn, tennis 200–220 nghìn, bóng rổ 180 nghìn, bóng đá 300 nghìn VND/giờ. Ca bóng đá 21–22h ngày 28/11 được Manager đổi 320 nghìn qua UI và Customer đọc đúng qua API. Không khẳng định địa chỉ/giá là cơ sở thương mại đã xác minh. Manifest: client/.local/catalog-provenance.json.

Tổng 5472 ca, 16 ca 60 phút/ngày/sân, 06:00–22:00. Khoảng lịch 26/11/2026 đến 27/12/2026 (giờ Việt Nam). Một booking ONLINE do khách demo giữ để nghiệm thu, không thanh toán; trạng thái cuối EXPIRED: 1. Sau hết deadline, cron giải phóng slot đúng nghiệp vụ và giữ booking trong lịch sử. Không có payment/refund/review; doanh thu 0 là dữ liệu thật. Không tạo số liệu giả để làm đầy UI.

## 3. Dữ liệu kỹ thuật và audit

Catalogue/tên sân/địa chỉ/mô tả hiện tại không chứa T5/QA/Fixture, chuỗi A/S lặp hay mô tả kiểm thử. Các bản ghi QA gốc nằm nguyên trong DB QA, không được lọc ẩn theo tên ở Frontend.

Người dùng đã quyết định **“Giữ nguyên 3 audit để bảo toàn lịch sử khởi tạo”**. Đã giữ nguyên đúng các audit có ID bên dưới; không xóa/sửa/che ở Frontend. Nội dung seed cũ trong before_data là ngoại lệ đã được người dùng chấp thuận, không phải dữ liệu QA/giao dịch giả. Quyết định lưu tại client/test-artifacts/task6.1/audit-decision.json.

| ID audit được giữ | Action | Mô tả seed trước cập nhật |
|---|---|---|
| e0a507de-be63-42dd-bd2b-3c1e12613954 | VENUE_UPDATED | Cụm sân bóng đá và cầu lông; dữ liệu mẫu phục vụ phát triển. |
| c087eace-06ef-494e-bae6-d3b57b3eea27 | VENUE_UPDATED | Cụm sân bóng rổ và cầu lông; dữ liệu mẫu. |
| 6db9e8f6-ff88-4adf-9321-d458614244f7 | VENUE_UPDATED | Cụm sân pickleball và tennis; quản lý độc lập để kiểm thử quyền sở hữu. |

## 4. Rà soát nguồn dữ liệu Frontend

- api/client.js: API là mặc định; mock chỉ import khi VITE_DATA_MODE=mock. Không thêm fallback mock hoặc bộ lọc tên QA.
- Worker vận hành ép API mode, VITE_API_BASE=/api, proxy tới Backend gốc 4006; Backend đọc private DATABASE_URL sportbooking.
- Pages/layouts/components/services đều dùng response Backend cho catalogue, lịch, booking, refund, review, dashboard và audit. Nhãn/enum/trang trí tĩnh giữ nguyên. Không sửa service để tạo thành công giả. Dashboard được đối chiếu với SQL thật.
- useCustomerResource/useWorkflowResource đã bổ sung khóa scope theo user/role/trạng thái khôi phục phiên, che dữ liệu scope cũ ngay khi đổi phiên và hủy/bỏ qua response cũ. useManagerResource cũng che/xóa scope cũ và tải lại.
- Đã tái hiện cache cơ sở INACTIVE của Manager vẫn hiện trên route công khai sau đổi sang Customer (storage event), rồi sửa: dữ liệu cũ biến mất, Backend 403 hiện đúng. Kiểm tra thêm Manager1 → Manager2 cùng route quản lý đạt PASS.
- Các POST/PATCH/DELETE vẫn chờ Backend xác nhận; không tự tạo booking CONFIRMED, dashboard/revenue/review/slot status. Refresh lấy lại dữ liệu lưu thật.

## 5. Lỗi hiển thị dữ liệu dài

FE-QA-010/P2: tên/địa chỉ/description không có khoảng trắng vẫn hợp lệ nhưng làm min-content của flex/grid vượt màn hình. Trước sửa **17 FAIL/25**, sau sửa **25 PASS/25** tại 1920×1080, 1366×768, 820×1100, 390×844, 360×800. Kiểm tra chi tiết cơ sở, booking list, modal detail, quản lý/bảng và audit before/after.

Sửa body overflow-wrap:anywhere, min-width:0 cho flex/grid item và nội dung court/venue/booking/panel, giữ khối giá/CTA không bị ép ra ngoài; cột nhãn tóm tắt có phần rộng cố định tương đối để không bị ép mỗi chữ một dòng. Không đổi maxLength/validation, không dùng overflow-x:hidden toàn trang. Đã xem 5 sheet đối chiếu ảnh dài và ảnh gốc modal/venue. Mô tả cực dài có thể làm trang/bảng cao, nhưng còn đầy đủ nội dung và cuộn được. Dữ liệu A/B/S/M/N biên chỉ có trong QA.

FE-QA-011/P2: cache khác phiên nói trên; có FAIL trước/PASS sau và ảnh session-scope. Không thay phân quyền Backend. Xem BUG_REPORT.md phần TASK 6.1.

## 6. Tính toàn vẹn và cấu hình bền vững

| Kiểm tra | Kết quả |
|---|---|
| orphanCourts | 0 |
| orphanSlots | 0 |
| orphanBookings | 0 |
| invalidSlots | 0 |
| duplicateSlots | 0 |
| invalidCourtPrices | 0 |
| non16DaySchedules | 0 |
| technicalRecords | 0 |

Không orphan/slot trùng/ca sai 60 phút/giá ngoài giới hạn/ngày không đủ 16 ca. FKs/check/exclusion/unique theo migration gốc được kiểm kê trong database-after.json. Số bảng không đổi kiến trúc; các bảng auth/payment/audit giữ cấu trúc gốc.

Backup trước khởi tạo sportbooking trống và backup PostgreSQL custom đầy đủ sau bổ sung ở client/.local/backups/. Đường dẫn, size và SHA-256 backup cuối: client/test-artifacts/task6.1/backup.json. File backup, config, JWT secret/PID/log và ảnh không được stage/Git. JWT_SECRET không xuất hiện trong bundle build đã quét.

Backend/Frontend chạy hai worker riêng; start/restart không gọi migration/seed. Đã restart độc lập và đối chiếu số venue/court/booking/audit không mất, giữ nguyên ID booking. Lệnh bootstrap gọi lại trả initialized=false, không thay dữ liệu.

Guard QA chặn URL sportbooking/host không local, chỉ cho tên DB tạo mới khớp sportbooking_tv3_<timestamp>_<random>_{ui,backend}_test; kiểm tra kind trước seed và trước spawn suite Backend. Chạy thực tế test:real với operations.env bị chặn trước khi kết nối/ghi. Đường dẫn bằng chứng task5/task6 bị từ chối ghi; mặc định là task6.1.

## 7. Kiểm thử cuối

| Bộ kiểm tra | Tổng | PASS | Bằng chứng trong task6.1/ |
|---|---|---|---|
| Unit/API (thêm 4 guard tests) | 108 | 108 | unit.log |
| Mock + HTTP fixture browser | 39 | 39 | mock-browser.log |
| Real HTTP/PostgreSQL + real browser | 34 | 34 | real/results.json |
| Backend regression: 38 PG + 7 unit | 45 | 45 | real/backend-regression.log |
| QA mở rộng, gồm 85 ảnh | 111 | 111 | extended-after/summary.json |
| QA edge, gồm 4 retest lặp | 9 | 9 | fault/summary.json |
| Dữ liệu dài: 5 trạng thái × 5 viewport | 25 | 25 | long-after/long-checks.json |
| Đổi phiên Customer/Manager + Manager1/Manager2 | 1 | 1 | scope-after/scope-result.json |
| Vận hành sportbooking, ba role | 10 | 10 | operational/summary.json |

Tổng **382 lượt case/check PASS**, FAIL=0, SKIP=0 trong các bộ cuối; 4 check edge là retest lặp. 1 check scope có 2 tình huống đổi phiên. Kiểm tra âm “harness từ chối DB vận hành” thành công; không tính exit từ chối mong đợi thành lỗi sản phẩm. Build mock/API và git diff --check PASS.

Hai lượt chuẩn bị chưa đạt đã được giữ log: API fixture nhận lỗi CDP Invalid InterceptionId do request bị hủy lúc khôi phục phiên (đã tách khỏi lỗi fixture thật, vẫn giữ assertion route/GET/payment); phép đọc SQL trong nghiệm thu vận hành dùng nhầm held_until ở bookings (đã sửa join time_slots và tiếp tục từ hold đã có, không gửi thêm hold). Không thay Contract hoặc hạ assertion nghiệp vụ.

| Nghiệm thu vận hành | Trạng thái | Read-back/bằng chứng |
|---|---|---|
| OPS-01-manager-create-catalogue | PASS | {"venue":"76609870-c870-4828-97e2-a6dac6ce947a","courts":2,"source":"Manager UI; retained meaningful project catalogue","days":30} |
| OPS-02-slot-price | PASS | {"date":"2026-11-28","price":320000,"hour":"21:00–22:00"} |
| OPS-03-manager-scope | PASS | {"foreignVenueVisible":false} |
| OPS-04-customer-finds-price | PASS | {"venue":"76609870-c870-4828-97e2-a6dac6ce947a","newPrice":320000} |
| OPS-05-unpaid-hold | PASS | {"booking":"99d1c727-7854-4087-b25a-3e2696b8b094","status":"PENDING","source":"One demonstration hold by project demo customer; no payment","deadline":"2026-11-27T06:26:15.450Z"} |
| OPS-06-manager-held | PASS | {"managerReadBack":"HELD","booking":"99d1c727-7854-4087-b25a-3e2696b8b094"} |
| OPS-07-admin-real-statistics | PASS | {"total_venues":5,"total_bookings":1,"total_revenue":0,"total_users":5} |
| OPS-08-backend-offline-no-mock | PASS | {"realBackendStopped":true,"mockStore":false,"retryRecovers":true} |
| OPS-09-restart-persistence | PASS | {"backendRestart":true,"frontendRestart":true,"counts":{"venues":5,"courts":11,"bookings":1,"audits":15},"bookingPersisted":true,"noStartupSeed":true} |
| OPS-10-data-source-and-no-payment | PASS | {"source":"sportbooking","technicalRecords":0,"paymentRequests":0,"payments":0,"reviews":0} |

Các ca phá hủy/PAID fixture/POS/refund/review/concurrency chỉ chạy trên QA mới. Payment online giữ paymentEnabled=false, không có request /payments/create hay /payments/confirm từ Frontend. TC-03/16/phần payment TC-22 OUT_OF_SCOPE_TV3.

## 8. Khởi động và giới hạn còn lại

Xem HANDOVER.md: ops:start/status/stop/restart-backend/restart-frontend, Docker project/volume, config riêng, tài khoản, sao lưu và lệnh QA. Website đang chạy để người dùng review. Cần làm mới tab cũ để đọc đúng môi trường sau khi chuyển nguồn; token QA cũ không được chấp nhận bằng secret vận hành.

Chưa nghiệm thu thanh toán, WCAG đầy đủ, Safari/iOS thật; zoom 200% của TASK 6 là mô phỏng reflow. Đây là môi trường đồ án local với tài khoản demo; cấu hình/backup riêng không được đưa lên GitHub.

## 9. File và trạng thái Git

File TASK 6.1 tập trung vào client/.gitignore, scripts/{lib,operations}, hooks scope, CSS, tests/database-safety.test.js, tests/qa/{long-data,session-scope}, guard/evidence routing của real/QA harness và tài liệu. Không di chuyển file. Danh sách toàn bộ working tree (gồm TASK 6 chưa commit):

- `client/.gitignore`
- `client/package.json`
- `client/qa/BACKEND_ISSUES.md`
- `client/qa/BUG_REPORT.md`
- `client/qa/FINAL_QA_REPORT.md`
- `client/qa/HANDOVER.md`
- `client/qa/TASK6_1_REPORT.md`
- `client/qa/TEST_MATRIX.md`
- `client/scripts/lib/databaseSafety.mjs`
- `client/scripts/operations/acceptance.mjs`
- `client/scripts/operations/audit.mjs`
- `client/scripts/operations/bootstrap.mjs`
- `client/scripts/operations/catalog.mjs`
- `client/scripts/operations/manage.mjs`
- `client/scripts/operations/report.mjs`
- `client/scripts/operations/run.mjs`
- `client/src/components/manager/EntityForm.jsx`
- `client/src/components/manager/GenerateModal.jsx`
- `client/src/components/manager/ManagerSchedule.jsx`
- `client/src/hooks/useCustomerResource.js`
- `client/src/hooks/useManagerResource.js`
- `client/src/layouts/Layouts.jsx`
- `client/src/pages/customer/Checkout.jsx`
- `client/src/pages/customer/Schedule.jsx`
- `client/src/pages/customer/Venues.jsx`
- `client/src/pages/manager/Venues.jsx`
- `client/src/styles/app.css`
- `client/tests/api.browser.mjs`
- `client/tests/browser.mjs`
- `client/tests/database-safety.test.js`
- `client/tests/qa/contact-sheets.ps1`
- `client/tests/qa/coverage.mjs`
- `client/tests/qa/edge-run.mjs`
- `client/tests/qa/edges.mjs`
- `client/tests/qa/generate-report.mjs`
- `client/tests/qa/long-data.mjs`
- `client/tests/qa/review.mjs`
- `client/tests/qa/run.mjs`
- `client/tests/qa/session-scope.mjs`
- `client/tests/qa/suite.mjs`
- `client/tests/real/README.md`
- `client/tests/real/chrome.mjs`
- `client/tests/real/environment.mjs`
- `client/tests/real/run.mjs`

```text
## tv3/frontend-complete...origin/tv3/frontend-complete
 M client/package.json
 M client/src/components/manager/EntityForm.jsx
 M client/src/components/manager/GenerateModal.jsx
 M client/src/components/manager/ManagerSchedule.jsx
 M client/src/hooks/useCustomerResource.js
 M client/src/hooks/useManagerResource.js
 M client/src/layouts/Layouts.jsx
 M client/src/pages/customer/Checkout.jsx
 M client/src/pages/customer/Schedule.jsx
 M client/src/pages/customer/Venues.jsx
 M client/src/pages/manager/Venues.jsx
 M client/src/styles/app.css
 M client/tests/api.browser.mjs
 M client/tests/browser.mjs
 M client/tests/real/README.md
 M client/tests/real/chrome.mjs
 M client/tests/real/environment.mjs
 M client/tests/real/run.mjs
?? client/.gitignore
?? client/qa/
?? client/scripts/
?? client/tests/database-safety.test.js
?? client/tests/qa/

client/package.json                               | 12 ++++-
 client/src/components/manager/EntityForm.jsx      | 17 +++++--
 client/src/components/manager/GenerateModal.jsx   | 16 ++++--
 client/src/components/manager/ManagerSchedule.jsx | 16 ++++--
 client/src/hooks/useCustomerResource.js           | 13 +++--
 client/src/hooks/useManagerResource.js            |  9 +++-
 client/src/layouts/Layouts.jsx                    |  4 +-
 client/src/pages/customer/Checkout.jsx            |  8 +--
 client/src/pages/customer/Schedule.jsx            |  8 ++-
 client/src/pages/customer/Venues.jsx              |  2 +-
 client/src/pages/manager/Venues.jsx               |  2 +-
 client/src/styles/app.css                         | 59 ++++++++++++++++++++---
 client/tests/api.browser.mjs                      |  9 +++-
 client/tests/browser.mjs                          |  4 +-
 client/tests/real/README.md                       |  4 ++
 client/tests/real/chrome.mjs                      | 12 +++--
 client/tests/real/environment.mjs                 | 13 ++++-
 client/tests/real/run.mjs                         |  2 +
 18 files changed, 162 insertions(+), 48 deletions(-)
```

Index rỗng; HEAD giữ nguyên 2a4df6f7187f0d716c24ab3d4209798542acf1c9. Không commit/push/merge/thay trạng thái Draft PR. Không thay server/, docs/ hoặc tài liệu phân công.
