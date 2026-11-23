# Kịch bản nghiệm thu

Tài liệu mô tả điều kiện phải đạt. Chỉ đánh dấu pass khi đã chạy và có bằng chứng; không mặc định toàn bộ tính năng đã được nghiệm thu vì mã nguồn tồn tại. Tạo `sportbooking_test` một lần bằng `docker compose exec -T db createdb -U sportbooking sportbooking_test`, sau đó chạy test tự động tại root bằng `npm test`. Có thể cấu hình `TEST_DATABASE_URL` với tên database kết thúc `_test`; suite tự migrate/seed và reset dữ liệu test. Test giao dịch cần PostgreSQL thật và cơ sở dữ liệu kiểm thử riêng. Đợt này chỉ nghiệm thu backend; `npm run test:unit` kiểm tra lịch không cần DB, `npm run check:server` kiểm tra cú pháp. Frontend nằm ngoài phạm vi thay đổi.

## Chuẩn bị

- Chạy migration/seed trên DB phát triển/kiểm thử; không dùng dữ liệu cần giữ vì seed reset toàn bộ dữ liệu demo.
- Có customer và customer2; manager1 quản lý Thủ Đức/Quận 7, manager2 quản lý Bình Thạnh; admin có quyền cao nhất. Mật khẩu demo trong README.
- Lịch có từ hôm qua đến 30 ngày sau; chọn slot tương lai để test online, slot đã qua để test complete và slot đang diễn ra để test walk-in.
- Test mốc thời gian phải dựa vào giờ server/DB; không chỉ chỉnh đồng hồ trình duyệt.
- Với test concurrency, gửi request đồng thời bằng `Promise.all` hoặc hai phiên khách riêng. Xem kết quả DB sau khi tất cả request kết thúc.

Mỗi lần chạy ghi: mã TC, phiên bản commit, DB/Node, thời gian, actor/ID slot, HTTP response, dữ liệu trước/sau, pass/fail và người chạy. Che JWT/mật khẩu khi lưu bằng chứng.

## TC-01 — hai khách đặt cùng slot

1. Chọn AVAILABLE slot tương lai đủ lead time, venue/court ACTIVE.
2. Dùng customer và customer2 gọi đồng thời `POST /bookings/online` với cùng time_slot_id.
3. Đọc booking/slot trong DB sau khi hai request hoàn tất.

Kỳ vọng: đúng một request thành công, request kia 409. Có đúng một PENDING booking chiếm slot; slot HELD, deadline đúng cấu hình cơ sở. Không có hai booking active hoặc payment tự tạo ngoài luồng.

## TC-02 — hết hạn giữ chỗ

1. Tạo hold hợp lệ. Chờ đến quá hạn hoặc dùng fixture DB kiểm thử để tạo deadline đã qua.
2. Chạy job expire hoặc chờ tick tối đa 30 giây.
3. Gọi lại job để kiểm tra tính ổn định.

Kỳ vọng: booking EXPIRED; slot AVAILABLE và held_until null; không ảnh hưởng BOOKED/UNAVAILABLE hoặc hold chưa tới hạn. Gọi lại không tạo thay đổi sai. Cấu hình hold 1, 5, 10 phút đều dựa deadline của từng slot.

## TC-03 — payment atomic và idempotent

1. Hold một slot, tạo payment attempt.
2. Confirm transaction_code trước held_until.
3. Confirm lại cùng code, kể cả gửi hai request đồng thời.

Kỳ vọng: payment PAID, booking CONFIRMED, slot BOOKED, held_until null; commit cùng nhau. Chỉ một PAID payment/booking, không ghi trùng khi callback lặp. Customer khác không confirm được code này. Sau deadline, confirm bị từ chối dù cron chưa chạy.

## TC-04 — lead time và cấu hình hold

1. Thử online khi chỉ còn dưới 10 phút đến start_at.
2. Đặt ở cơ sở hold 5 phút, so sánh held_until với server_time.
3. PATCH payment_hold_minutes=15, 0, số thập phân; sau đó thử giá trị 1 và 10.

Kỳ vọng: sát giờ bị từ chối, không tạo booking/hold. Hold 5 phút chênh khoảng 300 giây, sai số chỉ do thời gian xử lý. Giá trị ngoài integer 1–10 trả 400, dữ liệu DB không đổi. Lead time tối thiểu của base là 10 phút; giờ ngày được hiểu theo Việt Nam.

## TC-05 — walk-in ca đang diễn ra

1. Chọn ca AVAILABLE 07:00–08:00 trong fixture mà server đang ở 07:30.
2. Manager đúng cơ sở tạo walk-in CASH hoặc BANK_TRANSFER.
3. Thử lại cùng slot; thử slot đã qua end_at.

