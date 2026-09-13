"""
======================================================================
MODULE BEHAVIOR: MultiFeatureLSTM Model Class & Vector Normalizer
Bảo toàn 100% kiến trúc PyTorch MultiFeatureLSTM & normalize_feature_vector
======================================================================
"""

import numpy as np
import torch
import torch.nn as nn

FEATURE_NAMES = ("yaw", "pitch", "roll", "gaze_x", "gaze_y", "ear", "phone_prob", "motion_level", "face_valid")
BEHAVIOR_CLASSES = ("attentive", "reading_writing", "looking_away", "using_phone", "sleeping", "unknown")
STATE_THRESHOLDS = {"attentive": .5, "reading_writing": .5, "looking_away": 1.0, "using_phone": 1.5, "sleeping": 1.5, "unknown": 0.5}

class MultiFeatureLSTM(nn.Module):
    """Mô hình LSTM một chiều cho real-time; không sử dụng frame tương lai."""
    def __init__(self, input_dim=len(FEATURE_NAMES), hidden_dim=64, num_layers=2, num_classes=len(BEHAVIOR_CLASSES)):
        super().__init__()
        self.lstm = nn.LSTM(input_dim, hidden_dim, num_layers, batch_first=True, dropout=.2, bidirectional=False)
        self.classifier = nn.Sequential(
            nn.Linear(hidden_dim, 32),
            nn.ReLU(),
            nn.Dropout(.2),
            nn.Linear(32, num_classes)
        )

    def forward(self, x):
        sequence, _ = self.lstm(x)
        return self.classifier(sequence[:, -1, :])

def normalize_feature_vector(yaw, pitch, roll, gx, gy, ear, phone, motion, valid):
    """Bảo toàn 100% công thức Vector Fusion 9D từ LSTM_v2.py"""
    return np.asarray([
        np.clip(yaw / 90.0, -1, 1),
        np.clip(pitch / 90.0, -1, 1),
        np.clip(roll / 90.0, -1, 1),
        np.clip(gx, 0, 1),
        np.clip(gy, 0, 1),
        np.clip(ear / 0.4, 0, 1.5),
        np.clip(phone, 0, 1),
        np.clip(motion, 0, 1),
        float(valid)
    ], dtype=np.float32)

def rule_fusion(f):
    """
    Bảo toàn logic Fusion Heuristic vật lý từ LSTM_v2.py và tối ưu hóa các điều kiện ngủ/điện thoại
    """
    yaw, pitch, _, gx, gy, ear_s, phone, motion, valid = f
    yaw *= 90.0
    pitch *= 90.0
    ear = ear_s * 0.4

    # 1. DÙNG ĐIỆN THOẠI: Kiểm tra trước tiên, thậm chí cả khi che mặt (valid < 0.5)
    if phone >= 0.45:
        conf = float(max(phone, 0.85))
        return "using_phone", conf

    if valid < 0.5:
        return "unknown", 0.0

    # 2. ĐỌC / VIẾT BÀI: Cúi đầu nhìn xuống bàn (gy >= 0.40), bắt buộc phải mở mắt (ear >= 0.08)
    if -45.0 <= pitch <= -5.0 and abs(yaw) <= 35 and ear >= 0.08 and (gy >= 0.40 or ear >= 0.12):
        return "reading_writing", 0.85

    # 3. NGỦ GẬT: Đầu nằm gục hẳn xuống bàn (pitch < -50.0) hoặc nhắm mắt hẳn (0 < ear < 0.08)
    if pitch < -50.0 or (0 < ear < 0.08):
        return "sleeping", min(1.0, max(0.85, (0.22 - ear) * 6.0 + 0.3))

    # 4. Quay đầu hoặc liếc mắt đi nơi khác (looking_away)
    if abs(yaw) >= 25 or abs(pitch) >= 30 or gx < 0.30 or gx > 0.70:
        return "looking_away", min(1.0, max(abs(yaw) / 45.0, abs(pitch) / 45.0, 0.75))

    return "attentive", max(0.5, 1.0 - float(motion))
