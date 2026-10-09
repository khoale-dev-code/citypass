# Kiến trúc CityPass — MVP

## Thiết kế
- Sản phẩm: bản đồ cảnh báo mưa/ngập quanh người tham gia giao thông tại TP.HCM.
- Người dùng: người đi xe máy/ô tô; hành động chính: xem tín hiệu, so tuyến, báo điểm ngập.
- Ngôn ngữ: tiếng Việt. Desktop: sidebar 360px + bản đồ + route overlay. Mobile: bản đồ trước, danh sách/layer phía dưới.
- Bảng màu: xanh trầm #14322E, xanh định hướng #086C62, trắng #FFFFFF, nền #F4F8F5, viền #DCE7E2; mức ngập vàng #BE9210, cam #D36B24, đỏ #CC3538.
- Typography: Be Vietnam Pro, nhấn mạnh khả năng đọc tiếng Việt và thao tác 1 tay.
- Điểm nhấn: tuyến đường và cảnh báo được đặt trực tiếp trên bản đồ (không dùng dashboard biểu đồ trang trí).

## Wireframe

```text
┌───────────── Brand ────────── City/Time ───── Route / Report ─────┐
├───────────────┬───────────────────────────────────────────────────┤
│ Layers        │ Weather / Radar time             GPS buttons      │
│ Flood risks   │                                                   │
│ Incident list │                 MAP                               │
│               │                + flood pins                       │
│               │                       Route panel (bottom-right)  │
└───────────────┴───────────────────────────────────────────────────┘
Mobile: Header / Map / Layers + Incident List
```

## Luồng dữ liệu
1. Radar RainViewer cung cấp ảnh mưa quá khứ; /api/v1/weather/radar cache 5 phút. Tối đa zoom native 7 theo chính sách 2026.
2. Open-Meteo current precipitation là số từ mô hình dự báo/tái phân tích, **không phải trạm đo ngay tại địa điểm**.
3. Dữ liệu ngập từ AFSC adapter nếu có URL/khóa/hợp đồng dữ liệu; server POST /api/internal/ingest/afsc qua bearer CRON_SECRET.
4. Báo cáo cộng đồng POST /api/v1/reports → RPC Postgres giao dịch → incident PENDING → realtime incident_events theo ô lưới và polling 30 giây.
5. 3 phiếu confirm từ 3 tài khoản khác nhau, GPS khai báo nằm trong 200m, trong 15 phút → VERIFIED. 2 false_alarm → HIDDEN. TTL 90 phút. Đối đầu: ưu tiên HIDDEN.
6. Tuyến xe: máy chủ OSRM cung cấp route alternatives, backend đếm điểm ngập gần polyline trong 130m, xếp tăng dần tín hiệu ngập và ưu tiên thời gian khi hòa. Chưa phải thuật toán tránh tất cả đường ngập; thiếu sự cố chưa chứng minh đường khô. Profile driving là ô tô, không dùng làm chỉ đường rẽ xe máy chính thức.
7. GET /api/v1/cameras đọc danh mục snapshot từ tab camera của nguồn công khai (cache 60s), ưu tiên an toàn + chống tái sử dụng sai mục đích; camera HLS từ DB vẫn hoạt động. Không coi ảnh là video hay bằng chứng đường không ngập.
8. Database Supabase với PostGIS; không có keys → giao diện demo, dữ liệu ví dụ cố ý gắn nhãn dữ liệu hư cấu. Google Maps không được dùng ở bản khởi tạo để chạy được mà không cần API key/billing; nền bản đồ OpenStreetMap/Leaflet. Có thể thay adapter map ở bản sau khi cấp khóa Google Maps.

## Các API
- GET /api/v1/incidents/nearby?lat=10.78&lng=106.7&radius_km=5
- GET /api/v1/cameras?lat=10.78&lng=106.7&radius_km=5
- POST /api/v1/reports (requires bearer Supabase access_token, body {type,lat,lng,severity,photo_url,note})
- POST /api/v1/reports/:id/verify (bearer auth, body {vote_type,lat,lng,accuracy_m})
- GET /api/v1/weather/radar
- GET /api/v1/weather/current?lat=10.78&lng=106.7
- GET /api/v1/routes?from_lat=...&from_lng=...&to_lat=...&to_lng=...
- POST /api/internal/ingest/afsc (Authorization: Bearer CRON_SECRET)

## Hạ tầng
- Vercel chạy Next.js (không chạy Socket.io/FFmpeg kéo dài phiên).
- Supabase Postgres/PostGIS/RLS + Postgres Changes trên incident_events; camera tùy chọn: HLS qua hls.js/Safari chỉ khởi chạy khi click marker và hủy stream khi đóng modal; yêu cầu nguồn HTTPS có CORS hợp lệ.
- Định tuyến máy chủ OSRM: máy chủ demo chỉ phù hợp phát triển; production bắt buộc đặt ROUTING_BASE_URL.
- Không có Upstash Redis ở giai đoạn này; GET nearby đọc DB trực tiếp và polling, chưa đạt mục tiêu cache 1000 request/30s.
- Thực tế production cần CDN/tile provider có SLA, IP rate limit phân tán, quy trình kiểm duyệt, GPS attestation, tích hợp giao thông cấp phép, quan trắc mực nước đủ phủ, kiểm thử đường sát thực địa.
