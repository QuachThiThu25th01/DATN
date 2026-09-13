# Monkey patch to prevent YOLOv8 from hanging on Windows when checking C:\Users writeability
import tempfile
from pathlib import Path

original_TemporaryFile = tempfile.TemporaryFile
original_NamedTemporaryFile = tempfile.NamedTemporaryFile

def patched_TemporaryFile(*args, **kwargs):
    dir_path = kwargs.get('dir', None)
    if dir_path:
        try:
            resolved_dir = str(Path(dir_path).resolve()).lower()
            if resolved_dir in [r"c:\users", r"c:\users\\", "c:\\"]:
                raise OSError("Mocked permission denied to prevent hang in C:\\Users")
        except Exception:
            pass
    return original_TemporaryFile(*args, **kwargs)

def patched_NamedTemporaryFile(*args, **kwargs):
    dir_path = kwargs.get('dir', None)
    if dir_path:
        try:
            resolved_dir = str(Path(dir_path).resolve()).lower()
            if resolved_dir in [r"c:\users", r"c:\users\\", "c:\\"]:
                raise OSError("Mocked permission denied to prevent hang in C:\\Users")
        except Exception:
            pass
    return original_NamedTemporaryFile(*args, **kwargs)

tempfile.TemporaryFile = patched_TemporaryFile
tempfile.NamedTemporaryFile = patched_NamedTemporaryFile

# Monkey patch PyTorch 2.6+ weights_only restriction for older ultralytics packages
import torch
original_torch_load = torch.load
def patched_torch_load(*args, **kwargs):
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return original_torch_load(*args, **kwargs)
torch.load = patched_torch_load

# Setup sys.path to resolve local imports from tracking repo
import sys
import os
import cv2
import numpy as np
import tkinter as tk
from tkinter import filedialog

FILE = Path(__file__).resolve()
ROOT = FILE.parents[0]  # repository root directory
WEIGHTS = ROOT / 'weights'

if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

# Repository imports
from ultralytics.nn.autobackend import AutoBackend
try:
    from ultralytics.data.loaders import LoadImages
    from ultralytics.utils.ops import non_max_suppression, scale_boxes, process_mask, process_mask_native
    from ultralytics.utils.plotting import Annotator, colors
except ImportError:
    from ultralytics.yolo.data.dataloaders.stream_loaders import LoadImages
    from ultralytics.yolo.utils.ops import non_max_suppression, scale_boxes, process_mask, process_mask_native
    from ultralytics.yolo.utils.plotting import Annotator, colors
from trackers.multi_tracker_zoo import create_tracker

def choose_file():
    root = tk.Tk()
    root.withdraw()
    
    filetypes = [
        ("Media Files", "*.mp4 *.avi *.mkv *.mov *.jpg *.jpeg *.png *.bmp *.webp"),
        ("Video Files", "*.mp4 *.avi *.mkv *.mov"),
        ("Image Files", "*.jpg *.jpeg *.png *.bmp *.webp"),
        ("All Files", "*.*")
    ]
    
    print("\n[INFO] Opening file dialog to select a video or image...")
    file_path = filedialog.askopenfilename(
        title="Select Video or Image for Tracking and Segmentation",
        filetypes=filetypes
    )
    return file_path

