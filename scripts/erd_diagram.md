# Sơ đồ Thực thể Mối quan hệ (ERD - Entity Relationship Diagram) Database `focus_db`

Tài liệu này cung cấp sơ đồ ERD đã được chuẩn hóa, phân nhóm khoa học và trình bày rõ ràng các mối quan hệ (1 - N) giữa 14 bảng trong hệ thống **Focus System**, giúp thay thế hình ảnh ERD cũ bị chồng chéo đường nối.

---

## 1. Hình ảnh Sơ đồ ERD Mẫu (Kiểu dáng Chuẩn hóa)

![Sơ đồ ERD chuẩn hóa Database focus_db](C:\Users\PC\.gemini\antigravity-ide\brain\032d00dd-7034-46f6-8bc0-7ba6775026fe\erd_focus_db_clean_1789289318637.png)

---

## 2. Sơ đồ Mermaid ERD (Dành cho Xem Trực quan / Chỉnh sửa)

```mermaid
erDiagram
    %% GROUP 1: QUẢN LÝ NGƯỜI DÙNG & TÀI KHOẢN
    users {
        int id PK
        string username
        string password
        string email
        enum role
        string name
        string code
        int class_id FK
        timestamp created_at
    }

    classes {
        int id PK
        string class_name
        int advisor_id FK
        string academic_year
        timestamp created_at
    }

    face_embeddings {
        int id PK
        int student_id FK
        longblob embedding
        timestamp created_at
    }

    notifications {
        int id PK
        int user_id FK
        text message
        tinyint is_read
        timestamp created_at
    }

    %% GROUP 2: QUẢN LÝ HỌC PHẦN & PHÒNG HỌC
    courses {
        int id PK
        string course_code
        string title
        text description
    }

    spaces {
        int id PK
        string name
        enum type
        text description
        string video_path
        timestamp created_at
    }

    course_sections {
        int id PK
        int course_id FK
        string section_code
        string semester
        int space_id FK
        int lecturer_id FK
    }

    section_enrollments {
        int id PK
        int section_id FK
        int student_id FK
        timestamp created_at
    }

    %% GROUP 3: GIÁM SÁT AI & BÁO CÁO PHIÊN HỌC
    sessions {
        int id PK
        int section_id FK
        string title
        datetime start_time
        datetime end_time
        enum status
        timestamp created_at
    }

    detection_events {
        int id PK
        int session_id FK
        int student_id FK
        int track_id
        datetime timestamp
        enum behavior
        float confidence
        string image_path
        timestamp created_at
    }

    stranger_events {
        int id PK
        int session_id FK
        int track_id
        datetime first_seen
        datetime last_seen
        string image_path
        enum verification_status
    }

    analysis_results {
        int id PK
        int session_id FK
        datetime timestamp
        int total_students
        int focused_count
        int phone_count
        int sleep_count
        int unverified_count
    }

    concentration_scores {
        int id PK
        int session_id FK
        int student_id FK
        float score
        int total_phone_time
        int total_sleep_time
        int total_away_time
    }

    email_logs {
        int id PK
        int session_id FK
        int student_id FK
        string recipient_email
        string subject
        text content
        timestamp sent_at
        enum status
    }

    %% RELATIONSHIPS (MỐI QUAN HỆ 1 - N)
    classes ||--o{ users : "1 lớp chứa N sinh viên"
    users ||--o{ classes : "1 cố vấn quản lý N lớp"
    users ||--o{ face_embeddings : "1 sinh viên có N vector khuôn mặt"
    users ||--o{ notifications : "1 người dùng nhận N thông báo"

    courses ||--o{ course_sections : "1 môn có N lớp học phần"
    spaces ||--o{ course_sections : "1 phòng máy có N lớp học phần"
    users ||--o{ course_sections : "1 giảng viên dạy N lớp học phần"
    course_sections ||--o{ section_enrollments : "1 lớp HP có N sinh viên đăng ký"
    users ||--o{ section_enrollments : "1 sinh viên đăng ký N lớp HP"

    course_sections ||--o{ sessions : "1 lớp HP có N phiên học"
    sessions ||--o{ detection_events : "1 phiên học ghi nhận N sự kiện vi phạm"
    users ||--o{ detection_events : "1 sinh viên có N vi phạm"
    sessions ||--o{ stranger_events : "1 phiên học có N sự kiện người lạ"
    sessions ||--o{ analysis_results : "1 phiên học có N bản ghi phân tích"
    sessions ||--o{ concentration_scores : "1 phiên học có N điểm tập trung"
    users ||--o{ concentration_scores : "1 sinh viên có N mốc điểm"
    sessions ||--o{ email_logs : "1 phiên học phát N email cảnh báo"
    users ||--o{ email_logs : "1 sinh viên nhận N email cảnh báo"
```

---

## 3. Bảng Phân loại Mối quan hệ Chi tiết (Chi tiết Khóa ngoại - FK)

| Bảng nguồn | Bảng liên kết (FK) | Loại mối quan hệ | Ý nghĩa nghiệp vụ |
| :--- | :--- | :---: | :--- |
| `classes` | `users(advisor_id)` | **1 - N** | Một giảng viên cố vấn có thể chủ nhiệm nhiều lớp sinh hoạt. |
| `users` | `classes(class_id)` | **1 - N** | Một lớp sinh hoạt chứa nhiều tài khoản sinh viên. |
| `course_sections` | `courses(course_id)` | **1 - N** | Một môn học có thể mở nhiều lớp học phần khác nhau. |
| `course_sections` | `spaces(space_id)` | **1 - N** | Một phòng máy/phòng học diễn ra nhiều lớp học phần. |
| `course_sections` | `users(lecturer_id)` | **1 - N** | Một giảng viên phụ trách giảng dạy nhiều lớp học phần. |
| `section_enrollments`| `course_sections(section_id)`<br>`users(student_id)` | **N - N** | Bảng trung gian thể hiện sinh viên đăng ký học các lớp học phần. |
| `sessions` | `course_sections(section_id)` | **1 - N** | Một lớp học phần tổ chức nhiều buổi/phiên giám sát. |
| `face_embeddings` | `users(student_id)` | **1 - N** | Lưu các vector nhúng nhận diện khuôn mặt ArcFace của từng sinh viên. |
| `detection_events` | `sessions(session_id)`<br>`users(student_id)` | **1 - N** | Lưu từng sự kiện AI phát hiện hành vi mất tập trung (dùng ĐT, ngủ gật). |
| `stranger_events` | `sessions(session_id)` | **1 - N** | Lưu nhật ký phát hiện đối tượng chưa xác minh / người lạ. |
| `analysis_results` | `sessions(session_id)` | **1 - N** | Lưu chỉ số phân tích định kỳ tổng hợp của cả lớp theo mốc thời gian. |
| `concentration_scores`| `sessions(session_id)`<br>`users(student_id)` | **1 - N** | Lưu kết quả điểm Focus Score cá nhân sau mỗi phiên học. |
| `email_logs` | `sessions(session_id)`<br>`users(student_id)` | **1 - N** | Lưu nhật ký email cảnh báo tự động gửi cho sinh viên/giảng viên. |
| `notifications` | `users(user_id)` | **1 - N** | Lưu thông báo chuông hiển thị trên Web/Mobile. |
