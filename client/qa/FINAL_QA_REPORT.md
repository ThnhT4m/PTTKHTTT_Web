# Báo cáo nghiệm thu Frontend TASK 6

Ngày 27/11/2026 (Asia/Saigon). **Đạt kiểm tra tự động và review trực quan trong phạm vi TV3 đã nêu; chờ người dùng review website.** Không kết luận toàn bộ website không có lỗi.

## Phạm vi và môi trường

13 route pattern (gồm redirect / và fallback), 11 màn hình nghiệp vụ + 404 = 12 màn hình, 9 nhóm MH. Ma trận ảnh mở rộng gồm 17 screen/state (thêm tab Admin, tab Manager và modal) × 5 viewport = 85 ảnh. Kiểm kê trước sửa đọc 95 file source/test, 197 vị trí JSX tương tác và phát hiện 3 import không dùng. TEST_MATRIX.md được tạo trước thay đổi runtime.

Node 24.15.0; npm 11.12.1; Vite 6.4.6; React 19; Chrome 158.0.8127.37 headless trên Windows; PostgreSQL 16.16; Docker Desktop 4.97.0, Engine 29.9.2, Compose 5.6.1. Dependencies hiện có, không thêm dependency trong TASK 6. Sparse Checkout giữ client/docs/server đã được mở ở TASK 5. Backend tham chiếu d5f89812966dafa6cafdd2a0ac0b5d14d0436e9e.

## Kết quả thực tế

| Bộ kiểm tra | Tổng case/check | PASS | FAIL | SKIP | Bằng chứng trong task6/ |
|---|---|---|---|---|---|
| Unit/API Frontend | 104 | 104 | 0 | 0 | unit.log |
| Mock + HTTP fixture browser | 39 | 39 | 0 | 0 | mock-browser.log |
| Real HTTP/PostgreSQL | 19 | 19 | 0 | 0 | real/results.json |
| Real browser E2E | 15 | 15 | 0 | 0 | real/results.json |
| Backend (38 PostgreSQL + 7 unit) | 45 | 45 | 0 | 0 | real/backend-regression.log |
| QA mở rộng (85 visual + 26 functional) | 111 | 111 | 0 | 0 | extended-after/summary.json |
| QA edge (4 retest lặp + 5 case mới) | 9 | 9 | 0 | 0 | fault/summary.json |

Tổng **342 lượt case/check PASS**, FAIL=0, SKIP=0, BLOCKED=0 trong các bộ cuối; gồm 4 retest chạy lặp ở edge. Không cộng những lượt chuẩn bị thất bại vào tổng PASS. Các check có nhiều assertion/bước; số này không phải số assertion. Ma trận Contract riêng có 20 mục trong scope PASS và 3 mục OUT_OF_SCOPE_TV3 (TC-03, TC-16, payment của TC-22; TC-22 auth vẫn PASS).

Mock/API build đều PASS; git diff --check PASS. Real suite dùng DB UI `sportbooking_tv3_1795754409141_6ab3ea_ui_test`, Backend regression dùng `sportbooking_tv3_1795754409141_6ab3ea_backend_test`; QA mở rộng `sportbooking_tv3_1795754507913_9f02dd_ui_test`, edge `sportbooking_tv3_1795754233517_a1451c_ui_test`. Các DB đều mới. 55 file bằng chứng TASK 5 được đối chiếu SHA-256, 0 thay đổi; không reset database TASK 5.

QA mở rộng ghi 378 thao tác CDP (navigate/input/click/submit/focus), edge ghi 57; đây là lượt thực thi, có lặp, không phải số control duy nhất. 2628 quan sát control trong 85 ảnh được ghi ở control-observations.json. 197 vị trí JSX tĩnh được ánh xạ theo họ control trong TEST_MATRIX; control lặp theo hàng dữ liệu được kiểm tra theo biến thể.

## Kết quả theo role

| Role QA mở rộng | Check gồm ảnh | PASS | FAIL |
|---|---|---|---|
| CUSTOMER | 45 | 45 | 0 |
| VENUE_MANAGER | 36 | 36 | 0 |
| GUEST | 11 | 11 | 0 |
| VENUE_MANAGER2 | 1 | 1 | 0 |
| ADMIN | 17 | 17 | 0 |
| ALL | 1 | 1 | 0 |

