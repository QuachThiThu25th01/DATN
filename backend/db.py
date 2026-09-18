import os
import pymysql
from pymysql.cursors import DictCursor

DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "Thubezy2004@")
DB_NAME = os.environ.get("DB_NAME", "focus_db")

def get_conn():
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=DictCursor
    )

def test_connection():
    try:
        conn = get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT NOW() AS time;")
        result = cursor.fetchone()
        print("✅ DB Connection OK! Current time:", result["time"])
        cursor.close()
        conn.close()
    except Exception as e:
        print("❌ DB Connection Failed:", e)

# Nếu chạy file trực tiếp, test luôn
if __name__ == "__main__":
    test_connection()