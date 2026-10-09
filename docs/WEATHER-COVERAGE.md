# CityPass — thời tiết theo khu vực TP.HCM (v0.4)

- `GET /api/v1/weather/areas` gọi một request gộp nhiều tọa độ Open-Meteo, cache 300 giây ở server. Giao diện làm mới mỗi 5 phút; khi lỗi không hiển thị nắng giả.
- 22 điểm lấy mẫu là các **điểm đại diện**, không phải trạm đo tại vị trí GPS; tên khu vực là địa danh quen thuộc, không tuyên bố là ranh giới hành chính.
- `current.precipitation` (mm / 15 phút) là số liệu **mô hình**; `hourly.precipitation_probability` là dự báo tỷ lệ phần trăm, không phải ghi nhận thực tế.
- Hình radar nếu có là lớp *quan trắc* riêng; màu điểm ngập là dữ liệu khác. Không suy ra ngập hay an toàn di chuyển từ mô hình thời tiết.
- Open-Meteo API miễn phí dành cho sử dụng phi thương mại theo điều khoản của họ. Nếu CityPass thương mại/hệ thống sản xuất lớn cần hợp đồng/giấy phép phù hợp.
- Nếu muốn biết đang mưa thật theo từng đường, cần một trong các nguồn độc lập: radar có phủ sóng, trạm mưa có metadata tọa độ và thời gian, hoặc báo cáo cộng đồng được xác thực.
- Test: `npm run typecheck && npm run lint && npm test && npm run build`.
