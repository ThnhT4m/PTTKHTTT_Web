# Lỗi Frontend TASK 6

Ngày 27/11/2026. Môi trường chung: Node 24.15.0, Vite 6.4.6, Chrome headless, API mode, PostgreSQL 16.16 local trên DB mới. Không tác động dữ liệu TASK 5. Các lỗi 001–004 có tái hiện FAIL trước sửa trong `../test-artifacts/task6/extended-before/checks.json`; 005–009 có bằng chứng screenshot/CSS/thuộc tính DOM và kiểm tra hồi quy riêng.

Tổng: **9 lỗi; P0=0, P1=0, P2=7, P3=2**. Trạng thái retest cuối xem FINAL_QA_REPORT.md và checks.json; không suy ra PASS từ việc đã sửa mã.

## FE-QA-001 — Giữ chỗ điều hướng lại sau khi khách đã rời trang

- Mức độ: P2. Route: `/courts/:id/schedule`. Role: CUSTOMER. Viewport tái hiện: 1366×768; lỗi chữ/vùng bấm thêm 360×800 và 390×844.
- Bước tái hiện: Giữ POST /bookings/online ở pha response sau khi Backend đã commit; bấm Khám phá sân rồi trả response.
- Mong muốn: Giữ nguyên route /venues do khách vừa chọn.
- Thực tế trước sửa: Route bị kéo sang /checkout/:id.
- Nguyên nhân: Schedule.jsx gọi navigate sau await mà không kiểm tra vòng đời/context.
- File: src/pages/customer/Schedule.jsx.
- Sửa: Kiểm tra mounted và context trước khi điều hướng; bỏ qua lỗi/state của trang đã rời.
- Bằng chứng trước: `client/test-artifacts/task6/extended-before/FE-QA-001.png`.
- Bằng chứng sau: `client/test-artifacts/task6/extended-after/FE-QA-001.png`.
- Retest: đối chiếu test ID FE-QA-001, QA-M3-GUARD, VIS-*; kết quả cuối ghi tại FINAL_QA_REPORT.md.

## FE-QA-002 — Checkout không xóa lỗi đọc đã phục hồi

- Mức độ: P2. Route: `/checkout/:bookingId`. Role: CUSTOMER. Viewport tái hiện: 1366×768; lỗi chữ/vùng bấm thêm 360×800 và 390×844.
- Bước tái hiện: Cho một lần polling trả 503; lần tiếp theo trả booking hợp lệ.
- Mong muốn: Thông báo lỗi cũ biến mất khi tải thành công.
- Thực tế trước sửa: Booking hiện đúng nhưng thông báo lỗi cũ vẫn còn.
- Nguyên nhân: Nhánh thành công chỉ cập nhật booking và offset.
- File: src/pages/customer/Checkout.jsx.
- Sửa: Xóa error khi nhận response hợp lệ.
- Bằng chứng trước: `client/test-artifacts/task6/extended-before/FE-QA-002.png`.
- Bằng chứng sau: `client/test-artifacts/task6/extended-after/FE-QA-002.png`.
- Retest: đối chiếu test ID FE-QA-002, QA-M3-GUARD, VIS-*; kết quả cuối ghi tại FINAL_QA_REPORT.md.

## FE-QA-003 — Biểu mẫu quản lý nhận submit lặp trong cùng lượt xử lý

- Mức độ: P2. Route: `/manager/venues`. Role: VENUE_MANAGER. Viewport tái hiện: 1366×768; lỗi chữ/vùng bấm thêm 360×800 và 390×844.
- Bước tái hiện: Điền cơ sở mới; gọi requestSubmit hai lần liên tiếp trong khi response POST bị giữ.
- Mong muốn: Chỉ một request ghi được gửi.
- Thực tế trước sửa: Hai POST được gửi; PostgreSQL có thể tạo hai cơ sở.
- Nguyên nhân: busy là React state; handler thứ hai vẫn đọc giá trị cũ trước render. Generate/Price có cùng mẫu kỹ thuật.
- File: src/components/manager/{EntityForm,GenerateModal,ManagerSchedule}.jsx.
- Sửa: Dùng ref khóa đồng bộ trước await; luôn mở khóa finally.
- Bằng chứng trước: `client/test-artifacts/task6/extended-before/FE-QA-003.png`.
- Bằng chứng sau: `client/test-artifacts/task6/extended-after/FE-QA-003.png`.
- Retest: đối chiếu test ID FE-QA-003, QA-M3-GUARD, VIS-*; kết quả cuối ghi tại FINAL_QA_REPORT.md.

