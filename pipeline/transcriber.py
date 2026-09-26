#!/usr/bin/env python3
"""
Transcription Engine using faster-whisper.
Extracts segment-level and word-level timestamps with confidence.
Detects language (English, Hindi, Hinglish, etc.).
Caches results to disk.
"""
import sys
import os
import json
import time

def transcribe_audio(audio_path, output_json_path=None, model_size="tiny", device="cpu", compute_type="int8"):
    if output_json_path and os.path.exists(output_json_path):
        try:
            with open(output_json_path, 'r', encoding='utf-8') as f:
                cached = json.load(f)
                if cached.get("segments"):
                    print(json.dumps({"cached": True, "data": cached}))
                    return cached
        except Exception:
            pass

    if not os.path.exists(audio_path):
        error_res = {"error": f"Audio file not found: {audio_path}"}
        print(json.dumps(error_res))
        return error_res

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        error_res = {
            "error": "faster-whisper is not installed. Please install it via pip install faster-whisper",
            "code": "DEPENDENCY_MISSING"
        }
        print(json.dumps(error_res))
        return error_res

    try:
        t0 = time.time()
        # Initialize faster-whisper model
        # using tiny or base for rapid high-quality CPU inference
        model = WhisperModel(model_size, device=device, compute_type=compute_type)
        
        segments_gen, info = model.transcribe(
            audio_path,
            beam_size=5,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        
        segments_list = []
        all_words = []
        full_text_parts = []
        
        for idx, seg in enumerate(segments_gen):
            words = []
            if seg.words:
                for w in seg.words:
                    word_obj = {
                        "word": w.word.strip(),
                        "start": round(w.start, 3),
                        "end": round(w.end, 3),
                        "confidence": round(w.probability, 3) if hasattr(w, "probability") and w.probability is not None else 1.0
                    }
                    words.append(word_obj)
                    all_words.append(word_obj)
            
            segment_obj = {
                "id": idx,
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg.text.strip(),
                "words": words,
                "avg_logprob": round(seg.avg_logprob, 3) if hasattr(seg, "avg_logprob") else 0.0,
                "no_speech_prob": round(seg.no_speech_prob, 3) if hasattr(seg, "no_speech_prob") else 0.0
            }
            segments_list.append(segment_obj)
            full_text_parts.append(seg.text.strip())

        detected_lang = info.language
        lang_prob = round(info.language_probability, 3)
        duration = round(info.duration, 2)
        
        result = {
            "language": detected_lang,
            "language_probability": lang_prob,
            "duration": duration,
            "transcription_time_sec": round(time.time() - t0, 2),
            "full_text": " ".join(full_text_parts),
            "segments": segments_list,
            "word_count": len(all_words)
        }
        
        if output_json_path:
            os.makedirs(os.path.dirname(os.path.abspath(output_json_path)), exist_ok=True)
            with open(output_json_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
                
        print(json.dumps({"success": True, "data": result}))
        return result
    except Exception as e:
        error_res = {"error": f"Transcription error: {str(e)}"}
        print(json.dumps(error_res))
        return error_res

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: transcriber.py <audio_path> [output_json_path] [model_size]"}))
        sys.exit(1)
    audio = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else None
    model_size = sys.argv[3] if len(sys.argv) > 3 else "tiny"
    transcribe_audio(audio, out, model_size=model_size)
