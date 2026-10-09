# CityPass v0.6 — Mobile UX và hiệu năng

## Đã thay đổi

- Mobile ≤760px: bản đồ chiếm phần màn hình còn lại bên dưới header 60px và thanh điều hướng 68px; sidebar chuyển sang bottom sheet có thể mở/đóng. Bốn hành động chính ở thanh đáy, hỗ trợ safe-area iOS và vùng chạm ≥44px.
- Desktop: sidebar cố định, map lấp phần còn lại, lớp dữ liệu là cả hàng có thể nhấn, chú thích được thu gọn. Route card có thể cuộn và không phủ toàn bộ bản đồ.
- Khi chọn điểm đi/đến trên mobile, route card tạm ẩn để người dùng có thể chạm bản đồ; chọn xong bảng tìm đường trở lại.
- Tắt radar theo mặc định để giảm tải tile; các lớp bổ sung (camera, giao thông, ngập) chỉ gọi API khi bật. Thời tiết mô hình vẫn mặc định bật.
- Radar không gọi lại khi chỉ kéo bản đồ; dự báo thời tiết khu vực tải mỗi 5 phút. Ngập chỉ polling khi bật, tối đa mỗi 60 giây. Giao thông tiếp tục 90 giây; camera chỉ tải khi bật. Tác vụ định kỳ tạm ngưng khi tab bị ẩn.
- Bỏ request dự báo thời tiết `/weather/current` trùng lặp; thông tin nổi trên bản đồ sử dụng bộ 22 điểm thời tiết theo khu vực.
- Bản đồ chỉ render marker trong vùng đang xem, tối đa 85 camera, 160 sự cố, 22 khu vực thời tiết, 20 điểm giao thông; giảm hiển thị khi zoom xa. Leaflet tiết kiệm tile bằng `updateWhenIdle` và buffer 1.
- Tránh tạo lại Supabase client qua từng render và giảm cập nhật tâm bản đồ với pan nhỏ.

## Cần thử nghiệm trên máy thật

- 375, 390, 430, 768, 1024, 1440px; điện thoại xoay ngang; bật/tắt bảng lớp dữ liệu và tìm tuyến.
- Tìm đường: GPS, chọn từ/đến trên bản đồ, chuyển sang Google Maps. Xác nhận route card xuất hiện lại sau khi chọn điểm.
- Bật riêng từng lớp: weather, radar, traffic, camera, ngập. Kiểm tra DevTools Network: không tiếp tục polling lớp tắt hoặc khi tab ẩn.
- Bật hàng trăm camera, kéo/zoom nhanh; theo dõi Memory và FPS trong Chrome Performance trên thiết bị tầm trung.
- Chạy `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` trên Windows; thử bằng phiên bản production `npm run start`.

## Giới hạn

Chưa có benchmark Lighthouse/Web Vitals đo trên thiết bị thật, chưa chứng minh không crash. Máy chủ bản đồ, radar và TomTom có giới hạn riêng. Tài khoản TomTom, hạ tầng và RUM cần quản lý quota để chịu tải nhiều người dùng. Dữ liệu thời tiết mô hình không phải trạm quan trắc tại từng con đường; thiếu cảnh báo ngập không chứng minh đường an toàn.