## FE-QA-004 — Mất response sau ghi thành công vẫn cho gửi lại không cảnh báo

- Mức độ: P2. Route: `/manager/venues`. Role: VENUE_MANAGER. Viewport tái hiện: 1366×768; lỗi chữ/vùng bấm thêm 360×800 và 390×844.
- Bước tái hiện: Cho Backend tạo cơ sở thành công rồi làm mất response bằng CDP ConnectionClosed.
- Mong muốn: Cảnh báo kết quả chưa xác định và yêu cầu tải lại danh sách trước thao tác mới.
- Thực tế trước sửa: Form giữ dữ liệu và bật lại nút lưu; có thể tạo cơ sở trùng.
- Nguyên nhân: Không phân biệt network/5xx với lỗi validation có kết quả chắc chắn.
- File: src/components/manager/{EntityForm,GenerateModal,ManagerSchedule}.jsx.
- Sửa: Đánh dấu unknown, khóa biểu mẫu/nút gửi; vẫn đóng được bằng nút X, tải lại dữ liệu để đối chiếu.
- Bằng chứng trước: `client/test-artifacts/task6/extended-before/FE-QA-004.png`.
- Bằng chứng sau: `client/test-artifacts/task6/extended-after/FE-QA-004.png`.
- Retest: đối chiếu test ID FE-QA-004, QA-M3-GUARD, VIS-*; kết quả cuối ghi tại FINAL_QA_REPORT.md.

## FE-QA-005 — Thông báo checkout hẹn payment ở TASK 6 không còn đúng phạm vi

- Mức độ: P3. Route: `/checkout/:bookingId`. Role: CUSTOMER. Viewport tái hiện: 1366×768; lỗi chữ/vùng bấm thêm 360×800 và 390×844.
- Bước tái hiện: Mở booking PENDING; đọc notice thanh toán.
- Mong muốn: Nêu rõ thanh toán chưa khả dụng và ngoài phạm vi nghiệm thu này.
- Thực tế trước sửa: Thông báo cũ hẹn hoàn thiện payment ở TASK 6.
- Nguyên nhân: Copy từ checkpoint cũ.
- File: src/pages/customer/Checkout.jsx; tests/browser.mjs.
- Sửa: Sửa nội dung và assertion tương ứng; giữ paymentEnabled=false.
- Bằng chứng trước: `client/test-artifacts/task6/extended-before/FE-QA-002.png`.
- Bằng chứng sau: `client/test-artifacts/task6/extended-after/checkout-accessible-timer.png`.
- Retest: đối chiếu test ID FE-QA-005, QA-M3-GUARD, VIS-*; kết quả cuối ghi tại FINAL_QA_REPORT.md.

## FE-QA-006 — Countdown là vùng live cập nhật liên tục

- Mức độ: P2. Route: `/checkout/:bookingId`. Role: CUSTOMER. Viewport tái hiện: 1366×768; lỗi chữ/vùng bấm thêm 360×800 và 390×844.
- Bước tái hiện: Mở booking PENDING; kiểm tra aria-live và thay đổi countdown mỗi giây.
- Mong muốn: Giá trị timer có thể đọc khi cần, không phát thông báo mỗi giây.
- Thực tế trước sửa: aria-live=polite bao quanh timer thay đổi liên tục.
- Nguyên nhân: Cấu hình accessibility của countdown.
- File: src/pages/customer/Checkout.jsx.
- Sửa: Dùng role=timer, aria-live=off; cảnh báo hết hạn riêng vẫn được giữ.
- Bằng chứng trước: `client/test-artifacts/task6/inventory.json + git show HEAD:client/src/pages/customer/Checkout.jsx`.
- Bằng chứng sau: `client/test-artifacts/task6/extended-after/checkout-accessible-timer.png`.
- Retest: đối chiếu test ID FE-QA-006, QA-M3-GUARD, VIS-*; kết quả cuối ghi tại FINAL_QA_REPORT.md.

