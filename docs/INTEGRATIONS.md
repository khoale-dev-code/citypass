# Thông tin cần có để kết nối dữ liệu thật

## AFSC
Hiện **chưa có** URL endpoint chính thức, token và hợp đồng response. Không được coi đây là dữ liệu thực khi thiếu những thứ đó. Adapter duy nhất là `src/lib/afsc/adapter.ts`, hiện chỉ chấp nhận mảng:

```json
[{"sensor_id":"SENSOR_123", "lat":10.7, "lng":106.7, "water_level_cm":12, "observed_at":"2026-10-08T01:00:00Z"}]
```
Đây là **định dạng trung gian mà ứng dụng định nghĩa**, không được mô tả là JSON chính thức của AFSC. Cần bản quyền sử dụng/điều khoản, IDs trạm đo, thời hạn hết hạn sensor (đang tạm 120 phút), xác nhận ngưỡng 20 và 35 cm, giới hạn API, cơ chế chống đo lỗi.

## Radar / thời tiết
- RainViewer: https://www.rainviewer.com/api.html. MVP 0.2 đọc tối đa 12 khung radar gần đây từ weather-maps.json, phát timeline và tùy chỉnh opacity. Chỉ ảnh radar quá khứ, không phải dự báo tương lai. Có thể không phủ vùng muốn xem; giới hạn native zoom 7. API public không có SLA, cần ghi nguồn RainViewer.
- Open-Meteo: https://open-meteo.com/en/docs. Giá trị current precipitation từ mô hình, không dùng suy ra độ sâu ngập.

## Định tuyến
- Mặc định development: https://router.project-osrm.org, có thể gián đoạn và giới hạn truy cập.
- Production: đặt `ROUTING_BASE_URL` đến OSRM do mình vận hành hoặc dịch vụ có hợp đồng. Hiện không có dữ liệu đường đóng chính thức, không hiển thị rẽ trái/phải để điều hướng xe máy.

## Camera
- Cần nguồn video HLS/WebRTC hợp pháp, địa chỉ, quyền hiển thị, độ trễ, CORS, chính sách băng thông. MVP phát luồng HLS qua hls.js nếu stream HTTPS hợp lệ và có CORS; không có FFmpeg proxy để chuyển RTSP hoặc sửa CORS.

## Thỏa thuận
- Biên mức 20cm: mức 2; 35cm: mức 2; trên 35cm: mức 3 (theo đặc tả gửi kèm).
- Xung đột confirm / false_alarm: ưu tiên HIDDEN.
- Đăng nhập để báo cáo và xác minh.
- MVP vùng TP.HCM; các tỉnh khác hiển thị bản đồ/radar nhưng chưa có giám sát chất lượng ngập.
