"""
======================================================================
SCRIPT KIỂM CHỨNG TOÀN BỘ DATASET (FULL DATASET EVALUATION)
Nằm trong thư mục tests/ chuẩn theo Kiến trúc phần mềm của Thầy
======================================================================
"""

import os
import sys
import torch
import torch.nn as nn
import numpy as np
from pathlib import Path
from sklearn.metrics import classification_report, confusion_matrix

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(PROJECT_ROOT))

from ai_service.behavior.lstm_model import MultiFeatureLSTM, FEATURE_NAMES, BEHAVIOR_CLASSES

VECTOR_BASE_DIR = PROJECT_ROOT / 'dataset' / 'behavior_vectors_v4'
MODEL_PATH = PROJECT_ROOT / 'models' / 'lstm_multifeature' / 'best.pt'
OUTPUT_DIR = PROJECT_ROOT / 'reports'
os.makedirs(OUTPUT_DIR, exist_ok=True)

def evaluate_full():
    print("=" * 75)
    print("[INFO] BAT DAU KIEM CHUNG TOAN BO TAP DU LIEU BEHAVIOR_DATASET_V4")
    print("=" * 75)

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"[INFO] Thiet bi kiem tra: {device}")

    model = MultiFeatureLSTM().to(device)
    model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
    model.eval()

    splits = ['train', 'val', 'test']
    total_samples = 0
    total_correct = 0

    all_y_true = []
    all_y_pred = []

    report_lines = []
    report_lines.append("======================================================================")
    report_lines.append("BAO CAO KIEM CHUNG TOAN BO TAP DU LIEU (FULL DATASET EVALUATION REPORT)")
    report_lines.append("======================================================================\n")

    for split in splits:
        split_dir = VECTOR_BASE_DIR / split
        if not split_dir.exists():
            continue

        x_split = np.load(split_dir / 'X.npy')
        y_split = np.load(split_dir / 'y.npy')
        num_samples = x_split.shape[0]

        x_tensor = torch.from_numpy(x_split).float().to(device)
        with torch.no_grad():
            outputs = model(x_tensor)
            preds = torch.argmax(outputs, dim=1).cpu().numpy()

        correct = np.sum(preds == y_split)
        split_acc = (correct / num_samples) * 100.0

        total_samples += num_samples
        total_correct += correct

        all_y_true.extend(y_split)
        all_y_pred.extend(preds)

        print(f"[SPLIT: {split.upper()}] So mau: {num_samples} | Chinh xac: {correct}/{num_samples} ({split_acc:.2f}%)")
        report_lines.append(f"-> Tap {split.upper()}: {correct}/{num_samples} mau dung ({split_acc:.2f}%)")

    overall_acc = (total_correct / total_samples) * 100.0
    print("-" * 75)
    print(f"[OVERALL] TONG SO MAU KIEM TRA: {total_samples} chuoi (100% Tap du lieu)")
    print(f"[OVERALL] DO CHINH XAC TONG THE (OVERALL ACCURACY): {overall_acc:.2f}%")
    print("-" * 75)

    all_y_true = np.array(all_y_true)
    all_y_pred = np.array(all_y_pred)

    unique_labels = sorted(list(set(all_y_true) | set(all_y_pred)))
    target_names = [BEHAVIOR_CLASSES[i] for i in unique_labels]

    report_str = classification_report(all_y_true, all_y_pred, target_names=target_names, digits=4)
    cm_str = str(confusion_matrix(all_y_true, all_y_pred))

    print("\nClassification Report On Entire Dataset:")
    print(report_str)
    print("Confusion Matrix On Entire Dataset:")
    print(cm_str)

    report_lines.append(f"\n[TONG THE] Tong so mau: {total_samples} | Do chinh xac: {overall_acc:.2f}%\n")
    report_lines.append("Classification Report:")
    report_lines.append(report_str)
    report_lines.append("\nConfusion Matrix:")
    report_lines.append(cm_str)

    out_file = OUTPUT_DIR / 'full_dataset_evaluation_report.txt'
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write("\n".join(report_lines))

    print("\n" + "=" * 75)
    print(f"[INFO] DA LUU BAP CAO KIEM CHUNG TOAN BO DATASET TAI: {out_file}")
    print("=" * 75)

if __name__ == '__main__':
    evaluate_full()
