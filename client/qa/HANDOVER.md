# Bàn giao môi trường vận hành Sân Nhà — TASK 6.1

Website review hiện dùng **database sportbooking**, API thật, tại **http://127.0.0.1:5176**. API ở 127.0.0.1:4006. Không dùng database QA để phục vụ website.

## Thiết lập lần đầu trên máy thành viên khác

Chuẩn bị Git, Node.js 22+, npm và Docker Desktop/Compose. `ops:start` dùng PowerShell/CIM trên Windows; đường dẫn repository được suy ra từ vị trí script, không phụ thuộc tên người dùng hoặc thư mục máy bàn giao. Checkout nhánh `tv3/frontend-complete`; cần có `client/`, `docs/`, `server/` và file cấp gốc. Nếu clone đang sparse thì chủ máy bổ sung `server/` theo hướng dẫn nhóm; không chạy runner khi thiếu mã Backend gốc.

Tại root repository trên máy mới:

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
$env:POSTGRES_PORT='55435'
docker compose -f docker-compose.yml -f client/tests/real/compose.task5.yml -p sportbooking-tv3-task5 up -d --wait db
$opsConnection = Read-Host 'DATABASE_URL PostgreSQL local cho database sportbooking, cổng 55435' -AsSecureString
$env:DATABASE_URL = [System.Net.NetworkCredential]::new('', $opsConnection).Password
npm.cmd run ops:bootstrap --workspace client
Remove-Item Env:DATABASE_URL
npm.cmd run ops:start --workspace client
npm.cmd run ops:status --workspace client
```

Nhập URL dạng `postgres://DB_USER:DB_PASSWORD@127.0.0.1:55435/sportbooking`; thay bằng thông tin của Compose nhóm hoặc tài khoản PostgreSQL local được cấp. Không nhập giá trị placeholder nguyên văn. Bootstrap tự sinh JWT secret ngẫu nhiên và ghi cấu hình vào `client/.local/operations.env`, không cần sao chép secret từ máy bàn giao. Nếu subnet Docker bị trùng, chọn `TASK5_SUBNET` chưa dùng theo `client/tests/real/README.md`; không xóa network/volume khác.

Trên database trống, bootstrap chạy migration/seed gốc một lần. Nếu database đã có bảng, bootstrap **không migrate/seed/reset**; cần schema đủ 10 bảng trước khi start. Không dùng các lệnh seed/reset để sửa database đang có dữ liệu. Giữ `operations.env` riêng của máy đó; restart sau này chỉ dùng các lệnh ở phần dưới.

Dependencies từ package-lock cấp gốc gồm các thư viện Backend mà runner cần; đây là hướng dẫn cài máy mới, không thay package-lock hay mã Backend. `client/.local/`, database dump, ảnh và log không đi cùng checkpoint GitHub. Database mới nhận danh mục seed gốc; bộ 5 cơ sở/11 sân trong báo cáo là dữ liệu đã lưu trên máy bàn giao, không tự được chuyển khi clone. Sau khi start, có thể chủ động chạy `node --env-file=client/.local/operations.env client/scripts/operations/catalog.mjs` để bổ sung danh mục Bình Tân qua API; Tân Bình được thêm qua giao diện Manager. Không chạy `acceptance.mjs` để làm đầy dữ liệu.

macOS/Linux có thể chạy foreground bằng `node --env-file=client/.local/operations.env client/scripts/operations/run.mjs` sau khi tự cấu hình PostgreSQL và môi trường. Bộ lệnh quản lý PID `ops:start/status/stop` và kiểm thử của checkpoint này được nghiệm thu trên Windows; chưa tuyên bố hỗ trợ các lệnh CIM trên hệ điều hành khác.

## Khởi động lại

Từ root repository, mở Docker Desktop và PowerShell:

```powershell
$env:POSTGRES_PORT='55435'
docker compose -f docker-compose.yml -f client/tests/real/compose.task5.yml -p sportbooking-tv3-task5 up -d --wait db
npm.cmd run ops:start --workspace client
npm.cmd run ops:status --workspace client
```

Giữ project/volume hiện có: **sportbooking-tv3-task5_sportbooking_pgdata**. Tên Docker project có chữ task5 do lịch sử tạo container; database website là sportbooking, tách riêng các database sportbooking_tv3_*_test. Không chạy down -v, truncate/reset hoặc seed lại để khởi động website.

Các lệnh vận hành:

```powershell
npm.cmd run ops:restart-backend --workspace client
npm.cmd run ops:restart-frontend --workspace client
npm.cmd run ops:stop --workspace client
```

