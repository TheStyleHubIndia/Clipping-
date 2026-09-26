#!/usr/bin/env python3
"""
Computer Vision & Temporal Tracking Engine.
Tracks:
- Faces (bounding boxes, centers, temporal movement, active speaker estimation)
- Hands (gestures, bounding area, motion)
- Body / Pose (occupancy, torso center)
- Optical Flow / Movement signals (scene changes, visual dynamics)
- Generates smoothed 9:16 crop trajectories (no jitter, safe zones)
"""
import sys
import os
import json
import time
import cv2
import numpy as np

def analyze_video_vision(video_path, output_json_path=None, sample_fps=2.0, max_duration=None):
    if output_json_path and os.path.exists(output_json_path):
        try:
            with open(output_json_path, 'r') as f:
                cached = json.load(f)
                if cached.get("frames"):
                    print(json.dumps({"cached": True, "data": cached}))
                    return cached
        except Exception:
            pass

    if not os.path.exists(video_path):
        err = {"error": f"Video file not found: {video_path}"}
        print(json.dumps(err))
        return err

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        err = {"error": f"Could not open video file: {video_path}"}
        print(json.dumps(err))
        return err

    src_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    src_fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    video_duration = total_frames / src_fps if src_fps > 0 else 0

    if max_duration and video_duration > max_duration:
        video_duration = max_duration

    # Frame sampling interval
    step = max(1, int(round(src_fps / sample_fps)))
    
    # Initialize OpenCV Face Detector
    model_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
    face_cascade_path = os.path.join(model_dir, "haarcascade_frontalface_default.xml")
    if not os.path.exists(face_cascade_path):
        face_cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    
    face_cascade = None
    if os.path.exists(face_cascade_path):
        face_cascade = cv2.CascadeClassifier(face_cascade_path)
    
    # Check if MediaPipe is available for hands/pose
    mp_hands = None
    mp_pose = None
    try:
        import mediapipe as mp
        if hasattr(mp, 'solutions'):
            if hasattr(mp.solutions, 'hands'):
                mp_hands = mp.solutions.hands.Hands(
                    static_image_mode=False,
                    max_num_hands=2,
                    min_detection_confidence=0.4
                )
            if hasattr(mp.solutions, 'pose'):
                mp_pose = mp.solutions.pose.Pose(
                    static_image_mode=False,
                    min_detection_confidence=0.4
                )
    except Exception:
        mp_hands = None
        mp_pose = None

    tracked_frames = []
    prev_gray = None
    frame_idx = 0
    
    t0 = time.time()
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        timestamp = frame_idx / src_fps
        if max_duration and timestamp > max_duration:
            break

        if frame_idx % step == 0:
            # Resize for fast processing if frame is large
            h, w = frame.shape[:2]
            scale = 1.0
            proc_w = 640
            if w > proc_w:
                scale = proc_w / float(w)
                proc_h = int(h * scale)
                small_frame = cv2.resize(frame, (proc_w, proc_h))
            else:
                small_frame = frame
                proc_w, proc_h = w, h

            gray = cv2.cvtColor(small_frame, cv2.COLOR_BGR2GRAY)
            
            # 1. Global Visual Movement & Scene Change Detection
            visual_change = 0.0
            scene_change = False
            if prev_gray is not None:
                diff = cv2.absdiff(gray, prev_gray)
                mean_diff = float(np.mean(diff))
                visual_change = min(1.0, mean_diff / 40.0)
                if visual_change > 0.65:
                    scene_change = True
            prev_gray = gray.copy()

            # 2. Face Tracking (OpenCV Cascade)
            faces_raw = []
            if face_cascade is not None:
                try:
                    faces_raw = face_cascade.detectMultiScale(
                        gray,
                        scaleFactor=1.1,
                        minNeighbors=4,
                        minSize=(int(30 * scale), int(30 * scale))
                    )
                except Exception:
                    faces_raw = []
            
            detected_faces = []
            for (fx, fy, fw, fh) in faces_raw:
                orig_fx = fx / scale
                orig_fy = fy / scale
                orig_fw = fw / scale
                orig_fh = fh / scale
                detected_faces.append({
                    "bbox": [round(orig_fx, 1), round(orig_fy, 1), round(orig_fw, 1), round(orig_fh, 1)],
                    "center": [round(orig_fx + orig_fw / 2, 1), round(orig_fy + orig_fh / 2, 1)],
                    "norm_center": [round((orig_fx + orig_fw / 2) / src_width, 3), round((orig_fy + orig_fh / 2) / src_height, 3)],
                    "size_ratio": round((orig_fw * orig_fh) / (src_width * src_height), 4)
                })

            # Sort faces by size (largest is most likely primary speaker)
            detected_faces.sort(key=lambda f: f["size_ratio"], reverse=True)
            
            # 3. Hand & Pose Tracking
            detected_hands = []
            body_occupancy = 0.0
            torso_center = None
            
            rgb_small = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
            
            if mp_hands:
                try:
                    hand_res = mp_hands.process(rgb_small)
                    if hand_res.multi_hand_landmarks:
                        for hand_lms in hand_res.multi_hand_landmarks:
                            xs = [lm.x for lm in hand_lms.landmark]
                            ys = [lm.y for lm in hand_lms.landmark]
                            min_x, max_x = min(xs) * src_width, max(xs) * src_width
                            min_y, max_y = min(ys) * src_height, max(ys) * src_height
                            detected_hands.append({
                                "bbox": [round(min_x, 1), round(min_y, 1), round(max_x - min_x, 1), round(max_y - min_y, 1)],
                                "center": [round((min_x + max_x) / 2, 1), round((min_y + max_y) / 2, 1)],
                                "norm_center": [round((min_x + max_x) / (2 * src_width), 3), round((min_y + max_y) / (2 * src_height), 3)],
                                "wrist": [round(hand_lms.landmark[0].x, 3), round(hand_lms.landmark[0].y, 3)]
                            })
                except Exception:
                    pass

            if mp_pose:
                try:
                    pose_res = mp_pose.process(rgb_small)
                    if pose_res.pose_landmarks:
                        lms = pose_res.pose_landmarks.landmark
                        # Key landmarks: shoulders (11, 12), hips (23, 24)
                        if len(lms) > 24:
                            sh_x = (lms[11].x + lms[12].x) / 2.0
                            sh_y = (lms[11].y + lms[12].y) / 2.0
                            hip_x = (lms[23].x + lms[24].x) / 2.0
                            hip_y = (lms[23].y + lms[24].y) / 2.0
                            torso_center = [round((sh_x + hip_x) / 2.0, 3), round((sh_y + hip_y) / 2.0, 3)]
                            body_occupancy = round(abs((lms[11].x - lms[12].x) * (hip_y - sh_y) * 4), 3)
                except Exception:
                    pass

            frame_data = {
                "frame_idx": frame_idx,
                "timestamp": round(timestamp, 2),
                "visual_change": round(visual_change, 3),
                "scene_change": scene_change,
                "faces": detected_faces,
                "face_count": len(detected_faces),
                "hands": detected_hands,
                "hand_count": len(detected_hands),
                "body_occupancy": min(1.0, body_occupancy),
                "torso_center": torso_center
            }
            tracked_frames.append(frame_data)

        frame_idx += 1

    cap.release()
    if mp_hands:
        mp_hands.close()
    if mp_pose:
        mp_pose.close()

    # Calculate Smoothed 9:16 Crop Trajectory for different modes
    target_aspect = 9.0 / 16.0
    crop_height = src_height
    crop_width = int(round(crop_height * target_aspect))
    if crop_width > src_width:
        crop_width = src_width
        crop_height = int(round(crop_width / target_aspect))

    # Calculate raw focus center X for each frame
    raw_focus_x = []
    default_center_x = src_width / 2.0

    for f in tracked_frames:
        target_x = default_center_x
        faces = f["faces"]
        hands = f["hands"]
        
        if len(faces) == 1:
            face_center_x = faces[0]["center"][0]
            if len(hands) > 0:
                # Weighted combination of face (0.75) and hand center (0.25)
                hand_x = np.mean([h["center"][0] for h in hands])
                target_x = 0.75 * face_center_x + 0.25 * hand_x
            else:
                target_x = face_center_x
        elif len(faces) >= 2:
            # Multi-speaker layout: span between two prominent faces or prioritize largest
            f1, f2 = faces[0]["center"][0], faces[1]["center"][0]
            # If both faces fit within 9:16 crop width, center between them
            dist = abs(f1 - f2)
            if dist < (crop_width * 0.75):
                target_x = (f1 + f2) / 2.0
            else:
                # Focus on the primary speaker (largest face)
                target_x = faces[0]["center"][0]
        elif f["torso_center"]:
            target_x = f["torso_center"][0] * src_width

        # Clamp target crop X so window stays within source bounds
        min_x = crop_width / 2.0
        max_x = src_width - (crop_width / 2.0)
        clamped_x = max(min_x, min(max_x, target_x))
        raw_focus_x.append(clamped_x)

    # Temporal Smoothing using Exponential Moving Average / Window Filter (No Jitter)
    smoothed_focus_x = []
    smooth_x = default_center_x
    alpha = 0.15 # Low alpha for silky smooth camera tracking
    
    for idx, raw_x in enumerate(raw_focus_x):
        # On scene change, reset smooth position instantly
        if tracked_frames[idx]["scene_change"]:
            smooth_x = raw_x
        else:
            smooth_x = alpha * raw_x + (1 - alpha) * smooth_x
        smoothed_focus_x.append(round(smooth_x, 1))
        
        # Attach crop coordinates to frame
        left_x = int(round(smooth_x - (crop_width / 2.0)))
        left_x = max(0, min(src_width - crop_width, left_x))
        tracked_frames[idx]["crop_9_16"] = {
            "x": left_x,
            "y": int((src_height - crop_height) / 2),
            "width": crop_width,
            "height": crop_height,
            "center_x": round(smooth_x, 1)
        }

    # Calculate overall metrics
    total_faces_detected = sum(f["face_count"] for f in tracked_frames)
    total_hands_detected = sum(f["hand_count"] for f in tracked_frames)
    avg_visual_change = float(np.mean([f["visual_change"] for f in tracked_frames])) if tracked_frames else 0.0

    result = {
        "source": {
            "width": src_width,
            "height": src_height,
            "fps": src_fps,
            "duration": round(video_duration, 2)
        },
        "crop_dimensions": {
            "width": crop_width,
            "height": crop_height,
            "aspect_ratio": "9:16"
        },
        "analysis_time_sec": round(time.time() - t0, 2),
        "total_analyzed_frames": len(tracked_frames),
        "metrics": {
            "face_visibility_ratio": round(total_faces_detected / max(1, len(tracked_frames)), 3),
            "hand_visibility_ratio": round(total_hands_detected / max(1, len(tracked_frames)), 3),
            "avg_movement_intensity": round(avg_visual_change, 3)
        },
        "frames": tracked_frames
    }

    if output_json_path:
        os.makedirs(os.path.dirname(os.path.abspath(output_json_path)), exist_ok=True)
        with open(output_json_path, 'w') as f:
            json.dump(result, f, indent=2)

    print(json.dumps({"success": True, "metrics": result["metrics"], "frame_count": len(tracked_frames)}))
    return result

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: vision_tracker.py <video_path> [output_json_path] [sample_fps]"}))
        sys.exit(1)
    vid = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else None
    sample_rate = float(sys.argv[3]) if len(sys.argv) > 3 else 2.0
    analyze_video_vision(vid, out, sample_fps=sample_rate)
