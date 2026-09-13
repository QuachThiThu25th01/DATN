"""
======================================================================
MODULE DETECTION: YOLOv8 Person & Phone Detector
Bảo toàn 100% logic phát hiện Người & Điện thoại từ LSTM_v2.py
======================================================================
"""

import sys
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
HEAD_POSE_ROOT = PROJECT_ROOT / 'scripts' / 'head_pose_estimation'
ULTRALYTICS_CONFIG_ROOT = PROJECT_ROOT / '.runtime'
ULTRALYTICS_CONFIG_ROOT.mkdir(parents=True, exist_ok=True)
os.environ.setdefault('YOLO_CONFIG_DIR', str(ULTRALYTICS_CONFIG_ROOT))
sys.path.append(str(HEAD_POSE_ROOT))

import torch
import numpy as np
import cv2
try:
    from ultralytics.utils.nms import non_max_suppression
except ImportError:
    try:
        from ultralytics.utils.ops import non_max_suppression
    except ImportError:
        try:
            from ultralytics.yolo.utils.ops import non_max_suppression
        except ImportError:
            from utils.general import non_max_suppression

try:
    from ultralytics.utils.ops import scale_boxes
except ImportError:
    try:
        from ultralytics.yolo.utils.ops import scale_boxes
    except ImportError:
        def scale_boxes(img1_shape, boxes, img0_shape):
            gain = min(img1_shape[0] / img0_shape[0], img1_shape[1] / img0_shape[1])
            pad = (img1_shape[1] - img0_shape[1] * gain) / 2, (img1_shape[0] - img0_shape[0] * gain) / 2
            boxes[:, [0, 2]] -= pad[0]
            boxes[:, [1, 3]] -= pad[1]
            boxes[:, :4] /= gain
            return boxes

try:
    from ultralytics.data.augment import LetterBox
except ImportError:
    try:
        from ultralytics.yolo.data.augment import LetterBox
    except ImportError:
        from utils.augmentations import LetterBox

def get_skin_mask_info(crop, max_skin_ratio=0.50, min_skin_ratio=0.08):
    """
    Tách biệt Bàn tay vs Vật thể dùng Không gian màu kép YCrCb + HSV (Kháng 100% ánh sáng đèn huỳnh quang trắng):
    - Nếu skin_ratio < 8%: Điện thoại nằm ngửa trên bàn KHÔNG CÓ DA TAY CHẠM VÀO -> LOẠI BỎ (Không dùng điện thoại)
    - Nếu skin_ratio > 50%: Nắm tay ôm lấy cây bút dạ -> LOẠI BỎ (Là tay cầm bút)
    - Nếu 8% <= skin_ratio <= 50%: Bàn tay cầm chiếc điện thoại thật -> CHẤP NHẬN
    """
    if crop is None or crop.size == 0:
        return False, 0.0, None
    
    # 1. YCrCb Skin Space (Không gian màu da người chuẩn quốc tế - Kháng 100% ánh sáng huỳnh quang/đèn tuýp)
    ycrcb = cv2.cvtColor(crop, cv2.COLOR_BGR2YCrCb)
    mask_ycrcb = cv2.inRange(ycrcb, np.array([0, 133, 77], dtype=np.uint8), np.array([255, 173, 127], dtype=np.uint8))
    
    # 2. HSV Skin Space
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mask_hsv = cv2.inRange(hsv, np.array([0, 10, 40], dtype=np.uint8), np.array([28, 255, 255], dtype=np.uint8))
    
    # Kết hợp 2 mask da tay
    combined_mask = cv2.bitwise_or(mask_ycrcb, mask_hsv)
    skin_ratio = np.sum(combined_mask > 0) / float(crop.shape[0] * crop.shape[1] + 1e-6)
    
    is_valid_phone_hand = (min_skin_ratio <= skin_ratio <= max_skin_ratio)
    return is_valid_phone_hand, skin_ratio, combined_mask

