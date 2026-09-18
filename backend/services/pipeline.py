from datetime import datetime
from collections import defaultdict, deque
from queue import Full, Queue
import json
import threading
import time
import os
from pathlib import Path
import cv2
import torch
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from backend.db import get_conn as get_connection

# Import 100% Modular AI Engines từ ai_service
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
WEIGHTS_PATH = Path(os.environ.get('FOCUS_YOLO_WEIGHTS', PROJECT_ROOT / 'models' / 'yolov8s.pt'))
if not WEIGHTS_PATH.exists():
    WEIGHTS_PATH = PROJECT_ROOT / 'yolov8s.pt'
if not WEIGHTS_PATH.exists():
    WEIGHTS_PATH = PROJECT_ROOT / 'yolov8m.pt'

YOLO_SIZE = int(os.environ.get('FOCUS_YOLO_SIZE', '512'))
YOLO_CONFIDENCE = float(os.environ.get('FOCUS_YOLO_CONFIDENCE', '0.10'))
FACE_MESH_INTERVAL = max(1, int(os.environ.get('FOCUS_FACE_MESH_INTERVAL', '3')))
PHONE_DETECT_INTERVAL = max(1, int(os.environ.get('FOCUS_PHONE_DETECT_INTERVAL', '10')))

SHOW_FPS = os.environ.get('FOCUS_SHOW_FPS', '0') == '1'
SHOW_OVERLAYS = os.environ.get('FOCUS_SHOW_OVERLAYS', '0') == '1'

from ai_service.detection.yolo_detector import YoloDetector, suppress_duplicate_persons, get_skin_mask_info
from ai_service.tracking.byte_tracker import ByteTrackerService
from ai_service.features.eye_state import EyeFeatureExtractor
from ai_service.features.head_pose import compute_3d_head_pose, draw_3d_axis
from ai_service.features.phone_tracker import PhoneBoxKalmanTracker
from ai_service.features.motion import calculate_motion_level
from ai_service.behavior.lstm_model import MultiFeatureLSTM, normalize_feature_vector, rule_fusion, BEHAVIOR_CLASSES
from ai_service.behavior.sequence_buffer import SequenceBuffer
from ai_service.behavior.temporal_filter import update_temporal_state
from ai_service.scoring.attention_engine import attention_score_for
from ai_service.recognition.insightface_service import InsightFaceService

# Biến kiểm tra AI đã sẵn sàng chưa
AI_READY = False
detector = None
tracker_service = None
eye_extractor = None
seq_buffer = None
lstm_model = None
lstm_ready = False
recog_service = None
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

def init_ai():
    global AI_READY, detector, tracker_service, eye_extractor, seq_buffer, lstm_model, lstm_ready, recog_service
    try:
        # InsightFace is intentionally imported here so Flask can start while
        # the ONNX models are initialized by this background worker.
        from . import identity as identity_service  # noqa: F401
        
        detector = YoloDetector(
            weights_path=str(WEIGHTS_PATH),
            device='cuda' if torch.cuda.is_available() else 'cpu',
            imgsz=(YOLO_SIZE, YOLO_SIZE),
            conf_thres=YOLO_CONFIDENCE,
        )
        tracker_service = ByteTrackerService()
        eye_extractor = EyeFeatureExtractor()
        seq_buffer = SequenceBuffer(sequence_length=16)
        recog_service = InsightFaceService()

        model_path = PROJECT_ROOT / 'models' / 'lstm_multifeature' / 'best.pt'
        if model_path.exists():
            try:
                lstm_model = MultiFeatureLSTM().to(device)
                try:
                    checkpoint = torch.load(str(model_path), map_location=device, weights_only=True)
                except TypeError:
                    checkpoint = torch.load(str(model_path), map_location=device)
                if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
                    lstm_model.load_state_dict(checkpoint["model_state_dict"])
                else:
                    lstm_model.load_state_dict(checkpoint)
                lstm_model.eval()
                lstm_ready = True
                print("✅ [Dashboard] Loaded Multi-Feature LSTM Model Successfully!")
            except Exception as e_m:
                print(f"⚠️ [Dashboard] Could not load LSTM model: {e_m}")

        AI_READY = True
        print(
            f"[AI] Ready: device={device}, fp16={getattr(detector, 'use_half', False)}, "
            f"yolo={YOLO_SIZE}, face_interval={FACE_MESH_INTERVAL}, "
            f"phone_interval={PHONE_DETECT_INTERVAL}"
        )
        return True
    except Exception as e:
        print(f"⚠️ Lỗi khởi tạo Dashboard AI: {e}")
        return False

