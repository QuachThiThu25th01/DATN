"""
======================================================================
MODULE FEATURES: 3D Geometric HeadPose & Plotting Utility
Bảo toàn 100% công thức hình học mốc 3D và đảo dấu chuẩn xác từ LSTM_v2.py
======================================================================
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
HEAD_POSE_ROOT = PROJECT_ROOT / 'scripts' / 'head_pose_estimation'
sys.path.append(str(HEAD_POSE_ROOT))

import math
import numpy as np
import cv2


def plot_3axis_Zaxis(img, yaw, pitch, roll, tdx=None, tdy=None, size=50.0, thickness=2):
    """Draw the three pose axes without importing the full training toolkit."""
    p = math.radians(pitch)
    y = -math.radians(yaw)
    r = math.radians(roll)
    if tdx is None or tdy is None:
        height, width = img.shape[:2]
        tdx, tdy = width / 2.0, height / 2.0

    x1 = size * (math.cos(y) * math.cos(r)) + tdx
    y1 = size * (math.cos(p) * math.sin(r) + math.cos(r) * math.sin(p) * math.sin(y)) + tdy
    x2 = size * (-math.cos(y) * math.sin(r)) + tdx
    y2 = size * (math.cos(p) * math.cos(r) - math.sin(p) * math.sin(y) * math.sin(r)) + tdy
    x3 = size * math.sin(y) + tdx
    y3 = size * (-math.cos(y) * math.sin(p)) + tdy

    endx = tdx + (x3 - tdx) * 2.0
    endy = tdy + (y3 - tdy) * 2.0
    origin = (int(tdx), int(tdy))
    cv2.line(img, origin, (int(endx), int(endy)), (0, 255, 255), thickness)
    cv2.line(img, origin, (int(x1), int(y1)), (0, 0, 255), thickness)
    cv2.line(img, origin, (int(x2), int(y2)), (0, 255, 0), thickness)
    cv2.line(img, origin, (int(x3), int(y3)), (255, 0, 0), thickness)
    return img

def compute_3d_head_pose(lm, cw, ch, crop_x0, crop_y0):
    """
    Tính toán 3D Head Pose bám sát sống mũi 100% chuẩn xác không bao giờ bị rớt tia 3D
    """
    nose_pt = (int(lm[1].x * cw) + crop_x0, int(lm[1].y * ch) + crop_y0)

    eye_cx = (lm[33].x + lm[263].x) / 2.0
    eye_cy = (lm[33].y + lm[263].y) / 2.0
    eye_w = max(abs(lm[263].x - lm[33].x), 1e-6)

    # Yaw: Lệch giữa đỉnh mũi và trung điểm 2 mắt
    raw_yaw = (lm[1].x - eye_cx) / eye_w * 130.0
    yaw = float(np.clip(-raw_yaw, -90.0, 90.0))

    # Pitch: Chuẩn hóa mốc nhìn thẳng camera (rel_nose_y = 0.52 cho pitch = 0.0 khi nhìn thẳng)
    rel_nose_y = (lm[1].y - eye_cy) / eye_w
    raw_pitch = -(rel_nose_y - 0.52) * 110.0
    pitch = float(np.clip(raw_pitch, -90.0, 90.0))

    # Roll: Góc nghiêng 2 mắt
    raw_roll = math.atan2((lm[263].y - lm[33].y), (lm[263].x - lm[33].x)) * 180.0 / math.pi
    roll = float(np.clip(raw_roll, -90.0, 90.0))

    return yaw, pitch, roll, nose_pt

def draw_3d_axis(im0, yaw, pitch, roll, nose_pt, box_w, mesh_valid, ear=0.20):
    """
    Vẽ trục 3D Head Pose luôn luôn bám sống mũi cho 100% sinh viên khi có mốc mặt (mesh_valid > 0)
    """
    if nose_pt is not None and mesh_valid > 0:
        tdx, tdy = nose_pt
        axis_size = max(35.0, float(box_w) * 0.35)
        im0 = plot_3axis_Zaxis(im0, yaw, pitch, roll, tdx=tdx, tdy=tdy, size=axis_size, thickness=2)
    return im0