Customer/Manager/Admin còn được kiểm tra liên vai trò qua real HTTP, browser và PostgreSQL. Manager2 có kiểm tra scope UI và 403 khi ghi cơ sở manager1; không suy quyền sở hữu từ tên cơ sở.

## Kết quả theo viewport

| Viewport | Screen/state | Kết quả | Review |
|---|---|---|---|
| 1920×1080 | 17 | PASS | Ảnh gốc + sheet đã xem; không tràn ngang trang |
| 1366×768 | 17 | PASS | Ảnh gốc + sheet đã xem; không tràn ngang trang |
| 820×1100 | 17 | PASS | Ảnh gốc + sheet đã xem; không tràn ngang trang |
| 390×844 | 17 | PASS | Ảnh gốc + sheet đã xem; không tràn ngang trang |
| 360×800 | 17 | PASS | Ảnh gốc + sheet đã xem; không tràn ngang trang |

Đã xem sheet đối chiếu cả 17 screen/state và ảnh gốc có dữ liệu dài/giá biên, modal/error/empty, POS/refund. Bảng nhiều dòng cuộn trong vùng bảng; modal cuộn nội bộ, header đóng luôn truy cập được. Sau chỉnh, tương phản nhãn tóm tắt đo được 6.09:1 trên nền trắng; icon 44px. Các phép đo chỉ áp dụng selector đã kiểm tra, không phải kiểm toán WCAG toàn bộ.

Tab/Shift+Tab giữ focus trong modal; Escape đóng khi không busy; focus trở về nút mở; label và accessible name được kiểm tra DOM/AX tree. Timer aria-live=off. Zoom 200% dùng mô phỏng reflow 683×384/DPR2, chưa xác nhận menu zoom native hay trình đọc màn hình thật.

## Lỗi và retest

9 lỗi: P0=0, P1=0, P2=7, P3=2. **Đã sửa 9, còn mở 0** trong danh sách phát hiện. FE-QA-001–004 có FAIL trước sửa và PASS sau sửa; 005–009 đối chiếu nội dung/thuộc tính/CSS/ảnh và case hồi quy. Xem BUG_REPORT.md cho bước tái hiện, nguyên nhân, file, severity và trước/sau. Không còn P0/P1/P2 đã biết chưa giải trình trong phạm vi đã chạy.

Lỗi đã sửa gồm route bị phản hồi giữ chỗ chiếm lại; thông báo checkout không phục hồi; submit lặp và retry ghi chưa rõ kết quả ở manager; nội dung payment lỗi thời; countdown live; tương phản/cỡ chữ mobile; vùng bấm; xác minh phiên trên trang công khai. Ba import không dùng đã bỏ. Không refactor lớn.

## Error handling và phân biệt bằng chứng

HTTP adapter/unit kiểm tra đầy đủ 400/401/403/404/409/429/500/503/network/AbortError. QA bơm lỗi đọc 400/403/404/409/429/500/503, auth/me 401/503 và network CDP; có nhãn HTTP_FIXTURE/CDP. Ghi giữ chỗ/cơ sở/giá thực sự commit trên PostgreSQL trước khi CDP giữ hoặc làm mất response. Các kiểm tra 403/409/429 và invalid JWT/locked account thật còn có ở real suite. Backend không phản hồi được kiểm tra loading và rời trang; chưa áp dụng timeout tự động cho fetch. Không tự retry thao tác ghi chưa rõ kết quả.

Đã chạy response cũ sau response mới, refresh giữa ghi, lỗi đọc phục hồi, nhiều role/session, null/tiếng Việt/tên dài/giá 0/100.000.000 VND, lệch đồng hồ client 2 giờ. Concurrency giữ chỗ, optimistic version, hold/đóng sân và tranh ca dời lịch chạy trên PostgreSQL thật. Mock không thay chúng.

Một lượt real regression sơ bộ dừng native Node với exit 0xC0000409 trước browser hoàn tất, lưu real-native-exit.log. Chưa xác định nguyên nhân native; không coi là lỗi nghiệp vụ hay PASS. Lượt chạy lại toàn bộ trên DB mới đạt 34/34 + Backend 45/45. Các lỗi selector/chờ render/debounce trong harness được sửa và chạy lại, không bỏ assertion nghiệp vụ.

## Giới hạn và phần ngoài phạm vi

