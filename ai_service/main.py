"""
======================================================================
MAIN REAL-TIME AI PIPELINE (MODULAR ARCHITECTURE)
Khởi chạy hệ thống Giám sát Độ tập trung theo đúng Kiến trúc Mục 9 của Thầy
Bảo toàn 100% logic và độ chính xác nhận diện từ LSTM_v2.py
======================================================================
"""

import sys
import os
import time
import math
import cv2
import torch
import numpy as np
from pathlib import Path
import tkinter as tk
from tkinter import filedialog

# Fix import paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(PROJECT_ROOT / 'yolov8_tracking-master') not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / 'yolov8_tracking-master'))
if str(PROJECT_ROOT / 'scripts' / 'head_pose_estimation') not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / 'scripts' / 'head_pose_estimation'))

from ai_service.detection.yolo_detector import YoloDetector, get_skin_mask_info
from ai_service.tracking.byte_tracker import ByteTrackerService
from ai_service.recognition.insightface_service import InsightFaceService
from ai_service.features.eye_state import EyeFeatureExtractor
from ai_service.features.head_pose import compute_3d_head_pose, draw_3d_axis
from ai_service.features.phone_tracker import PhoneBoxKalmanTracker
from ai_service.features.motion import calculate_motion_level
from ai_service.behavior.lstm_model import MultiFeatureLSTM, normalize_feature_vector, rule_fusion, BEHAVIOR_CLASSES
from ai_service.behavior.sequence_buffer import SequenceBuffer
from ai_service.behavior.temporal_filter import update_temporal_state
from ai_service.scoring.attention_engine import attention_score_for

def choose_file():
    root = tk.Tk()
    root.withdraw()
    filetypes = [
        ("Video Files", "*.mp4 *.avi *.mkv *.mov"),
        ("Media Files", "*.mp4 *.avi *.mkv *.mov *.jpg *.jpeg *.png *.bmp *.webp"),
        ("All Files", "*.*")
    ]
    print("\n[INFO] Opening file dialog to select a video for testing...")
    file_path = filedialog.askopenfilename(
        title="Select Video for Student Attention Monitoring System",
        filetypes=filetypes
    )
    root.destroy()
    return file_path

def preprocess_frame(im0):
    """
    Tiền xử lý ảnh Video đầu vào (Data Preprocessing Pipeline):
    1. Cân bằng ánh sáng thích nghi CLAHE (Contrast Limited Adaptive Histogram Equalization)
    2. Chống lóa chói phông nền trắng sáng (Anti-Glare Gamma Correction)
    3. Tăng cường độ tương phản da tay và nét viền vật thể
    """
    if im0 is None or im0.size == 0:
        return im0

    # 1. Cân bằng ánh sáng cục bộ CLAHE trên kênh L (LAB Space)
    lab = cv2.cvtColor(im0, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    cl = clahe.apply(l)
    enhanced_lab = cv2.merge((cl, a, b))
    enhanced = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)

    # 2. Kiểm tra độ chói phông nền (Mean Luminance Check)
    mean_luminance = np.mean(cl)
    if mean_luminance > 155: # Phông nền tường trắng/bảng sáng quá chói
        inv_gamma = 1.0 / 0.85
        lookup_table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
        enhanced = cv2.LUT(enhanced, lookup_table)

    return enhanced

def get_webcam_index():
    for idx in [1, 0, 2, 3]:
        temp_cap = cv2.VideoCapture(idx)
        if temp_cap.isOpened():
            ret, _ = temp_cap.read()
            temp_cap.release()
            if ret:
                return idx
    return 0

