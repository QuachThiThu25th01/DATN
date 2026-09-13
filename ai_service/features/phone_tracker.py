"""
======================================================================
MODULE FEATURES: Kalman Filter 2D Phone Box Tracker
Bộ theo vết Kalman Filter 2D bám dính Điện thoại siêu mượt 100%
======================================================================
"""

import cv2
import numpy as np

class PhoneBoxKalmanTracker:
    def __init__(self):
        # 8 Trạng thái: [cx, cy, w, h, v_cx, v_cy, v_w, v_h], 4 Đo đạc: [cx, cy, w, h]
        self.kf = cv2.KalmanFilter(8, 4)
        self.kf.measurementMatrix = np.array([
            [1, 0, 0, 0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0, 0, 0],
            [0, 0, 0, 1, 0, 0, 0, 0]
        ], dtype=np.float32)

        self.kf.transitionMatrix = np.array([
            [1, 0, 0, 0, 1, 0, 0, 0],
            [0, 1, 0, 0, 0, 1, 0, 0],
            [0, 0, 1, 0, 0, 0, 1, 0],
            [0, 0, 0, 1, 0, 0, 0, 1],
            [0, 0, 0, 0, 1, 0, 0, 0],
            [0, 0, 0, 0, 0, 1, 0, 0],
            [0, 0, 0, 0, 0, 0, 1, 0],
            [0, 0, 0, 0, 0, 0, 0, 1]
        ], dtype=np.float32)

        self.kf.processNoiseCov = np.eye(8, dtype=np.float32) * 1e-2
        self.kf.measurementNoiseCov = np.eye(4, dtype=np.float32) * 1e-1
        self.is_initialized = False
        self.missed_frames = 0

    def update(self, bbox):
        x1, y1, x2, y2 = bbox
        w, h = float(x2 - x1), float(y2 - y1)
        cx, cy = float(x1 + w / 2.0), float(y1 + h / 2.0)
        measurement = np.array([[cx], [cy], [w], [h]], dtype=np.float32)

        if not self.is_initialized:
            self.kf.statePre = np.array([[cx], [cy], [w], [h], [0], [0], [0], [0]], dtype=np.float32)
            self.kf.statePost = np.array([[cx], [cy], [w], [h], [0], [0], [0], [0]], dtype=np.float32)
            self.is_initialized = True
            self.missed_frames = 0
            return (int(x1), int(y1), int(x2), int(y2))

        self.kf.predict()
        corrected = self.kf.correct(measurement)
        mcx, mcy, mw, mh = corrected[:4].flatten()

        mx1 = int(max(0, mcx - mw / 2.0))
        my1 = int(max(0, mcy - mh / 2.0))
        mx2 = int(mcx + mw / 2.0)
        my2 = int(mcy + mh / 2.0)
        self.missed_frames = 0
        return (mx1, my1, mx2, my2)

    def predict_only(self):
        if not self.is_initialized:
            return None
        self.missed_frames += 1
        if self.missed_frames > 20: # Mất nét quá 20 khung hình (~0.6s) -> Hủy
            self.is_initialized = False
            return None

        predicted = self.kf.predict()
        mcx, mcy, mw, mh = predicted[:4].flatten()
        mx1 = int(max(0, mcx - mw / 2.0))
        my1 = int(max(0, mcy - mh / 2.0))
        mx2 = int(mcx + mw / 2.0)
        my2 = int(mcy + mh / 2.0)
        return (mx1, my1, mx2, my2)
