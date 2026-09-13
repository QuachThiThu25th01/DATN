"""
======================================================================
MODULE FEATURES: Eye State & Iris Gaze Extractor
Bảo toàn 100% MediaPipe FaceMesh EAR, Gaze vector và Upsampling 256x256
======================================================================
"""

import math
import os
import cv2
import numpy as np
try:
    import mediapipe as mp
except ImportError:
    mp = None

from ai_service.features.head_pose import compute_3d_head_pose

class EyeFeatureExtractor:
    LEFT_EYE = (33, 160, 158, 133, 153, 144)
    RIGHT_EYE = (362, 385, 387, 263, 373, 380)
    LEFT_IRIS = (468, 469, 470, 471, 472)
    RIGHT_IRIS = (473, 474, 475, 476, 477)

    def __init__(self):
        self.input_size = max(192, int(os.environ.get("FOCUS_FACE_MESH_SIZE", "256")))
        self.mesh = None if mp is None else mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True, max_num_faces=1, refine_landmarks=True,
            min_detection_confidence=0.05, min_tracking_confidence=0.05
        )

    @staticmethod
    def _d(a, b, w=1.0, h=1.0):
        return math.hypot((a.x - b.x) * w, (a.y - b.y) * h)

    def _ear(self, lm, idx, w=1.0, h=1.0):
        a, b, c, d, e, f = [lm[i] for i in idx]
        return (self._d(b, f, w, h) + self._d(c, e, w, h)) / max(2.0 * self._d(a, d, w, h), 1e-6)

    @staticmethod
    def _gaze(lm, eye_idx, iris_idx):
        eye = [lm[i] for i in eye_idx]
        iris = [lm[i] for i in iris_idx]
        minx, maxx = min(p.x for p in eye), max(p.x for p in eye)
        miny, maxy = min(p.y for p in eye), max(p.y for p in eye)
        ix = sum(p.x for p in iris) / len(iris)
        iy = sum(p.y for p in iris) / len(iris)
        return (ix - minx) / max(maxx - minx, 1e-6), (iy - miny) / max(maxy - miny, 1e-6)

    def extract_crop(self, crop, crop_x0, crop_y0, full_w=1280, full_h=720):
        if self.mesh is None or crop is None or crop.size == 0:
            return 0.0, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, None, None, None, None, None

        ch, cw = crop.shape[:2]
        if ch < 5 or cw < 5:
            return 0.0, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, None, None, None, None, None

        # Kích thước có thể cấu hình; 320 cân bằng độ chính xác và CPU cho realtime.
        proc_crop = cv2.resize(crop, (self.input_size, self.input_size), interpolation=cv2.INTER_LINEAR)
        result = self.mesh.process(cv2.cvtColor(proc_crop, cv2.COLOR_BGR2RGB))
        if not result.multi_face_landmarks:
            return 0.0, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, None, None, None, None, None

        lm = result.multi_face_landmarks[0].landmark
        le = self._ear(lm, self.LEFT_EYE, cw, ch)
        re = self._ear(lm, self.RIGHT_EYE, cw, ch)
        lg = self._gaze(lm, self.LEFT_EYE, self.LEFT_IRIS)
        rg = self._gaze(lm, self.RIGHT_EYE, self.RIGHT_IRIS)

        left_pts = np.array([[int(lm[i].x * cw) + crop_x0, int(lm[i].y * ch) + crop_y0] for i in self.LEFT_EYE], dtype=np.int32)
        right_pts = np.array([[int(lm[i].x * cw) + crop_x0, int(lm[i].y * ch) + crop_y0] for i in self.RIGHT_EYE], dtype=np.int32)

        l_iris_x = int(sum(lm[i].x for i in self.LEFT_IRIS) / len(self.LEFT_IRIS) * cw) + crop_x0
        l_iris_y = int(sum(lm[i].y for i in self.LEFT_IRIS) / len(self.LEFT_IRIS) * ch) + crop_y0
        r_iris_x = int(sum(lm[i].x for i in self.RIGHT_IRIS) / len(self.RIGHT_IRIS) * cw) + crop_x0
        r_iris_y = int(sum(lm[i].y for i in self.RIGHT_IRIS) / len(self.RIGHT_IRIS) * ch) + crop_y0

        yaw, pitch, roll, nose_pt = compute_3d_head_pose(lm, cw, ch, crop_x0, crop_y0)

        return yaw, pitch, roll, (lg[0] + rg[0]) / 2.0, (lg[1] + rg[1]) / 2.0, (le + re) / 2.0, 1.0, left_pts, right_pts, (l_iris_x, l_iris_y), (r_iris_x, r_iris_y), nose_pt
