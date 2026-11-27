# TASK 5 — Tích hợp và nghiệm thu ngoài payment

Ngày nghiệm thu: **27/11/2026, Asia/Ho_Chi_Minh**. Chỉ kết luận cho các tình huống đã chạy dưới đây; không nghiệm thu payment Frontend hoặc triển khai TASK 6.

## 1. Môi trường và phiên bản

- Nhánh: `tv3/frontend-complete`; checkpoint trước TASK 5: `6b547823a4e76ce73a43df40346b2dbe0a4f7a32`.
- Backend và `origin/main`: `d5f89812966dafa6cafdd2a0ac0b5d14d0436e9e`; fetch lại không có thay đổi mới. Mọi dòng ma trận dưới đây dùng phiên bản Backend này và Frontend checkpoint trên **cộng thay đổi TASK 5 trong commit bàn giao**. SHA bàn giao cuối được ghi trong PR #1/báo cáo chat; có thể lấy bằng `git log -1`.
- Windows PowerShell; Node **v24.15.0**, npm **11.12.1**; Docker Engine **29.9.2**, Docker Compose **v5.6.1**; PostgreSQL **16.16**, image `postgres:16-alpine`; Chrome headless.
- Sparse Checkout mở rộng theo quyền TASK 5 thành `client`, `docs`, `server`. Không clone lại repository.
- Docker Desktop có sẵn được khởi động; image 16 được tải vì máy chỉ có image PostgreSQL 17 trước đó. Không cài phần mềm hệ thống.
- Dependencies được cài lại bằng `npm.cmd ci --ignore-scripts --no-audit --no-fund` theo lockfile hiện có sau lần cài gián đoạn; không thêm dependency, không đổi lockfile/Backend.

## 2. Kết nối Backend

- Compose project riêng **`sportbooking-tv3-task5`**, PostgreSQL chỉ bind **127.0.0.1:55435**.
- Docker hết pool subnet mặc định. Đã kiểm kê network/route, chọn subnet riêng **10.242.5.0/24** qua `client/tests/real/compose.task5.yml`; không sửa Compose gốc, prune network hoặc xóa volume.
- Harness import Express app và cron gốc, lắng nghe HTTP thật trên cổng local trống; UI dùng Vite **127.0.0.1:5175**, `VITE_DATA_MODE=api`, proxy `/api` tới Backend đó. Không intercept HTTP trong real browser suite.
- `GET /api/health` trả 200 với truy vấn DB thật; envelope/server_time/CORS đúng. Backend origin lần chạy cuối: **http://127.0.0.1:53485**. Server/Vite của harness đóng sau test; PostgreSQL và database bằng chứng được giữ.
- JWT_SECRET sinh ngẫu nhiên 48 byte, không ghi giá trị vào báo cáo hoặc Git. Cấu hình local trong `client/test-artifacts/task5/backend.env`, đã ignore. Backend phục vụ UI luôn `PAYMENT_SANDBOX_ENABLED=false`.

Chạy lại tại root:

```powershell
$env:POSTGRES_PORT='55435'
docker compose -f docker-compose.yml -f client/tests/real/compose.task5.yml -p sportbooking-tv3-task5 up -d --wait db
npm.cmd run test:real --workspace client
```

Để mở UI thủ công sau khi đã có cấu hình local, dùng hai terminal:

```powershell
# Terminal Backend
$env:DOTENV_CONFIG_PATH=(Resolve-Path client/test-artifacts/task5/backend.env).Path
$env:PORT='4005'
npm.cmd run start --workspace server

# Terminal Frontend
$env:VITE_DATA_MODE='api'
$env:VITE_PROXY_TARGET='http://127.0.0.1:4005'
npm.cmd run dev --workspace client -- --port 5175
```

Mở `http://127.0.0.1:5175`. Kiểm tra cổng trước khi dùng; không ghi đè tiến trình đang có. Tài khoản demo và mật khẩu theo README gốc, chỉ trên DB test này.

## 3. Database kiểm thử

- UI/real API/browser: **sportbooking_tv3_1795751496957_a4ffc2_ui_test**.
- Backend regression: **sportbooking_tv3_1795751496957_a4ffc2_backend_test**.
- Thời điểm kết thúc evidence cuối: **10:52:45 27/11/26**.
- Mỗi lần chạy tạo hai DB mới với prefix `sportbooking_tv3_...` và suffix `_test`. CREATE thất bại nếu đã tồn tại; xác nhận `current_database()` và database UI trống trước migrate/seed.
- Chỉ chạy migration và demo seed **nguyên trạng** trên DB mới. Không dùng production, không reset DB/volume sẵn có. Các DB của lần thử trước cũng được giữ để đối chiếu.
- Backend regression chạy trên DB riêng mới; suite gốc được phép reset DB đó theo README. Không chạy suite này trên DB UI.

