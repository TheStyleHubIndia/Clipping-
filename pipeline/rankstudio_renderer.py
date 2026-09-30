#!/usr/bin/env python3
import json, os, subprocess, sys, tempfile

def ass_time(x):
    x=float(x); h=int(x//3600); m=int((x%3600)//60); s=int(x%60); cs=min(99,int(round((x-int(x))*100)))
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

def esc(x):
    return str(x).replace("\\","/").replace("{","\\{").replace("}","\\}").replace("\n","\\N")

def make_ass(path, words, title, hook, preset, duration):
    sizes={"BOLD":56,"CLEAN":44,"MINIMAL":38,"PODCAST":48,"KARAOKE":58}
    size=sizes.get(str(preset).upper(),56)
    s=f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,DejaVu Sans,{size},&H00FFFFFF,&H0000D7FF,&H00000000,&H90000000,1,0,0,0,100,100,0,0,1,3,1,2,60,60,250,1
Style: Header,DejaVu Sans,52,&H00FFFFFF,&H0000D7FF,&H00000000,&H90000000,1,0,0,0,100,100,0,0,1,4,2,8,60,60,180,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    if title: s+=f"Dialogue: 2,0:00:00.00,{ass_time(min(5,duration))},Header,,0,0,0,,{{\\fad(150,250)}}{esc(title.upper())}\n"
    if hook: s+=f"Dialogue: 2,0:00:00.00,{ass_time(min(5,duration))},Header,,0,0,0,,{{\\an8\\fad(150,250)}}{esc(hook)}\n"
    for i in range(0,len(words),4):
        c=words[i:i+4]
        if not c: continue
        a=max(0,float(c[0].get("start",0))); b=min(duration,max(a+.25,float(c[-1].get("end",a+.5))))
        if a>=duration: continue
        t=" ".join(str(w.get("word","")).strip() for w in c).strip().upper()
        if t: s+=f"Dialogue: 0,{ass_time(a)},{ass_time(b)},Caption,,0,0,0,,{{\\t(0,120,\\fscx108\\fscy108)\\t(120,240,\\fscx100\\fscy100)}}{esc(t)}\n"
    with open(path,"w",encoding="utf-8") as f: f.write(s)

def run(cmd):
    p=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    if p.returncode: raise RuntimeError(p.stderr[-10000:] or f"ffmpeg failed: {p.returncode}")
    return p.stdout

def make_script_ass(path, script, title, hook, preset, duration):
    sizes={"BOLD":56,"CLEAN":44,"MINIMAL":38,"PODCAST":48,"KARAOKE":58}
    size=sizes.get(str(preset).upper(),56)
    import re
    clean=re.sub(r"\\s+"," ",str(script).strip())
    chunks=[x.strip() for x in re.split(r"(?<=[.!?।])\\s+",clean) if x.strip()]
    if not chunks: chunks=[clean]
    chunks=chunks[:120]
    total=max(3.0,float(duration)); step=total/max(1,len(chunks))
    s=f"""[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Caption,DejaVu Sans,{size},&H00FFFFFF,&H0000D7FF,&H00000000,&H90000000,1,0,0,0,100,100,0,0,1,3,1,2,70,70,320,1\nStyle: Header,DejaVu Sans,52,&H00FFFFFF,&H0000D7FF,&H00000000,&H90000000,1,0,0,0,100,100,0,0,1,4,2,8,60,60,180,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"""
    if title: s+=f"Dialogue: 2,0:00:00.00,{ass_time(min(5,total))},Header,,0,0,0,,{esc(title.upper())}\\n"
    if hook: s+=f"Dialogue: 2,0:00:00.00,{ass_time(min(5,total))},Header,,0,0,0,,{{\\\\an8}}{esc(hook)}\\n"
    for i,text in enumerate(chunks):
        a=i*step; b=min(total,(i+1)*step)
        if b<=a: continue
        s+=f"Dialogue: 0,{ass_time(a)},{ass_time(b)},Caption,,0,0,0,,{esc(text.upper())}\\n"
    with open(path,"w",encoding="utf-8") as f: f.write(s)

def render(cfg):
    clips=cfg.get("clips") or []; output=cfg["output"]; title=str(cfg.get("title","")).strip()[:120]
    hook=str(cfg.get("hook","")).strip()[:180]; script=str(cfg.get("script","")).strip()[:20000]; preset=str(cfg.get("preset","BOLD")).upper()
    captions=bool(cfg.get("captions",True)); os.makedirs(os.path.dirname(os.path.abspath(output)),exist_ok=True)
    if not clips and script:
        duration=max(8.0,min(180.0,8.0 + len(script.split())/2.5))
        with tempfile.TemporaryDirectory(prefix="rankstudio_script_") as td:
            ass=os.path.join(td,"script.ass")
            make_script_ass(ass,script,title,hook,preset,duration)
            ep=ass.replace("\\\\","/").replace(":","\\\\:")
            cmd=["ffmpeg","-y","-f","lavfi","-i",f"color=c=black:s=1080x1920:r=30:d={duration}","-f","lavfi","-i",f"anullsrc=r=48000:cl=stereo","-t",str(duration),"-vf",f"subtitles='{ep}'","-c:v","libx264","-preset","veryfast","-crf","20","-pix_fmt","yuv420p","-c:a","aac","-b:a","160k","-ar","48000","-shortest","-movflags","+faststart","-metadata",f"title={title or 'Rank Studio Script'}",output]
            run(cmd)
        probe=json.loads(run(["ffprobe","-v","error","-show_entries","format=duration,size:stream=codec_name,width,height,r_frame_rate","-of","json",output]))
        streams=probe.get("streams",[]); v=next((x for x in streams if x.get("width")),None); a=next((x for x in streams if x.get("codec_name")=="aac"),None)
        if not v or v.get("codec_name")!="h264" or v.get("width")!=1080 or v.get("height")!=1920 or not a: raise RuntimeError("Script output validation failed")
        return {"success":True,"output_path":output,"duration":float(probe.get("format",{}).get("duration",0)),"bytes":int(float(probe.get("format",{}).get("size",0))),"width":1080,"height":1920,"fps":30,"videoCodec":"H.264","audioCodec":"AAC","mode":"script"}
    if not clips: raise RuntimeError("No clips or script supplied")
    with tempfile.TemporaryDirectory(prefix="rankstudio_") as td:
        args=["ffmpeg","-y"]; filters=[]
        for c in clips: args += ["-i",c["path"]]
        for i,c in enumerate(clips):
            dur=max(.1,float(c.get("duration",0))); rank=max(1,min(999,int(c.get("rank",i+1))))
            ass=os.path.join(td,f"{i}.ass")
            words=c.get("words") or []
            if captions and words: make_ass(ass,words,title if i==0 else "",hook if i==0 else "",preset,dur)
            vf=f"[{i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p"
            vf+=f",drawbox=x=42:y=42:w=150:h=105:color=black@0.58:t=fill,drawtext=font='DejaVu Sans':text='#"+str(rank)+"':x=75:y=58:fontsize=58:fontcolor=white:borderw=3:bordercolor=black"
            if title and i==0 and not captions: vf+=f",drawtext=font='DejaVu Sans':text='{title.replace(chr(39),'')}':x=(w-text_w)/2:y=155:fontsize=50:fontcolor=white:borderw=3:bordercolor=black"
            if hook and i==0 and not captions: vf+=f",drawtext=font='DejaVu Sans':text='{hook.replace(chr(39),'')}':x=(w-text_w)/2:y=250:fontsize=42:fontcolor=white:borderw=3:bordercolor=black:enable='between(t,0,5)'"
            if captions and words:
                ep=ass.replace("\\","/").replace(":","\\:")
                vf+=f",subtitles='{ep}'"
            filters.append(vf+f"[v{i}]")
            filters.append(f"[{i}:a]aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo,apad=whole_dur={dur}[a{i}]")
        ins="".join(f"[v{i}][a{i}]" for i in range(len(clips)))
        filters.append(f"{ins}concat=n={len(clips)}:v=1:a=1[v][a]")
        cmd=args+["-filter_complex",";".join(filters),"-map","[v]","-map","[a]","-c:v","libx264","-preset","veryfast","-crf","20","-profile:v","high","-pix_fmt","yuv420p","-c:a","aac","-b:a","160k","-ar","48000","-movflags","+faststart","-metadata",f"title={title or 'Rank Studio'}",output]
        run(cmd)
    probe=json.loads(run(["ffprobe","-v","error","-show_entries","format=duration,size:stream=codec_name,width,height,r_frame_rate","-of","json",output]))
    streams=probe.get("streams",[]); v=next((x for x in streams if x.get("width")),None); a=next((x for x in streams if x.get("codec_name")=="aac"),None)
    if not v or v.get("codec_name")!="h264" or v.get("width")!=1080 or v.get("height")!=1920 or not a: raise RuntimeError("Output validation failed: expected 1080x1920 H.264 + AAC")
    return {"success":True,"output_path":output,"duration":float(probe.get("format",{}).get("duration",0)),"bytes":int(float(probe.get("format",{}).get("size",0))),"width":1080,"height":1920,"fps":30,"videoCodec":"H.264","audioCodec":"AAC"}

if __name__=="__main__":
    try: print(json.dumps(render(json.loads(sys.argv[1]))))
    except Exception as e: print(json.dumps({"error":str(e)})); sys.exit(1)
