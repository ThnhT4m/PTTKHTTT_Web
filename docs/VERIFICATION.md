# Kết quả kiểm chứng base

Ngày chạy: 17/11/2026, múi giờ Việt Nam. Môi trường thực tế: Node.js 24.22.1, npm 11.9.0, PostgreSQL 16 trong Docker. Yêu cầu tối thiểu trong source là Node.js 22; lần kiểm chứng này dùng Node.js 24.

## Đã chạy thành công

| Kiểm tra | Kết quả |
|---|---|
| Cài dependency workspace | Thành công; có `package-lock.json` để cài lại bằng `npm ci`. |
| `npm run db:migrate` | Thành công 1 migration: 10 bảng nghiệp vụ/audit, các FK, CHECK, unique/partial index và exclusion constraint. |
| `npm run db:seed` | Thành công: 5 tài khoản, 3 cơ sở, 6 sân, 3.072 slot cố định. |
| `npm test` | **17 pass, 0 fail, 0 skip**, dùng PostgreSQL thật tại database riêng `sportbooking_test`. |
| `npm run build` | Vite build thành công, 1.605 module; xuất `client/dist`. |
| `GET /api/health` trực tiếp và qua Vite proxy | HTTP 200, truy vấn database thành công. |
| Kiểm tra cú pháp server / biên dịch JSX | Thành công. |

## Các tình huống tự động đã đạt

1. API riêng tư yêu cầu JWT; không tự đăng ký ADMIN; customer không vào API admin.
2. TC-01: hai customer giữ cùng slot đồng thời, một thành công và một lỗi 409.
3. TC-02: job hết hạn đổi booking EXPIRED và slot AVAILABLE, xóa held_until.
4. TC-03: xác nhận thanh toán đồng thời cùng transaction_code an toàn, chỉ một payment PAID; booking CONFIRMED, slot BOOKED.
5. TC-04: thời hạn giữ đúng cấu hình 5 phút; cấu hình 15 bị từ chối; ca không đạt lead time bị từ chối.
6. TC-05: walk-in cho ca đang diễn ra, có payment tại quầy.
7. TC-06: gia hạn bị từ chối khi ca liền kề đang HELD, không tạo booking con.
8. TC-07: dời tự nguyện mở lại slot cũ; customer không tự hủy hoặc đòi hoàn tiền khi chưa báo sự cố.
9. TC-07 bổ sung: dời sau báo sự cố giữ slot cũ UNAVAILABLE.
10. TC-08: không được nhảy thẳng REQUESTED sang COMPLETED; duyệt tự đi qua APPROVED/PROCESSING có audit; hoàn thành cập nhật đồng thời payment/booking/slot.
11. TC-09: chỉ complete sau giờ kết thúc; gọi complete lặp an toàn; chỉ chủ đơn COMPLETED đánh giá và tối đa một lần.
12. TC-10: manager khác cơ sở không sửa sân, tạo walk-in hoặc báo sự cố đơn của cơ sở khác.
13. Manager không gửi status qua PATCH thông tin, không gọi API admin; endpoint generate-slots không tồn tại.
14. Hai PATCH cùng version: một thành công, một EDIT_CONFLICT; version chỉ tăng một lần.
15. ADMIN khóa sân đồng thời customer đặt: chỉ một thao tác thành công; không có booking hợp lệ trong sân đã bị khóa.
16. Callback quá hạn không chiếm lại slot đã được người khác giữ.
17. ADMIN đổi trạng thái bắt buộc lý do và ghi đúng actor, dữ liệu trước/sau trong audit.

Test TC-05 phụ thuộc giờ mở cửa tại Việt Nam (06:00–22:00). Suite sẽ ghi skip nếu được chạy ngoài khoảng này; lần chạy bàn giao không có skip. Các test trên là những tình huống cụ thể, chưa phải kiểm thử tải hoặc chứng minh mọi tổ hợp cạnh tranh. Danh sách nghiệm thu rộng hơn và thao tác thủ công nằm trong [ACCEPTANCE.md](ACCEPTANCE.md).

## Giới hạn kiểm chứng

Đã thử mở frontend bằng Cloud browser. Môi trường trình duyệt chặn thao tác bởi chính sách URL nên chưa thực hiện được nghiệm thu tương tác UI cho 9 nhóm màn hình. HTTP server/proxy và build vẫn đã được kiểm tra độc lập; không coi hai kiểm tra đó là bằng chứng UI hoạt động đầy đủ. Nhóm cần chạy lại luồng UI trong trình duyệt local theo ACCEPTANCE.md.

Postman collection là bộ request thao tác thủ công, chưa chạy toàn bộ như một collection runner. Cần đăng nhập lại theo role, chọn slot/ngày hợp lệ và cập nhật expected_version trước thao tác sửa.

Thanh toán/hoàn tiền chỉ ghi nhận sandbox và xác nhận nghiệp vụ tại quầy, không giao dịch tiền thật. Chưa triển khai lên hosting và chưa tích hợp nhà cung cấp thanh toán, email/SMS hoặc vận hành production.
