# Cập nhật TASK 6.1

Website vận hành dùng sportbooking tại 5176; không dùng QA làm website. Harness mặc định ghi client/test-artifacts/task6.1/real/, từ chối ghi đè bằng chứng task5/task6 và từ chối DATABASE_URL/TEST_DATABASE_URL vận hành. Xem client/qa/HANDOVER.md cho lệnh hiện hành. Nội dung TASK 5 bên dưới là nền tảng harness; dùng đường dẫn bằng chứng TASK 6.1 cho lần chạy mới. TC-03/16/phần payment TC-22 là OUT_OF_SCOPE_TV3.

# TASK 5: real HTTP, browser và PostgreSQL 16

Bộ này khác `npm.cmd test --workspace client` (unit/mock/API adapter) và `test:browser` (mock + HTTP fixture).
Không sửa hoặc thêm endpoint Backend. Không gửi `/payments/create` hay `/payments/confirm` từ bộ kiểm thử Frontend.

## Chuẩn bị

Tại root repository, dùng Node 22+, Chrome/Edge và Docker Desktop đã chạy:

```powershell
git sparse-checkout add server
npm.cmd ci --ignore-scripts --no-audit --no-fund
$env:POSTGRES_PORT='55435'
docker compose -f docker-compose.yml -f client/tests/real/compose.task5.yml -p sportbooking-tv3-task5 up -d --wait db
npm.cmd run test:real --workspace client
```

Override chỉ cấu hình một subnet riêng cho project; không đổi Compose gốc. Nếu `10.242.5.0/24` đã được dùng, kiểm tra network/route và đặt `TASK5_SUBNET` sang subnet riêng khác chưa dùng. Không prune Docker hoặc xóa volume để giải quyết lỗi cấp subnet.

Mặc định PostgreSQL tại 127.0.0.1:55435, user/password demo của Compose. Có thể đặt `TASK5_DB_ADMIN_URL` trỏ đến database `postgres` của PostgreSQL **local dành riêng cho kiểm thử**, tài khoản có quyền CREATE DATABASE. Không dùng production. Harness từ chối host ngoài loopback và PostgreSQL khác major 16.

Mỗi lần chạy tạo **hai database mới** có tên `sportbooking_tv3_<run>_ui_test` và `..._backend_test`. Tên đã tồn tại làm CREATE thất bại; harness không DROP/TRUNCATE/reset database có sẵn. Database UI phải trống trước khi chạy migration/seed gốc. Database Backend mới là nơi suite Backend tự migrate/seed/reset như README dự án. Giữ cả hai DB sau chạy để đối chiếu; không có lệnh xóa volume/database tự động.

`client/test-artifacts/` phải được Git ignore trước khi chạy; harness kiểm tra điều này. Trong workspace hiện tại đã có ignore cục bộ. Máy mới có thể thêm `/client/test-artifacts/` vào `.git/info/exclude` hoặc cấu hình ignore cục bộ tương đương. Không commit cấu hình môi trường, ảnh hoặc log.

## Phân biệt các cấp kiểm thử

- `api.mjs`: dùng chính HTTP adapter/ApiError của Frontend gọi HTTP Backend thật, sau đó đối chiếu PostgreSQL. Có hai session customer độc lập và `Promise.allSettled` cho concurrency. Kết quả `REAL_HTTP_POSTGRESQL`.
- `browser.mjs` + `chrome.mjs`: Vite API mode trên 127.0.0.1:5175, proxy tới Backend thật, Chrome headless, không HTTP intercept hoặc mock store. Kết quả `REAL_BROWSER_E2E`. Chạy các luồng Customer, Manager, POS, hậu mãi và Admin, 33 lượt màn hình theo ba viewport, bàn phím và auth 429 thật.
- `run.mjs`: tạo môi trường, chạy hai bộ trên, chạy lại 45 test Backend trên DB khác, ghi kết quả đã loại JWT. Backend regression có các test payment sandbox sẵn có; đó **không phải nghiệm thu payment Frontend**. Backend phục vụ UI luôn `PAYMENT_SANDBOX_ENABLED=false`.
- `environment.mjs`: test setup an toàn, JWT secret ngẫu nhiên trong bộ nhớ/file local bị ignore, migration/seed chỉ trên DB mới, HTTP server và cron thật, đóng server/pool sau khi kết thúc.

Ảnh/log/kết quả trong `client/test-artifacts/task5/`. `results.json` chỉ ghi status, mã TC, actor, ID, mốc thời gian, trạng thái DB và request path/status; không ghi Authorization, mật khẩu hoặc JWT. `backend.env` chỉ dành local và không đưa lên Git.

Fixture trực tiếp DB chỉ dùng cho booking ONLINE CONFIRMED + payment PAID có owner, ca quá khứ hợp lệ, các trạng thái ca liền kề và deadline đã qua. Chúng được tạo đúng constraint trong DB mới, không gọi payment API, không thêm chức năng runtime. Các luồng còn lại chạy qua UI/API thực. Cron hết hạn được chờ tick thật; sau đó gọi job gốc để kiểm tra retry không giải phóng hold của khách sau.

TC-05 ca đang diễn ra cần giờ Việt Nam 06:00–22:00; kiểm tra ca đã kết thúc cần có ca trước đó trong ngày. Chạy ngoài điều kiện đó sẽ không được báo PASS. Cổng Frontend 5175 phải trống. Auth rate limit được thử ở cuối để không tác động các luồng trước.

Nhóm responsive dùng một Express app instance mới, cùng mã Backend/DB/cron và cùng cấu hình rate limit, để tách ngân sách 100 request auth khỏi nhóm functional. Không sửa hoặc tắt limiter; kiểm tra HTTP 429 thật vẫn chạy cuối nhóm này. Mỗi trang responsive phải có session user đã tải xong, tránh tính màn hình lỗi auth là một màn hình nghiệp vụ PASS.

## Bàn giao

Xem `client/TASK5_REPORT.md` cho ma trận TC-01–TC-22, kết quả thực tế, phiên bản và giới hạn. TC-03, TC-16 và phần payment TC-22 vẫn hoãn tới TASK 6 cho Frontend. Không dùng kết quả mock hoặc báo cáo Backend lịch sử thay cho một lần chạy real API/DB hiện tại.
