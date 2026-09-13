# backend/router/session.py
from flask import Blueprint, request, jsonify
from backend.services.pipeline import start_new_session, get_connection

session_bp = Blueprint("session", __name__)

# API lấy danh sách các Space (phòng) để hiển thị lên dropdown
@session_bp.route("/api/spaces", methods=["GET"])
def get_spaces():
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, name FROM spaces")
            spaces = cursor.fetchall()
        return jsonify(spaces)
    finally:
        conn.close()

# API tạo session mới
@session_bp.route("/api/sessions/create", methods=["POST"])
def create_new_session():
    data = request.json
    title = data.get("title", "Phiên làm việc mới")
    space_id = data.get("space_id", 1)

    # Gọi hàm từ pipeline.py để tạo session và reset tracker
    session_id = start_new_session(title=title, space_id=space_id)

    if session_id:
        return jsonify({
            "status": "success",
            "session_id": session_id,
            "message": f"Đã tạo session {title}"
        })
    else:
        return jsonify({"status": "error", "message": "Không thể tạo session"}), 500