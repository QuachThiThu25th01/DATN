"""
======================================================================
MODULE FEATURES: Motion Level Calculator
Bảo toàn 100% logic đo độ di chuyển vị trí của Track ID
======================================================================
"""

import math
import numpy as np

def calculate_motion_level(state, tx1, ty1, tx2, ty2):
    center = np.asarray([(tx1 + tx2) / 2.0, (ty1 + ty2) / 2.0], dtype=np.float32)
    diagonal = max(1.0, math.hypot(tx2 - tx1, ty2 - ty1))
    previous_center = state.get("last_center")
    
    motion_level = 0.0 if previous_center is None else min(1.0, float(np.linalg.norm(center - previous_center)) / diagonal * 5.0)
    state["last_center"] = center
    return motion_level