Kỳ vọng: lượt đầu tạo CONFIRMED + BOOKED + PAID trong transaction, customer_id có thể null nhưng có tên khách. Lượt lặp hoặc ca đã hết bị từ chối. Manager cơ sở khác nhận 403.

## TC-06 — extension đúng ca liền kề

1. Có booking CONFIRMED tại ca 18:00–19:00.
2. Đặt lần lượt trạng thái ca 19:00–20:00 thành HELD, BOOKED, UNAVAILABLE trong fixture phù hợp và thử extend.
3. Với một fixture mới, để ca liền kề AVAILABLE và extend.

Kỳ vọng: các trạng thái bị chiếm/khóa trả conflict và không tạo đơn mới. AVAILABLE tạo đơn EXTENSION trỏ parent_booking_id, payment tại quầy và BOOKED. Không nhảy qua ca 19:00–20:00 để chọn 20:00–21:00. Mỗi booking được complete riêng.

## TC-07 — dời lịch và quyền refund của khách

1. Chủ đơn CONFIRMED dời sang slot tương lai cùng cơ sở, cùng môn, cùng giá, còn AVAILABLE.
2. Thử đích đã BOOKED; thử khác cơ sở, khác môn, khác giá.
3. Manager báo sự cố trên một đơn khác; chủ đơn dời với is_venue_issue=true.
4. Khách thử yêu cầu refund khi chưa được báo sự cố.

Kỳ vọng: dời tự nguyện mở slot cũ AVAILABLE; dời do sự cố để slot cũ UNAVAILABLE. Slot mới BOOKED, booking đổi tham chiếu, có lịch sử old/new/reason/actor. Đích không phù hợp hoặc đã chiếm bị từ chối, dữ liệu cũ nguyên vẹn. Refund khi chưa có sự cố bị từ chối; không có endpoint tự hủy đòi tiền.

## TC-08 — hoàn tiền đủ bốn bước

1. Manager báo sự cố REPORT, xác minh issue trên đơn và slot UNAVAILABLE.
2. Chủ đơn refund-request, hoặc manager tạo yêu cầu bằng action REFUND.
3. Thử nhảy REQUESTED → COMPLETED: phải bị từ chối.
4. Duyệt APPROVED: server ghi APPROVED rồi tự chuyển PROCESSING, có audit cả hai.
5. Manager xác nhận COMPLETED; thử quay lui trạng thái.

Kỳ vọng: tối đa một refund/booking; đủ chuỗi audit REQUESTED → APPROVED → PROCESSING → COMPLETED. Hoàn tất chuyển payment REFUNDED, booking CANCELLED_BY_VENUE, slot vẫn UNAVAILABLE trong một transaction. Không có COMPLETE khi chưa PROCESSING, không quay lui. Hoàn tiền sandbox chỉ ghi nhận nghiệp vụ, không chuyển tiền thật.

## TC-09 — complete và review

1. Với booking CONFIRMED chưa end_at, manager thử complete.
2. Với booking đã hết giờ, manager complete; gọi lại.
3. Chủ đơn gửi review 1–5; gửi lần hai; customer khác thử gửi.
4. Thử rating 0/6/số thập phân và review trên đơn chưa COMPLETED.

Kỳ vọng: chưa hết giờ không complete; hết giờ chuyển COMPLETED và slot vẫn BOOKED. Gọi complete lại thành công, không ghi trùng. Chỉ chủ đơn COMPLETED review được, đúng một review/booking. Rating không hợp lệ trả 400, sai chủ trả 403.

## TC-10 — cách ly quyền sở hữu

Dùng manager1 với venue/court/slot/booking/refund thuộc Bình Thạnh của manager2:

- PATCH metadata venue/court.
- Tạo court, walk-in, complete, extension.
- Reschedule, venue-issue, duyệt/hoàn refund.
- Đọc list/detail quản lý và tìm khả năng lộ dữ liệu ngoài phạm vi.

Kỳ vọng: mutation ngoài phạm vi trả 403 và không đổi DB. List quản lý chỉ gồm dữ liệu được phép. ADMIN vẫn được truy cập nhưng phải giữ mọi ràng buộc nghiệp vụ. Đổi ID trong URL/body không vượt ownership.

## Kiểm thử bổ sung theo PDF mới và kiểm soát dữ liệu

