# Ràng buộc tin cậy và bảo mật

1. **Mô hình không tự chứng nhận tuyến đường khô ráo.** Không suy từ thiếu báo cáo thành an toàn. Cần từ chối chỉ đường đi qua vùng ngập nặng nếu có đóng đường/truy cập dữ liệu độ sâu theo toàn tuyến đáng tin.
2. **Báo cáo cộng đồng có thể sai.** Ở bản MVP, server đo khoảng cách từ tọa độ GPS trình duyệt gửi lên tới incident bằng PostGIS, nhưng không thể xác thực vị trí vật lý của thiết bị. Kẻ gian có thể giả mạo GPS. Không dùng 3 phiếu = bằng chứng chắc chắn; cần attestation, lịch sử uy tín, phát hiện Sybil / kiểm duyệt trước sản xuất.
3. Chỉ người dùng xác thực bằng Supabase mới POST báo cáo/xác minh. SQL function dùng `service_role` qua server; public RLS chỉ đọc. Mỗi người một phiếu, người viết báo cáo không được tự xác minh.
4. RPC giới hạn tối đa 3 báo cáo/giờ/tài khoản. Chưa có rate limit theo IP phân tán (chỉ nên mở public sau khi cấu hình Upstash / WAF).
5. Ảnh ở bucket public tối đa 5 MB JPEG/PNG/WebP; người dùng chịu trách nhiệm tránh ảnh chứa thông tin cá nhân/biển số. Bản production cần moderation, chống file độc và xử lý quyền riêng tư.
6. AFSC/API token, CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY chỉ ở .env.local hoặc Vercel server env. Không chia sẻ với client. Phiên bản demo không gọi AFSC.
7. Camera chỉ hiển thị metadata của nguồn được phép, không phát stream khi chưa có quyền sử dụng + CORS/stream adapter.
8. Realtime đổi theo ô lưới 2km tại vùng trung tâm 3×3 ô; ngoài vùng đó, polling 30 giây đồng bộ. Chưa có websocket gateway theo viewport đầy đủ.
9. RainViewer API chỉ dành cho cá nhân/giáo dục/cộng đồng quy mô nhỏ và có giới hạn; cần xem xét quyền sử dụng nếu thương mại. Nguồn định tuyến OSRM thử nghiệm cũng không có SLA.
10. Nên bật Supabase bot protection, CAPTCHA, email limits; giới hạn nguồn login và thêm audit trail khi ra sản phẩm thực tế.