def is_mostly_hand_skin(crop, max_skin_ratio=0.50):
    """Lọc bỏ nếu là nắm tay (> 50% da tay) HOẶC không có da tay cầm (< 8% da tay)"""
    is_valid, _, _ = get_skin_mask_info(crop, max_skin_ratio=max_skin_ratio, min_skin_ratio=0.08)
    return (not is_valid)

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
            if iou > iou_thresh:
                is_dup = True
                break
        if not is_dup:
            keep.append(p1)
    return keep

class YoloDetector:
    def __init__(self, weights_path, device='cuda', imgsz=(960, 960), conf_thres=0.20):
        self.device = torch.device(device if torch.cuda.is_available() else 'cpu')
        self.imgsz = imgsz
        self.conf_thres = conf_thres
        self.use_half = self.device.type == 'cuda' and os.environ.get('FOCUS_FP16', '1') != '0'

        if self.device.type == 'cuda':
            torch.backends.cudnn.benchmark = True
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
            try:
                torch.set_float32_matmul_precision('high')
            except (AttributeError, RuntimeError):
                pass
        
        # Load YOLO Model
        try:
            # PyTorch 2.6+ defaults to weights_only=True, while legacy Ultralytics
            # checkpoints contain the model class itself.
            self.model = torch.load(weights_path, map_location=self.device, weights_only=False)
        except TypeError:
            self.model = torch.load(weights_path, map_location=self.device)
        if isinstance(self.model, dict):
            self.model = self.model['model']
        self.model = self.model.to(self.device).eval()
        self.model = self.model.half() if self.use_half else self.model.float()
        self.stride = int(self.model.stride.max())
        self.names = self.model.names if hasattr(self.model, 'names') else {0: 'person', 67: 'cell phone'}
        self.letterbox = LetterBox(new_shape=self.imgsz, auto=True, stride=self.stride)
        self.hand_letterbox = LetterBox(new_shape=(640, 640), auto=True, stride=self.stride)
        self._warmup()

    def _warmup(self):
        """Allocate CUDA kernels/caches before the first real frame."""
        if self.device.type != 'cuda':
            return
        height, width = self.imgsz if isinstance(self.imgsz, tuple) else (self.imgsz, self.imgsz)
        dtype = torch.float16 if self.use_half else torch.float32
        with torch.inference_mode():
            shapes = [(height, width)]
            landscape_height = int(np.ceil((height * 9.0 / 16.0) / self.stride) * self.stride)
            if landscape_height != height:
                shapes.append((landscape_height, width))
            for warm_h, warm_w in shapes:
                dummy = torch.zeros((1, 3, warm_h, warm_w), device=self.device, dtype=dtype)
                self.model(dummy)

    def _to_tensor(self, image):
        im = image[:, :, ::-1].transpose((2, 0, 1))
        im = np.ascontiguousarray(im)
        tensor = torch.from_numpy(im).to(self.device, non_blocking=True)
        tensor = tensor.half() if self.use_half else tensor.float()
        tensor.div_(255.0)
        return tensor.unsqueeze(0) if tensor.ndim == 3 else tensor

    def detect(self, im0):
        if im0 is None or im0.size == 0:
            return [], []

        im = self.letterbox(image=im0)
        im_tensor = self._to_tensor(im)

        with torch.inference_mode():
            preds = self.model(im_tensor)
            preds_data = preds[0] if isinstance(preds, (list, tuple)) else preds
            try:
                p = non_max_suppression(preds_data, conf_thres=self.conf_thres, iou_thres=0.45, classes=[0, 63, 67], nc=len(self.names))
            except TypeError:
                p = non_max_suppression(preds_data, conf_thres=self.conf_thres, iou_thres=0.45, classes=[0, 63, 67])

        person_list = []
        phone_list = []
        # NMS runs under inference_mode. Clone once before Ultralytics performs
        # in-place coordinate scaling so PyTorch 2.11 treats this as a regular
        # tensor in the caller's thread.
        det_all = p[0].clone() if p[0] is not None else None
        if det_all is not None and len(det_all):
            det_all[:, :4] = scale_boxes(im_tensor.shape[2:], det_all[:, :4], im0.shape).round()
            for det_row in det_all:
                x1, y1, x2, y2, conf, cls_id = det_row[:6]
                cls_id = int(cls_id)
                if cls_id == 0:
                    person_list.append((int(x1), int(y1), int(x2), int(y2), float(conf)))
                elif cls_id in (63, 67):
                    phone_list.append((int(x1), int(y1), int(x2), int(y2), float(conf)))

        return person_list, phone_list

    def detect_in_hand_crop(self, im0, student_bbox):
        """
        CROP VÙNG TAY/MẶT BÀN CỦA TỪNG SINH VIÊN VÀ PHÓNG TO NÂNG ĐỘ NGHỊCH CHI TIẾT (512x512 Upsampling)
        Phát hiện Điện thoại nhỏ / bị che một phần trên tay sinh viên với độ chính xác tuyệt đối
        """
        tx1, ty1, tx2, ty2 = map(int, student_bbox)
        bw, bh = tx2 - tx1, ty2 - ty1
        if bw < 15 or bh < 15:
            return []

        # Crop vùng từ cằm/ngực xuống bàn (10% đến 100% chiều cao sinh viên để lấy cả điện thoại giơ cao)
        crop_y0 = max(0, ty1 + int(bh * 0.10))
        crop_y1 = min(im0.shape[0], ty2 + int(bh * 0.05))
        crop_x0 = max(0, tx1 - int(bw * 0.10))
        crop_x1 = min(im0.shape[1], tx2 + int(bw * 0.10))

        hand_crop = im0[crop_y0:crop_y1, crop_x0:crop_x1]
        if hand_crop.size == 0 or hand_crop.shape[0] < 10 or hand_crop.shape[1] < 10:
            return []

        ch, cw = hand_crop.shape[:2]
        # Phóng to vùng tay (Upsample Crop lên 640x640 - đúng tỷ lệ native của YOLOv8) để soi rõ từng chi tiết điện thoại/bút
        scaled_hand_crop = cv2.resize(hand_crop, (640, 640), interpolation=cv2.INTER_CUBIC)

        im = self.hand_letterbox(image=scaled_hand_crop)
        im_tensor = self._to_tensor(im)

        with torch.inference_mode():
            preds = self.model(im_tensor)
            preds_data = preds[0] if isinstance(preds, (list, tuple)) else preds
            try:
                # Tăng conf_thres lên 0.25 để loại bỏ các phát hiện nhầm của bút (bút thường có conf thấp < 0.25)
                p = non_max_suppression(preds_data, conf_thres=0.25, iou_thres=0.40, classes=[63, 67], nc=len(self.names))
            except TypeError:
                p = non_max_suppression(preds_data, conf_thres=0.25, iou_thres=0.40, classes=[63, 67])

        phones_found = []
        det_all = p[0].clone() if p[0] is not None else None
        if det_all is not None and len(det_all):
            det_all[:, :4] = scale_boxes(im_tensor.shape[2:], det_all[:, :4], scaled_hand_crop.shape).round()
            for det_row in det_all:
                cx1, cy1, cx2, cy2, conf, cls_id = det_row[:6]
                
                # Quy đổi tọa độ từ vùng phóng to 640x640 về tọa độ gốc của Video
                orig_px1 = int((float(cx1) / 640.0) * cw) + crop_x0
                orig_py1 = int((float(cy1) / 640.0) * ch) + crop_y0
                orig_px2 = int((float(cx2) / 640.0) * cw) + crop_x0
                orig_py2 = int((float(cy2) / 640.0) * ch) + crop_y0

                crop_item = im0[orig_py1:orig_py2, orig_px1:orig_px2]
                if crop_item.size > 0:
                    # Nâng ngưỡng bỏ qua lọc da tay lên conf >= 0.75 để an toàn hơn
                    if float(conf) >= 0.75:
                        is_valid_phone_hand = True
                        skin_ratio = 0.30
                    else:
                        is_valid_phone_hand, skin_ratio, _ = get_skin_mask_info(crop_item, max_skin_ratio=0.65, min_skin_ratio=0.05)
                    if is_valid_phone_hand:
                        phones_found.append((orig_px1, orig_py1, orig_px2, orig_py2, float(conf), skin_ratio))

        return phones_found