@torch.no_grad()
def main():
    print("=" * 60)
    print("   YOLOv8 INSTANCE SEGMENTATION & TRACKING SCRIPT")
    print("=" * 60)
    
    # Configuration - Using yolov8s-seg.pt for Instance Segmentation
    yolo_weights = WEIGHTS / 'yolov8l-seg.pt'  # Bản Large (Chính xác nhất)

    reid_weights = WEIGHTS / 'osnet_x0_25_msmt17.pt'
    tracking_method = 'bytetrack'
    tracking_config = ROOT / 'trackers' / tracking_method / 'configs' / f'{tracking_method}.yaml'
    
    # Create weights dir if not exists
    WEIGHTS.mkdir(parents=True, exist_ok=True)
    
    # Check device
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"[INFO] Using device: {device}")
    
    # Load YOLOv8 segmentation model
    print(f"[INFO] Loading YOLOv8 Segmentation model ({yolo_weights.name})...")
    model = AutoBackend(yolo_weights, device=device, dnn=False, fp16=False)
    stride, names = model.stride, model.names
    imgsz = (960, 960)
    is_seg = True  # Model is a segmentation model (-seg)
    retina_masks = False
    PERSON_CLASS_ID = 0
    
    while True:
        # 1. Select file
        file_path = choose_file()
        if not file_path:
            print("[INFO] No file selected. Do you want to exit?")
            choice = input("Enter 'y' to exit, or press Enter to try selecting again: ").strip().lower()
            if choice == 'y':
                print("[INFO] Exiting...")
                sys.exit(0)
            continue
            
        print(f"[INFO] Selected file: {file_path}")
        
        # Initialize Tracker for this session
        print(f"[INFO] Initializing {tracking_method} tracker...")
        tracker = create_tracker(tracking_method, tracking_config, reid_weights, device, half=False)
        
        window_name = f"YOLOv8 + {tracking_method.upper()} SEGMENTATION - [q] New File | [ESC] Exit"
        cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
        
        # Load dataset
        dataset = LoadImages(
            file_path,
            imgsz=imgsz,
            stride=stride,
            auto=model.pt,
            transforms=getattr(model.model, 'transforms', None),
            vid_stride=1
        )
        
        print("[INFO] Processing file. Press 'q' to select another file, or 'ESC' to exit.")
        
        for frame_idx, batch in enumerate(dataset):
            path, im, im0s, vid_cap, s = batch
            
            # Format image for model input
            im = torch.from_numpy(im).to(device)
            im = im.half() if False else im.float()
            im /= 255.0
            if len(im.shape) == 3:
                im = im[None]
            
            # Predict
            preds = model(im)
            
            # Apply NMS (classes=[PERSON_CLASS_ID] to only detect and track people)
            p = non_max_suppression(preds[0], conf_thres=0.20, iou_thres=0.45, classes=[PERSON_CLASS_ID], nm=32)
            proto = preds[1][-1]
            
            # Draw on a copy of the original image
            im0 = im0s.copy()
            annotator = Annotator(im0, line_width=2, example=str(names))
            
            # Process detections (batch size is always 1)
            for i, det in enumerate(p):
                if det is not None and len(det):
                    # Scale bboxes and extract masks
                    if retina_masks:
                        det[:, :4] = scale_boxes(im.shape[2:], det[:, :4], im0.shape).round()
                        masks = process_mask_native(proto[i], det[:, 6:], det[:, :4], im0.shape[:2])  # HWC
                    else:
                        masks = process_mask(proto[i], det[:, 6:], det[:, :4], im.shape[2:], upsample=True)  # HWC
                        det[:, :4] = scale_boxes(im.shape[2:], det[:, :4], im0.shape).round()
                    
                    # Draw segmentation masks
                    annotator.masks(
                        masks,
                        colors=[colors(x, True) for x in det[:, 5]],
                        im_gpu=torch.as_tensor(im0, dtype=torch.float16).to(device).permute(2, 0, 1).flip(0).contiguous() / 255 if retina_masks else im[i]
                    )
                    
                    # Update tracker
                    outputs = tracker.update(det.cpu(), im0)
                    
                    # Draw boxes and tracking labels
                    if len(outputs) > 0:
                        for output in outputs:
                            bbox = output[0:4]
                            id = int(output[4])
                            cls = int(output[5])
                            conf = float(output[6])
                            
                            label = f"ID: {id} {names[cls]} {conf:.2f}"
                            annotator.box_label(bbox, label, color=colors(cls, True))
            
            # Display result
            cv2.imshow(window_name, annotator.result())
            
            # Check key presses
            key = cv2.waitKey(1) & 0xFF
            if key == 27:  # ESC
                print("[INFO] ESC pressed. Exiting...")
                cv2.destroyAllWindows()
                sys.exit(0)
            elif key == ord('q') or key == ord('Q'):
                print("[INFO] 'q' pressed. Stopping file play...")
                break
        
        # When file ends or 'q' is pressed, pause and wait for final choice
        print("[INFO] Finished processing current file. Waiting for key input...")
        while True:
            key = cv2.waitKey(100) & 0xFF
            if key == 27:  # ESC
                print("[INFO] ESC pressed. Exiting...")
                cv2.destroyAllWindows()
                sys.exit(0)
            elif key == ord('q') or key == ord('Q'):
                print("[INFO] 'q' pressed. Selecting new file...")
                cv2.destroyWindow(window_name)
                break

if __name__ == "__main__":
    main()
