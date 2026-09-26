#!/usr/bin/env python3
"""
Media Analyzer using FFprobe.
Extracts true format, streams, duration, resolution, fps, bitrate, audio channels.
"""
import sys
import json
import subprocess
import os

def probe_file(file_path):
    if not os.path.exists(file_path):
        return {"error": f"File not found: {file_path}"}
    
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        data = json.loads(res.stdout)
        
        video_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
        audio_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), None)
        
        width = int(video_stream.get("width", 0)) if video_stream else 0
        height = int(video_stream.get("height", 0)) if video_stream else 0
        
        fps = 30.0
        if video_stream and "r_frame_rate" in video_stream:
            parts = video_stream["r_frame_rate"].split('/')
            if len(parts) == 2 and float(parts[1]) > 0:
                fps = round(float(parts[0]) / float(parts[1]), 2)
            elif len(parts) == 1:
                fps = float(parts[0])
        
        duration = float(data.get("format", {}).get("duration", 0))
        if duration == 0 and video_stream and "duration" in video_stream:
            duration = float(video_stream["duration"])
            
        return {
            "path": file_path,
            "filename": os.path.basename(file_path),
            "duration": duration,
            "width": width,
            "height": height,
            "aspect_ratio": f"{width}:{height}" if height > 0 else "unknown",
            "fps": fps,
            "has_audio": audio_stream is not None,
            "audio_codec": audio_stream.get("codec_name") if audio_stream else None,
            "audio_sample_rate": int(audio_stream.get("sample_rate", 0)) if audio_stream else 0,
            "audio_channels": int(audio_stream.get("channels", 0)) if audio_stream else 0,
            "video_codec": video_stream.get("codec_name") if video_stream else None,
            "bitrate": int(data.get("format", {}).get("bit_rate", 0)),
            "size_bytes": int(data.get("format", {}).get("size", 0))
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: media_probe.py <video_path>"}))
        sys.exit(1)
    result = probe_file(sys.argv[1])
    print(json.dumps(result, indent=2))
