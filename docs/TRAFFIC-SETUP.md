# CityPass v0.5 – Giao thông theo tuyến (TomTom, tùy chọn)

## Lấy khóa TomTom
1. Mở https://developer.tomtom.com/ , đăng ký/đăng nhập TomTom.
2. Vào **API & SDK Keys**, lấy key có quyền dùng Routing API và Traffic API. Theo dõi hạn mức và giá tại tài khoản.
3. Thêm `TOMTOM_API_KEY=...` trong `.env.local`, **không dùng** `NEXT_PUBLIC_TOMTOM_API_KEY`.
4. Dừng `npm run dev` và chạy lại. Bật lớp **Giao thông / kẹt xe** ở sidebar.

Không có key: CityPass không hiển thị màu ùn tắc; tính tuyến OSRM thử nghiệm như trước.

## Dữ liệu
- `/api/v1/traffic/areas`: 10 đoạn đường đại diện được lấy từ TomTom Flow Segment Data, giới hạn đồng thời 3 yêu cầu, cache tiến trình 90 giây. Đây **không phải** tốc độ trung bình của một quận.
- `/api/v1/traffic/tile`: ảnh đường theo Flow Tiles, giới hạn zoom 10–18 và phạm vi TP.HCM mở rộng; key ở server.
- `/api/v1/routes`: khi key hợp lệ, TomTom Routing tính đường ô tô có xét traffic hiện tại và các phương án thay thế; giữ ưu tiên tránh báo ngập **đã kết nối database**. Nếu TomTom thất bại, thử OSRM và gắn nhãn rõ **không có traffic trực tiếp**.

## Giới hạn và bảo mật
- Kết quả không bảo đảm tuyến nhanh nhất vào đúng thời điểm khởi hành; lưu lượng thay đổi liên tục, dữ liệu TomTom có độ trễ/phạm vi phủ khác nhau.
- Tuyến xe ô tô không khẳng định phù hợp với xe máy; không thể bảo đảm tránh ngập nếu chưa có cảm biến/báo cáo xác minh.
- Để triển khai công khai nhiều người dùng: cài **rate limit chia sẻ** (Redis/Upstash), chống abuse các API traffic tile/areas/routes; cân nhắc hạn mức TomTom và điều kiện sử dụng dịch vụ. Bản này dành cho thử nghiệm MVP, không có distributed rate limiter.
- Chỉ cấu hình key trong server (.env.local ở máy cá nhân, Env Variables của Vercel); không commit key. Proxy có thể tạo chi phí API. Cấu hình giới hạn usage/billing trước khi mở công khai.
- TomTom Maps Traffic Flow v4: https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/raster-flow-tiles
- TomTom Routing: https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route
