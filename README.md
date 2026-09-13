# FocusSystem - Hệ thống Giám sát & Phân tích Động thái Học tập Sinh viên qua AI

![FocusSystem Logo](ANHGIAODIEN/dashboard.png)

## 📌 Giới thiệu dự án
**FocusSystem** là hệ thống AI giám sát và phân tích mức độ tập trung của sinh viên trong giờ học thông qua dữ liệu video từ Camera (Webcam / IP Camera / RTSP Stream). Hệ thống tự động nhận diện khuôn mặt sinh viên, phân tích hành vi (tập trung, sử dụng điện thoại, ngủ gật, vắng mặt, đối tượng lạ) và tính toán **Điểm Tập Trung (Focus Score)** theo thời gian thực.

---

## 🛠 Cấu trúc dự án (`D:\DATN`)

```text
DATN/
├── ai_service/             # Dịch vụ AI nhận diện khuôn mặt (ArcFace) & theo dõi đối tượng (YOLOv8 + ByteTrack)
├── backend/                # Server Flask Web API (Phân tích, Quản lý Lớp, Gửi Mail Cảnh báo, Báo cáo)
├── mobile/                 # Ứng dụng di động dành cho Sinh viên & Giảng viên (React Native / Expo)
├── scripts/                # Kịch bản bảo trì, dọn dẹp dữ liệu, backup SQL, sơ đồ ERD
├── SQL/                    # File khởi tạo cơ sở dữ liệu focus_db và bản sao lưu master data
├── ANHGIAODIEN/            # Hình ảnh giao diện Web & Mobile
├── DanhSachLopHoc/         # File Excel danh sách lớp mẫu
├── dataset/                # Tập dữ liệu ảnh khuôn mặt mẫu của sinh viên
├── yolov8_tracking-master/ # Thuật toán tracking YOLOv8 tích hợp
├── FocusDB.txt             # Mô tả cấu trúc cơ sở dữ liệu
├── FocusSystem_Colab_Runner.ipynb # Notebook chạy huấn luyện / thử nghiệm trên Google Colab
├── requirements.txt        # Danh sách thư viện Python cần thiết
├── run_project.ps1         # Kịch bản khởi chạy toàn bộ hệ thống tự động (Backend + Web + Mobile)
└── setup_cuda.ps1          # Kịch bản cấu hình môi trường GPU CUDA cho AI
```

---

## 🔥 Các Tính Năng Chính

1. **Giám sát thời gian thực (Real-time AI Monitoring):**
   - Nhận diện khuôn mặt sinh viên chính xác bằng ArcFace.
   - Phát hiện các vi phạm: **Dùng điện thoại**, **Ngủ gật**, **Nhìn quanh/Mất tập trung**, **Người lạ (Stranger)**.
2. **Quản lý không gian & Lớp học:**
   - Quản lý Không gian/Phòng máy, Lớp học phần, Cố vấn học tập, Giảng viên & Danh sách sinh viên.
3. **Báo cáo & Thống kê tự động:**
   - Thống kê biểu đồ di chuyển của Điểm tập trung trung bình.
   - Xuất báo cáo điểm danh & vi phạm ra file Excel (`.xlsx`).
   - Gửi Email cảnh báo tự động đến sinh viên vi phạm nhiều lần.
4. **Ứng dụng Di động (Mobile App):**
   - Đăng nhập theo vai trò (Sinh viên / Giảng viên / Quản trị viên).
   - Xem điểm tập trung cá nhân, lịch sử vi phạm, thông báo và lịch học.
5. **Sơ đồ Cơ sở Dữ liệu (ERD):**
   - Chuẩn hóa 14 bảng dữ liệu relational đầy đủ chi tiết khóa ngoại.

---

## 🚀 Hướng dẫn Khởi chạy Hệ thống

### 1. Yêu cầu môi trường
- **Python**: 3.10+ (Khuyến nghị 3.10.x)
- **Node.js**: 18+ (Dành cho ứng dụng Mobile Expo)
- **MySQL Server**: 8.0+ (Cơ sở dữ liệu `focus_db`)

### 2. Cài đặt thư viện Python & Mobile
```powershell
# Cài đặt thư viện Backend & AI
pip install -r requirements.txt

# Cài đặt thư viện Mobile (nếu cần chạy Expo)
cd mobile
npm install
```

### 3. Khởi chạy dự án bằng PowerShell
Hệ thống cung cấp file script tự động hóa `run_project.ps1`:
```powershell
.\run_project.ps1
```
Script sẽ tự động:
- Kiểm tra kết nối Cơ sở dữ liệu MySQL `focus_db`.
- Khởi chạy Flask Server tại `http://localhost:5000`.
- Khởi chạy Expo Metro Server cho ứng dụng Mobile.

---

## 📝 Hướng dẫn Push dự án lên GitHub

```bash
# 1. Di chuyển vào thư mục D:\DATN
cd D:\DATN

# 2. Khởi tạo Git repository
git init

# 3. Thêm tất cả file vào Git
git add .

# 4. Tạo commit đầu tiên
git commit -m "Initial commit: Complete FocusSystem Project Clean Source"

# 5. Liên kết với Repository trên GitHub của bạn
git remote add origin <URL_GITHUB_REPO_CUA_BAN>

# 6. Push mã nguồn lên GitHub
git branch -M main
git push -u origin main
```

---
*Dự án Đồ án Tốt nghiệp - Hệ thống Giám sát & Phân tích Động thái Học tập Sinh viên (FocusSystem)*
