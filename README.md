# FocusSystem - Hệ thống Giám sát & Phân tích Động thái Học tập Sinh viên qua AI

![FocusSystem Logo](ANHGIAODIEN/dashboard.png)

## 📌 Giới thiệu dự án
**FocusSystem** là hệ thống AI giám sát và phân tích mức độ tập trung của sinh viên trong giờ học thông qua dữ liệu video từ Camera (Webcam / IP Camera / RTSP Stream). Hệ thống tự động nhận diện khuôn mặt sinh viên, phân tích hành vi (tập trung, sử dụng điện thoại, ngủ gật, vắng mặt, đối tượng lạ) và tính toán **Điểm Tập Trung (Focus Score)** theo thời gian thực.

---

## 🚀 Hướng dẫn Cài đặt & Khởi chạy (Dành cho Server `D:\DATN`)

Dự án yêu cầu cài đặt và chạy trong thư mục `D:\DATN` để đảm bảo các đường dẫn tuyệt đối trong file cấu hình (nếu có) hoạt động chính xác.

### 1. Yêu cầu phần cứng và phần mềm
- **CPU**: Intel Core i5 / i7 thế hệ 10 trở lên (hoặc AMD Ryzen tương đương)
- **RAM**: 16 GB trở lên
- **GPU**: NVIDIA GeForce RTX 3060 (khuyến nghị VRAM ≥ 6 GB, có hỗ trợ CUDA 11.8 / 12.x)
- **Hệ điều hành**: Windows 10 / 11 (64-bit)
- **Phần mềm cần cài**: Python 3.10+, Node.js 18+, Git, MySQL Server 8.0+

### 2. Tải Source Code từ GitHub
Mở Command Prompt hoặc PowerShell, di chuyển đến ổ đĩa `D:\` và thực hiện lệnh clone:
```powershell
d:
git clone https://github.com/QuachThiThu25th01/DATN.git
cd DATN
```

### 3. Cài đặt và cấu hình Cơ sở dữ liệu MySQL (`focus_db`)
1. Đăng nhập MySQL bằng tài khoản root:
   ```sql
   mysql -u root -p
   CREATE DATABASE focus_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   EXIT;
   ```
2. Nạp dữ liệu khởi tạo 14 bảng quan hệ và dữ liệu danh mục mẫu từ file `SQL/focus_db_backup.sql`:
   ```bash
   mysql -u root -p focus_db < SQL/focus_db_backup.sql
   ```
3. Kiểm tra thông tin kết nối CSDL trong file `backend/db.py` (Mặc định dùng User: `root`, Password rỗng `""` và DB `focus_db`).

### 4. Thiết lập địa chỉ IP mạng LAN cho Mobile App
Để Mobile App kết nối được tới Backend Server, cần xác định địa chỉ IPv4 của máy tính đang chạy Backend:
1. Mở PowerShell và chạy lệnh `ipconfig` để lấy địa chỉ IPv4 (ví dụ: `192.168.1.15`).
2. Mở file `mobile/constants/api.ts` và thay đổi hằng số `DEFAULT_LAN_IP` thành địa chỉ IPv4 vừa lấy được:
   ```typescript
   export const DEFAULT_LAN_IP = '192.168.1.15'; // Thay bằng IP của máy tính
   ```

### 5. Khởi chạy toàn bộ hệ thống
Hệ thống cung cấp sẵn kịch bản tự động hóa `run_project.ps1` để tự động kích hoạt môi trường ảo, cài đặt thư viện phụ thuộc và khởi chạy cả Backend lẫn Mobile App:
```powershell
.\run_project.ps1
```
*Lưu ý: Nếu chạy lần đầu, quá trình cài đặt thư viện (`pip install` và `npm install`) sẽ mất một chút thời gian. Sau khi xong, hệ thống sẽ mở Server backend và Metro bundler cho Mobile.*

Hoặc bạn có thể chạy thủ công từng phần theo hướng dẫn trong thư mục `backend` và `mobile`.

Sau khi khởi động thành công:
- **Web Dashboard (Backend)** chạy tại: `http://localhost:5000`
- **Mobile App (Expo)**: Quét mã QR hiển thị ở terminal bằng ứng dụng **Expo Go** trên điện thoại (đảm bảo điện thoại dùng chung mạng Wi-Fi với máy tính).

---

## 🔑 Tài khoản Đăng nhập Hệ thống (Test Accounts)

Dưới đây là các tài khoản mặc định đã được tạo sẵn trong CSDL (`SQL/focus_db_backup.sql`) để trải nghiệm đầy đủ các phân hệ chức năng (Web & Mobile):

| Vai trò | Tên đăng nhập | Mật khẩu | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (Admin)** | `admin` | `admin` | Toàn quyền quản lý danh mục, tài khoản, giám sát AI |
| **Giảng viên giảng dạy** | `gvgd01` | `GVGD01` | Theo dõi Camera AI, xem danh sách sinh viên vi phạm trong ca |
| **Cố vấn học tập** | `gvcn25th01` | `GVCN25TH01` | Xem thống kê lớp sinh hoạt, gửi email cảnh báo học vụ |
| **Sinh viên (Thu)** | `22050034` | `22050034` | Quách Thị Thu - Xem điểm tập trung, nhận thông báo đẩy (Push) |
| **Sinh viên (Minh)** | `22050076` | `22050076` | Hà Văn Minh - Xem lịch sử vi phạm cá nhân trên Mobile App |

---
*Dự án Đồ án Tốt nghiệp - Hệ thống Giám sát & Phân tích Động thái Học tập Sinh viên (FocusSystem)*
