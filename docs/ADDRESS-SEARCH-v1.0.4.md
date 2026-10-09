# CityPass v1.0.4 – Tìm số nhà và địa chỉ cụ thể

- Gõ số nhà + tên đường + phường/quận, ví dụ `123 Hai Bà Trưng, Quận 1`.
- API TomTom Search tìm từ `PAD,Addr,POI,Str,XStr` (địa chỉ theo số nhà, địa chỉ nội suy, địa điểm, tên đường, giao lộ).
- Ưu tiên `Point Address` khi nguồn có số nhà khớp; `Address Range` là vị trí nội suy ước tính; kết quả `Street` KHÔNG phải số nhà.
- Trả các trường `precision` và `precision_label` để người dùng phân biệt độ chính xác.
- Khi TomTom không có dữ liệu ở cấp số nhà, CityPass chỉ đưa kết quả gần đúng và KHÔNG tự đặt ghim vào số nhà do người dùng nhập.
- Cả ô điểm xuất phát và điểm đến đều sử dụng API tra cứu này.
- Kết quả từ TomTom chỉ là dữ liệu bản đồ, chưa xác nhận lối vào/biển số nhà thực tế; kiểm tra biển đường và quy định xe máy khi đi.
- Không cần API key mới nếu `TOMTOM_API_KEY` hiện đã có quyền Search API.
