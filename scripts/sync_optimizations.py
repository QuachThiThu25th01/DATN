import shutil
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

dir_src = r"D:\New folder"
dir_dst = r"d:\22050034_QuachThiThu\DO_AN_NGANH-QUACHTHITHU-22050034\DO_AN_NGANH"

files_to_sync = [
    "ai_service/detection/yolo_detector.py",
    "ai_service/features/eye_state.py",
    "ai_service/features/head_pose.py",
    "ai_service/recognition/insightface_service.py",
    "backend/services/identity.py",
    "backend/router/predict.py",
    "backend/services/pipeline.py"
]

print("=== SYNCING PERFORMANCE OPTIMIZATIONS FROM New folder TO DO_AN_NGANH ===")

for rel_path in files_to_sync:
    p_src = os.path.join(dir_src, rel_path.replace("/", os.sep))
    p_dst = os.path.join(dir_dst, rel_path.replace("/", os.sep))
    
    if os.path.exists(p_src):
        os.makedirs(os.path.dirname(p_dst), exist_ok=True)
        shutil.copy2(p_src, p_dst)
        print(f"[SYNCED]: {rel_path}")
    else:
        print(f"[MISSING IN SRC]: {rel_path}")

print("Sync completed successfully.")