## 4. API đã nghiệm thu

Các service Frontend được đối chiếu route/schema/repository thực tế. `GET /auth/me` trả user trực tiếp; service hiện có đọc được cả shape này và mock. Số tiền integer, timestamp có múi giờ, query whitelist, reason/version và ownership được kiểm tra bằng HTTP thật.

| Nhóm | Endpoint/method thực chạy | Bằng chứng |
|---|---|---|
| Health/Auth | GET health/me; POST register/login/logout | HTTP/DB + browser; sai mật khẩu, hết hạn/thu hồi JWT, tài khoản khóa, 429 |
| Danh mục | GET venues, venue detail, venue courts, court detail, court slots | HTTP + browser; q/district/sport/giá/limit/offset, dữ liệu inactive và scope |
| M2 | POST/PATCH venues/courts; DELETE court body reason/version | HTTP + browser; cấu hình hold, CRUD/xóa mềm/kích hoạt lại |
| M3 | POST generate-slots; PATCH slots/:id | HTTP + browser; 480 ca, lặp không ghi đè, snapshot giá và conflict |
| Booking | GET list/detail/history; POST online/walk-in/extend/complete | HTTP/DB + browser; PENDING/HELD/deadline, PAID tại quầy, cha/con, complete |
| Hậu mãi | POST reschedule/venue-issue/refund-request; GET refunds/detail; PATCH refund status | HTTP/DB + browser; issue flags, slot cũ, chuỗi refund sandbox và retry |
| Review | POST bookings/:id/reviews | HTTP/DB + browser; đúng chủ, COMPLETED, một review, rating |
| Admin | GET overview/users/audit-logs; PATCH user status và admin status venue/court/slot | HTTP/DB, browser và Backend regression; scope/version/audit/token revocation |
| Payment online | Không gọi create/confirm từ bộ Frontend | Monitor API và browser: **0 request payment**; hoãn TASK 6 |

Phân trang dữ liệu thật được so sánh với trang kế tiếp và filter; không đổi API Contract hoặc giả định có total-count. Bộ Backend gốc bổ sung kiểm tra trạng thái venue/slot và rollback ở các endpoint tương ứng; không gọi đó là browser E2E.

## 5. Ma trận TC-01–TC-22

Phiên bản áp dụng cho **tất cả dòng**: B=`d5f8981`, F=`6b54782` + bản sửa TASK 5 bàn giao. Actor là các tài khoản demo hoặc tài khoản mới trong DB test. `R` = `client/test-artifacts/task5/results.json` (real HTTP/DB hoặc real browser theo trường `level`); `B` = `backend-regression.log` cùng thư mục (suite gốc chạy lại). Không có dòng FAIL/BLOCKED/N/A ở phạm vi đã chạy; phần payment được tách DEFERRED_TO_TASK6.

