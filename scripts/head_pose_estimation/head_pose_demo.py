import sys
import os
import time

# Reconfigure stdout/stderr to use UTF-8 encoding to support emojis on Windows terminals
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

from pathlib import Path
import argparse
import torch
import cv2
import yaml
import numpy as np
import tkinter as tk
from tkinter import filedialog

# --- 1. THIẾT LẬP ĐƯỜNG DẪN HỆ THỐNG ---
FILE = Path(__file__).absolute()
sys.path.append(FILE.parent.as_posix())          # Thêm thư mục head_pose_estimation
sys.path.append(FILE.parents[2].as_posix())      # Thêm thư mục gốc DO_AN_NGANH

# Import Tracker từ backend của đồ án tốt nghiệp
try:
    from backend.services.tracker import Tracker
except ImportError as e:
    print(f"⚠️ Warning: Không thể import Tracker từ backend. Chi tiết: {e}")
    # Fallback tracker đơn giản nếu chạy độc lập ngoài hệ sinh thái
    class DummyTrack:
        def __init__(self, id, box):
            self.id = id
            self.box = box
    class Tracker:
        def __init__(self):
            self.tracks = {}
        def update(self, detections):
            return {i: det for i, det in enumerate(detections)}

from utils.torch_utils import select_device
from utils.general import check_img_size, scale_coords, non_max_suppression
from utils.augmentations import letterbox
from utils.plots import plot_3axis_Zaxis
from models.experimental import attempt_load


