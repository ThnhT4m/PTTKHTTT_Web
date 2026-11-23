# Nghiệm thu backend — 23/11/2026

**Kết quả cuối: 45/45 test đạt, 0 fail, 0 cancelled, 0 skipped, 0 todo**, gồm **38 test tích hợp HTTP/PostgreSQL và 7 unit test**. Mã backend hiện tại đã được kiểm chứng sau cả ba sửa lỗi bổ sung cuối cùng.

Đã đối chiếu log chạy `npm run verify:backend` từ Terminal máy người dùng. Bắt đầu **16:23:05 ngày 23/11/2026, giờ Việt Nam** (09:23:05 UTC), kết thúc khoảng 16:23:33. Toàn quy trình 27,8 giây; phần test 11.203,260397 ms. Môi trường: Node.js v24.18.0, Docker Engine 29.9.3, PostgreSQL image `postgres:16-alpine`, database riêng `sportbooking_test` tại 127.0.0.1:5432.

| Kiểm tra | Kết quả đã ghi nhận |
|---|---|
| `npm ping` | PONG; kết nối registry thành công. |
| `docker info` | Docker daemon truy cập được, Server 29.9.3. |
| `npm ci --workspace server --ignore-scripts --no-audit --no-fund` | Cài 152 package thành công. |
| `docker compose up -d --wait db` | PostgreSQL healthy. |
| Database test | Database `_test` tồn tại; suite migrate/seed và chạy truy vấn thực. |
| `npm run check:server` | **43 file JavaScript hợp lệ.** |
| `npm test` | **45 pass, 0 fail, 0 skip.** |
| Frontend | Không sửa thư mục client; không build/kiểm thử UI trong phạm vi backend này. |

Bằng chứng cuối: [backend-verification-2026-11-23-final.txt](backend-verification-2026-11-23-final.txt), bản sao nguyên trạng log vừa đối chiếu. SHA-256: `6eae77d084817c4ba17cd99acd2aa48952fe1788407d23e6ac2cf82f134aa776`. File root `backend-verification.log` bị Git bỏ qua theo `*.log`; bản `.txt` trong docs được giữ để push cùng source. [Log 38 test trước đợt sửa cuối](backend-verification-2026-11-23.txt) chỉ là bằng chứng lịch sử, không phải kết quả hiện tại.

## Phạm vi đã đạt

- TC-01 → TC-10: atomic hold/race condition, hết hạn, thanh toán idempotent, hold/lead time, walk-in ca đang chạy, gia hạn, dời lịch tự nguyện/sự cố, chuỗi hoàn tiền, complete/review và cách ly quyền sở hữu.
- M3: đủ 30 ngày với 16 ca/ngày 06–22; gọi lặp/đồng thời không trùng và không ghi đè giá/hold; giới hạn ngày/sân/ownership; chỉnh giá/version và bảo vệ slot HELD/BOOKED.
- Manager đổi trạng thái đúng cơ sở; xóa mềm giữ lịch sử; từ chối customer/manager khác; khách không thấy sân ngưng phục vụ.
- Nhiều payment attempts chỉ một PAID, các attempt còn lại FAILED; confirm quá hạn bị chặn dù cron chưa chạy; expire đồng thời không xử lý trùng.
- Gia hạn thành công có booking con/payment; complete sớm bị chặn; hai đơn dời cùng đích chỉ một thắng và bên thua rollback; refund/reschedule loại trừ nhau khi cạnh tranh.
- List/detail/history/refund có scope; phân trang/lọc không vượt quyền; retry yêu cầu hoàn hoặc hoàn tất không ghi trùng.
- Logout/khóa/cấp quyền thu hồi token; không trả password_hash/token_version trong user/audit; JSON hỏng/quá lớn giữ envelope.
- Constraint PostgreSQL chặn trùng/sai ca, HELD thiếu deadline, payment PAID trùng. Lỗi ghi audit/lịch sử dời rollback cả dữ liệu liên quan.
- Ba sửa lỗi cuối đã có test hồi quy pass: mật khẩu UTF-8 chạm/vượt 72 byte bcrypt; booking EXPIRED không nhận deadline của khách đặt sau; deadline được kiểm tra lại ngay tại UPDATE BOOKED, rollback payment/booking/slot/alternative attempt khi quá hạn trong lúc xử lý.
- Bảy unit test kiểm tra giới hạn bcrypt, UTF-8/emoji, validation đăng ký/đăng nhập, không trim mật khẩu, chặn tự cấp quyền, ngày Việt Nam, ngày nhuận và lịch 30 ngày.

Hai thông báo `forced audit failure` và `forced reschedule history failure` là lỗi được tạo chủ đích bằng trigger trong database test. Các test xác nhận HTTP 500 và rollback đã **pass**; không có lỗi kiểm thử còn mở trong lần chạy cuối. Test deadline dùng fault injection trong DB, không dựa vào sleep hoặc tốc độ máy.

## Chạy lại

```bash
npm run verify:backend
```

Lệnh kiểm tra npm/Docker, cài dependency workspace server, khởi động PostgreSQL, tạo database test nếu cần và chạy kiểm tra cú pháp/test. Không reset database phát triển. Có thể đặt TEST_DATABASE_URL cho PostgreSQL ngoài Docker; tên database bắt buộc kết thúc `_test`, dữ liệu test sẽ được migrate/seed lại. Khi sửa code backend, chạy lại suite trước khi dùng kết quả này làm bằng chứng cho phiên bản mới.

## Giới hạn phạm vi

- Đã hoàn thiện backend M1–M12 theo PDF mới và kiểm chứng các tình huống trong suite. Đây chưa phải kiểm thử tải hoặc chứng minh mọi tổ hợp concurrency.
- Thanh toán/hoàn tiền vẫn là sandbox cho demo; chưa nối cổng tiền thật, đối soát hoặc triển khai production. Dời sân hiện cùng cơ sở/môn/giá.
- Frontend không sửa theo yêu cầu; UI và Postman collection runner chưa được nghiệm thu. API mới, request mẫu và quy tắc trạng thái đã có trong API.md/CONTRACT.md.
- TC-05 cần ca đang diễn ra trong giờ Việt Nam 06–22. Lần cuối đã pass, không skip; chạy ngoài giờ có thể skip test này.

Phiên AI vẫn bị giới hạn truy cập Docker/PostgreSQL, nhưng kiểm thử trên Terminal máy đã hoàn tất và log đã được đối chiếu. Không còn yêu cầu chạy lại đang chờ cho phiên bản backend này.