| TC | Actor / điều kiện | Mong muốn | Thực tế | Cấp / bằng chứng | Kết quả |
|---|---|---|---|---|---|
| 01 | Hai CUSTOMER, hai session, cùng slot AVAILABLE | Một 201, một 409; một PENDING/HELD | Đúng một winner, DB count=1; UI loser báo conflict và tải lại | R: TC-01 HTTP/DB + browser | PASS |
| 02 | CUSTOMER + cron; fixture deadline đã qua | EXPIRED/AVAILABLE, retry không nhả hold mới | Chờ tick cron thật; hold sau giữ nguyên, booking cũ held_until=null | R: TC-02 HTTP/DB; B: deadline regression | PASS |
| 03 | Payment atomic/idempotent | Nghiệm thu Frontend sau tích hợp payment | Không gọi payment từ UI; Backend regression có chạy test gốc riêng | B chỉ là regression Backend | DEFERRED_TO_TASK6 |
| 04 | CUSTOMER/manager; hold 1/5/10, giá trị sai, ca sát giờ | Giới hạn đúng, deadline server, không reset | Giá trị sai 400; hold 1 phút đúng khoảng 60 giây; checkout reload giữ deadline | R: TC-04 + browser; B: hold 5 phút | PASS |
| 05 | Manager đúng cơ sở; ca đang chạy/tương lai/kết thúc | CONFIRMED/BOOKED/PAID hoặc conflict/403 | Bán được ca đang chạy và ca tương lai, chặn ended/trùng/ngoài scope | R: TC-05 + POS browser | PASS |
| 06 | Manager; ca kế HELD/BOOKED/UNAVAILABLE rồi AVAILABLE | Không nhảy ca, extension đúng giá/parent | Ba conflict; child trỏ ca sát ngay sau, payment đúng giá 333000 | R: TC-06/21 + browser | PASS |
| 07 | Chủ đơn paid fixture; dời tự nguyện/sự cố | Cùng cơ sở/môn/giá, clear issue, đúng trạng thái slot | Tự nguyện mở ca; sự cố giữ UNAVAILABLE, xóa hai cờ và có history; fake issue 403 | R: TC-07 + browser; B: sai giá/môn | PASS |
| 08 | Chủ đơn + manager; paid fixture hoặc POS | Đủ chuỗi và cập nhật atomic, idempotent | APPROVED/PROCESSING có hai audit; REFUNDED/CANCELLED_BY_VENUE/UNAVAILABLE; retry không trùng | R: TC-08 + browser | PASS |
| 09 | Manager + chủ đơn; ca quá khứ hợp lệ | Complete đúng giờ, slot BOOKED, một review | Complete sớm 409; past complete/retry đúng, owner review một lần; sai rating 400/sai chủ 403 | R: TC-09 + browser | PASS |
| 10 | manager2/customer2 đổi ID ngoài scope | Không vượt quyền đọc/ghi | Mutation ngoài cơ sở 403, list rỗng, detail/history khách khác 403, UI không lộ summary | R: TC-10/11 + browser; B: refund scope | PASS |
| 11 | Manager đúng/sai cơ sở, route Admin | Metadata/status tách biệt, guard như Admin | Sai role/ownership bị chặn; ACTIVE bookings chặn đóng sân | R: TC-10/11, TC-11/12/18; B: M2/M3 scope | PASS |
| 12 | ADMIN, reason/version | Tăng version và audit actor/before/after/reason | Audit lọc được; version cũ 409; thiếu reason bị suite gốc từ chối | R + browser admin audit; B: ADMIN reason/audit | PASS |
| 13 | Hai PATCH cùng expected_version | Một winner, một EDIT_CONFLICT | Version tăng đúng một, tên bằng payload thắng, UI không ghi đè | R: TC-13 HTTP/DB + browser conflict | PASS |
| 14 | Hold đồng thời ADMIN đóng sân | Không có booking mới trên sân đã đóng | Chỉ một thành công; DB trạng thái phù hợp bên thắng | R: TC-14 HTTP/DB; B: race cùng loại | PASS |
| 15 | Fixture lỗi audit trong DB regression riêng | Transaction rollback | Giá/version/trạng thái giữ nguyên khi ghi audit lỗi | B: “Audit thất bại rollback cả giá/version” | PASS (Backend integration) |
| 16 | Expire cạnh tranh payment | Nghiệm thu Frontend sau payment | Không chạy luồng payment Frontend | B có test regression, không thay nghiệm thu UI | DEFERRED_TO_TASK6 |
| 17 | Hai booking CONFIRMED về một đích | Một winner, loser rollback | Một 200/một 409; một booking chiếm đích; loser slot/history không đổi | R: TC-17 HTTP/DB; B: hai đơn cùng đích | PASS |
| 18 | Logout/khóa/cấp/hạ quyền/expired JWT | Token cũ bị thu hồi thật | API cũ 401, locked login 403, UI phân biệt sai password và hết phiên | R: TC-18/22, Admin + browser | PASS |
| 19 | Fixture DB constraint riêng | PostgreSQL chặn invalid overlap/window/hold/paid | Suite gốc xác nhận constraint từ chối và rollback | B: “PostgreSQL: ràng buộc overlap...” | PASS (DB integration) |
| 20 | Sân mới, 30 ngày, lặp/đồng thời/sai scope | 480 ca, 16/ngày, không ghi đè/trùng | Real API + UI tạo 480/lặp skipped 480; suite gốc kiểm tra parallel/validation | R: TC-04/20 + browser; B: M3 parallel | PASS |
| 21 | Booking đã tạo, sửa court.hourly_price | Snapshot slot/booking/payment giữ nguyên | Booking gốc không đổi; child dùng giá slot đã chỉnh, không dùng giá metadata | R: TC-06/21 | PASS |
| 22 | Auth/user/audit và payment | Không lộ bí mật; payment hoãn | User/audit/UI không có password_hash/token_version/credential; payment Frontend chưa tích hợp | R: TC-18/22, browser Admin; B regression | PASS auth/secrets; DEFERRED_TO_TASK6 payment |