Backend và Frontend là hai worker độc lập, chạy ẩn. manage.mjs xác minh PID, tên tiến trình, đường dẫn script và loại worker trước khi dừng; từ chối thay tiến trình lạ đang dùng cổng. Không dừng Docker khi chỉ cần restart ứng dụng. Trên máy có hạn chế truy cập CIM/process, chạy các lệnh quản lý trong phiên PowerShell được cấp quyền tương ứng.

Cấu hình riêng ở **client/.local/operations.env**; PID/log ở client/.local/{backend,frontend}.{pid,log}. File chứa DATABASE_URL và JWT_SECRET ngẫu nhiên, bị Git ignore. Không sao chép secret vào mã nguồn hoặc tài liệu. Giữ nguyên file này để phiên đăng nhập không bị mất chỉ vì restart Backend. Frontend worker ép API mode và API base /api, proxy nội bộ tới Backend gốc. Payment online tiếp tục tắt.

Lệnh ops:bootstrap **chỉ dành khởi tạo lần đầu database sportbooking trống**. Đã thực hiện ở workspace này. Khi đã có bất kỳ bảng nào, script không migrate/seed/ghi lại dữ liệu; runtime không import bootstrap hoặc seed. Seed gốc có thao tác truncate nên tuyệt đối không gọi seed gốc thủ công trên database có dữ liệu.

## Danh mục và nguồn gốc

- 5 cơ sở: Thể thao Thủ Đức, Thể thao Bình Thạnh, Thể thao Quận 7, Sân Nhà Bình Tân, Sân Nhà Tân Bình.
- 11 sân, đủ FOOTBALL/BADMINTON/TENNIS/PICKLEBALL/BASKETBALL; 5 khu vực.
- Giá minh họa cho đồ án: cầu lông 80.000–90.000; pickleball 160.000; tennis 200.000–220.000; bóng rổ 180.000; bóng đá mặc định 300.000 VND/giờ. Một ca 21:00–22:00 ngày 28/11/2026 được quản lý chỉnh thành 320.000 VND để nghiệm thu đồng bộ giá.
- 5.472 slot lưu trong PostgreSQL, 16 ca/ngày/sân, 06:00–22:00. Seed gốc có lịch từ hôm trước đến 30 ngày tiếp theo; sân bổ sung sinh 30 ngày bằng API. Không seed mỗi khi mở website. Khi sắp hết khoảng lịch, quản lý dùng Sinh lịch sân; Backend giữ nguyên ca đã tồn tại.
- Giữ một booking ONLINE chưa thanh toán do khách demo thao tác nghiệm thu. Deadline do Backend quản lý; sau hết hạn booking chuyển EXPIRED và ca được giải phóng theo cron. Bản ghi vẫn tồn tại để chứng minh dữ liệu bền vững.
- Không tạo payment, doanh thu, refund hoặc review giả trong database vận hành. Các luồng PAID/POS/refund/review được kiểm thử trên QA riêng.
- Đây là danh mục minh họa phục vụ đồ án, không phải xác minh cơ sở thương mại hay báo giá thị trường. Seed/migration gốc giữ nguyên. Phần mô tả tự nhiên, cơ sở/sân bổ sung và chỉnh giá được ghi qua API/UI thật. Manifest nguồn gốc: client/.local/catalog-provenance.json và client/test-artifacts/task6.1/operational/summary.json.

Các tên T5/QA/Fixture và giao dịch kỹ thuật ở website trước thuộc database sportbooking_tv3_1795754409141_6ab3ea_ui_test. Database đó được giữ nguyên, không lọc ẩn tên bản ghi ở Frontend. Chuyển DATABASE_URL là cách loại chúng khỏi website.

Ba audit khởi tạo mô tả cơ sở có before_data chứa mô tả seed gốc (dữ liệu mẫu/kiểm thử quyền sở hữu). Chúng không được import từ QA. Người dùng đã quyết định giữ nguyên đúng 3 audit này để bảo toàn lịch sử khởi tạo. Không xóa/sửa/che ở Frontend. Chi tiết và ID nằm trong TASK6_1_REPORT.md và audit-decision.json.

## Tài khoản đồ án

| Role | Email | Mật khẩu demo |
|---|---|---|
| CUSTOMER | customer@example.com | Demo@12345 |
| CUSTOMER thứ hai | customer2@example.com | Demo@12345 |
| VENUE_MANAGER | manager1@example.com | Demo@12345 |
| VENUE_MANAGER cơ sở khác | manager2@example.com | Demo@12345 |
| ADMIN | admin@example.com | Demo@12345 |

Manager1: Thủ Đức, Quận 7, Tân Bình. Manager2: Bình Thạnh, Bình Tân. Đây là tài khoản seed công khai dùng cho đồ án local.