def calculate_iou(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    return interArea / float(boxAArea + boxBArea - interArea + 1e-6)


def match_angles_to_tracked_box(tracked_box, detections_with_angles):
    """
    Khớp hộp bao từ Tracker với hộp bao gốc chứa góc quay để lấy thông số Yaw, Pitch, Roll.
    """
    best_iou = -1
    best_angles = (0.0, 0.0, 0.0)
    for box, conf, angles in detections_with_angles:
        iou = calculate_iou(tracked_box, box)
        if iou > best_iou:
            best_iou = iou
            best_angles = angles
    return best_angles if best_iou > 0.5 else None


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', type=str, default=str(FILE.parent / 'data/agora_coco.yaml'), help='cấu hình dataset')
    parser.add_argument('--imgsz', type=int, default=1280, help='kích thước ảnh đưa vào mô hình')
    parser.add_argument('--weights', default=str(FILE.parent / 'agora_s_1280_e300_t40_lw010_best.pt'), help='trọng số mô hình')
    parser.add_argument('--device', default='', help='chọn thiết bị cuda hoặc cpu')
    parser.add_argument('--conf-thres', type=float, default=0.3, help='ngưỡng tin cậy của hộp đầu')
    parser.add_argument('--iou-thres', type=float, default=0.45, help='ngưỡng NMS')
    parser.add_argument('--thickness', type=int, default=2, help='độ dày nét vẽ các trục và text')
    parser.add_argument('--distract-time', type=float, default=10.0, help='ngưỡng giây xác định mất tập trung')
    parser.add_argument('--dropout-time', type=float, default=1.0, help='ngưỡng giây lọc nhiễu dropout khi mất dấu')
    
    args = parser.parse_args()

    # Load file yaml cấu hình
    with open(args.data) as f:
        data = yaml.safe_load(f)

    # Chọn thiết bị và load mô hình DirectMHP
    device = select_device(args.device, batch_size=1)
    print('🧠 Đang khởi tạo mô hình DirectMHP trên thiết bị: {}'.format(device))
    model = attempt_load(args.weights, map_location=device)
    stride = int(model.stride.max())
    imgsz = check_img_size(args.imgsz, s=stride)

    if device.type != 'cpu':
        model(torch.zeros(1, 3, imgsz, imgsz).to(device).type_as(next(model.parameters())))

    # Khởi tạo Tkinter để mở hộp thoại chọn tệp tin
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)

    while True:
        print("📁 Đang mở hộp thoại chọn video/camera...")
        # Lựa chọn chạy từ Camera trực tiếp hoặc chọn file Video
        choice = input("👉 Nhập 'w' để chạy Webcam, hoặc 'v' để chọn file Video: ").strip().lower()
        
        if choice == 'w':
            pipe = input("👉 Nhập ID Camera (Mặc định '1' cho Webcam phụ, '0' cho Camera chính): ").strip()
            if not pipe:
                pipe = '1'
            cap = cv2.VideoCapture(int(pipe) if pipe.isdigit() else pipe)
            video_name = "Webcam"
        else:
            file_path = filedialog.askopenfilename(
                title="Chọn file video để kiểm thử",
                filetypes=[
                    ("Video files", "*.mp4 *.avi *.mov *.mkv *.flv *.webm *.wmv"),
                    ("All files", "*.*")
                ]
            )
            if not file_path:
                print("👋 Đã hủy chọn tệp tin. Đang thoát...")
                break
            cap = cv2.VideoCapture(file_path)
            video_name = Path(file_path).name

        if not cap.isOpened():
            print("❌ Không thể mở nguồn phát hình ảnh. Vui lòng thử lại.")
            continue

        print(f"✅ Đang xử lý: {video_name}")
        print("   - Nhấn 'q' để dừng phiên hiện tại và quay lại màn hình chọn.")
        print("   - Nhấn 'ESC' để thoát hoàn toàn ứng dụng.")

        # Tạo cửa sổ hiển thị có thể thay đổi kích thước, tránh bị tràn màn hình (mất góc)
        window_name = "DirectMHP + Distraction Timer Demo"
        cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)

        # Khởi tạo bộ bám vết đối tượng (Tracker) của đồ án
        tracker = Tracker()
        
        # Bộ lưu trữ trạng thái của sinh viên:
        # key: track_id
        # value: {
        #     "is_abnormal_pose": Boolean,
        #     "start_time": Float (timestamp),
        #     "last_seen": Float (timestamp),
        #     "past_distracted_duration": Float (giây),
        #     "status": String ("Tap trung" | "MAT TAP TRUNG!")
        # }
        student_states = {}

        exit_program = False
        
        while True:
            t_start_frame = time.time()
            ret, frame = cap.read()
            if not ret:
                print("🎬 Đã kết thúc video/nguồn phát.")
                break

            im0 = frame.copy()
            h, w = im0.shape[:2]
            current_time = time.time()

            # --- BƯỚC 1: TIỀN XỬ LÝ HÌNH ẢNH CHO MÔ HÌNH ---
            # Resize ảnh về kích cỡ imgsz dùng letterbox (RGB)
            img = letterbox(im0, imgsz, stride=stride, auto=True)[0]
            img = img.transpose((2, 0, 1))[::-1]  # HWC -> CHW, BGR -> RGB
            img = np.ascontiguousarray(img)
            img = torch.from_numpy(img).to(device)
            img = img / 255.0  # 0 - 255 -> 0.0 - 1.0
            if len(img.shape) == 3:
                img = img[None]

            # --- BƯỚC 2: CHẠY MÔ HÌNH NHẬN DIỆN VÀ GÓC QUAY (Inference) ---
            with torch.no_grad():
                out_ori = model(img, augment=False)[0]
                out = non_max_suppression(out_ori, args.conf_thres, args.iou_thres, num_angles=data['num_angles'])

            # Chuyển đổi tọa độ bounding box về kích thước ảnh gốc im0
            bboxes = scale_coords(img.shape[2:], out[0][:, :4], im0.shape[:2]).cpu().numpy()
            scores = out[0][:, 4].cpu().numpy()
            pitchs_yaws_rolls = out[0][:, 6:].cpu().numpy()

            # Chuẩn bị danh sách phát hiện để đưa vào Tracker
            detections_for_tracker = []
            detections_with_angles = []

            for j, [x1, y1, x2, y2] in enumerate(bboxes):
                pitch = (pitchs_yaws_rolls[j][0] - 0.5) * 180
                yaw = (pitchs_yaws_rolls[j][1] - 0.5) * 360
                roll = (pitchs_yaws_rolls[j][2] - 0.5) * 180
                
                detections_for_tracker.append((int(x1), int(y1), int(x2), int(y2), float(scores[j])))
                detections_with_angles.append(([int(x1), int(y1), int(x2), int(y2)], float(scores[j]), (yaw, pitch, roll)))

            # --- BƯỚC 3: CẬP NHẬT TRACKER VÀ THEO DÕI SINH VIÊN ---
            # Tracker trả về từ điển: {track_id: (x1, y1, x2, y2, conf)}
            tracks = tracker.update(detections_for_tracker)

            active_track_ids = set()

            for track_id, track_data in tracks.items():
                active_track_ids.add(track_id)
                tx1, ty1, tx2, ty2, tconf = map(int, track_data[:5])
                
                # Lấy thông số góc xoay khớp nhất với tracked box này
                angles = match_angles_to_tracked_box((tx1, ty1, tx2, ty2), detections_with_angles)
                if angles is None:
                    continue  # Không khớp được góc xoay phù hợp
                
                yaw, pitch, roll = angles

                # Khởi tạo trạng thái sinh viên nếu là ID mới phát hiện
                if track_id not in student_states:
                    student_states[track_id] = {
                        "is_abnormal_pose": False,
                        "start_time": None,
                        "last_seen": current_time,
                        "past_distracted_duration": 0.0,
                        "status": "Tap trung",
                        "smooth_yaw": yaw,
                        "smooth_pitch": pitch,
                        "smooth_roll": roll
                    }
                
                state = student_states[track_id]
                state["last_seen"] = current_time # Cập nhật thời gian nhìn thấy cuối cùng

                # Bộ lọc làm mượt góc quay (Exponential Moving Average - EMA) để giảm rung lắc
                alpha = 0.25  # Hệ số làm mượt (0.25 là tỉ lệ cân bằng giữa độ mượt và độ trễ)
                smooth_yaw = alpha * yaw + (1 - alpha) * state.get("smooth_yaw", yaw)
                smooth_pitch = alpha * pitch + (1 - alpha) * state.get("smooth_pitch", pitch)
                smooth_roll = alpha * roll + (1 - alpha) * state.get("smooth_roll", roll)
                
                state["smooth_yaw"] = smooth_yaw
                state["smooth_pitch"] = smooth_pitch
                state["smooth_roll"] = smooth_roll

                # Dùng góc đã được làm mượt để phân tích và hiển thị
                yaw, pitch, roll = smooth_yaw, smooth_pitch, smooth_roll

                # Kiểm tra tư thế có vượt ngưỡng hay không (Mất tập trung tạm thời)
                is_abnormal = (abs(yaw) > 30) or (pitch < -20)

                # --- BƯỚC 4: LOGIC BỘ ĐẾM THỜI GIAN PHẠT ---
                if is_abnormal:
                    if not state["is_abnormal_pose"]:
                        # Lần đầu tiên tư thế bị lệch
                        state["is_abnormal_pose"] = True
                        state["start_time"] = current_time
                    else:
                        # Tư thế tiếp tục lệch ở các frame sau
                        elapsed = current_time - state["start_time"]
                        if elapsed >= args.distract_time:
                            state["status"] = "MAT TAP TRUNG!"
                else:
                    # Sinh viên ở tư thế bình thường
                    if state["is_abnormal_pose"]:
                        # Nếu trước đó đang bị lệch tư thế
                        elapsed = current_time - state["start_time"]
                        # Chỉ cộng dồn nếu thời gian lệch thực sự vượt ngưỡng quy định
                        if elapsed >= args.distract_time:
                            state["past_distracted_duration"] += elapsed
                        
                        # Reset bộ đếm tạm thời
                        state["is_abnormal_pose"] = False
                        state["start_time"] = None
                        state["status"] = "Tap trung"

                # Tính tổng thời gian mất tập trung tích lũy để vẽ lên màn hình
                display_distracted_time = state["past_distracted_duration"]
                if state["is_abnormal_pose"] and (current_time - state["start_time"] >= args.distract_time):
                    display_distracted_time += (current_time - state["start_time"])

                # --- BƯỚC 5: VẼ KẾT QUẢ ĐỒ HỌA ---
                status = state["status"]
                box_color = (0, 0, 255) if status == "MAT TAP TRUNG!" else (0, 255, 0)
                
                # Vẽ hộp đầu
                cv2.rectangle(im0, (tx1, ty1), (tx2, ty2), box_color, args.thickness)
                
                # Vẽ 3 trục tọa độ tư thế đầu (đỏ: X, xanh lá: Y, xanh dương: Z)
                im0 = plot_3axis_Zaxis(im0, yaw, pitch, roll, tdx=(tx1+tx2)/2, tdy=(ty1+ty2)/2, 
                                       size=max(ty2-ty1, tx2-tx1)*0.8, thickness=args.thickness)

                # Viết thông tin hiển thị lên trên hộp bao
                cv2.putText(im0, f"ID: {track_id} | {status}", (tx1, ty1 - 10), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, args.thickness)
                cv2.putText(im0, f"P: {pitch:.1f} | Y: {yaw:.1f} | R: {roll:.1f}", (tx1, ty2 + 15), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
                cv2.putText(im0, f"Phat: {display_distracted_time:.1f}s", (tx1, ty2 + 30), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1)

            # --- BƯỚC 6: XỬ LÝ LỌC NHIỄU DROPOUT KHI MẤT DẤU SINH VIÊN ---
            # Duyệt qua danh sách để xử lý những sinh viên không xuất hiện trong frame này
            for tid, state in list(student_states.items()):
                if tid not in active_track_ids:
                    time_since_last_seen = current_time - state["last_seen"]
                    if time_since_last_seen > args.dropout_time:
                        # Mất dấu quá 1.0 giây -> Lưu giữ thời gian phạt cũ và reset bộ đếm tạm thời
                        if state["is_abnormal_pose"]:
                            elapsed = state["last_seen"] - state["start_time"]
                            if elapsed >= args.distract_time:
                                state["past_distracted_duration"] += elapsed
                            state["is_abnormal_pose"] = False
                            state["start_time"] = None
                            state["status"] = "Tap trung"

            # Tính toán hiển thị FPS toàn hệ thống
            t_frame_elapsed = time.time() - t_start_frame
            fps = 1 / t_frame_elapsed if t_frame_elapsed > 0 else 0
            cv2.putText(im0, f"System FPS: {fps:.1f}", (20, 40), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            cv2.putText(im0, f"Checking: {video_name}", (20, 70), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

            cv2.imshow(window_name, im0)

            key = cv2.waitKey(1) & 0xFF
            # Nhấn 'q' để quay lại chọn file
            if key == ord('q'):
                print("🔄 Đang quay lại màn hình lựa chọn...")
                break
            # Nhấn ESC để thoát toàn bộ chương trình
            elif key == 27:
                print("👋 Đang thoát hoàn toàn chương trình...")
                exit_program = True
                break

        cap.release()
        cv2.destroyWindow(window_name)

        if exit_program:
            break
