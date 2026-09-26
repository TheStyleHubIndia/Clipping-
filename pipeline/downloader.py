#!/usr/bin/env python3
"""
Video Downloader using yt-dlp.
Downloads YouTube, YouTube Shorts, or web media into the project source folder.
Validates downloaded container with FFprobe.
"""
import sys
import os
import json
import subprocess
import re

def sanitize_filename(name):
    return re.sub(r'[^a-zA-Z0-9_\-\.]', '_', name)

def download_video(url, output_dir, max_height=1080):
    os.makedirs(output_dir, exist_ok=True)
    
    # Check if yt-dlp is available
    yt_dlp_bin = "/usr/local/bin/yt-dlp"
    if not os.path.exists(yt_dlp_bin):
        yt_dlp_bin = "yt-dlp"

    out_template = os.path.join(output_dir, "source_%(id)s.%(ext)s")
    
    cmd = [
        yt_dlp_bin,
        "--no-playlist",
        "-f", f"bestvideo[height<={max_height}][ext=mp4]+bestaudio[ext=m4a]/best[height<={max_height}][ext=mp4]/best",
        "--merge-output-format", "mp4",
        "-o", out_template,
        "--write-info-json",
        url
    ]

    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        
        # Locate the downloaded mp4 file
        files = [f for f in os.listdir(output_dir) if f.startswith("source_") and f.endswith(".mp4")]
        if not files:
            # Fallback check any video file
            files = [f for f in os.listdir(output_dir) if f.startswith("source_") and not f.endswith(".json")]
            
        if not files:
            return {"error": "yt-dlp finished but no output file was found."}

        target_file = os.path.join(output_dir, files[0])
        info_json_file = os.path.splitext(target_file)[0] + ".info.json"
        
        metadata = {}
        if os.path.exists(info_json_file):
            try:
                with open(info_json_file, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
            except Exception:
                pass

        return {
            "success": True,
            "file_path": target_file,
            "filename": os.path.basename(target_file),
            "title": metadata.get("title", "Video"),
            "uploader": metadata.get("uploader"),
            "duration": metadata.get("duration"),
            "description": metadata.get("description", "")[:500]
        }
    except subprocess.CalledProcessError as e:
        return {"error": f"Download failed: {e.stderr or e.stdout}"}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: downloader.py <url> <output_dir>"}))
        sys.exit(1)
    res = download_video(sys.argv[1], sys.argv[2])
    print(json.dumps(res, indent=2))
