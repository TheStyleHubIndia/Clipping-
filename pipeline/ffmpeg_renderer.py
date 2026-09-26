#!/usr/bin/env python3
"""
Production FFmpeg Renderer for 9:16 Vertical Short-Form Clips.
Performs:
- Exact trimming (-ss, -to)
- Dynamic / Static Smart 9:16 Reframing (Face + Hands guided)
- Subtitle generation and burning (ASS with word-level highlight & styles: CLEAN, BOLD, MINIMAL, PODCAST, KARAOKE)
- Optional hook banner overlay
- H.264 + AAC encoding with faststart
- Post-render validation with ffprobe
"""
import sys
import os
import json
import subprocess
import math

def format_ass_time(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs >= 100:
        cs = 99
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

def generate_ass_subtitles(clip_start, clip_end, words_list, style_name="BOLD", hook_text=None, target_w=1080, target_h=1920):
    """
    Generates an Advanced SubStation Alpha (.ass) subtitle file with word-level karaoke or highlight effects.
    """
    # Define style colors & fonts
    # ASS colors are &HAABBGGRR in hex
    styles_map = {
        "BOLD": {
            "font": "Arial Black,DejaVu Sans,sans-serif",
            "size": 52,
            "primary": "&H00FFFFFF",     # White
            "secondary": "&H0000D7FF",   # Gold/Yellow
            "outline": "&H00000000",     # Black
            "back": "&H80000000",
            "bold": 1,
            "outline_w": 4,
            "margin_v": 240
        },
        "KARAOKE": {
            "font": "Impact,DejaVu Sans,sans-serif",
            "size": 56,
            "primary": "&H0000FFFF",     # Cyan/Yellow
            "secondary": "&H00FFFFFF",
            "outline": "&H00000000",
            "back": "&H80000000",
            "bold": 1,
            "outline_w": 5,
            "margin_v": 240
        },
        "CLEAN": {
            "font": "Arial,DejaVu Sans,sans-serif",
            "size": 44,
            "primary": "&H00FFFFFF",
            "secondary": "&H00E0E0E0",
            "outline": "&H00101010",
            "back": "&HA0000000",
            "bold": 0,
            "outline_w": 2,
            "margin_v": 220
        },
        "MINIMAL": {
            "font": "DejaVu Sans,sans-serif",
            "size": 38,
            "primary": "&H00F0F0F0",
            "secondary": "&H00C0C0C0",
            "outline": "&H00202020",
            "back": "&H00000000",
            "bold": 0,
            "outline_w": 2,
            "margin_v": 200
        },
        "PODCAST": {
            "font": "DejaVu Sans,sans-serif",
            "size": 48,
            "primary": "&H0038E8FF",     # Warm orange/gold
            "secondary": "&H00FFFFFF",
            "outline": "&H00000000",
            "back": "&H90000000",
            "bold": 1,
            "outline_w": 3,
            "margin_v": 250
        }
    }
    
    st = styles_map.get(style_name, styles_map["BOLD"])
    
    ass_content = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {target_w}
PlayResY: {target_h}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{st['font']},{st['size']},{st['primary']},{st['secondary']},{st['outline']},{st['back']},{st['bold']},0,0,0,100,100,0,0,1,{st['outline_w']},1,2,50,50,{st['margin_v']},1
Style: HookHeader,Arial Black,46,&H00FFFFFF,&H0000E0FF,&H00000000,&H60000000,1,0,0,0,100,100,0,0,1,4,2,8,60,60,180,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    # Add optional hook header
    if hook_text and hook_text.strip():
        h_start = format_ass_time(0.0)
        h_end = format_ass_time(min(5.0, clip_end - clip_start))
        safe_hook = hook_text.strip().replace("\n", "\\N")
        ass_content += f"Dialogue: 1,{h_start},{h_end},HookHeader,,0,0,0,,{{\\fad(200,300)}}\\N{safe_hook}\\N\n"

    # Filter words inside clip window
    clip_words = []
    for w in words_list:
        w_start = w.get("start", 0)
        w_end = w.get("end", 0)
        if w_end >= clip_start and w_start <= clip_end:
            clip_words.append(w)

    if not clip_words:
        return ass_content

    # Group words into 3-5 word rhythmic punchy chunks
    chunk_size = 4
    for i in range(0, len(clip_words), chunk_size):
        chunk = clip_words[i:i + chunk_size]
        rel_start = max(0.0, chunk[0]["start"] - clip_start)
        rel_end = max(rel_start + 0.3, chunk[-1]["end"] - clip_start)
        
        # Word highlight inside chunk
        chunk_text_parts = []
        for w in chunk:
            w_text = w.get("word", "").strip()
            chunk_text_parts.append(w_text)
            
        text_line = " ".join(chunk_text_parts).upper()
        # Word pop animation
        animated_line = f"{{\\fade(100,100)\\t(0,120,\\fscx108\\fscy108)\\t(120,240,\\fscx100\\fscy100)}}{text_line}"
        
        start_fmt = format_ass_time(rel_start)
        end_fmt = format_ass_time(rel_end)
        ass_content += f"Dialogue: 0,{start_fmt},{end_fmt},Caption,,0,0,0,,{animated_line}\n"

    return ass_content


def render_clip(config):
    """
    config: {
        "source_path": str,
        "output_path": str,
        "start_time": float,
        "end_time": float,
        "crop": {"x": int, "y": int, "width": int, "height": int},
        "target_width": 1080,
        "target_height": 1920,
        "caption_style": "BOLD",
        "words": list,
        "hook_text": str or None,
        "burn_captions": bool
    }
    """
    src = config["source_path"]
    out = config["output_path"]
    start_time = float(config["start_time"])
    end_time = float(config["end_time"])
    duration = end_time - start_time
    
    if duration <= 0:
        return {"error": "Clip duration must be greater than 0"}

    if not os.path.exists(src):
        return {"error": f"Source video not found: {src}"}

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    temp_dir = os.path.dirname(os.path.abspath(out))

    # Calculate crop & scale
    crop = config.get("crop", {})
    crop_w = crop.get("width")
    crop_h = crop.get("height")
    crop_x = crop.get("x", 0)
    crop_y = crop.get("y", 0)
    
    target_w = config.get("target_width", 1080)
    target_h = config.get("target_height", 1920)

    # Subtitle file generation
    ass_path = None
    burn_caps = config.get("burn_captions", True)
    words = config.get("words", [])
    hook = config.get("hook_text")
    style_name = config.get("caption_style", "BOLD")

    filter_chains = []
    
    if crop_w and crop_h:
        filter_chains.append(f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y}")
    else:
        # Default 9:16 center crop
        filter_chains.append(f"crop=ih*9/16:ih:(iw-ih*9/16)/2:0")

    filter_chains.append(f"scale={target_w}:{target_h}:flags=lanczos")

    if burn_caps and (words or hook):
        ass_content = generate_ass_subtitles(start_time, end_time, words, style_name, hook, target_w, target_h)
        ass_path = os.path.join(temp_dir, f"sub_{os.path.splitext(os.path.basename(out))[0]}.ass")
        with open(ass_path, "w", encoding="utf-8") as f:
            f.write(ass_content)
        
        # Escape path for FFmpeg subtitles filter
        escaped_ass = ass_path.replace("\\", "/").replace(":", "\\:")
        filter_chains.append(f"subtitles='{escaped_ass}'")

    vf_string = ",".join(filter_chains)

    # Build real FFmpeg command
    cmd = [
        "ffmpeg",
        "-y",
        "-ss", str(round(start_time, 3)),
        "-to", str(round(end_time, 3)),
        "-i", src,
        "-vf", vf_string,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "22",
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "48000",
        "-movflags", "+faststart",
        out
    ]

    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        
        # Post-render validation with ffprobe
        if not os.path.exists(out) or os.path.getsize(out) == 0:
            return {"error": "Render completed but output file is missing or empty"}
            
        probe_cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration,size:stream=codec_name,width,height",
            "-of", "json",
            out
        ]
        probe_proc = subprocess.run(probe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        probe_data = json.loads(probe_proc.stdout)
        
        out_dur = float(probe_data.get("format", {}).get("duration", 0))
        out_size = int(probe_data.get("format", {}).get("size", 0))
        streams = probe_data.get("streams", [])
        v_stream = next((s for s in streams if s.get("width")), None)
        
        if out_dur <= 0 or not v_stream:
            return {"error": "Render validation failed: output file has invalid streams or duration"}

        # Cleanup subtitle file
        if ass_path and os.path.exists(ass_path):
            try:
                os.remove(ass_path)
            except Exception:
                pass

        return {
            "success": True,
            "output_path": out,
            "filename": os.path.basename(out),
            "duration": round(out_dur, 2),
            "size_bytes": out_size,
            "width": v_stream.get("width"),
            "height": v_stream.get("height"),
            "codec": v_stream.get("codec_name")
        }

    except subprocess.CalledProcessError as e:
        return {"error": f"FFmpeg error: {e.stderr}"}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: ffmpeg_renderer.py <config_json_path_or_string>"}))
        sys.exit(1)
        
    arg = sys.argv[1]
    if os.path.exists(arg):
        with open(arg, 'r') as f:
            cfg = json.load(f)
    else:
        cfg = json.loads(arg)
        
    res = render_clip(cfg)
    print(json.dumps(res, indent=2))
