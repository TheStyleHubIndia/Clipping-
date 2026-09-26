#!/usr/bin/env python3
"""
Audio Extractor using FFmpeg.
Extracts normalized 16kHz mono WAV for high-accuracy Whisper transcription.
"""
import sys
import subprocess
import os
import json

def extract_audio(video_path, output_audio_path):
    if not os.path.exists(video_path):
        return {"error": f"Video file not found: {video_path}"}
    
    os.makedirs(os.path.dirname(os.path.abspath(output_audio_path)), exist_ok=True)
    
    # Extract 16kHz, 1-channel, 16-bit PCM WAV
    cmd = [
        "ffmpeg",
        "-y",
        "-i", video_path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        output_audio_path
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        if os.path.exists(output_audio_path) and os.path.getsize(output_audio_path) > 0:
            return {
                "success": True,
                "audio_path": output_audio_path,
                "size_bytes": os.path.getsize(output_audio_path)
            }
        else:
            return {"error": "Audio extraction produced empty or missing file"}
    except subprocess.CalledProcessError as e:
        return {"error": f"FFmpeg failed: {e.stderr}"}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: audio_extractor.py <video_path> <output_audio_path>"}))
        sys.exit(1)
    result = extract_audio(sys.argv[1], sys.argv[2])
    print(json.dumps(result))