Người thực hiện: TV3/Codex. Nếu có lỗi mới: TV3 phụ trách Frontend, TV1 auth/danh mục/Admin/DB, TV2 booking/POS/hậu mãi/payment. Không phát hiện lỗi Backend cần bàn giao TV1/TV2 trong các tình huống đã chạy.

## 6. Concurrency thực tế

Không dùng localStorage để chứng minh race. Các request `Promise.allSettled` chạy qua HTTP Backend thật và query PostgreSQL sau khi cả hai kết thúc:

| Trường hợp | Kết quả và invariant |
|---|---|
| Hai khách hold một slot | 201/409, DB đúng một booking PENDING, slot HELD |
| Hai write cùng version | Một thành công/409, version +1, DB bằng payload thắng |
| Hold và đóng court | Một thắng/409; ACTIVE + một PENDING hoặc INACTIVE + zero PENDING |
| Hai booking reschedule một target | 200/409; đúng một CONFIRMED ở target; loser booking và history rollback |
| Expire rồi người khác giữ | Tick cron thật chuyển EXPIRED; hold sau không bị retry expire nhả nhầm; lịch sử không nhận deadline mới |

Các ID, status cụ thể và deadline cuối nằm trong `R` theo mã TC. Kết quả này là các race đã chạy, không phải kiểm thử tải hoặc chứng minh mọi tổ hợp concurrency.

## 7–8. Kiểm thử và build

| Bộ kiểm tra | Pass | Fail | Skip |
|---|---:|---:|---:|
| Frontend unit/API (`npm.cmd test --workspace client`) | **104** | 0 | 0 |
| Baseline hợp lệ TASK 1–4 giữ lại | 101 | 0 | 0 |
| Regression TASK 5 mới (validation/clock envelope) | 3 | 0 | 0 |
| Mock + HTTP fixture browser (`test:browser`) | **39** | 0 | 0 |
| Real HTTP/PostgreSQL checks | **19** | 0 | 0 |
| Real browser E2E checks | **15** | 0 | 0 |
| Tổng `test:real` ngoài payment Frontend | **34** | 0 | 0 |
| Backend regression chạy lại trên DB khác | **45** (38 integration + 7 unit) | 0 | 0 |
| `npm.cmd run check:server` | 43 file hợp lệ | 0 | 0 |
| Build mock `--outDir dist/mock` | Thành công | 0 | 0 |
| Build API `--outDir dist/api` | Thành công | 0 | 0 |

`git diff --check` và staged check được kiểm tra trước commit. Mock browser xác nhận không có request Backend và không có runtime exception. Real browser xác nhận **413 request qua proxy, 0 payment request, không mock store, 0 runtime exception**. HTTP fixture và real E2E được báo riêng.

Responsive: **33 lượt route/viewport**, bao phủ chín nhóm màn hình và các route login/register, catalogue/detail, schedule, checkout, history, manager, POS, requests, Admin; viewport 1365×950 / 820×1100 / 390×844. Mỗi lượt phải tải session hợp lệ và không tràn trang. Tab giữ focus trong modal, Escape đóng. Đồng hồ trình duyệt được làm lệch +2 giờ **trước mount** màn quản lý để xác nhận guard giá dùng giờ server. Lỗi đọc được tạo bằng browser offline, hiển thị lỗi kết nối và retry đọc thành công khi online lại.

Nhóm responsive dùng Express app instance mới cùng mã/DB/cron và limiter gốc, tách ngân sách auth khỏi nhóm functional. Không sửa/tắt limiter. HTTP 429 thật được tạo và xác nhận trên UI ở cuối nhóm.

## 9. Lỗi Frontend đã sửa

1. Validation metadata lệch Backend: tên sân 100 → **120**; địa chỉ 1–255 → **3–300**; kiểm tra chiều dài sau trim. Đồng bộ cả thuộc tính input và logic validation, có boundary test và request thực ở biên.
2. `readPages` làm mất `server_time`: giữ mốc của response cuối sau khi đọc hết trang, không đổi data array hay query.
3. Lịch manager dùng đồng hồ máy: resource hook cung cấp offset từ response, `ManagerSchedule` dùng server clock cho điều kiện chỉnh giá. Real browser xác nhận khi đồng hồ client lệch +2 giờ.

Không thay đổi Contract hoặc nới guard Backend. Lỗi selector/chờ trang và quota auth trong lần viết test được sửa ở harness; không bỏ assertion, không tính những lượt thất bại là PASS. Các kết quả bảng trên là lần nghiệm thu cuối đã pass.

## 10. Vấn đề cần TV1/TV2

