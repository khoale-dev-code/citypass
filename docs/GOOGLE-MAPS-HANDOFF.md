# CityPass v0.5.1 — Bàn giao tuyến sang Google Maps

- Trong bảng **Tìm đường**, chọn điểm đi và đến rồi chọn **Tìm và so sánh tuyến**.
- Chạm **Tuyến 1, Tuyến 2…** để chọn kết quả có độ trễ giao thông và cảnh báo ngập theo CityPass.
- Chọn phương tiện (ô tô, xe máy nếu Google Maps hỗ trợ), và bật/tắt tùy chọn gửi ba điểm trung gian.
- Bấm **Mở Google Maps để dẫn đường**. Google Maps sẽ mở tab/app bên ngoài và có thể chỉ hiển thị bản xem trước nếu điểm đi khác vị trí hiện tại.

## Điều kiện và giới hạn

Liên kết Maps URLs không cần Google Maps API Key và không lộ TOMTOM_API_KEY. CityPass gửi điểm xuất phát, điểm đến, chế độ và tùy chọn tối đa ba điểm trung gian sampled theo hình học tuyến đang **được chọn**. Google Maps **không hỗ trợ nhập nguyên vẹn geometry/polyline từ TomTom hoặc OSRM vào dẫn đường công cộng**: dịch vụ này sẽ tự tính toán đường đi, tốc độ, ETA và có thể bỏ/đổi đường so với đề xuất CityPass. Chức năng xe máy tùy phạm vi hỗ trợ của Google Maps; các kết quả CityPass vẫn dựa vào định tuyến ô tô. Không cam kết đường đi an toàn, tránh ngập hay phù hợp xe máy.

Tài liệu Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started
