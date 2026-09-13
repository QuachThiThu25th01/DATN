import sys
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.db import get_conn

def update_schema():
    conn = get_conn()
    cur = conn.cursor()
    
    queries = [
        "ALTER TABLE users MODIFY COLUMN role ENUM('admin','lecturer','advisor','student') NOT NULL DEFAULT 'student';",
        """CREATE TABLE IF NOT EXISTS roles (
            id int NOT NULL AUTO_INCREMENT,
            name varchar(50) NOT NULL,
            description varchar(255) DEFAULT NULL,
            created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;""",
        """INSERT IGNORE INTO roles (id, name, description) VALUES 
        (1,'admin','Quan tri he thong'),
        (2,'lecturer','Giang vien bo mon'),
        (3,'advisor','Giang vien chu nhiem / Co van hoc tap'),
        (4,'student','Sinh vien');""",
        """CREATE TABLE IF NOT EXISTS permissions (
            id int NOT NULL AUTO_INCREMENT,
            code varchar(100) NOT NULL,
            description varchar(255) DEFAULT NULL,
            created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY code (code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;""",
        """CREATE TABLE IF NOT EXISTS user_roles (
            user_id int NOT NULL,
            role_id int NOT NULL,
            PRIMARY KEY (user_id, role_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;""",
        """CREATE TABLE IF NOT EXISTS teaching_assignments (
            id int NOT NULL AUTO_INCREMENT,
            lecturer_id int NOT NULL,
            course_section_id int NOT NULL,
            assigned_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;""",
        """CREATE TABLE IF NOT EXISTS advisor_assignments (
            id int NOT NULL AUTO_INCREMENT,
            advisor_id int NOT NULL,
            class_id int NOT NULL,
            assigned_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"""
    ]
    
    for q in queries:
        try:
            cur.execute(q)
        except Exception as e:
            print("Error executing query:", e)
            
    conn.commit()
    cur.execute("SHOW TABLES;")
    tables = [list(r.values())[0] for r in cur.fetchall()]
    print("[OK] UPDATED MYSQL DATABASE TABLES:", tables)
    conn.close()

if __name__ == "__main__":
    update_schema()
