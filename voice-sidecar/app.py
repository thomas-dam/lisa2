from __future__ import annotations

import json
import time
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from providers.asr_whispermlx import WhisperMLXProvider

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
audio_cfg = config.get("audio", {})

# Resolve paths relative to the sidecar directory
tmp_dir = (BASE_DIR / audio_cfg.get("tmp_dir", "tmp/voice")).resolve()
tmp_dir.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Lisa ASR Sidecar", version="0.2.0")

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


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "asr_provider": "whispermlx",
        "asr_model": asr_cfg.get("model", "large-v3"),
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


@app.on_event("startup")
async def startup():
    sidecar_cfg = config.get("sidecar", {})
    host = sidecar_cfg.get("host", "127.0.0.1")
    port = sidecar_cfg.get("port", 3330)
    print(f"Lisa ASR Sidecar starting on http://{host}:{port}")
    print(f"  ASR: whispermlx ({asr_cfg.get('model', 'large-v3')})")
    print(f"  Tmp dir: {tmp_dir}")