# =============================
# GLOBAL STATE (Seat Anchors + Student Memory)
# =============================
seat_anchors = {}
student_states = {}
identity_cache = {}
face_attempts = {}
last_face_frame = {}
session_detected_ids = set()
frame_count = 0
next_seat_id = 1
_fps_deque = deque(maxlen=30)
_last_pipeline_time = None

# Reuse CPU preprocessing objects instead of rebuilding them every frame.
_clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
_gamma_lut = np.array([
    ((i / 255.0) ** (1.0 / 0.85)) * 255 for i in np.arange(256)
], dtype=np.uint8)

# A single bounded writer keeps DB latency away from the realtime loop.
_analysis_queue = Queue(maxsize=128)
_analysis_worker_started = False
_analysis_worker_lock = threading.Lock()

def get_rotated_object_box(phone_crop, skin_mask):
    """
    Tìm hộp bao xoay (Rotated Bounding Box) ôm sát vật thể phi-da-tay (như bút hoặc điện thoại)
    bằng cách phân tích Contour trên mặt nạ phi-da-tay (Non-skin mask).
    """
    if phone_crop is None or phone_crop.size == 0 or skin_mask is None or skin_mask.size == 0:
        return None, 1.0, 0.0
        
    non_skin = cv2.bitwise_not(skin_mask)
    gray = cv2.cvtColor(phone_crop, cv2.COLOR_BGR2GRAY)
    _, dark_mask = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY_INV)
    combined = cv2.bitwise_and(non_skin, dark_mask)
    
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)
    
    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None, 1.0, 0.0
        
    c = max(contours, key=cv2.contourArea)
    if cv2.contourArea(c) < 100:
        return None, 1.0, 0.0
        
    rect = cv2.minAreaRect(c)
    box_points = cv2.boxPoints(rect)
    box_points = box_points.astype(np.int32)
    
    (cx, cy), (w, h), angle = rect
    aspect_ratio = max(w, h) / (min(w, h) + 1e-6)
    
    return box_points, aspect_ratio, angle

