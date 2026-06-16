from __future__ import annotations

import json
import os
import time
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from dotenv import load_dotenv

from providers.asr_whispermlx import WhisperMLXProvider
from providers.tts_supertonic import SupertonicTTSProvider

BASE_DIR = Path(__file__).resolve().parent
CONFIG_DIR = BASE_DIR.parent / "config"
CONFIG_PATH = CONFIG_DIR / "voice.json"


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        raise RuntimeError(
            f"Config file not found at {CONFIG_PATH}. Create config/voice.json before starting the sidecar."
        )
    return json.loads(CONFIG_PATH.read_text("utf-8"))


config = load_config()

if not config.get("voice_enabled", False):
    raise RuntimeError("voice_enabled is false in config/voice.json. Set to true to start the sidecar.")

asr_cfg = config.get("asr", {})
tts_cfg = config.get("tts", {})
audio_cfg = config.get("audio", {})

# Resolve paths relative to the sidecar directory
tmp_dir = (BASE_DIR / audio_cfg.get("tmp_dir", "tmp/voice")).resolve()
output_dir = (BASE_DIR / audio_cfg.get("output_dir", "outputs/voice")).resolve()
tmp_dir.mkdir(parents=True, exist_ok=True)
output_dir.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Lisa Voice Sidecar", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

asr_provider = WhisperMLXProvider(
    model_name=asr_cfg.get("model", "large-v3"),
    device=asr_cfg.get("device", "cpu"),
)

tts_provider = SupertonicTTSProvider(
    voice=tts_cfg.get("voice", "F2"),
    speeds=tts_cfg.get("speeds"),
    language=tts_cfg.get("language", "en"),
    fallback_python=os.getenv("SUPERTONIC_PYTHON_BIN"),
)

VALID_VOICES = {"F1", "F2", "M1", "M2"}


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "asr_provider": "whispermlx",
        "asr_model": asr_cfg.get("model", "large-v3"),
        "tts_provider": "supertonic",
        "tts_voice": tts_cfg.get("voice", "F2"),
    }


@app.post("/api/asr")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: str = Form(default=asr_cfg.get("language", "en")),
):
    if not audio.filename:
        raise HTTPException(status_code=400, detail="Audio file is required")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio is empty")

    ext = Path(audio.filename).suffix or ".webm"
    timestamp = int(time.time() * 1000)
    audio_path = tmp_dir / f"asr_{timestamp}{ext}"
    audio_path.write_bytes(audio_bytes)

    try:
        result = asr_provider.transcribe(audio_path=audio_path, language=language)
        return {
            "transcript": result["transcript"],
            "provider": result["provider"],
            "model": result["model_name"],
            "language": result.get("language", language),
            "elapsed_sec": result["elapsed_sec"],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ASR failed: {exc}")
    finally:
        if audio_path.exists():
            audio_path.unlink(missing_ok=True)


@app.post("/api/tts")
async def synthesize_speech(
    text: str = Form(...),
    voice: str = Form(default=tts_cfg.get("voice", "F2")),
    language: str = Form(default=tts_cfg.get("language", "en")),
):
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text is required")

    voice = voice.strip()
    if voice not in VALID_VOICES:
        raise HTTPException(status_code=400, detail=f"Unsupported voice '{voice}'. Valid: {', '.join(sorted(VALID_VOICES))}")

    timestamp = int(time.time() * 1000)
    output_filename = f"tts_{timestamp}_{voice}.wav"
    output_path = output_dir / output_filename

    try:
        result = tts_provider.generate(
            text=text,
            output_path=output_path,
            voice=voice,
            language=language,
        )

        return {
            "audio_url": f"/api/audio/{output_filename}",
            "voice": result.get("voice_name", voice),
            "language": language,
            "audio_duration_sec": result.get("audio_duration_sec"),
            "generation_time_sec": result.get("generation_time_sec"),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"TTS failed: {exc}")


@app.get("/api/audio/{filename}")
async def get_audio(filename: str):
    candidate = (output_dir / filename).resolve()
    if not candidate.exists() or not str(candidate).startswith(str(output_dir)):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(path=candidate, media_type="audio/wav", filename=filename)


@app.on_event("startup")
async def startup():
    sidecar_cfg = config.get("sidecar", {})
    host = sidecar_cfg.get("host", "127.0.0.1")
    port = sidecar_cfg.get("port", 3330)
    print(f"Lisa Voice Sidecar starting on http://{host}:{port}")
    print(f"  ASR: whispermlx ({asr_cfg.get('model', 'large-v3')})")
    print(f"  TTS: supertonic ({tts_cfg.get('voice', 'F2')})")
    print(f"  Tmp dir: {tmp_dir}")
    print(f"  Output dir: {output_dir}")