Payment online giữ paymentEnabled=false, **0 request Frontend tới /payments/create hoặc /payments/confirm** trong các bộ cuối; không tự PENDING→CONFIRMED. TC-03/16/phần payment TC-22 OUT_OF_SCOPE_TV3. Backend payment tests chỉ là regression riêng. PAID fixture/POS/refund sandbox không chuyển tiền thật.

Chưa kiểm toán WCAG hay chạy Safari/iOS/thiết bị thật; zoom native cần người dùng review thêm. Font Google có fallback hệ thống. Phone validation Frontend chặt hơn trường chuỗi Backend, được ghi ở HANDOVER. Switcher nhiều cơ sở dài và bảng cần cuộn ngang nội bộ là giới hạn hiện có; không redesign. Không tìm thấy lỗi Backend mới trong các case đã chạy; xem BACKEND_ISSUES.md.

## File thay đổi

- `client/package.json`
- `client/qa/BACKEND_ISSUES.md`
- `client/qa/BUG_REPORT.md`
- `client/qa/FINAL_QA_REPORT.md`
- `client/qa/HANDOVER.md`
- `client/qa/TEST_MATRIX.md`
- `client/src/components/manager/EntityForm.jsx`
- `client/src/components/manager/GenerateModal.jsx`
- `client/src/components/manager/ManagerSchedule.jsx`
- `client/src/layouts/Layouts.jsx`
- `client/src/pages/customer/Checkout.jsx`
- `client/src/pages/customer/Schedule.jsx`
- `client/src/pages/customer/Venues.jsx`
- `client/src/pages/manager/Venues.jsx`
- `client/src/styles/app.css`
- `client/tests/browser.mjs`
- `client/tests/qa/contact-sheets.ps1`
- `client/tests/qa/coverage.mjs`
- `client/tests/qa/edge-run.mjs`
- `client/tests/qa/edges.mjs`
- `client/tests/qa/generate-report.mjs`
- `client/tests/qa/review.mjs`
- `client/tests/qa/run.mjs`
- `client/tests/qa/suite.mjs`
- `client/tests/real/chrome.mjs`
- `client/tests/real/environment.mjs`

Không di chuyển file. Không sửa Backend/Contract/tài liệu phân công. node_modules/dist/.env/secret/ảnh/log vẫn bị ignore. Danh sách trên gồm file untracked; git diff --stat chỉ đếm tracked files.

## Git cuối

```text
## tv3/frontend-complete...origin/tv3/frontend-complete
 M client/package.json
 M client/src/components/manager/EntityForm.jsx
 M client/src/components/manager/GenerateModal.jsx
 M client/src/components/manager/ManagerSchedule.jsx
 M client/src/layouts/Layouts.jsx
 M client/src/pages/customer/Checkout.jsx
 M client/src/pages/customer/Schedule.jsx
 M client/src/pages/customer/Venues.jsx
 M client/src/pages/manager/Venues.jsx
 M client/src/styles/app.css
 M client/tests/browser.mjs
 M client/tests/real/chrome.mjs
 M client/tests/real/environment.mjs
?? client/qa/
?? client/tests/qa/

client/package.json                               |  4 +-
 client/src/components/manager/EntityForm.jsx      | 17 ++++++---
 client/src/components/manager/GenerateModal.jsx   | 16 +++++---
 client/src/components/manager/ManagerSchedule.jsx | 16 +++++---
 client/src/layouts/Layouts.jsx                    |  4 +-
 client/src/pages/customer/Checkout.jsx            |  8 ++--
 client/src/pages/customer/Schedule.jsx            |  8 +++-
 client/src/pages/customer/Venues.jsx              |  2 +-
 client/src/pages/manager/Venues.jsx               |  2 +-
 client/src/styles/app.css                         | 45 +++++++++++++++++++----
 client/tests/browser.mjs                          |  4 +-
 client/tests/real/chrome.mjs                      | 12 ++++--
 client/tests/real/environment.mjs                 |  5 ++-
 13 files changed, 105 insertions(+), 38 deletions(-)
```

Index rỗng. HEAD giữ nguyên `2a4df6f7187f0d716c24ab3d4209798542acf1c9`; chưa commit/push/merge hoặc cập nhật Draft PR #1. Mở website review và tài khoản theo HANDOVER.md; người dùng quyết định bước Git tiếp theo.