| Mã | Cách chạy | Kỳ vọng |
|---|---|---|
| TC-11: trạng thái theo quyền | Manager PATCH metadata kèm status/gọi API admin bị từ chối; gọi `/courts/:id/status` của mình hợp lệ, cơ sở khác 403 | Version/reason/audit và guard booking áp dụng cho cả manager/admin |
| TC-12: admin audit | ADMIN đổi trạng thái hợp lệ với reason và version hiện tại; thử thiếu reason | Hợp lệ tăng version và có actor/before/after/reason; thiếu lý do trả 400 |
| TC-13: lost update | Hai request PATCH metadata hoặc status dùng cùng expected_version | Một thành công, một 409, không ghi đè; kết quả đúng payload thắng |
| TC-14: booking và đóng sân đồng thời | Customer hold slot đồng thời admin ngưng/bảo trì court/venue | Không có đơn mới trên sân đã bị đóng; hoặc hold thắng và status bị từ chối do đơn, hoặc status thắng và booking bị từ chối |
| TC-15: audit rollback | Fixture test gây lỗi ghi audit trong transaction đổi trạng thái | Trạng thái/version rollback, không có thay đổi thiếu audit |
| TC-16: giữ chỗ và expire/payment | Gửi expire và confirm gần deadline đồng thời | Chỉ một kết quả hợp lệ thắng; không có PAID + EXPIRED hoặc AVAILABLE + CONFIRMED |
| TC-17: thay đổi slot khi reschedule | Hai luồng dời cùng booking hoặc hai booking về cùng đích | Không ghi nhầm slot cũ; tối đa một đơn chiếm đích; bên thua 409 |
| TC-18: tài khoản khóa/logout | Login, logout rồi dùng token cũ; khóa user rồi dùng token đang có | Token cũ/khóa bị từ chối, không chỉ ẩn nút frontend |
| TC-19: DB constraints | Insert fixture overlap, ca sai 60 phút, hold null khi HELD, payment PAID trùng | PostgreSQL từ chối; giao dịch rollback |
| TC-20: sinh lịch M3 | Sân mới sinh 30 ngày, gọi lặp/đồng thời; ngày quá hạn, sân sai cơ sở | 480 ca/sân, 16 ca/ngày 06–22; không trùng/ghi đè; phạm vi ngày/ownership được kiểm tra |
| TC-21: giá snapshot | Tạo booking rồi đổi giá metadata court | Giá slot đã seed và total_amount/payment amount của booking cũ không đổi |
| TC-22: bí mật và auth | Đọc API admin/user/audit; thử payment confirm bằng customer khác/tắt sandbox | Không trả password/token hash; không confirm trái quyền hoặc khi sandbox tắt |

## Kiểm tra giao diện

- Đăng nhập điều hướng đúng role; route bảo vệ truy cập trực tiếp URL.
- Có loading, empty và lỗi mạng; không treo nút sau 400/401/403/409.
- AVAILABLE xanh lá, HELD vàng cam, BOOKED xanh/tím, UNAVAILABLE xám; có nhãn chữ để không chỉ dựa màu.
- Reload checkout vẫn dùng deadline backend; hết giờ khóa thanh toán, không reset bộ đếm.
- Frontend chưa sửa trong đợt này. Sau khi tích hợp: form manager gọi sinh lịch và endpoint status riêng, gửi reason/version; không gộp status vào PATCH metadata.
- Khi 409 do version cũ, giao diện tải/cho tải lại dữ liệu, không tự gửi lại đè thay đổi.
- Nhãn refund thống nhất: Chờ duyệt / Đã duyệt / Đang hoàn tiền / Đã hoàn tiền.
- Form review chỉ xuất hiện sau complete; backend vẫn kiểm tra khi gửi thủ công.

## Bảng ghi kết quả

| Mã | Commit / môi trường | Ngày chạy | Kết quả | Bằng chứng | Người chạy |
|---|---|---|---|---|---|
| TC-01 → TC-10 | Node 24.18.0, PostgreSQL 16/Docker 29.9.3; source backend trong repo tại lần chạy | 23/11/2026, 16:23 Việt Nam | Pass tự động, TC-05 không skip | backend-verification-2026-11-23-final.txt | Terminal người dùng; trợ lý đối chiếu log |
| TC-11 → TC-22 và mở rộng | Đã chạy các test cụ thể tương ứng trong suite 38 integration test | 23/11/2026 | Xem tên từng test trong log; chưa đánh dấu pass mọi bước kiểm thử thủ công/tổ hợp ngoài suite | VERIFICATION.md | Trợ lý đối chiếu log |

Bản cuối đã chạy **45 pass, 0 fail, 0 skip**, gồm **38 HTTP/PostgreSQL test và 7 unit test**. Ba test hồi quy sau lần 38 test đã pass; hai lỗi cố ý tạo để kiểm tra rollback cũng có test tương ứng pass. Xem [VERIFICATION.md](VERIFICATION.md) và [log cuối](backend-verification-2026-11-23-final.txt). Kết quả tự động chỉ áp dụng cho tình huống đã có trong suite, không thay cho nghiệm thu UI hoặc mọi bước thủ công ở trên.

Nếu có kiểm thử tự động mới, liên kết tên test tương ứng và ghi phạm vi: unit, HTTP integration hay PostgreSQL concurrency. Không báo pass các bước thủ công chưa thực hiện.
