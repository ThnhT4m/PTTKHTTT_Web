# Phối hợp Backend — TASK 6

Không sửa file Backend, schema, migration, seed hoặc API Contract. Kết quả cuối của HTTP/PostgreSQL và 45 Backend regression được ghi tại FINAL_QA_REPORT.md, `client/test-artifacts/task6/real/results.json` và `backend-regression.log`.

Chưa phát hiện lỗi Backend mới cần giao TV1/TV2 trong các tình huống đã chạy. Không suy rộng kết luận này thành Backend không có lỗi.

Các điểm cần hiểu khi review:

- Giới hạn `/api/auth` là 100 request/15 phút, bao gồm kiểm tra phiên. Nhiều lần tải trang trong harness có thể chạm 429. Không thay limiter; ảnh được chia nhóm trên app instance mới cùng mã/DB/cấu hình. Bộ real kiểm tra 429 thật riêng. FE-QA-009 sửa cách Frontend hiển thị thất bại xác minh phiên ở trang công khai.
- Các lỗi 400/403/404/409/429/500/503 được bơm trong QA có nhãn HTTP_FIXTURE; ConnectionClosed/InternetDisconnected và response bị giữ là điều khiển CDP. Không ghi chúng thành lỗi Backend thật.
- Booking ONLINE CONFIRMED + payment PAID dùng cho dời/refund/review là fixture hợp lệ trong database kiểm thử mới. Điều này không nghiệm thu Payment Frontend. POS/refund sandbox không chuyển tiền thật.
- TC-15 (audit rollback) và TC-19 (DB constraint) cần suite PostgreSQL Backend; không thể chứng minh chỉ bằng UI hoặc mock.
- TC-03, TC-16 và phần payment TC-22: **OUT_OF_SCOPE_TV3**. Test payment có sẵn trong Backend chỉ là hồi quy riêng.

Mỗi lần chạy tạo database mới, không DROP/TRUNCATE/reset database TASK 5. Đối chiếu bảo toàn file TASK 5 tại `client/test-artifacts/task6/task5-preservation-result.json`.
