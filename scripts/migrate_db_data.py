# scripts/migrate_db_data.py
import sys
import os
import pymysql

# Cấu hình UTF-8 cho Windows Terminal để không bị lỗi mã hóa
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

# Thêm thư mục gốc vào path để import db cấu hình nếu cần
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Cấu hình kết nối
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "Thubezy2004@",
    "charset": "utf8mb4"
}

def migrate():
    # Kết nối đến 2 cơ sở dữ liệu
    try:
        conn_src = pymysql.connect(**DB_CONFIG, database="focus_system", cursorclass=pymysql.cursors.DictCursor)
        conn_dest = pymysql.connect(**DB_CONFIG, database="focus_db", cursorclass=pymysql.cursors.DictCursor)
        print("[OK] Ket noi thanh cong den ca 2 co so du lieu!")
    except Exception as e:
        print(f"[ERR] Ket noi co so du lieu that bai: {e}")
        return

    try:
        # 1. Di chuyển các Lớp sinh hoạt (classes)
        print("\n--- 1. Dang di chuyen cac lop hoc (classes) ---")
        with conn_src.cursor() as cur_src, conn_dest.cursor() as cur_dest:
            cur_src.execute("SELECT * FROM classes;")
            classes = cur_src.fetchall()
            print(f"Tim thay {len(classes)} lop o CSDL cu.")
            
            # Tắt kiểm tra khóa ngoại tạm thời ở đích để tránh lỗi khi chèn
            cur_dest.execute("SET FOREIGN_KEY_CHECKS = 0;")
            
            class_map = {} # map old_id -> new_id
            for c in classes:
                # Kiểm tra xem lớp đã tồn tại ở CSDL mới chưa
                cur_dest.execute("SELECT id FROM classes WHERE class_name = %s;", (c["class_name"],))
                exists = cur_dest.fetchone()
                if exists:
                    class_map[c["id"]] = exists["id"]
                    print(f"  Lop '{c['class_name']}' da ton tai o DB moi. Bo qua.")
                else:
                    cur_dest.execute(
                        "INSERT INTO classes (class_name, advisor_id) VALUES (%s, NULL);",
                        (c["class_name"],)
                    )
                    new_id = cur_dest.lastrowid
                    class_map[c["id"]] = new_id
                    print(f"  [+] Da chuyen lop: {c['class_name']} (ID moi: {new_id})")
            conn_dest.commit()

        # 2. Di chuyển thông tin Sinh viên (students -> users)
        print("\n--- 2. Dang di chuyen thong tin Sinh vien (students -> users) ---")
        with conn_src.cursor() as cur_src, conn_dest.cursor() as cur_dest:
            cur_src.execute("SELECT * FROM students;")
            students = cur_src.fetchall()
            print(f"Tim thay {len(students)} sinh vien o CSDL cu.")
            
            student_map = {} # map old_student_id -> new_user_id
            for s in students:
                code = s["student_code"] if s["student_code"] else f"SV{s['id']:06d}"
                # Kiểm tra xem sinh viên đã tồn tại trong bảng users mới chưa
                cur_dest.execute("SELECT id FROM users WHERE code = %s;", (code,))
                exists = cur_dest.fetchone()
                if exists:
                    student_map[s["id"]] = exists["id"]
                    print(f"  Sinh vien '{s['name']}' (Ma: {code}) da ton tai. Bo qua.")
                else:
                    # Tạo tài khoản đăng nhập mặc định cho sinh viên
                    username = code.lower().strip()
                    email = f"{username}@student.edu.vn"
                    password = code  # Đặt mật khẩu mặc định là mã số sinh viên
                    new_class_id = class_map.get(s["class_id"])
                    
                    cur_dest.execute(
                        """
                        INSERT INTO users (username, password, email, role, name, code, class_id, created_at)
                        VALUES (%s, %s, %s, 'student', %s, %s, %s, %s);
                        """,
                        (username, password, email, s["name"], code, new_class_id, s["created_at"])
                    )
                    new_id = cur_dest.lastrowid
                    student_map[s["id"]] = new_id
                    print(f"  [+] Da chuyen sinh vien: {s['name']} | MS: {code} -> Tai khoan: {username}")
            conn_dest.commit()

        # 3. Di chuyển dữ liệu Định danh / Trích xuất khuôn mặt (face_embeddings)
        print("\n--- 3. Dang di chuyen du lieu dinh danh khuon mat (face_embeddings) ---")
        with conn_src.cursor() as cur_src, conn_dest.cursor() as cur_dest:
            cur_src.execute("SELECT * FROM face_embeddings;")
            embeddings = cur_src.fetchall()
            print(f"Tim thay {len(embeddings)} ban ghi dinh danh khuon mat o CSDL cu.")
            
            count = 0
            for emb in embeddings:
                old_student_id = emb["student_id"]
                new_user_id = student_map.get(old_student_id)
                
                if not new_user_id:
                    print(f"  [!] Bỏ qua bản ghi ID {emb['id']} vì không tìm thấy sinh viên tương ứng.")
                    continue
                
                cur_dest.execute(
                    "INSERT INTO face_embeddings (student_id, embedding) VALUES (%s, %s);",
                    (new_user_id, emb["embedding"])
                )
                count += 1
            
            # Bật lại kiểm tra khóa ngoại
            cur_dest.execute("SET FOREIGN_KEY_CHECKS = 1;")
            conn_dest.commit()
            print(f"[OK] Da chuyen thanh cong {count}/{len(embeddings)} ban ghi dinh danh khuon mat!")

        print("\n[OK] Qua trinh di chuyen du lieu hoan tat!")

    except Exception as e:
        print(f"[ERR] Loi trong qua trinh di chuyen du lieu: {e}")
        # Đảm bảo bật lại khóa ngoại nếu lỗi xảy ra nửa chừng
        try:
            with conn_dest.cursor() as cur_dest:
                cur_dest.execute("SET FOREIGN_KEY_CHECKS = 1;")
                conn_dest.commit()
        except: pass
    finally:
        conn_src.close()
        conn_dest.close()

if __name__ == "__main__":
    migrate()
