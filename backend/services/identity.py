import cv2
import numpy as np
import insightface
from sklearn.metrics.pairwise import cosine_similarity
from backend.db import get_conn
import os
import torch
import onnxruntime as ort
from pathlib import Path

try:
    # Make CUDA/cuDNN DLLs bundled with PyTorch visible to ONNX Runtime.
    ort.preload_dlls()
except (AttributeError, RuntimeError):
    pass

# ====== LOAD MODEL ======
# Chỉ load một lần khi module được import
print("[INFO] Loading Face Recognition Model...")
available_providers = ort.get_available_providers()
gpu_enabled = 'CUDAExecutionProvider' in available_providers
gpu_providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if gpu_enabled else ['CPUExecutionProvider']
gpu_ctx = 0 if gpu_enabled else -1
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
INSIGHTFACE_ROOT = Path(os.environ.get(
    "FOCUS_INSIGHTFACE_ROOT", PROJECT_ROOT / ".runtime" / "insightface"
))
INSIGHTFACE_ROOT.mkdir(parents=True, exist_ok=True)
app = insightface.app.FaceAnalysis(
    name="buffalo_l",
    root=str(INSIGHTFACE_ROOT),
    allowed_modules=['detection', 'recognition'],
    providers=gpu_providers,
)
app.prepare(ctx_id=gpu_ctx, det_size=(640, 640))
actual_providers = app.models['detection'].session.get_providers()
if gpu_enabled and 'CUDAExecutionProvider' not in actual_providers:
    raise RuntimeError(
        f"InsightFace requested CUDA but fell back to {actual_providers}. "
        "Check ONNX Runtime/CUDA compatibility."
    )
print(f"[INFO] InsightFace providers: {actual_providers}")

# Bộ nhớ đệm danh tính để tránh truy vấn DB quá nhiều
known_ids = []
known_names = []
known_codes = [] # Thêm mã số sinh viên
known_embeddings = []

def load_known_faces():
    """Tải dữ liệu khuôn mặt từ MySQL vào RAM"""
    global known_ids, known_names, known_codes, known_embeddings
    try:
        conn = get_conn()
        cursor = conn.cursor()
        
        # Query lấy ID, tên, mã số sinh viên và embedding từ bảng users
        query = """
        SELECT u.id, u.name, u.code AS student_code, e.embedding 
        FROM face_embeddings e
        JOIN users u ON e.student_id = u.id
        WHERE u.role = 'student'
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        
        ids = []
        names = []
        codes = []
        embeddings = []
        
        for row in rows:
            ids.append(row['id'])
            names.append(row['name'])
            codes.append(row['student_code'] if row['student_code'] else "")
            # Chuyển đổi từ byte sang numpy array
            emb = np.frombuffer(row['embedding'], dtype=np.float32)
            embeddings.append(emb)
        
        known_ids = np.array(ids)
        known_names = np.array(names)
        known_codes = np.array(codes)
        known_embeddings = np.array(embeddings)
        
        print(f"[OK] Loaded {len(known_names)} face embeddings from database.")
        
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"[ERROR] Error loading faces from DB: {e}")

# Tải dữ liệu ngay khi khởi động
load_known_faces()

def recognize_face(face_image):
    """
    Nhận diện danh tính từ ảnh khuôn mặt (đã crop)
    Trả về: name (str), score (float)
    """
    if len(known_embeddings) == 0:
        return "Unknown", 0.0

    # Tiền xử lý (tùy chọn, giống database_embedding.py)
    # lab = cv2.cvtColor(face_image, cv2.COLOR_BGR2LAB)
    # ...

    faces = app.get(face_image)
    if not faces:
        return "Unknown", 0.0
    
    # Lấy khuôn mặt lớn nhất trong ảnh crop
    face = max(faces, key=lambda x: (x.bbox[2]-x.bbox[0]) * (x.bbox[3]-x.bbox[1]))
    emb = face.embedding.reshape(1, -1)
    
    # Tính toán độ tương đồng
    sims = cosine_similarity(emb, known_embeddings)[0]
    best_idx = np.argmax(sims)
    score = sims[best_idx]
    
    if score > 0.42: # Ngưỡng chấp nhận (đã tối ưu xuống 0.42)
        return known_names[best_idx], float(score)
    else:
        return "Unknown", float(score)