def suppress_duplicate_persons(person_list, iou_thresh=0.50):
    if not person_list:
        return []
    person_list = sorted(person_list, key=lambda x: x[4], reverse=True)
    keep = []
    for p1 in person_list:
        x1, y1, x2, y2, c1 = p1
        area1 = (x2 - x1) * (y2 - y1)
        is_dup = False
        for k in keep:
            kx1, ky1, kx2, ky2, _ = k
            area2 = (kx2 - kx1) * (ky2 - ky1)
            inter_x1, inter_y1 = max(x1, kx1), max(y1, ky1)
            inter_x2, inter_y2 = min(x2, kx2), min(y2, ky2)
            inter_w, inter_h = max(0, inter_x2 - inter_x1), max(0, inter_y2 - inter_y1)
            inter_area = inter_w * inter_h
            iou = inter_area / float(area1 + area2 - inter_area + 1e-6)
            overlap_ratio = inter_area / float(min(area1, area2) + 1e-6)
            if iou > iou_thresh or overlap_ratio > 0.60:
                is_dup = True
                break
        if not is_dup:
            keep.append(p1)
    return keep

def main():
    print("=" * 70)
    print("🚀 KHỞI CHẠY PIPELINE AI GIÁM SÁT THỜI GIAN THỰC (MODULAR ARCHITECTURE)")
    print("=" * 70)

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"[INFO] Thiết bị tính toán: {device}")

    # Paths - Upgrade to YOLOv8m (Medium model - 25.9M params) cho độ chính xác vật thể nhỏ cao hơn hẳn
    yolo_weights = PROJECT_ROOT / 'models' / 'yolov8s.pt'
    if not yolo_weights.exists():
        yolo_weights = PROJECT_ROOT / 'yolov8s.pt'
    if not yolo_weights.exists():
        yolo_weights = PROJECT_ROOT / 'yolov8m.pt'
    lstm_weights = PROJECT_ROOT / 'models' / 'lstm_multifeature' / 'best.pt'

    # Initialize Services
    print("🧠 Loading YOLOv8 Detector...")
    detector = YoloDetector(yolo_weights, device=device, conf_thres=0.05)

    print("🧠 Loading ByteTrack Tracker...")
    tracker_service = ByteTrackerService()

    print("🧠 Loading InsightFace Service...")
    recog_service = InsightFaceService()

    print("🧠 Loading Eye Feature Extractor & MediaPipe Mesh...")
    eye_extractor = EyeFeatureExtractor()

    print("🧠 Loading MultiFeatureLSTM Model...")
    lstm_model = MultiFeatureLSTM().to(device)
    lstm_ready = False
    if lstm_weights.exists():
        lstm_model.load_state_dict(torch.load(lstm_weights, map_location=device))
        lstm_model.eval()
        lstm_ready = True
        print(f"✅ Loaded Multi-Feature LSTM from: {lstm_weights}")

    seq_buffer = SequenceBuffer(sequence_length=30)
    student_states = {}
    seat_anchors = {}
    next_seat_id = 1

    replay_video = False
    current_video_path = None

    while True:
        if not replay_video:
            print("\n" + "=" * 50)
            print("   CHỌN NGUỒN ĐẦU VÀO PIPELINE (INPUT SOURCE)")
            print("=" * 50)
            print("   [c] Chạy test trên CAMERA máy tính")
            print("   [v] Chạy test trên VIDEO máy tính")
            print("   [e] Thoát chương trình (Exit)")
            print("=" * 50)
            choice = input("Lựa chọn của bạn (c/v/e): ").strip().lower()

            if choice == 'e':
                print("[INFO] Thoát chương trình.")
                break
            elif choice == 'c':
                is_camera = True
                cam_inp = input("Nhập Camera Index (Bấm Enter để dùng Webcam 1, hoặc nhập 0, 2...): ").strip()
                if cam_inp.isdigit():
                    camera_index = int(cam_inp)
                else:
                    camera_index = 1
                camera_index = get_webcam_index()
                cap = cv2.VideoCapture(camera_index)
                if not cap.isOpened():
                    print(f"❌ Không thể mở Camera index {camera_index}.")
                    continue
            elif choice == 'v':
                is_camera = False
                current_video_path = choose_file()
                if not current_video_path:
                    print("⚠️ Chưa chọn file video.")
                    continue
                cap = cv2.VideoCapture(current_video_path)
                if not cap.isOpened():
                    print(f"❌ Không thể mở video: {current_video_path}")
                    current_video_path = None
                    continue
            else:
                print("⚠️ Lựa chọn không hợp lệ.")
                continue
        else:
            is_camera = False
            cap = cv2.VideoCapture(current_video_path)
            if not cap.isOpened():
                print(f"❌ Không thể mở lại video: {current_video_path}")
                replay_video = False
                continue

        seq_buffer.clear()
        student_states.clear()
        seat_anchors.clear()
        next_seat_id = 1

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
        orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720
        frame_count = 0

        reports_dir = PROJECT_ROOT / 'reports'
        reports_dir.mkdir(exist_ok=True, parents=True)
        out_video_path = reports_dir / ("output_camera_results.mp4" if is_camera else "output_video_results.mp4")
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out_writer = cv2.VideoWriter(str(out_video_path), fourcc, fps if fps > 0 else 30.0, (orig_w, orig_h))

        print(f"\n[INFO] Đang chạy Pipeline AI thời gian thực...")
        print(f"🎬 Video kết quả sẽ được tự động lưu tại: {out_video_path}")
        print("👉 Bấm 'q' hoặc ESC để dừng video, 'r' để Replay.\n")

        while cap.isOpened():
            ret, im0 = cap.read()
            if not ret:
                break

            if is_camera:
                im0 = cv2.flip(im0, 1)

            # Preprocess Frame (CLAHE + Anti-Glare Gamma Correction)
            im0 = preprocess_frame(im0)

            frame_count += 1
            current_time = time.time() if is_camera else (frame_count / fps)

            # Step 1: Detect Persons & Phones
            person_list, phone_list = detector.detect(im0)
            # Triệt tiêu các ô người trùng lấp (Duplicate NMS Suppressor)
            person_list = suppress_duplicate_persons(person_list, iou_thresh=0.50)

            # Step 2: Track Person Bboxes
            online_targets = tracker_service.update(person_list, im0)

            # Step 3: Loop Over Active Students
            for t in online_targets:
                if hasattr(t, 'tlwh'):
                    tlwh = t.tlwh
                    tx1, ty1, tw, th = map(int, tlwh)
                    tx2, ty2 = tx1 + tw, ty1 + th
                else:
                    tx1, ty1, tx2, ty2 = int(t[0]), int(t[1]), int(t[2]), int(t[3])
                    tw, th = tx2 - tx1, ty2 - ty1

                # Spatial Seat ID Anchor Matching (Cố định ID theo vị trí chỗ ngồi lớp học)
                cx, cy = (tx1 + tx2) / 2.0, (ty1 + ty2) / 2.0
                matched_seat = None
                min_dist = 9999.0
                for sid, (scx, scy, ltime) in seat_anchors.items():
                    # Áp dụng khoảng cách Euclid có trọng số dọc (weighted vertical distance)
                    # để giảm ảnh hưởng của việc thay đổi chiều cao hộp giới hạn khi sinh viên nằm gục
                    dist = math.hypot(cx - scx, (cy - scy) * 0.4)
                    # Tăng khoảng cách neo ghế từ 140 lên 250 để tránh nhảy ID khi gục đầu ngủ
                    if dist < 250.0 and dist < min_dist:
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
                        "stable_y_top": None
                    }

                state = student_states[tid]
                state["last_seen"] = current_time

                if "phone_kalman" not in state:
                    state["phone_kalman"] = PhoneBoxKalmanTracker()
                kalman_tracker = state["phone_kalman"]

                # Crop Head / Torso for feature extraction
                crop_x0 = max(0, tx1)
                crop_y0 = max(0, ty1)
                crop_x1 = min(im0.shape[1], tx2)
                crop_y1 = min(im0.shape[0], ty1 + int(th * 0.45))
                head_crop = im0[crop_y0:crop_y1, crop_x0:crop_x1]

                s_yaw, s_pitch, s_roll, gaze_x, gaze_y, ear, mesh_valid, left_pts, right_pts, l_iris, r_iris, nose_pt = eye_extractor.extract_crop(head_crop, crop_x0, crop_y0, im0.shape[1], im0.shape[0])

                if mesh_valid > 0:
                    alpha = 0.25
                    pitch = alpha * s_pitch + (1 - alpha) * state.get("smooth_pitch", s_pitch)
                    yaw   = alpha * s_yaw   + (1 - alpha) * state.get("smooth_yaw", s_yaw)
                    roll  = alpha * s_roll  + (1 - alpha) * state.get("smooth_roll", s_roll)
                    state["smooth_pitch"] = pitch
                    state["smooth_yaw"] = yaw
                    state["smooth_roll"] = roll
                    
                    # Cập nhật stable_y_top khi học sinh ngồi học bình thường (không ngủ gật, dùng đt)
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

                # Slumped Detection (phát hiện nằm gục) khi khuất mặt hoàn toàn
                is_slumped = False
                if state.get("stable_y_top") is not None and mesh_valid == 0:
                    if (ty1 - state["stable_y_top"]) > max(60.0, 0.20 * th):
                        is_slumped = True

                # Step 4: Hand-Crop 512x512 Upsampling + Kalman Filter 2D Tracker
                phones_found = detector.detect_in_hand_crop(im0, (tx1, ty1, tx2, ty2))

                # Liên kết thêm điện thoại từ phone_list toàn cảnh nếu nằm trong bbox học sinh
                for px1, py1, px2, py2, pconf in phone_list:
                    pcx, pcy = (px1 + px2) / 2.0, (py1 + py2) / 2.0
                    if tx1 <= pcx <= tx2 and ty1 <= pcy <= ty2:
                        phone_crop = im0[py1:py2, px1:px2]
                        if phone_crop.size > 0:
                            # Bỏ qua bộ lọc da tay nếu độ tin cậy phát hiện cao (pconf >= 0.65)
                            if float(pconf) >= 0.65:
                                is_valid_phone_hand = True
                                skin_ratio = 0.30
                            else:
                                is_valid_phone_hand, skin_ratio, _ = get_skin_mask_info(phone_crop, max_skin_ratio=0.75, min_skin_ratio=0.02)
                            if is_valid_phone_hand:
                                phones_found.append((px1, py1, px2, py2, float(pconf), skin_ratio))

                if phones_found:
                    best_phone = max(phones_found, key=lambda p: p[4])
                    bx1, by1, bx2, by2, bconf, bskin = best_phone
                    
                    # Update Kalman Filter 2D Tracker (Bám dính 100% mượt mà)
                    k_box = kalman_tracker.update((bx1, by1, bx2, by2))
                    state["smooth_phone_box"] = k_box
                    state["phone_prob"] = float(bconf)
                    state["phone_hold_until"] = current_time + 1.5
                else:
                    # Dự đoán trajectory Kalman nếu nảy frame hoặc che khuất ngắn
                    k_box = kalman_tracker.predict_only()
                    if k_box is not None:
                        state["smooth_phone_box"] = k_box
                        state["phone_prob"] = max(0.40, state.get("phone_prob", 0.40) * 0.95)
                    else:
                        state["smooth_phone_box"] = None
                        state["phone_prob"] = 0.0

                phone_prob = state.get("phone_prob", 0.0)
                motion_level = calculate_motion_level(state, tx1, ty1, tx2, ty2)

                # Step 4: Multi-Feature Fusion & LSTM Prediction
                feature = normalize_feature_vector(yaw, pitch, roll, gaze_x, gaze_y, ear, phone_prob, motion_level, 1.0 if mesh_valid > 0 else 0.0)
                seq_buffer.append(tid, feature)

                rule_behavior, rule_conf = rule_fusion(feature)
                # Đè trạng thái ngủ gật nếu phát hiện nằm gục
                if is_slumped:
                    rule_behavior = "sleeping"
                    rule_conf = 0.95

                if lstm_ready and seq_buffer.is_full(tid):
                    seq = np.stack(seq_buffer.get_buffer(tid))
                    seq_tensor = torch.from_numpy(seq).unsqueeze(0).float().to(device)
                    with torch.no_grad():
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

                # Step 5: Temporal State Filter & Score Engine
                state["status"] = update_temporal_state(state, mapped_behavior, current_time)
                attention_score = attention_score_for(state, current_time)

                # Render Overlay
                # Cập nhật màu sắc: Xanh lá cho bình thường, Cam cho Chưa xác minh (unknown), Đỏ cho vi phạm
                if state["status"] in ("attentive", "reading_writing"):
                    box_color = (0, 180, 0)
                elif state["status"] == "unknown":
                    box_color = (0, 165, 255) # Màu cam
                else:
                    box_color = (0, 0, 255) # Màu đỏ
                
                labels_vi = {"attentive":"Tap trung", "reading_writing":"Doc/Viet", "looking_away":"Quay di", "using_phone":"Dung dien thoai", "sleeping":"Ngu gat", "unknown":"Chua xac minh"}
                display_status = f"{labels_vi.get(state['status'], 'Chua xac minh')} | Score:{attention_score}"

                cv2.rectangle(im0, (tx1, ty1), (tx2, ty2), box_color, 2)
                # Render overlay nhãn điện thoại: Kiểm tra bắt buộc Da tay YCrCb + HSV trực tiếp trên ô khoanh
                if state.get("smooth_phone_box") is not None:
                    spx1, spy1, spx2, spy2 = map(int, state["smooth_phone_box"])
                    spx1, spy1 = max(0, spx1), max(0, spy1)
                    spx2, spy2 = min(im0.shape[1], spx2), min(im0.shape[0], spy2)
                    phone_crop = im0[spy1:spy2, spx1:spx2]

                    if phone_crop.size > 0:
                        # Bỏ qua bộ lọc da tay nếu độ tin cậy phát hiện cao (phone_prob >= 0.65)
                        if phone_prob >= 0.65:
                            is_valid_phone_hand = True
                        else:
                            is_valid_phone_hand, skin_ratio, mask = get_skin_mask_info(phone_crop, max_skin_ratio=0.65, min_skin_ratio=0.05)
                        
                        if not is_valid_phone_hand:
                            # Nắm tay cầm bút dạ (> 65% da tay) hoặc Không có da tay (< 5% da tay) -> LOẠI BỎ HẲN
                            state["smooth_phone_box"] = None
                            state["phone_prob"] = 0.0
                            if state["status"] == "using_phone":
                                state["status"] = "reading_writing"
                        else:
                            # Điện thoại thật đang được cầm trên tay (5% <= skin_ratio <= 65%)
                            box_color_phone = (255, 0, 255) # Pink
                            label_text = f"PHONE {phone_prob:.2f}"
                            cv2.rectangle(im0, (spx1, spy1), (spx2, spy2), box_color_phone, 2)
                            cv2.putText(im0, label_text, (spx1, max(15, spy1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, box_color_phone, 2)

                im0 = draw_3d_axis(im0, yaw, pitch, roll, nose_pt, tw, mesh_valid, ear)

                if left_pts is not None and right_pts is not None:
                    cv2.polylines(im0, [left_pts], True, (0, 255, 0) if ear >= 0.20 else (0, 0, 255), 2)
                    cv2.polylines(im0, [right_pts], True, (0, 255, 0) if ear >= 0.20 else (0, 0, 255), 2)

                cv2.putText(im0, f"ID:{tid} | {display_status}", (tx1, max(20, ty1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 2)

            if out_writer is not None:
                out_writer.write(im0)

            cv2.imshow("Student Attention Monitoring System (Modular Architecture)", im0)
            key = cv2.waitKey(1) & 0xFF
            if key == 27 or key == ord('q'):
                replay_video = False
                break
            elif key == ord('r') and not is_camera and current_video_path is not None:
                replay_video = True
                print(f"[INFO] Replaying video: {current_video_path}")
                break

        if out_writer is not None:
            out_writer.release()
        cap.release()
        cv2.destroyAllWindows()
        print(f"✅ Ghi Video nhận diện hoàn tất! File kết quả lưu tại: {out_video_path}")

if __name__ == '__main__':
    main()
