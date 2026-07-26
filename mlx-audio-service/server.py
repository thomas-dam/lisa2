import glob
import io
import os
import re
import wave
from pathlib import Path

import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from engines import DEFAULT_MODELS, EngineRegistry, VoiceReference


BASE_DIR = Path(__file__).resolve().parent
VOICES_DIR = BASE_DIR / "voices"
VOICE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
DEFAULT_ENGINE = os.environ.get("LISA_TTS_ENGINE", "qwen3")
DEFAULT_MODEL = os.environ.get(
    "LISA_TTS_MODEL",
    DEFAULT_MODELS.get(DEFAULT_ENGINE, DEFAULT_MODELS["qwen3"]),
)
DEFAULT_LANGUAGE = os.environ.get("LISA_TTS_LANGUAGE", "auto")
DEFAULT_STREAMING_INTERVAL = 0.32

registry = EngineRegistry()

app = FastAPI(title="Lisa MLX Audio TTS", version="0.2.0")


class SpeechRequest(BaseModel):
    input: str
    voice: str
    engine: str = DEFAULT_ENGINE
    model: str | None = None
    language: str = DEFAULT_LANGUAGE
    streaming_interval: float = DEFAULT_STREAMING_INTERVAL


def load_voice(name: str) -> VoiceReference:
    if not VOICE_NAME_RE.fullmatch(name):
        raise HTTPException(status_code=400, detail="Invalid voice name")
    voice_dir = VOICES_DIR / name
    transcript_path = voice_dir / "transcript.txt"
    if not transcript_path.exists():
        raise HTTPException(status_code=404, detail=f"Voice '{name}' not found")

    clips = sorted(glob.glob(str(voice_dir / "clip.*")))
    if not clips:
        raise HTTPException(status_code=404, detail=f"Voice '{name}' has no reference clip")
    transcript = transcript_path.read_text(encoding="utf-8").strip()
    if not transcript:
        raise HTTPException(status_code=422, detail=f"Voice '{name}' has an empty transcript")
    return VoiceReference(audio_path=Path(clips[0]), transcript=transcript)


def resolve_engine(req: SpeechRequest):
    if not 0.08 <= req.streaming_interval <= 5.0:
        raise HTTPException(
            status_code=400,
            detail="streaming_interval must be between 0.08 and 5.0 seconds",
        )
    try:
        requested_model = req.model
        if requested_model is None and req.engine.strip().lower() == DEFAULT_ENGINE.lower():
            requested_model = DEFAULT_MODEL
        return registry.get(engine_name=req.engine, model_name=requested_model)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


def generate_chunks(*, req: SpeechRequest):
    voice = load_voice(req.voice)
    engine = resolve_engine(req)
    return engine, engine.stream(
        text=req.input.strip(),
        voice=voice,
        language=req.language,
        streaming_interval=req.streaming_interval,
    )


def pcm_stream(*, chunks):
    for chunk in chunks:
        if chunk.samples.size:
            yield chunk.samples.tobytes(order="C")


def wav_bytes(*, chunks, sample_rate: int) -> bytes:
    audio_parts = [chunk.samples for chunk in chunks if chunk.samples.size]
    if not audio_parts:
        raise HTTPException(status_code=500, detail="Generation returned no audio")
    audio = np.concatenate(audio_parts)
    pcm16 = (np.clip(audio, -1.0, 1.0) * 32_767).astype("<i2")
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm16.tobytes())
    return output.getvalue()


@app.get("/health")
def health():
    voices = sorted(
        path.name
        for path in VOICES_DIR.iterdir()
        if path.is_dir() and (path / "transcript.txt").exists()
    ) if VOICES_DIR.exists() else []
    return {
        "status": "ok",
        "provider": "mlx-audio",
        "default_engine": DEFAULT_ENGINE,
        "default_model": DEFAULT_MODEL,
        "loaded_engines": registry.loaded(),
        "voices": voices,
    }


@app.post("/v1/audio/speech")
def create_speech(req: SpeechRequest):
    if not req.input.strip():
        raise HTTPException(status_code=400, detail="Input text is required")

    engine, chunks = generate_chunks(req=req)
    audio = wav_bytes(chunks=chunks, sample_rate=engine.sample_rate)
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={
            "cache-control": "no-store",
            "x-lisa-tts-engine": req.engine,
            "x-lisa-tts-model": engine.model_name,
        },
    )


@app.post("/v1/audio/speech/stream")
def stream_speech(req: SpeechRequest):
    if not req.input.strip():
        raise HTTPException(status_code=400, detail="Input text is required")

    engine, chunks = generate_chunks(req=req)
    return StreamingResponse(
        pcm_stream(chunks=chunks),
        media_type="application/octet-stream",
        headers={
            "cache-control": "no-store",
            "x-audio-format": "f32le",
            "x-audio-sample-rate": str(engine.sample_rate),
            "x-lisa-tts-engine": req.engine,
            "x-lisa-tts-model": engine.model_name,
        },
    )


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
