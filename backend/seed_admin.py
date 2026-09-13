# backend/seed_admin.py
import sys
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
sys.path.append(ROOT_DIR)

from backend.db import get_conn

def seed():
    conn = get_conn()
    cursor = conn.cursor()
    try:
        # Check if admin already exists
        cursor.execute("SELECT * FROM users WHERE username = 'admin';")
        user = cursor.fetchone()
        if user:
            print("Admin user already exists!")
            return
        
        # Insert admin user
        sql = """
        INSERT INTO users (username, password, email, role, name, code, class_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s);
        """
        cursor.execute(sql, ('admin', 'admin', 'admin@bdu.edu.vn', 'admin', 'System Admin', 'ADMIN01', None))
        conn.commit()
        print("Successfully seeded admin user: username='admin', password='admin'")
    except Exception as e:
        print("Error seeding admin:", e)
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    seed()
