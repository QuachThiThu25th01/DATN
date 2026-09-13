# backend/router/auth.py
from flask import Blueprint, request, jsonify, session, redirect, url_for
from backend.db import get_conn

auth_bp = Blueprint("auth", __name__)


# =============================
# LOGIN
# =============================
@auth_bp.route("/login", methods=["POST"])
@auth_bp.route("/api/login", methods=["POST"])
def login():
    if request.is_json:
        data = request.get_json(silent=True) or {}
    else:
        data = request.form.to_dict() if request.form else (request.json or {})

    if not data and request.data:
        try:
            import json
            data = json.loads(request.data.decode('utf-8'))
        except:
            data = {}

    username = str(data.get("username") or data.get("user") or data.get("code") or "").strip()
    password = str(data.get("password") or data.get("pass") or "").strip()

    if not username or not password:
        return jsonify({"status": "error", "error": "Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu!"}), 400

    conn = get_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, username, role, name, code, email, password FROM users WHERE username=%s", (username,))
            user = cursor.fetchone()

            if not user:
                # Tìm theo mã cán bộ / mã sinh viên (code)
                cursor.execute("SELECT id, username, role, name, code, email, password FROM users WHERE code=%s", (username,))
                user = cursor.fetchone()

            if not user:
                return jsonify({"status": "error", "error": "Tài khoản không tồn tại trên hệ thống!"}), 400

            if user["password"] != password:
                return jsonify({"status": "error", "error": "Mật khẩu không chính xác. Vui lòng kiểm tra lại!"}), 400

            session["user"] = {
                "id": user["id"],
                "username": user["username"],
                "role": user["role"],
                "name": user["name"],
                "code": user["code"],
                "email": user["email"]
            }
            return jsonify({
                "status": "ok",
                "user": session["user"]
            })
    except Exception as e:
        return jsonify({"status": "error", "error": f"Lỗi cơ sở dữ liệu: {str(e)}"}), 500
    finally:
        conn.close()


# =============================
# LOGOUT
# =============================
@auth_bp.route("/logout")
def logout():
    session.clear()
    return redirect("/login_page")


# =============================
# UPDATE PROFILE INFO (NAME / EMAIL)
# =============================
@auth_bp.route("/api/user/update-info", methods=["POST"])
@auth_bp.route("/api/profile/update_email", methods=["POST"])
def update_info():
    data = request.json or {}
    user_id = data.get("user_id") or (session.get("user", {}).get("id") if "user" in session else None)
    new_email = data.get("email")
    new_name = data.get("name")
    
    if not user_id:
        return jsonify({"error": "Dữ liệu không hợp lệ"}), 400
        
    conn = get_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()
            if not user:
                return jsonify({"error": "Người dùng không tồn tại"}), 404
                
            if new_name:
                cursor.execute("UPDATE users SET name = %s WHERE id = %s", (new_name, user_id))
            if new_email:
                cursor.execute("UPDATE users SET email = %s WHERE id = %s", (new_email, user_id))
            conn.commit()
            
            if "user" in session and session["user"]["id"] == user_id:
                if new_name: session["user"]["name"] = new_name
                if new_email: session["user"]["email"] = new_email
                session.modified = True
                
        return jsonify({"status": "ok", "message": "Cập nhật thông tin thành công"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

# =============================
# CHANGE PASSWORD
# =============================
@auth_bp.route("/api/user/change-password", methods=["POST"])
@auth_bp.route("/api/profile/change_password", methods=["POST"])
def change_password():
    data = request.json or {}
    user_id = data.get("user_id") or (session.get("user", {}).get("id") if "user" in session else None)
    old_password = data.get("old_password")
    new_password = data.get("new_password")
    
    if not user_id or not old_password or not new_password:
        return jsonify({"error": "Vui lòng nhập đầy đủ thông tin"}), 400
        
    conn = get_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT password FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()
            if not user:
                return jsonify({"error": "Người dùng không tồn tại"}), 404
                
            if user["password"] != old_password:
                return jsonify({"error": "Mật khẩu cũ không chính xác"}), 400
                
            cursor.execute("UPDATE users SET password = %s WHERE id = %s", (new_password, user_id))
            conn.commit()
            
        return jsonify({"status": "ok", "message": "Đổi mật khẩu thành công"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()