## Phân biệt vận hành, QA và mock

| Môi trường | Nguồn | Ghi dữ liệu | Dùng phục vụ website |
|---|---|---|---|
| Vận hành đồ án | sportbooking, PostgreSQL 16/volume bền vững | Qua Backend gốc | 5176 |
| QA | sportbooking_tv3_<timestamp>_<random>_ui_test và _backend_test | Fixture, concurrency, reset chỉ trên DB mới | Harness 5175 tạm thời; đóng sau test |
| Mock | localStorage sportbooking.mock.* theo profile trình duyệt | Mô phỏng độc lập | Chỉ khi VITE_DATA_MODE=mock |

Guard chặn DATABASE_URL/TEST_DATABASE_URL trỏ database vận hành hoặc host không thuộc loopback. Bootstrap QA chỉ kết nối postgres để CREATE DB mới; seed chỉ sau khi xác minh DB mới/trống. Backend regression nhận URL _backend_test mới và được kiểm tra lần nữa trước spawn. Harness từ chối ghi bằng chứng vào task5/task6; mặc định hiện là task6.1. Không dùng client/tests/qa/review.mjs với env QA nữa; entry cũ chuyển sang runner vận hành và từ chối database QA.

## Kiểm thử lại

Chạy các bộ browser/real/QA **tuần tự**, cổng 5175 phải trống. Không dùng operations.env để chạy test:

```powershell
npm.cmd test --workspace client
npm.cmd run test:browser --workspace client
$env:SPORTBOOKING_QA='task6.1'
$env:SPORTBOOKING_QA_SUITE='real'
npm.cmd run test:real --workspace client
npm.cmd run test:qa --workspace client
npm.cmd run test:qa:edges --workspace client
npm.cmd run test:qa:long --workspace client
npm.cmd run test:qa:scope --workspace client
$env:VITE_DATA_MODE='mock'
npm.cmd run build --workspace client
$env:VITE_DATA_MODE='api'
npm.cmd run build --workspace client
git diff --check
```

Bằng chứng mới ở client/test-artifacts/task6.1/. test:real bao gồm 45 Backend regression trên DB khác mới. Mock không thay kiểm tra concurrency PostgreSQL. test:qa:long tạo chuỗi biên A/B/S/N/M chỉ trên DB QA, tuyệt đối không trên sportbooking. acceptance.mjs là nghiệm thu vận hành có ghi danh mục/giữ chỗ có ý nghĩa; không đưa vào regression tự động hoặc chạy lặp để làm đầy dữ liệu.

Mock độc lập khi cần:

```powershell
$env:VITE_DATA_MODE='mock'
npm.cmd run dev --workspace client -- --host 127.0.0.1
```

## Sao lưu và khôi phục

Đã lưu dump PostgreSQL định dạng custom trong client/.local/backups/ và snapshot sportbooking trống trước khởi tạo. Đường dẫn/hash backup mới nhất ở client/test-artifacts/task6.1/backup.json. Backup có dữ liệu và hash mật khẩu, là file riêng tư bị ignore. Không commit/upload.

Tạo backup mới bằng lệnh rõ ràng:

```powershell
node --env-file=client/.local/operations.env client/scripts/operations/audit.mjs
```

Script kiểm kê chỉ đọc, kiểm tra toàn vẹn rồi pg_dump; không restore/drop/reset. Khi cần khôi phục, tạo database phục hồi khác và kiểm tra dump trước, không ghi đè sportbooking hoặc các DB bằng chứng nếu chưa có quyết định của người dùng. Thay cấu hình kết nối chỉ sau khi xác nhận đúng môi trường.

## Giới hạn và bàn giao

Payment online giữ paymentEnabled=false; không gọi create/confirm. TC-03/16/phần payment TC-22 OUT_OF_SCOPE_TV3. Chưa kiểm toán WCAG, trình đọc màn hình hoặc thiết bị iOS/Safari thật; zoom 200% ở bộ QA là mô phỏng reflow. Dữ liệu mô tả dài hợp lệ được ngắt dòng, giữ nguyên validation; bảng cuộn ngang trong vùng bảng, không dùng overflow-x:hidden toàn trang.

Checkpoint TASK 6/6.1 được bàn giao trên nhánh `tv3/frontend-complete` theo yêu cầu người dùng; xem commit mới nhất của nhánh và Draft PR #1. Báo cáo nghiệm thu lưu trạng thái tại thời điểm trước checkpoint Git. PR giữ Draft, chưa merge; Payment online chờ thành viên Backend phụ trách và sẽ có một vòng tinh chỉnh nội dung/UX sau tích hợp Payment.
