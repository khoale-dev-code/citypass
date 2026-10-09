# CityPass v0.3 — Radar mưa, GPS, tìm đường và camera giao thông

Website Next.js App Router. Bản đồ hoạt động độc lập với AFSC/Supabase. Mở `http://localhost:3000` sau khi chạy `npm run dev`.

## Cập nhật dự án đang có

Chỉ tải file `Update-CityPass-v0.3.0.ps1` vào `D:\Downloads` và chạy:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Downloads\Update-CityPass-v0.3.0.ps1" -TargetPath "D:\freetime\LoiRao-FloodMap"
cd "D:\freetime\LoiRao-FloodMap"
npm run dev
```

Giữ nguyên tên thư mục trên Windows để các lệnh cập nhật cũ không bị lỗi. Tên thương hiệu trong UI, metadata và package.json đã đổi thành **CityPass**. Nếu muốn di chuyển cả thư mục, tắt ứng dụng trước và sửa đường dẫn `-TargetPath` ở những bản vá sau.

Script sao lưu các file trước khi sửa, không thay đổi `.env.local`; hỗ trợ nâng cấp trực tiếp từ mã gốc v0.1 hoặc v0.2 nếu file chưa tự chỉnh sửa. Sau patch script chạy typecheck/lint/test khi `node_modules` đã tồn tại.

## Camera giao thông

- Danh sách camera ảnh tĩnh được đọc **chỉ từ tab camera** của Google Sheet dùng bởi <https://rin2401.github.io/map/>. Nguồn bên ngoài có thể đổi/giới hạn/ngừng truy cập.
- Hình camera được tải **trực tiếp từ máy chủ ảnh của Cổng thông tin giao thông TP.HCM** ở trình duyệt, chỉ khi người dùng mở camera. Không proxy, ghi hình, lưu trữ hay nhận diện biển số.
- Ảnh cập nhật theo yêu cầu mỗi 30 giây khi popup mở, nhưng thời gian chụp gốc không xác nhận được. Nếu nguồn từ chối hotlink, app báo lỗi và có liên kết mở nguồn.
- Camera HLS từ bảng Supabase vẫn được hỗ trợ nếu đã được cấp quyền truy cập.
- Để tắt danh mục camera bên ngoài, thêm vào `.env.local`: `CITYPASS_PUBLIC_CAMERAS=false` rồi restart.
- **Bản đồ/chỉ dẫn không dùng hình camera để suy ra đường ngập, không hứa tuyến an toàn.**
- Trước khi đưa website ra công khai, xác minh quyền sử dụng và hạn mức tại phía chủ camera và tác giả dữ liệu.

## Các nguồn khác

- Datastore API TP.HCM với resource ID `6211b28e-34b6-474d-981b-2ab2a3681c67`: tài liệu cung cấp chỉ là cú pháp Datastore; chưa xác nhận tài nguyên đó là camera hoặc bản đồ ngập nên chưa đưa vào lớp dữ liệu.
- CSV `edu_ds_donvi_khoi_ttgdtx_2.csv` là danh sách đơn vị giáo dục thường xuyên, không liên quan đến camera/ngập.
- Hai repository nghiên cứu nhận diện xe/biển số là các hệ thống Python AI độc lập, chưa dùng trong MVP để tránh nhận diện biển số cá nhân và tăng chi phí vận hành.

## Xác minh trước khi triển khai

```powershell
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

Không đặt service-role key ở phía trình duyệt. Radar RainViewer là ảnh mưa trong quá khứ gần, không phải dự báo. Tuyến OSRM demo là tuyến đường ô tô chưa xác thực điều kiện xe máy và không biết ngập thật khi chưa có cảm biến.
