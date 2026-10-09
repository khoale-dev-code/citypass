# CityPass — nguồn camera (trạng thái chưa xác minh hoạt động/giấy phép)

Nguồn tham khảo do người dùng cung cấp: https://rin2401.github.io/map/ (https://github.com/rin2401/map/blob/master/index.html)

Mã của nguồn này đọc Google Visualization Sheet (gid=382031510) gồm `lat`, `lng`, `location`, `cam_id`, `angle`, `status`; đường dẫn ảnh gốc đến `giaothong.hochiminhcity.gov.vn/render/ImageHandler.ashx?id=...`. Đây là ảnh snapshot, không phải RTSP/HLS video.

Chỉ dùng tab camera, tuyệt đối không nhập hoặc hiện tab chứa mật khẩu Wi-Fi trong bản gốc. Không sao chép mã script, không gửi mật khẩu.

CityPass fetch danh mục server-side (cache 60s), kiểm tra dữ liệu + khoanh vùng, trả ảnh origin cho client khi click. Không proxy ảnh để tránh vượt giới hạn của nhà cung cấp. Ngừng dịch vụ khi máy chủ từ chối hoặc chưa có phép sử dụng thương mại. Khi thấy 403/hình lỗi, tắt `CITYPASS_PUBLIC_CAMERAS=false`.

Repo https://github.com/LeNguyenGiaBao/vehicle_detection là Streamlit/SSD; repo https://github.com/Tank97king/Nhan_dien_phuong_tien_giao_thong_va_bien_so_xe dùng FastAPI/YOLO/OCR. Không có endpoint hosted ổn định để gọi trực tiếp và không cần OCR biển số cho chức năng cảnh báo ngập.

Datastore API resource `6211b28e-34b6-474d-981b-2ab2a3681c67`: ID được cung cấp nhưng chưa xác thực schema/mục đích. Không dùng làm nguồn cảnh báo/ngập/ảnh cho tới khi có thông tin và quyền sử dụng rõ ràng.