def preprocess_frame(im0):
    """
    Tiền xử lý ảnh Video đầu vào (Data Preprocessing Pipeline):
    Bỏ qua CLAHE toàn cảnh trên CPU để đạt tốc độ 18-25 FPS real-time.
    """
    if im0 is None or im0.size == 0:
        return im0

    if os.environ.get("FOCUS_ENABLE_CLAHE", "0") == "1":
        lab = cv2.cvtColor(im0, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        cl = _clahe.apply(l)
        enhanced_lab = cv2.merge((cl, a, b))
        enhanced = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
        mean_luminance = np.mean(cl)
        if mean_luminance > 155:
            enhanced = cv2.LUT(enhanced, _gamma_lut)
        return enhanced

    return im0

def start_new_session(title="Realtime Session", space_id=1):
    global seat_anchors, student_states, identity_cache, session_detected_ids, frame_count, face_attempts, last_face_frame, next_seat_id, tracker_service, seq_buffer
    
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM course_sections WHERE space_id = %s LIMIT 1", (space_id,))
    row = cursor.fetchone()
    if row:
        section_id = row["id"]
    else:
        cursor.execute("SELECT id FROM courses LIMIT 1")
        course_row = cursor.fetchone()
        if course_row:
            course_id = course_row["id"]
        else:
            cursor.execute("INSERT INTO courses (course_code, title) VALUES ('TU_HOC', 'Môn Tự Học')")
            course_id = cursor.lastrowid
        
        section_code = f"SEC_SPACE_{space_id}"
        cursor.execute("""
            INSERT INTO course_sections (course_id, section_code, semester, space_id)
            VALUES (%s, %s, 'HK2_25-26', %s)
            ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
        """, (course_id, section_code, space_id))
        section_id = cursor.lastrowid
        conn.commit()

    cursor.execute("""
        SELECT s.id FROM sessions s 
        JOIN course_sections cs ON s.section_id = cs.id
        WHERE cs.space_id = %s AND s.status = 'ongoing'
    """, (space_id,))
    old_sessions = cursor.fetchall()
    for old_s in old_sessions:
        old_id = old_s["id"]
        cursor.execute("UPDATE sessions SET status = 'completed', end_time = NOW() WHERE id = %s", (old_id,))
        conn.commit()
        try:
            from backend.services.email_service import process_post_session_emails
            process_post_session_emails(old_id)
        except Exception as e_em:
            print(f"⚠️ [EMAIL SERVICE] Lỗi gửi email cho session cũ {old_id}: {e_em}")
    
    cursor.execute("INSERT INTO sessions (section_id, title, start_time) VALUES (%s, %s, NOW())", (section_id, title))
    conn.commit()
    session_id = cursor.lastrowid
    cursor.close()
    conn.close()

    seat_anchors.clear()
    student_states.clear()
    identity_cache.clear()
    face_attempts.clear()
    last_face_frame.clear()
    session_detected_ids.clear()
    frame_count = 0
    next_seat_id = 1
    _fps_deque.clear()
    _last_pipeline_time = None
    if tracker_service:
        tracker_service = ByteTrackerService()
    if seq_buffer:
        seq_buffer.clear()

    print(f"🧹 Đã xóa sạch bộ nhớ Dashboard AI cho Session mới: {session_id}")
    return session_id

def reset_session_states():
    global seat_anchors, student_states, identity_cache, face_attempts, last_face_frame, frame_count, next_seat_id, tracker_service, seq_buffer, _last_pipeline_time, _fps_deque
    seat_anchors.clear()
    student_states.clear()
    identity_cache.clear()
    face_attempts.clear()
    last_face_frame.clear()
    frame_count = 0
    next_seat_id = 1
    _fps_deque.clear()
    _last_pipeline_time = None
    if tracker_service:
        tracker_service = ByteTrackerService()
    if seq_buffer:
        seq_buffer.clear()
    print("🧹 [Dashboard] Đã reset bộ nhớ trạng thái khi video bắt đầu lại!")

def run_pipeline(image, session_id=None, current_time=None):
    global frame_count, seat_anchors, student_states, identity_cache, session_detected_ids, face_attempts, last_face_frame, next_seat_id, _last_pipeline_time, _fps_deque
    start_pipeline_t = time.time()
    
    if not AI_READY or detector is None or tracker_service is None:
        return [], image

    frame_count += 1
    if current_time is None:
        current_time = time.time()
    
    raw_image = image.copy()
    # Preprocess frame (CLAHE + Anti-Glare)
    image = preprocess_frame(image)
    h_orig, w_orig = image.shape[:2]

    # Step 1: YOLO Person & Phone Detection
    person_list, phone_list = detector.detect(image)
    person_list = suppress_duplicate_persons(person_list, iou_thresh=0.50)

    # Step 2: ByteTrack Multi-Object Person Tracking
    online_targets = tracker_service.update(person_list, image)

    # Chạy phát hiện khuôn mặt trên toàn cảnh bằng InsightFace (Chỉ chạy khi có học sinh cần nhận dạng VÀ tới nhịp đếm frame)
    faces = []
    should_run_face_recog = False
    for t in online_targets:
        if hasattr(t, 'tlbr'):
            tx1, ty1, tx2, ty2 = map(int, t.tlbr)
        elif hasattr(t, 'tlwh'):
            tx1, ty1, tw, th = map(int, t.tlwh)
            tx2, ty2 = tx1 + tw, ty1 + th
        else:
            tx1, ty1, tx2, ty2 = int(t[0]), int(t[1]), int(t[2]), int(t[3])
        cx, cy = (tx1 + tx2) / 2.0, (ty1 + ty2) / 2.0
        
        matched_seat = None
        min_dist = 250.0
        for sid, (ax, ay, last_t) in list(seat_anchors.items()):
            if current_time - last_t > 8.0:
                continue
            dist = np.hypot(cx - ax, cy - ay)
            if dist < min_dist:
                min_dist = dist
                matched_seat = sid
        tid = matched_seat if matched_seat is not None else next_seat_id
        name = identity_cache.get(tid, {}).get("name", "Đang nhận dạng")
        if name.startswith("Đang nhận dạng") or name.startswith("Người lạ"):
            attempts = face_attempts.get(tid, 0)
            last_f = last_face_frame.get(tid, 0)
            if (last_f == 0) or (attempts < 15 and frame_count - last_f >= 10):
                should_run_face_recog = True
                break
            
    if should_run_face_recog and recog_service is not None:
        faces = recog_service.face_app.get(raw_image)

    results = []
    assigned_names = [info["name"] for info in identity_cache.values() if not info["name"].startswith("Đang nhận dạng") and not info["name"].startswith("Người lạ")]

    for t in online_targets:
        if hasattr(t, 'tlwh'):
            tlwh = t.tlwh
            tx1, ty1, tw, th = map(int, tlwh)
            tx2, ty2 = tx1 + tw, ty1 + th
        elif hasattr(t, 'tlbr'):
            tx1, ty1, tx2, ty2 = map(int, t.tlbr)
            tw, th = tx2 - tx1, ty2 - ty1
        else:
            tx1, ty1, tx2, ty2 = int(t[0]), int(t[1]), int(t[2]), int(t[3])
            tw, th = tx2 - tx1, ty2 - ty1

        tx1, ty1 = max(0, tx1), max(0, ty1)
        tx2, ty2 = min(w_orig, tx2), min(h_orig, ty2)
        tw, th = tx2 - tx1, ty2 - ty1

        if tw < 15 or th < 15:
            continue

        # Spatial Seat Anchoring (Khóa ID chỗ ngồi cố định)
        cx, cy = (tx1 + tx2) / 2.0, (ty1 + ty2) / 2.0
        matched_seat = None
        min_dist = 250.0

        for sid, (ax, ay, last_t) in list(seat_anchors.items()):
            if current_time - last_t > 8.0:
                continue
            dist = np.hypot(cx - ax, cy - ay)
            if dist < min_dist:
                min_dist = dist
                matched_seat = sid

        if matched_seat is not None:
            tid = matched_seat
            scx, scy, _ = seat_anchors[tid]
            # Alpha = 0.1 để neo ghế di chuyển chậm tránh nhảy ID khi nằm gục
            seat_anchors[tid] = (0.1 * cx + 0.9 * scx, 0.1 * cy + 0.9 * scy, current_time)
        else:
            tid = next_seat_id
            next_seat_id += 1
            seat_anchors[tid] = (cx, cy, current_time)

        if tid not in student_states:
            student_states[tid] = {
                "last_seen": current_time,
                "smooth_yaw": 0.0, "smooth_pitch": 0.0, "smooth_roll": 0.0,
                "candidate": "unknown", "candidate_since": current_time,
                "stable_behavior": "unknown", "violation_since": None,
                "phone_prob": 0.0, "phone_box": None, "phone_hold_until": 0.0,
                "phone_kalman": PhoneBoxKalmanTracker(),
                "student_name": f"Sinh Vien #{tid}",
                "mesh_cache": None,
                "last_mesh_frame": -FACE_MESH_INTERVAL,
                "last_phone_frame": -PHONE_DETECT_INTERVAL,
            }

        state = student_states[tid]
        state["last_seen"] = current_time

        if "phone_kalman" not in state:
            state["phone_kalman"] = PhoneBoxKalmanTracker()
        kalman_tracker = state["phone_kalman"]

        # 3. Targeted Face Recognition (InsightFace)
        student_info = identity_cache.get(tid, {"name": f"Đang nhận dạng #{tid}", "id": None, "code": ""})

        if student_info["name"].startswith("Đang nhận dạng") or student_info["name"].startswith("Người lạ"):
            attempts = face_attempts.get(tid, 0)
            last_f = last_face_frame.get(tid, 0)
            should_check = (last_f == 0) or (attempts < 15 and frame_count - last_f >= 10)

            if should_check and faces:
                face_attempts[tid] = attempts + 1
                last_face_frame[tid] = frame_count

                # Vùng đầu của học sinh (nửa trên body bbox)
                head_h = int(th * 0.45)
                hx1, hy1, hx2, hy2 = tx1, ty1, tx2, ty1 + head_h
                
                matched_face = None
                max_area = 0
                for face in faces:
                    fx1, fy1, fx2, fy2 = map(int, face.bbox)
                    fcx, fcy = (fx1 + fx2) / 2.0, (fy1 + fy2) / 2.0
                    if hx1 <= fcx <= hx2 and hy1 <= fcy <= hy2:
                        area = (fx2 - fx1) * (fy2 - fy1)
                        if area > max_area:
                            max_area = area
                            matched_face = face

                if matched_face is not None:
                    # Trích xuất đặc trưng và so khớp trực tiếp giống test_face_video.py
                    feat = matched_face.embedding
                    feat = feat / (np.linalg.norm(feat) + 1e-6)
                    
                    known_ids_list = list(recog_service.face_db.keys())
                    known_names_list = [recog_service.face_db[kid]["name"] for kid in known_ids_list]
                    known_codes_list = [recog_service.face_db[kid].get("code", "") for kid in known_ids_list]
                    known_embs_list = [recog_service.face_db[kid]["embedding"] for kid in known_ids_list]
                    
                    if len(known_embs_list) > 0:
                        known_embs = np.array(known_embs_list)
                        sims = np.dot(known_embs, feat) # So sánh tương đồng cosine bằng tích vô hướng
                        best_idx = np.argmax(sims)
                        score = sims[best_idx]
                        
                        if score >= 0.42:
                            best_id = known_ids_list[best_idx]
                            best_name = known_names_list[best_idx]
                            best_code = known_codes_list[best_idx]
                            
                            if best_name not in assigned_names:
                                student_info = {
                                    "name": best_name,
                                    "id": int(best_id),
                                    "code": best_code
                                }
                                identity_cache[tid] = student_info
                                assigned_names.append(best_name)
                                if student_info["id"]:
                                    session_detected_ids.add(student_info["id"])

                if student_info["id"] is None and face_attempts[tid] >= 15:
                    student_info["name"] = f"Người lạ #{tid}"
                    identity_cache[tid] = student_info

        state["student_name"] = student_info["name"]

        # 4. Extract FaceMesh & 3D Head Pose & Gaze
        crop_x0, crop_y0 = tx1, ty1
        # Mở rộng vùng cắt đầu lên 65% chiều cao thân để không bị mất mặt khi cúi sâu/nghiêng đầu
        crop_x1, crop_y1 = tx2, ty1 + int(th * 0.65)
        head_crop = image[crop_y0:crop_y1, crop_x0:crop_x1]

        mesh_due = (
            state.get("mesh_cache") is None
            or (frame_count + tid) % FACE_MESH_INTERVAL == 0
        )
        if mesh_due:
            mesh_features = eye_extractor.extract_crop(
                head_crop, crop_x0, crop_y0, w_orig, h_orig
            )
            state["mesh_cache"] = mesh_features
            state["mesh_origin"] = (crop_x0, crop_y0)
            state["last_mesh_frame"] = frame_count
        else:
            mesh_features = state["mesh_cache"]

        s_yaw, s_pitch, s_roll, gaze_x, gaze_y, ear, mesh_valid, left_pts, right_pts, l_iris, r_iris, nose_pt = mesh_features

        # Bám đuổi tọa độ mắt/mũi 100% thời gian thực theo sự di chuyển của sinh viên
        if not mesh_due and state.get("mesh_origin") is not None:
            old_x0, old_y0 = state["mesh_origin"]
            dx, dy = crop_x0 - old_x0, crop_y0 - old_y0
            if dx != 0 or dy != 0:
                if left_pts is not None:
                    left_pts = left_pts + np.array([dx, dy], dtype=np.int32)
                if right_pts is not None:
                    right_pts = right_pts + np.array([dx, dy], dtype=np.int32)
                if nose_pt is not None:
                    nose_pt = (nose_pt[0] + dx, nose_pt[1] + dy)
                if l_iris is not None:
                    l_iris = (l_iris[0] + int(dx), l_iris[1] + int(dy))
                if r_iris is not None:
                    r_iris = (r_iris[0] + int(dx), r_iris[1] + int(dy))

        if mesh_valid > 0:
            alpha = 0.25
            pitch = alpha * s_pitch + (1 - alpha) * state.get("smooth_pitch", s_pitch)
            yaw   = alpha * s_yaw   + (1 - alpha) * state.get("smooth_yaw", s_yaw)
            roll  = alpha * s_roll  + (1 - alpha) * state.get("smooth_roll", s_roll)
            state["smooth_pitch"] = pitch
            state["smooth_yaw"] = yaw
            state["smooth_roll"] = roll
            
            if state.get("status", "attentive") not in ("sleeping", "using_phone"):
                if state.get("stable_y_top") is None:
                    state["stable_y_top"] = float(ty1)
                else:
                    if ty1 < state["stable_y_top"]:
                        state["stable_y_top"] = 0.8 * state["stable_y_top"] + 0.2 * float(ty1)
                    else:
                        state["stable_y_top"] = 0.995 * state["stable_y_top"] + 0.005 * float(ty1)
        else:
            pitch = state.get("smooth_pitch", 0.0)
            yaw = state.get("smooth_yaw", 0.0)
            roll = state.get("smooth_roll", 0.0)
            nose_pt = None

        is_slumped = False
        if state.get("stable_y_top") is not None and mesh_valid == 0:
            if (ty1 - state["stable_y_top"]) > max(60.0, 0.20 * th):
                is_slumped = True

        # 5. Global Phone Detection + Selective Hand-Crop Upsampling
        phones_found = []
        # Ưu tiên 1: Lấy điện thoại từ phone_list toàn cảnh (đã được YOLO quét ở Bước 1 - 0% tốn thêm GPU)
        for px1, py1, px2, py2, pconf in phone_list:
            pcx, pcy = (px1 + px2) / 2.0, (py1 + py2) / 2.0
            if tx1 <= pcx <= tx2 and ty1 <= pcy <= ty2:
                if pconf < 0.35:
                    continue
                rel_y = (pcy - ty1) / (th + 1e-6)
                if 0.12 <= rel_y <= 0.42 and pconf < 0.65:
                    continue
                phone_crop = image[py1:py2, px1:px2]
                if phone_crop.size > 0:
                    is_valid_phone_hand, skin_ratio, _ = get_skin_mask_info(phone_crop, max_skin_ratio=0.75, min_skin_ratio=0.02)
                    if is_valid_phone_hand:
                        phones_found.append((px1, py1, px2, py2, float(pconf), skin_ratio))

        # Ưu tiên 2: Nếu chưa tìm thấy điện thoại ở toàn cảnh VÀ đến nhịp đếm frame -> Quét sâu Hand-Crop
        phone_due = (
            state.get("last_phone_frame", -PHONE_DETECT_INTERVAL) < 0
            or (frame_count + tid) % PHONE_DETECT_INTERVAL == 0
        )
        if not phones_found and phone_due:
            hand_phones = detector.detect_in_hand_crop(image, (tx1, ty1, tx2, ty2))
            if hand_phones:
                phones_found.extend(hand_phones)
            state["last_phone_frame"] = frame_count

        if phones_found:
            best_phone = max(phones_found, key=lambda p: p[4])
            bx1, by1, bx2, by2, bconf, bskin = best_phone
            k_box = kalman_tracker.update((bx1, by1, bx2, by2))
            state["smooth_phone_box"] = k_box
            state["phone_prob"] = float(bconf)
            state["phone_hold_until"] = current_time + 1.5
        else:
            k_box = kalman_tracker.predict_only()
            if k_box is not None:
                state["smooth_phone_box"] = k_box
                state["phone_prob"] = max(0.40, state.get("phone_prob", 0.40) * 0.95)
            else:
                state["smooth_phone_box"] = None
                state["phone_prob"] = 0.0

        # Đánh giá lọc màu da & hình dáng bút phi-da-tay
        is_valid_phone = True
        skin_ratio = 0.0
        aspect_ratio = 1.0
        is_pen = False
        box_pts = None
        skin_mask = None
        
        if state.get("smooth_phone_box") is not None:
            spx1, spy1, spx2, spy2 = map(int, state["smooth_phone_box"])
            spx1, spy1 = max(0, spx1), max(0, spy1)
            spx2, spy2 = min(w_orig, spx2), min(h_orig, spy2)
            phone_crop = image[spy1:spy2, spx1:spx2]
            
            if phone_crop.size > 0:
                is_valid_h, skin_ratio, skin_mask = get_skin_mask_info(phone_crop, max_skin_ratio=0.65, min_skin_ratio=0.05)
                box_pts, aspect_ratio, angle = get_rotated_object_box(phone_crop, skin_mask)
                is_pen = (box_pts is not None) and (aspect_ratio > 2.8)
                is_valid_phone = is_valid_h and (not is_pen)

        # Lưu trạng thái lọc để hiển thị debug ở bước Render
        state["is_valid_phone"] = is_valid_phone
        state["phone_skin_ratio"] = skin_ratio
        state["phone_is_pen"] = is_pen
        state["phone_aspect_ratio"] = aspect_ratio
        state["phone_box_pts"] = box_pts
        state["phone_skin_mask"] = skin_mask

        # Tách biệt: Truyền xác suất điện thoại đã lọc vào LSTM/Rule quyết định để tránh nhận diện sai
        phone_prob = state.get("phone_prob", 0.0)
        filtered_phone_prob = phone_prob if is_valid_phone else 0.0
        motion_level = calculate_motion_level(state, tx1, ty1, tx2, ty2)

        # 6. LSTM Multi-Feature Fusion State Prediction
        feature = normalize_feature_vector(yaw, pitch, roll, gaze_x, gaze_y, ear, filtered_phone_prob, motion_level, 1.0 if mesh_valid > 0 else 0.0)
        seq_buffer.append(tid, feature)

        rule_behavior, rule_conf = rule_fusion(feature)
        if is_slumped:
            rule_behavior = "sleeping"
            rule_conf = 0.95

        if lstm_ready and seq_buffer.is_full(tid):
            seq = np.stack(seq_buffer.get_buffer(tid))
            seq_tensor = torch.from_numpy(seq).unsqueeze(0).float().to(device)
            with torch.inference_mode():
                prob = torch.softmax(lstm_model(seq_tensor), dim=1)[0]
                conf, idx = torch.max(prob, dim=0)
                lstm_behavior = BEHAVIOR_CLASSES[int(idx)]
                lstm_conf = float(conf)

            if (lstm_behavior in ("using_phone", "sleeping") and lstm_conf >= 0.50) or rule_behavior == "using_phone":
                mapped_behavior = "using_phone" if (rule_behavior == "using_phone" or lstm_behavior == "using_phone") else lstm_behavior
                behavior_confidence = max(lstm_conf, rule_conf)
            elif rule_behavior != "attentive":
                mapped_behavior, behavior_confidence = rule_behavior, rule_conf
            else:
                mapped_behavior = lstm_behavior
                behavior_confidence = lstm_conf
        else:
            mapped_behavior, behavior_confidence = rule_behavior, rule_conf

        # Khóa cứng quyết định: Không thể kết luận là dùng điện thoại nếu phone_prob quá thấp (< 0.25)
        if mapped_behavior == "using_phone" and phone_prob < 0.25:
            if pitch < -5.0 or gaze_y < -5.0:
                mapped_behavior = "reading_writing"
            else:
                mapped_behavior = "attentive"
            behavior_confidence = 0.80

        # 7. Temporal Filter & Attention Score Engine
        state["status"] = update_temporal_state(state, mapped_behavior, current_time)
        attention_score = attention_score_for(state, current_time)

        # 8. Render Visual Overlays directly on frame (only if SHOW_OVERLAYS is enabled)
        box_color = (0, 180, 0) if state["status"] in ("attentive", "reading_writing", "unknown") else (0, 0, 255)
        labels_vi = {"attentive":"Tap trung", "reading_writing":"Doc/Viet", "looking_away":"Quay di", "using_phone":"Dung dien thoai", "sleeping":"Ngu gat", "unknown":"Tap trung"}
        display_status = f"{labels_vi.get(state['status'], 'Tap trung')} | Score:{attention_score}"

        if SHOW_OVERLAYS:
            cv2.rectangle(image, (tx1, ty1), (tx2, ty2), box_color, 2)

            # Render Phone BBox
            if state.get("smooth_phone_box") is not None:
                spx1, spy1, spx2, spy2 = map(int, state["smooth_phone_box"])
                spx1, spy1 = max(0, spx1), max(0, spy1)
                spx2, spy2 = min(w_orig, spx2), min(h_orig, spy2)
                
                is_valid_phone = state.get("is_valid_phone", True)
                skin_ratio = state.get("phone_skin_ratio", 0.0)
                is_pen = state.get("phone_is_pen", False)
                aspect_ratio = state.get("phone_aspect_ratio", 1.0)
                box_points = state.get("phone_box_pts")

                if not is_valid_phone:
                    box_color_phone = (0, 165, 255) # Màu cam
                    if is_pen:
                        label_text = f"PEN (Aspect: {aspect_ratio:.2f}) {phone_prob:.2f}"
                    else:
                        label_text = f"PHONE (Invalid - Skin: {skin_ratio:.1%}) {phone_prob:.2f}"
                        
                    if box_points is not None:
                        global_box = box_points.copy()
                        global_box[:, 0] += spx1
                        global_box[:, 1] += spy1
                        cv2.drawContours(image, [global_box], 0, box_color_phone, 1)
                    else:
                        cv2.rectangle(image, (spx1, spy1), (spx2, spy2), box_color_phone, 1)
                    cv2.putText(image, label_text, (spx1, max(15, spy1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, box_color_phone, 1)
                else:
                    box_color_phone = (255, 0, 255) # Màu hồng sen
                    label_text = f"PHONE (Valid - Skin: {skin_ratio:.1%}) {phone_prob:.2f}"
                    
                    if box_points is not None:
                        global_box = box_points.copy()
                        global_box[:, 0] += spx1
                        global_box[:, 1] += spy1
                        cv2.drawContours(image, [global_box], 0, box_color_phone, 2)
                    else:
                        cv2.rectangle(image, (spx1, spy1), (spx2, spy2), box_color_phone, 2)
                    cv2.putText(image, label_text, (spx1, max(15, spy1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, box_color_phone, 2)

            image = draw_3d_axis(image, yaw, pitch, roll, nose_pt, tw, mesh_valid, ear)

            if left_pts is not None and right_pts is not None:
                # Vẽ đường bao mi mắt (Xanh lá/Đỏ tùy thuộc EAR)
                eye_color = (0, 255, 0) if ear >= 0.20 else (0, 0, 255)
                cv2.polylines(image, [left_pts], True, eye_color, 2)
                cv2.polylines(image, [right_pts], True, eye_color, 2)

                # Vẽ hộp bao (Bounding Box) màu xanh Cyan nổi bật quanh 2 mắt
                lx1, ly1 = np.min(left_pts, axis=0)
                lx2, ly2 = np.max(left_pts, axis=0)
                cv2.rectangle(image, (lx1 - 4, ly1 - 4), (lx2 + 4, ly2 + 4), (255, 255, 0), 2)

                rx1, ry1 = np.min(right_pts, axis=0)
                rx2, ry2 = np.max(right_pts, axis=0)
                cv2.rectangle(image, (rx1 - 4, ry1 - 4), (rx2 + 4, ry2 + 4), (255, 255, 0), 2)

                # In chỉ số EAR to hơn và dày nét hơn (Font scale: 0.55, Thickness: 2)
                cv2.putText(image, f"EAR: {ear:.2f}", (lx1 - 10, max(15, ly1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 0), 2)

            display_title = f"{student_info['name']} | {display_status}"
            cv2.putText(image, display_title, (tx1, max(20, ty1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 2)

        violation = state["status"] in ("using_phone", "sleeping", "looking_away")
        v_dur = round(current_time - state["violation_since"]) if (violation and state.get("violation_since") is not None) else 0
        
        results.append({
            "id": tid,
            "bbox": [tx1, ty1, tx2, ty2],
            "behavior": state["status"],
            "student_name": student_info["name"],
            "student_id": student_info["id"],
            "student_code": student_info["code"],
            "focus": "focused" if state["status"] in ("attentive", "reading_writing", "unknown") else "unfocused",
            "confidence": float(behavior_confidence),
            "violation": violation,
            "individual_focus_score": attention_score,
            "violation_duration": v_dur
        })

    if frame_count % 10 == 0 and session_id:
        save_analysis_async(session_id, results)

    # Render prominent FPS & Latency HUD Banner at top-left of video frame (only if SHOW_FPS is enabled)
    proc_latency_ms = (time.time() - start_pipeline_t) * 1000.0
    now_wall = time.time()
    if _last_pipeline_time is not None:
        dt = now_wall - _last_pipeline_time
        if dt > 0:
            _fps_deque.append(1.0 / dt)
    _last_pipeline_time = now_wall

    current_fps = (sum(_fps_deque) / len(_fps_deque)) if _fps_deque else 0.0

    if SHOW_FPS:
        hud_bg_x2 = 290
        hud_bg_y2 = 46
        cv2.rectangle(image, (10, 10), (hud_bg_x2, hud_bg_y2), (0, 0, 0), -1)
        cv2.rectangle(image, (10, 10), (hud_bg_x2, hud_bg_y2), (0, 255, 255), 2)
        hud_text = f"FPS: {current_fps:.1f} | Latency: {proc_latency_ms:.0f}ms"
        cv2.putText(image, hud_text, (18, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (0, 255, 255), 2)

    return results, image

def _analysis_writer():
    while True:
        session_id, results = _analysis_queue.get()
        conn = None
        try:
            conn = get_connection()
            cursor = conn.cursor()
            total = len(results)
            phone = sum(1 for r in results if r["behavior"] == "using_phone")
            sleep = sum(1 for r in results if r["behavior"] == "sleeping")
            looking_away = sum(1 for r in results if r["behavior"] == "looking_away")
            
            cursor.execute("SELECT section_id FROM sessions WHERE id = %s", (session_id,))
            sec = cursor.fetchone()
            section_id = sec['section_id'] if sec else 0
            
            unverified = sum(1 for r in results if "Người lạ" in str(r["student_name"]))
            
            cursor.execute("""
                INSERT INTO analysis_results (session_id, timestamp, total_students, focused_count, phone_count, sleep_count, unverified_count)
                VALUES (%s, NOW(), %s, %s, %s, %s, %s)
            """, (session_id, total, total - (phone + sleep + looking_away), phone, sleep, unverified))
            conn.commit()
            cursor.close()
        except Exception as exc:
            print(f"[DB] Analysis writer error: {exc}")
        finally:
            if conn:
                conn.close()
            _analysis_queue.task_done()


def _ensure_analysis_writer():
    global _analysis_worker_started
    if _analysis_worker_started:
        return
    with _analysis_worker_lock:
        if not _analysis_worker_started:
            threading.Thread(target=_analysis_writer, daemon=True, name="analysis-db-writer").start()
            _analysis_worker_started = True


def save_analysis_async(session_id, results):
    _ensure_analysis_writer()
    snapshot = [dict(result) for result in results]
    try:
        _analysis_queue.put_nowait((session_id, snapshot))
    except Full:
        # Realtime processing wins over historical samples when the DB is slow.
        try:
            _analysis_queue.get_nowait()
            _analysis_queue.task_done()
        except Exception:
            pass
        try:
            _analysis_queue.put_nowait((session_id, snapshot))
        except Full:
            pass

def get_current_stats(session_id):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT section_id FROM sessions WHERE id = %s", (session_id,))
        sec = cursor.fetchone()
        if not sec:
            return {"total_enrolled": 0}
        section_id = sec['section_id']
        cursor.execute("SELECT COUNT(*) as siso FROM section_enrollments WHERE section_id = %s", (section_id,))
        siso_row = cursor.fetchone()
        siso = siso_row['siso'] if siso_row else 0
        cursor.close()
        conn.close()
        return {"total_enrolled": siso}
    except:
        return {"total_enrolled": 0}
