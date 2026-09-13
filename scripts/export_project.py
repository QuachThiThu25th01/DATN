import os
import zipfile
import subprocess
import shutil
from datetime import datetime

# Cấu hình đường dẫn
PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SQL_DIR = os.path.join(PROJECT_DIR, "SQL")
os.makedirs(SQL_DIR, exist_ok=True)
SQL_FILE = os.path.join(SQL_DIR, "focus_db_backup.sql")

# Cấu hình Database
DB_USER = "root"
DB_PASS = "Thubezy2004@"
DB_NAME = "focus_db"

def export_database():
    print("=== 1. EXPORTING MYSQL DATABASE ===")
    try:
        # Đường dẫn mặc định của MySQL trên Windows
        mysql_paths = [
            r"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe",
            r"C:\Program Files\MySQL\MySQL Server 5.7\bin\mysqldump.exe",
            "mysqldump" # Nếu đã cấu hình Environment Variable
        ]
        
        mysqldump_bin = "mysqldump"
        for path in mysql_paths:
            if os.path.exists(path):
                mysqldump_bin = path
                break

        cmd = [
            mysqldump_bin,
            f"-u{DB_USER}",
            f"-p{DB_PASS}",
            "--databases", DB_NAME,
            f"--result-file={SQL_FILE}"
        ]
        
        print(f"Running: {' '.join(cmd)}")
        subprocess.run(cmd, check=True)
        print(f"-> EXPORT DATABASE SUCCESS: {SQL_FILE}")
        return True
    except Exception as e:
        print(f"-> EXPORT DATABASE ERROR: {e}")
        print("Tip: Make sure MySQL is running and mysqldump is in your PATH.")
        return False

def zip_project():
    print("\n=== 2. ZIPPING CODEBASE ===")
    zip_filename = os.path.join(PROJECT_DIR, "FocusSystem_Colab_Package.zip")
    
    # Xoá file cũ nếu tồn tại
    if os.path.exists(zip_filename):
        try:
            os.remove(zip_filename)
        except:
            pass

    # Danh sách các thư mục/file cần bỏ qua để giảm dung lượng
    ignored_patterns = {
        ".git", ".vscode", "node_modules", "venv", ".venv", "env",
        "__pycache__", ".codex_image_temp", "brain", "demo.mp4",
        "FocusSystem_Colab_Package.zip", "dataset",
        "backup", "reports", "uploads", "captures", "CODE_OLD"
    }

    ignored_extensions = {".zip", ".rar", ".mp4", ".avi", ".mkv", ".jpg", ".png", ".jpeg"}

    total_files = 0
    total_size = 0

    with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(PROJECT_DIR):
            # Lọc bỏ các thư mục ẩn hoặc thư mục trong danh sách bỏ qua
            dirs[:] = [d for d in dirs if d not in ignored_patterns and not d.startswith('.')]
            
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if file in ignored_patterns or ext in ignored_extensions or file.startswith('.'):
                    continue
                
                abs_path = os.path.join(root, file)
                rel_path = os.path.relpath(abs_path, PROJECT_DIR)
                
                zipf.write(abs_path, rel_path)
                total_files += 1
                total_size += os.path.getsize(abs_path)

    print(f"-> ZIP SUCCESSFUL!")
    print(f"File name: {zip_filename}")
    print(f"Total files zipped: {total_files}")
    print(f"Size: {total_size / (1024 * 1024):.2f} MB")
    print("\nNEXT STEPS:")
    print("1. Upload 'FocusSystem_Colab_Package.zip' to your Google Drive.")
    print("2. Run the Colab notebook cells to import database and run backend.")

if __name__ == "__main__":
    export_database()
    zip_project()