Không có lỗi Backend nghiêm trọng hoặc blocker trong phạm vi test cuối. Không sửa mã Backend. Lỗi `forced audit failure` và `forced reschedule history failure` trong log regression là fault injection chủ đích của suite gốc để chứng minh rollback, không phải test fail.

## 11. Fixture và giới hạn

- **Qua UI/API hoàn toàn:** auth, catalogue, hold/deadline/reload, CRUD/sinh lịch/version, POS walk-in/extension, REPORT/reschedule/refund/status/review trên booking đủ điều kiện, Admin và kiểm tra read-back.
- **Chuẩn bị trực tiếp DB test:** booking ONLINE CONFIRMED + payment PAID có owner, ca quá khứ hợp lệ cho complete/review, HELD/BOOKED/UNAVAILABLE cho ca kế, deadline đã qua cho cron. Không dùng payment create/confirm để chuẩn bị Frontend fixture. Mọi insert/update tuân thủ constraint, không sửa seed/migration.
- TC-15/19 và một số kiểm tra DB-only dùng suite Backend gốc chạy lại; không gọi là browser E2E. Payment trong suite Backend là regression có sẵn, trên DB khác với UI.
- Không phải kiểm thử tải, bảo mật production, mọi tổ hợp trạng thái hoặc đa trình duyệt. TC-05 cần giờ Việt Nam có ca đang chạy; harness không báo PASS khi không có ca phù hợp.
- Giữ database/project sau test để review; không xóa volume hoặc dữ liệu cũ. JWT local, ảnh và log chỉ ở thư mục Git ignore.

## 12. Screenshot và bằng chứng local

Trong `client/test-artifacts/task5/`, không commit:

- `results.json`: kết quả cuối gồm version, database, actor, status, ID/deadline và evidence.
- `backend-regression.log`: 45/45 test Backend lần chạy cuối.
- `real-auth.png`, `real-venue.png`, `real-schedule.png`, `real-conflict.png`, `real-checkout.png`, `real-history.png`.
- `real-manager-generation.png`, `real-version-conflict.png`, `real-read-network-error.png`, `real-pos-extension.png`, `real-pos-history.png`, `real-complete.png`, `real-refund.png`, `real-admin-audit.png`, `real-rate-limit.png`.
- `real-{admin,manager1,customer,guest}-{index}-{desktop,tablet,mobile}.png`: 33 ảnh màn hình responsive.
- `backend.env`: cấu hình local, không chứa trong báo cáo/Git. Không chia sẻ file này.

Đã kiểm tra trực quan các ảnh đại diện và đối chiếu với assertion về tràn nội dung, trạng thái và dữ liệu thật.

## 13. Payment hoãn TASK 6

Giữ nguyên **`paymentEnabled=false`**. Bộ Frontend chặn request `/payments/create` và `/payments/confirm`, không tự chuyển PENDING thành CONFIRMED. PAID ở POS là thu tiền CASH/BANK_TRANSFER tại quầy, đúng phạm vi TASK 4–5. Refund chỉ là sandbox ghi nhận nghiệp vụ, không chuyển tiền thật. TC-03, TC-16 và phần payment TC-22 **DEFERRED_TO_TASK6**, dù Backend regression payment gốc đã pass.

## 14. Git và file thay đổi

Chỉ thay đổi trong `client/`; không đổi server, schema/migration/seed, API Contract, package-lock, Compose gốc hoặc tài liệu phân công. Không merge/rebase/reset/force push. Sparse Checkout giữ mở rộng `server` theo quyền TASK 5.

```text
Sửa:
client/package.json
client/src/api/pagination.js
client/src/components/manager/EntityForm.jsx
client/src/components/manager/ManagerSchedule.jsx
client/src/hooks/useManagerResource.js
client/src/utils/managerValidation.js

Tạo:
client/TASK5_REPORT.md
client/tests/integration-foundation.test.js
client/tests/real/README.md
client/tests/real/api.mjs
client/tests/real/browser.mjs
client/tests/real/chrome.mjs
client/tests/real/compose.task5.yml
client/tests/real/environment.mjs
client/tests/real/run.mjs
```

Bàn giao sau nghiệm thu ngoài payment: commit `fix(tv3): integrate frontend with backend and verify non-payment workflows`, push `origin/tv3/frontend-complete`, cập nhật mô tả [Draft PR #1](https://github.com/ThnhT4m/PTTKHTTT_Web/pull/1). SHA, push và `git status -sb` cuối được ghi trong PR/báo cáo chat; không tạo PR mới, Ready for review hoặc merge. Dừng sau TASK 5.
