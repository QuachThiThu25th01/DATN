import sys
import os
# os.environ["CUDA_VISIBLE_DEVICES"] = "-1" # Đã mở khóa GPU để chạy nhanh hơn

# =============================
# FIX PATH
# =============================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
sys.path.append(ROOT_DIR)

# =============================
# IMPORT
# =============================
from flask import Flask, render_template, redirect, session, request, jsonify, send_from_directory
from flask_cors import CORS

from backend.router.session import session_bp
from backend.router.predict import predict_bp
from backend.router.dashboard import dashboard_bp
from backend.router.auth import auth_bp

# =============================
# INIT APP
# =============================
app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "web/templates"),
    static_folder=os.path.join(BASE_DIR, "web/static"),
    static_url_path="/static"
)

# Cấu hình CORS mở rộng cho Mobile & Web Development
CORS(app, supports_credentials=True, resources={r"/*": {"origins": "*"}})


# =============================
# CONFIG
# =============================
app.secret_key = os.environ.get("SECRET_KEY", "dev_secret_key_123")
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024
app.config["TEMPLATES_AUTO_RELOAD"] = True

# =============================
# LOGIN CHECK GLOBAL
# =============================
@app.before_request
def check_login():
    # 1. Bỏ qua preflight (OPTIONS)
    if request.method == "OPTIONS":
        return
        
    # 2. Các đường dẫn công khai
    open_routes = [
        "/login", "/api/login", "/login_page", "/logout", "/api/log_error",
        "/api/user/change-password", "/api/user/update-info",
        "/api/profile/change_password", "/api/profile/update_email"
    ]
    api_prefixes = ["/api/", "/dashboard", "/select_room", "/get_realtime_data", "/stream_video"]

    # Cho phép static và các route công khai hoặc stream, hoặc xuất báo cáo
    if request.path.startswith("/static") or request.path in open_routes or \
       request.path.startswith("/stream_video") or request.path.startswith("/api/export/"):
        return

    # Bỏ qua kiểm tra session nếu request có chứa student_id hoặc user_id (Dành cho Mobile App)
    has_mobile_auth = request.args.get("student_id") or request.args.get("user_id")
    if not has_mobile_auth and request.is_json:
        try:
            body = request.get_json(silent=True) or {}
            has_mobile_auth = body.get("student_id") or body.get("user_id")
        except:
            pass
            
    if has_mobile_auth:
        return


    # 3. Kiểm tra Session
    if "user" not in session:
        # Nếu truy cập trang chủ hoặc trang web thông thường thì redirect
        if request.path == "/" or not (any(request.path.startswith(prefix) for prefix in api_prefixes) or request.accept_mimetypes.accept_json):
            return redirect("/login_page")
            
        # Nếu là các yêu cầu API thực sự thì trả về 401
        if request.path.startswith("/select_room") or request.path.startswith("/get_realtime_data"):
            return
        return jsonify({"error": "Unauthorized", "message": "Vui lòng đăng nhập"}), 401

# =============================
# REGISTER BLUEPRINTS
# =============================
app.register_blueprint(predict_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(session_bp)

# Khởi tạo AI ngầm (không chặn server khởi động)
from backend.services.pipeline import init_ai
import threading
threading.Thread(target=init_ai).start()


# =============================
# SERVE STATIC CAPTURES WITH SMART FALLBACK
# =============================
@app.route("/static/captures/<path:filename>")
def serve_capture(filename):
    capture_dir = os.path.join(BASE_DIR, "web", "static", "captures")
    filepath = os.path.join(capture_dir, filename)
    if os.path.exists(filepath):
        return send_from_directory(capture_dir, filename)
    
    if os.path.exists(capture_dir):
        files = os.listdir(capture_dir)
        if files:
            name_parts = filename.split("_")
            student_name = "_".join(name_parts[3:]).replace(".jpg", "").replace(".png", "") if len(name_parts) >= 4 else ""
            
            if student_name:
                matches = [f for f in files if student_name.lower() in f.lower()]
                if matches:
                    return send_from_directory(capture_dir, matches[0])
            
            jpg_files = [f for f in files if f.endswith('.jpg') or f.endswith('.png')]
            if jpg_files:
                return send_from_directory(capture_dir, jpg_files[0])
                
    return jsonify({"error": "Image not found"}), 404


# =============================
# ROUTES
# =============================
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/login_page")
def login_page():
    return render_template("login.html")

@app.route("/api/log_error", methods=["POST"])
def log_js_error():
    data = request.json or {}
    print(f"\n🚨 [CLIENT JS ERROR] {data.get('message')} at {data.get('url')}:{data.get('line')}:{data.get('col')}\nStack: {data.get('stack')}\n")
    return jsonify({"status": "ok"})

# =============================
# RUN APP
# =============================
if __name__ == "__main__":
    app.run(
        debug=True,
        threaded=True,
        host="0.0.0.0",
        port=5000,
        use_reloader=False  # 🔥 tránh lỗi stream video
    )