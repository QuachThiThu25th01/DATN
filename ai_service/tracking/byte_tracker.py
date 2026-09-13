"""
======================================================================
MODULE TRACKING: ByteTrack Engine
Bảo toàn 100% logic định danh chỗ ngồi và theo dõi Track ID
======================================================================
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
YOLO_TRACKING_ROOT = PROJECT_ROOT / 'yolov8_tracking-master'
if str(YOLO_TRACKING_ROOT) not in sys.path:
    sys.path.insert(0, str(YOLO_TRACKING_ROOT))

from trackers.multi_tracker_zoo import create_tracker, get_config

class ByteTrackerService:
    def __init__(self, tracking_method='bytetrack', config_path=None):
        if config_path is None:
            config_path = YOLO_TRACKING_ROOT / 'trackers' / tracking_method / 'configs' / f'{tracking_method}.yaml'
        
        import torch
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        reid_weights = PROJECT_ROOT / 'weights' / 'osnet_x0_25_msmt17.pt'
        reid_str = str(reid_weights) if reid_weights.exists() else ""
        
        self.tracker = create_tracker(
            tracking_method,
            str(config_path),
            reid_str,
            device,
            False
        )

    def update(self, person_list, im0):
        if not person_list or im0 is None:
            return []
            
        dets = []
        for x1, y1, x2, y2, conf in person_list:
            dets.append([x1, y1, x2, y2, conf, 0])
            
        import torch
        dets_tensor = torch.tensor(dets, dtype=torch.float32) if dets else torch.zeros((0, 6), dtype=torch.float32)
        online_targets = self.tracker.update(dets_tensor, im0)
        return online_targets
