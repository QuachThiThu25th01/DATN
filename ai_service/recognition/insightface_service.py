"""
======================================================================
MODULE RECOGNITION: InsightFace Student Identification Service
Bảo toàn 100% logic so khớp vector 962 sinh viên
======================================================================
"""

import sys
import os
import numpy as np
import cv2
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

try:
    import insightface
    from insightface.app import FaceAnalysis
except ImportError:
    insightface = None

class InsightFaceService:
    def __init__(self, db_path=None):
        if db_path is None:
            db_path = PROJECT_ROOT / 'FocusDB.txt'
            
        self.face_app = None
        self.face_db = {}
        
        if insightface is not None:
            # Thử tái sử dụng model của identity để tránh tốn RAM/VRAM gấp đôi
            try:
                from backend.services import identity
                if hasattr(identity, "app") and identity.app is not None:
                    self.face_app = identity.app
                    print("[INFO] InsightFaceService is reusing identity.app model to save memory.")
            except Exception:
                pass

            if self.face_app is None:
                import onnxruntime as ort
                available = ort.get_available_providers()
                gpu_enabled = 'CUDAExecutionProvider' in available
                gpu_providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if gpu_enabled else ['CPUExecutionProvider']
                gpu_ctx = 0 if gpu_enabled else -1
                model_root = Path(os.environ.get(
                    'FOCUS_INSIGHTFACE_ROOT', PROJECT_ROOT / '.runtime' / 'insightface'
                ))
                model_root.mkdir(parents=True, exist_ok=True)
                self.face_app = FaceAnalysis(
                    name='buffalo_l',
                    root=str(model_root),
                    allowed_modules=['detection', 'recognition'],
                    providers=gpu_providers,
                )
                self.face_app.prepare(ctx_id=gpu_ctx, det_size=(640, 640))
            self._load_database(db_path)
        self._build_index()

    def _build_index(self):
        """Build contiguous arrays once instead of rebuilding them per frame."""
        self.face_ids = list(self.face_db.keys())
        self.face_names = [self.face_db[key]["name"] for key in self.face_ids]
        self.face_codes = [self.face_db[key].get("code", "") for key in self.face_ids]
        embeddings = [self.face_db[key]["embedding"] for key in self.face_ids]
        self.face_embeddings = (
            np.ascontiguousarray(embeddings, dtype=np.float32)
            if embeddings else np.empty((0, 512), dtype=np.float32)
        )

    def match_embedding(self, embedding, threshold=0.42):
        if self.face_embeddings.size == 0:
            return None
        feat = np.asarray(embedding, dtype=np.float32)
        feat /= np.linalg.norm(feat) + 1e-6
        scores = self.face_embeddings @ feat
        best_idx = int(np.argmax(scores))
        score = float(scores[best_idx])
        if score < threshold:
            return None
        return {
            "id": self.face_ids[best_idx],
            "name": self.face_names[best_idx],
            "code": self.face_codes[best_idx],
            "score": score,
        }

    def _load_database(self, db_path=None):
        count = 0
        # 1. Thử load từ MySQL DB
        try:
            from backend.db import get_conn
            conn = get_conn()
            cursor = conn.cursor()
            cursor.execute("SELECT u.id, u.name, u.code AS student_code, e.embedding FROM face_embeddings e JOIN users u ON e.student_id = u.id WHERE u.role = 'student'")
            rows = cursor.fetchall()
            for row in rows:
                s_id = str(row['id'])
                name = str(row['name'])
                emb = np.frombuffer(row['embedding'], dtype=np.float32)
                emb = emb / (np.linalg.norm(emb) + 1e-6)
                self.face_db[s_id] = {
                    "name": name, 
                    "embedding": emb, 
                    "code": row['student_code'] if row.get('student_code') else ""
                }
                count += 1
            cursor.close()
            conn.close()
            if count > 0:
                print(f"[INFO] Loaded {count} face embeddings from MySQL DB into InsightFaceService.")
                return
        except Exception:
            pass

        # 2. Fallback sang file FocusDB.txt nếu có
        if db_path is None:
            db_path = PROJECT_ROOT / 'FocusDB.txt'
        if not Path(db_path).exists():
            return
            
        lines = []
        for enc in ['utf-16', 'utf-8', 'latin-1']:
            try:
                with open(db_path, 'r', encoding=enc) as f:
                    lines = f.readlines()
                if len(lines) > 0:
                    break
            except Exception:
                continue

        for line in lines:
            try:
                parts = line.strip().split()
                if len(parts) >= 513:
                    s_id = parts[0]
                    name = " ".join(parts[1:-512])
                    feat = np.array([float(x) for x in parts[-512:]], dtype=np.float32)
                    feat = feat / (np.linalg.norm(feat) + 1e-6)
                    self.face_db[s_id] = {"name": name, "embedding": feat, "code": s_id}
                    count += 1
            except Exception:
                continue
        print(f"[INFO] Loaded {count} face embeddings into InsightFaceService.")

    def recognize_crop(self, face_crop, threshold=0.42):
        if self.face_app is None or face_crop is None or face_crop.size == 0:
            return None, 0.0, "unknown", ""
            
        faces = self.face_app.get(face_crop)
        if not faces:
            return None, 0.0, "unverified", ""
            
        # Ưu tiên lấy khuôn mặt lớn nhất trong ảnh crop
        face = max(faces, key=lambda x: (x.bbox[2]-x.bbox[0]) * (x.bbox[3]-x.bbox[1]))
        feat = face.embedding
        feat = feat / (np.linalg.norm(feat) + 1e-6)
        
        best_id = None
        best_score = -1.0
        best_name = "nguoi_la"
        
        for s_id, data in self.face_db.items():
            score = float(np.dot(feat, data["embedding"]))
            if score > best_score:
                best_score = score
                best_id = s_id
                best_name = data["name"]
                
        if best_score >= threshold:
            best_code = self.face_db[best_id].get("code", "")
            return best_id, best_score, best_name, best_code
        return None, best_score, "stranger", ""
