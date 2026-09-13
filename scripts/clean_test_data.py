import os
import sys
import subprocess
import pymysql

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DB_HOST = "localhost"
DB_USER = "root"
DB_PASSWORD = "Thubezy2004@"
DB_NAME = "focus_db"

TEST_TABLES = [
    "detection_events",
    "stranger_events",
    "analysis_results",
    "concentration_scores",
    "email_logs",
    "notifications",
    "sessions"
]

def backup_database():
    backup_dir = os.path.join(os.path.dirname(__file__), "..", "SQL")
    os.makedirs(backup_dir, exist_ok=True)
    backup_file = os.path.abspath(os.path.join(backup_dir, "focus_db_backup_before_clean.sql"))
    
    print(f"[*] Step 1: Backing up database '{DB_NAME}' to '{backup_file}'...")
    
    # Try mysqldump
    mysqldump_cmd = [
        "mysqldump",
        f"-h{DB_HOST}",
        f"-u{DB_USER}",
        f"-p{DB_PASSWORD}",
        DB_NAME
    ]
    
    try:
        with open(backup_file, "w", encoding="utf-8") as f:
            res = subprocess.run(mysqldump_cmd, stdout=f, stderr=subprocess.PIPE, text=True)
            if res.returncode == 0:
                print(f"[OK] Backup successful! Backup file created at: {backup_file}")
                return True
            else:
                print(f"[!] mysqldump returned code {res.returncode}: {res.stderr}")
    except Exception as e:
        print(f"[!] Warning: Could not run mysqldump executable ({e}). Proceeding to Python SQL backup...")

    # Python fallback backup if mysqldump is not in PATH
    try:
        conn = pymysql.connect(host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_NAME)
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES")
        tables = [row[0] for row in cursor.fetchall()]
        
        with open(backup_file, "w", encoding="utf-8") as f:
            f.write(f"-- Backup of database {DB_NAME} before cleaning test data\n\n")
            f.write("SET FOREIGN_KEY_CHECKS = 0;\n\n")
            for table in tables:
                cursor.execute(f"SHOW CREATE TABLE `{table}`")
                create_sql = cursor.fetchall()[0][1]
                f.write(f"DROP TABLE IF EXISTS `{table}`;\n")
                f.write(f"{create_sql};\n\n")
                
                cursor.execute(f"SELECT * FROM `{table}`")
                rows = cursor.fetchall()
                if rows:
                    for row in rows:
                        values = ", ".join([repr(val) if val is not None else "NULL" for val in row])
                        f.write(f"INSERT INTO `{table}` VALUES ({values});\n")
                    f.write("\n")
            f.write("SET FOREIGN_KEY_CHECKS = 1;\n")
        conn.close()
        print(f"[OK] Python fallback backup successful! File created at: {backup_file}")
        return True
    except Exception as e:
        print(f"[X] Error creating backup: {e}")
        return False

def clean_database():
    print("\n[*] Step 2: Connecting to MySQL database...")
    try:
        conn = pymysql.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            cursorclass=pymysql.cursors.DictCursor
        )
        cursor = conn.cursor()
        
        # Get all tables
        cursor.execute("SHOW TABLES")
        tables = [list(row.values())[0] for row in cursor.fetchall()]
        
        # Initial count
        print("\n--- Initial Table Record Counts ---")
        initial_counts = {}
        for table in sorted(tables):
            cursor.execute(f"SELECT COUNT(*) as cnt FROM `{table}`")
            initial_counts[table] = cursor.fetchone()["cnt"]
            print(f"  - {table}: {initial_counts[table]} records")
            
        print("\n[*] Step 3: Cleaning test tables...")
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0;")
        cleaned_tables = []
        for table in TEST_TABLES:
            if table in tables:
                cursor.execute(f"TRUNCATE TABLE `{table}`")
                cleaned_tables.append(table)
                print(f"  [OK] Cleared table `{table}`")
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1;")
        conn.commit()
        
        # Final count
        print("\n--- Final Table Record Counts After Cleanup ---")
        final_counts = {}
        for table in sorted(tables):
            cursor.execute(f"SELECT COUNT(*) as cnt FROM `{table}`")
            final_counts[table] = cursor.fetchone()["cnt"]
            status = "CLEANED (0)" if table in TEST_TABLES else "PRESERVED"
            print(f"  - {table:25s}: {initial_counts[table]:6d} -> {final_counts[table]:6d} [{status}]")
            
        conn.close()
        print("\n[✓] Database cleanup completed successfully!")
        return True
    except Exception as e:
        print(f"[X] Error cleaning database: {e}")
        return False

if __name__ == "__main__":
    if backup_database():
        clean_database()
