"""
======================================================================
MODULE EMAIL SERVICE: Gửi Email cảnh báo tự động & Lưu nhật ký
Bảo toàn 100% đúng chuẩn góp ý của Thầy & schema FocusDB
======================================================================
"""

import sys
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from pathlib import Path
from email.utils import formatdate, make_msgid

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.db import get_conn

# Cấu hình SMTP (Hỗ trợ Gmail SMTP hoặc cấu hình tùy chọn)
SMTP_SERVER = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
SMTP_USER = os.environ.get("SMTP_USER", "quachthu1104@gmail.com")
SMTP_PASS = os.environ.get("SMTP_PASS", "zjqyhttaomcqlpiy")

def send_violation_email(student_email, student_name, student_code, space_name, session_title, violations_count, focus_score, violation_details, student_id=None, session_id=None, session_time="N/A"):
    """
    Gửi email cảnh báo vi phạm học tập cho sinh viên và lưu nhật ký vào email_logs DB
    """
    subject = f"[HỖ TRỢ HỌC TẬP] Báo cáo mức độ tập trung phiên học {session_title}"
    
    html_content = f"""
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 20px; }}
            .card {{ background: #ffffff; max-width: 600px; margin: 0 auto; border-radius: 16px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }}
            .header {{ border-bottom: 2px solid #6366f1; padding-bottom: 15px; margin-bottom: 20px; }}
            .header h2 {{ color: #4f46e5; margin: 0; font-size: 20px; text-transform: uppercase; }}
            .info-table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
            .info-table td {{ padding: 10px; border-bottom: 1px solid #edf2f7; font-size: 14px; }}
            .info-table td.label {{ font-weight: bold; color: #64748b; width: 40%; }}
            .score-badge {{ display: inline-block; padding: 6px 16px; background-color: #fee2e2; color: #dc2626; font-weight: bold; border-radius: 20px; font-size: 14px; }}
            .footer {{ margin-top: 30px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 15px; }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="header">
                <h2>Hệ Thống Hỗ Trợ Tập Trung Học Tập Sinh Viên</h2>
                <p style="margin: 5px 0 0 0; color: #64748b; font-size: 13px;">Thông báo kết quả học tập & Góp ý hành vi cần chú ý</p>
            </div>
            
            <p style="font-size: 14px; color: #334155;">Kính gửi sinh viên <strong>{student_name}</strong> (MSSV: <strong>{student_code}</strong>),</p>
            <p style="font-size: 14px; color: #334155; line-height: 1.6;">
                Hệ thống AI vừa hoàn tất phân tích phiên học <strong>{session_title}</strong> tại phòng <strong>{space_name}</strong>. 
                Dưới đây là chi tiết chỉ số tập trung và các hành vi cần chú ý được ghi nhận:
            </p>
            
            <table class="info-table">
                <tr>
                    <td class="label">Môn / Phiên học:</td>
                    <td><strong>{session_title}</strong></td>
                </tr>
                <tr>
                    <td class="label">Thời gian buổi học:</td>
                    <td>{session_time}</td>
                </tr>
                <tr>
                    <td class="label">Phòng học thực hành:</td>
                    <td>{space_name}</td>
                </tr>
                <tr>
                    <td class="label">Số lần mất tập trung ghi nhận:</td>
                    <td><strong style="color: #dc2626;">{violations_count} lần</strong></td>
                </tr>
                <tr>
                    <td class="label">Điểm tập trung trung bình:</td>
                    <td><span class="score-badge">{focus_score}%</span></td>
                </tr>
                <tr>
                    <td class="label">Các hành vi cần lưu ý:</td>
                    <td>{violation_details}</td>
                </tr>
            </table>

            <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 15px; border-radius: 8px; margin-top: 20px;">
                <p style="margin: 0; font-size: 13px; color: #475569; font-weight: bold;">💡 Khuyến nghị cải thiện:</p>
                <p style="margin: 5px 0 0 0; font-size: 13px; color: #64748b;">
                    Vui lòng cất giữ thiết bị di động, duy trì hướng nhìn về phía bảng/giảng viên và giữ sự tập trung cao độ trong các giờ học tiếp theo.
                </p>
            </div>

            <div class="footer">
                <p>Email này được gửi tự động từ Hệ thống Phân tích Mức độ Tập trung Sinh viên (Smart Lab AI System).</p>
            </div>
        </div>
    </body>
    </html>
    """

    status = "failed"
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_USER
        msg["To"] = student_email
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain="gmail.com")
        msg.attach(MIMEText(html_content, "html"))

        # Gửi email qua SMTP (nếu cấu hình hợp lệ)
        if "app_password_here" not in SMTP_PASS:
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(SMTP_USER, [student_email], msg.as_string())
            status = "sent"
        else:
            # Chế độ Simulated / Development
            print(f"📧 [DEV EMAIL SERVICE] Đã giả lập gửi email cảnh báo tới {student_email} (MSSV: {student_code})")
            status = "sent"
    except Exception as e:
        print(f"❌ Lỗi gửi email cho {student_email}: {e}")
        status = "failed"

    # Lưu nhật ký vào bảng email_logs trong DB
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO email_logs (student_id, session_id, recipient_email, subject, content, status, sent_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
        """, (student_id, session_id, student_email, subject, html_content, status))
        conn.commit()
    except Exception as e:
        print(f"❌ Lỗi lưu email_logs: {e}")
    finally:
        if conn:
            conn.close()

    return status == "sent"

def process_post_session_emails(session_id):
    """
    Tự động tổng hợp dữ liệu sau buổi học và gửi email cho tất cả sinh viên vi phạm vượt ngưỡng
    """
    conn = None
    sent_count = 0
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # 1. Lấy thông tin session & space
        cur.execute("""
            SELECT s.id, s.title, sp.name as space_name, s.start_time
            FROM sessions s
            JOIN course_sections cs ON s.section_id = cs.id
            JOIN spaces sp ON cs.space_id = sp.id
            WHERE s.id = %s
        """, (session_id,))
        sess_row = cur.fetchone()
        if not sess_row:
            return 0

        session_title = sess_row.get("title", f"Session #{session_id}")
        space_name = sess_row.get("space_name", "Smart Lab")
        st_time = sess_row.get("start_time")
        session_time_str = st_time.strftime("%d/%m/%Y %H:%M") if st_time and hasattr(st_time, "strftime") else "N/A"

        # 2. Lấy danh sách vi phạm của từng sinh viên trong session này
        cur.execute("""
            SELECT u.id as student_id, u.name, u.code, u.email,
                   COUNT(de.id) as violation_count,
                   GROUP_CONCAT(DISTINCT de.behavior SEPARATOR ', ') as behavior_list,
                   AVG(cs.score) as avg_score
            FROM users u
            JOIN detection_events de ON u.id = de.student_id
            LEFT JOIN concentration_scores cs ON u.id = cs.student_id AND cs.session_id = de.session_id
            WHERE de.session_id = %s AND de.behavior IN ('using_phone', 'sleeping', 'turning_away')
            GROUP BY u.id, u.name, u.code, u.email
            HAVING violation_count >= 1
        """, (session_id,))

        violators = cur.fetchall()
        for v in violators:
            s_id = v["student_id"]
            s_name = v["name"]
            s_code = v["code"]
            
            # Danh sách mã sinh viên tạm thời tắt nhận email tự động
            DISABLED_EMAIL_STUDENTS = ["20050076"]
            if s_code in DISABLED_EMAIL_STUDENTS:
                print(f"🔇 [EMAIL SERVICE] Da bo qua gui email tu dong cho sinh vien {s_name} (MSSV: {s_code}) do dang tat thong bao.")
                continue
                
            s_email = v["email"] or f"{s_code}@student.edu.vn"
            v_count = v["violation_count"]
            
            # Dịch danh sách hành vi vi phạm tiếng Anh sang tiếng Việt
            behavior_map = {
                "using_phone": "Sử dụng điện thoại",
                "sleeping": "Ngủ gật",
                "turning_away": "Quay mặt đi nơi khác",
                "looking_away": "Quay mặt đi nơi khác",
                "unverified": "Chưa xác minh được khuôn mặt"
            }
            raw_behaviors = v["behavior_list"] or ""
            translated_list = []
            for b in raw_behaviors.split(", "):
                b_clean = b.strip()
                if b_clean:
                    translated_list.append(behavior_map.get(b_clean, b_clean))
            v_behaviors = ", ".join(translated_list) if translated_list else "Sử dụng điện thoại / Mất tập trung"
            
            score = round(float(v["avg_score"]), 1) if v["avg_score"] is not None else 65.0

            ok = send_violation_email(
                student_email=s_email,
                student_name=s_name,
                student_code=s_code,
                space_name=space_name,
                session_title=session_title,
                violations_count=v_count,
                focus_score=score,
                violation_details=v_behaviors,
                student_id=s_id,
                session_id=session_id,
                session_time=session_time_str
            )
            if ok:
                sent_count += 1

    except Exception as e:
        print(f"❌ Lỗi tổng hợp gửi email session #{session_id}: {e}")
    finally:
        if conn:
            conn.close()

    return sent_count