## FE-QA-007 — Chữ phụ quá nhạt và chữ lịch quản lý mobile quá nhỏ

- Mức độ: P2. Route: `/venues/:id; /checkout/:id; /manager/venues`. Role: ALL. Viewport tái hiện: 1366×768; lỗi chữ/vùng bấm thêm 360×800 và 390×844.
- Bước tái hiện: Mở tên dài ở mobile 360; xem nhãn tóm tắt, placeholder/hint và lịch quản lý.
- Mong muốn: Nhãn, thời gian và giá đọc được trên nền sáng.
- Thực tế trước sửa: Nhãn tóm tắt 2.77:1; hint 2.97:1; placeholder 2.01:1 trên nền trắng; giờ ca quản lý 9px ở mobile.
- Nguyên nhân: Các màu nhạt/cỡ chữ từ CSS gốc.
- File: src/styles/app.css.
- Sửa: Tăng tương phản chữ phụ; nâng cỡ chữ quản lý; lịch quản lý mobile 2 cột; date filter có bề rộng tối thiểu.
- Bằng chứng trước: `client/test-artifacts/task6/contrast-before.json; visual-before/visual-venue-360.png; visual-before/manager-small-text.png`.
- Bằng chứng sau: `client/test-artifacts/task6/extended-after/visual-venue-360.png; extended-after/visual-manager-schedule-360.png`.
- Retest: đối chiếu test ID FE-QA-007, QA-M3-GUARD, VIS-*; kết quả cuối ghi tại FINAL_QA_REPORT.md.

## FE-QA-008 — Vùng bấm icon và một số thao tác quản lý nhỏ

- Mức độ: P3. Route: `Header; modal; bảng quản lý`. Role: ALL. Viewport tái hiện: 1366×768; lỗi chữ/vùng bấm thêm 360×800 và 390×844.
- Bước tái hiện: Đo bounding box nút icon đăng xuất/đóng modal và nút bảng tại mobile.
- Mong muốn: Mục tiêu bấm ổn định tối thiểu 44px cho các control được sửa.
- Thực tế trước sửa: Icon 34px; một số nút bảng quản lý min-height 29px.
- Nguyên nhân: Kích thước CSS mặc định/mobile.
- File: src/styles/app.css.
- Sửa: Icon 44×44; nút modal/bảng và sidebar min-height 44px; không thay nhận diện.
- Bằng chứng trước: `client/test-artifacts/task6/visual-before/visual-venue-360.png; git show HEAD:client/src/styles/app.css`.
- Bằng chứng sau: `client/test-artifacts/task6/extended-after/focus-trap.png; extended-after/visual-manager-modal-360.png`.
- Retest: đối chiếu test ID FE-QA-008, QA-M3-GUARD, VIS-*; kết quả cuối ghi tại FINAL_QA_REPORT.md.

## FE-QA-009 — Trang công khai hiển thị như Guest khi không xác minh được phiên

