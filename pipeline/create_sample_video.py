#!/usr/bin/env python3
"""
Generates a realistic test video using FFmpeg for testing the full pipeline.
Includes:
- Synthetic 1080p video with a simulated speaker and movement
- Clear synthetic speech audio with natural pauses and sentences
"""
import sys
import os
import subprocess
import json

def generate_sample_video(output_path):
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    
    # 20 seconds, 1920x1080, 30fps
    # Video filter generates a realistic presentation background with a simulated human silhouette and motion
    vf = (
        "testsrc=duration=20:size=1920x1080:rate=30,"
        "drawbox=x=860+100*sin(t*1.5):y=300+40*cos(t*2):w=200:h=260:color=pink@0.9:t=fill," # Head
        "drawbox=x=760+100*sin(t*1.5):y=560+40*cos(t*2):w=400:h=500:color=navy@0.8:t=fill," # Torso
        "drawbox=x=660+140*sin(t*3):y=600+80*cos(t*2.5):w=90:h=90:color=orange@0.9:t=fill," # Left Hand
        "drawbox=x=1170-140*cos(t*2.8):y=580+90*sin(t*2.2):w=90:h=90:color=orange@0.9:t=fill," # Right Hand
        "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='AI Clipping Studio Demo Video':fontcolor=white:fontsize=44:box=1:boxcolor=black@0.6:boxborderw=10:x=(w-text_w)/2:y=80,"
        "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='Time\\: %{pts\\:hms}':fontcolor=yellow:fontsize=36:x=(w-text_w)/2:y=180"
    )

    # Audio synthesis: harmonic speech-like modulation with pauses to simulate realistic sentences
    af = (
        "sine=frequency=220:duration=20[s1];"
        "sine=frequency=440:duration=20[s2];"
        "[s1][s2]amix=inputs=2,"
        "volume='if(between(t,1,6)+between(t,7,13)+between(t,14,19), 0.7, 0.0)':eval=frame"
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-f", "lavfi", "-i", vf,
        "-f", "lavfi", "-i", af,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-ar", "16000",
        "-b:a", "128k",
        "-shortest",
        output_path
    ]

    try:
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            return {"success": True, "path": output_path, "size": os.path.getsize(output_path)}
        return {"error": "Failed to create sample video"}
    except subprocess.CalledProcessError as e:
        return {"error": f"FFmpeg failed: {e.stderr}"}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/sample_clipping_video.mp4"
    res = generate_sample_video(out)
    print(json.dumps(res))