- Mức độ: P2. Route: `/venues; route công khai`. Role: CUSTOMER/manager/admin có token. Viewport tái hiện: 1366×768; lỗi chữ/vùng bấm thêm 360×800 và 390×844.
- Bước tái hiện: GET /auth/me trả 503 hoặc chạm limiter xác thực trong chuỗi refresh; mở route công khai.
- Mong muốn: Thông báo lỗi xác minh phiên và có nút thử lại, bảo toàn token khi không phải 401.
- Thực tế trước sửa: Header hiện Đăng nhập dù token còn; không có cách phục hồi phiên trên trang công khai.
- Nguyên nhân: UserMenu chỉ phân nhánh theo user, bỏ qua loading/sessionError.
- File: src/layouts/Layouts.jsx; src/styles/app.css.
- Sửa: Hiển thị kiểm tra phiên/lỗi và retrySession; không xóa token khi 503.
- Bằng chứng trước: `client/test-artifacts/task6/visual-before/session-unavailable.png + lỗi chờ logout trong lượt QA sơ bộ`.
- Bằng chứng sau: `client/test-artifacts/task6/extended-after/session-unavailable.png`.
- Retest: đối chiếu test ID FE-QA-009, QA-M3-GUARD, VIS-*; kết quả cuối ghi tại FINAL_QA_REPORT.md.

## Ghi chú harness

Các lượt chuẩn bị đã sửa selector label (chỉ đọc field__label, không đọc toàn bộ option), chờ render/debounce trước assertion, tách fault venue khỏi request courts, và tách lỗi CDP do request đã bị hủy khỏi Runtime.exceptionThrown. Không bỏ assertion nghiệp vụ. App instance mới cho từng nhóm ảnh chỉ tách ngân sách auth 100 request/15 phút; không sửa/tắt limiter. HTTP 429 thật vẫn chạy ở bộ real regression.

Ba import không dùng (Empty, PAGE_SIZE, Field) được bỏ khi rà soát; không thay API/nghiệp vụ.

## TASK 6.1 — FE-QA-010 / P2: dữ liệu dài không có khoảng trắng gây tràn

Route: /venues/:id, /my-bookings (list/modal), /manager/venues, audit /admin. Role: CUSTOMER, Manager, Admin. API mode/Chrome/PostgreSQL QA mới. Bước: tạo tên 150/120, địa chỉ 300, mô tả 2000 ký tự hợp lệ có đoạn liền dài; mở trên năm viewport. Mong muốn: không tràn trang, giá/CTA truy cập được, nhãn không bị ép từng chữ. Trước sửa: 17/25 FAIL, trang chi tiết mobile tràn tới 2.660px. Nguyên nhân min-content/flex/grid chưa co và chuỗi không có cơ hội ngắt. File: src/styles/app.css. Sửa overflow-wrap:anywhere, min-width:0, giữ khối giá/CTA, cột dt/dd cân đối; không đổi validation và không overflow-x:hidden toàn trang. Retest: 25/25 PASS, đã xem ảnh 5 state × 5 viewport. Evidence: test-artifacts/task6.1/long-{before,after}/long-checks.json và PNG. Dữ liệu A/B/S/M/N chỉ có trong QA.

## TASK 6.1 — FE-QA-011 / P2: cache khác phiên trên cùng route

Route: public /venues/:id và /manager/venues. Bước: Manager mở cơ sở INACTIVE rồi đổi token qua storage event sang Customer, không rời route; kiểm tra thêm Manager1 → Manager2 cùng route quản lý. Mong muốn: bỏ dữ liệu scope cũ ngay lập tức, tải lại theo user/role mới. Trước sửa Customer vẫn thấy tên/mô tả cơ sở từ cache Manager dù API không cho đọc. Nguyên nhân khóa resource chỉ gồm path/deps, không gồm phiên user/role. File: hooks/useCustomerResource.js, hooks/useManagerResource.js. Sửa khóa scope và mask dữ liệu khác identity, cancel/ignore response cũ. Retest PASS cả hai tình huống; Customer nhận lỗi quyền và không thấy dữ liệu cũ, Manager2 chỉ thấy cơ sở của mình. Evidence: test-artifacts/task6.1/scope-{before,after}/scope-result.json và PNG.

Nguồn dữ liệu website đã chuyển từ QA sang sportbooking; đây là thay đổi cấu hình môi trường theo TASK 6.1, không lọc ẩn tên bản ghi. Người dùng chọn giữ 3 audit chuẩn hóa mô tả seed gốc để bảo toàn lịch sử; không nhập audit QA.
