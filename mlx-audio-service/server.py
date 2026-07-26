from pathlib import Path
import glob
import re
import uuid

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from mlx_audio.tts.generate import generate_audio
from mlx_audio.tts.utils import load_model


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL = "mlx-community/OmniVoice-bfloat16"
OUTPUT_DIR = BASE_DIR / "outputs"
VOICES_DIR = BASE_DIR / "voices"
VOICE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
model = load_model(DEFAULT_MODEL)

app = FastAPI(title="Lisa MLX Audio TTS", version="0.1.0")


class SpeechRequest(BaseModel):
    input: str
    voice: str


def load_voice(name: str) -> tuple[Path, str]:
    if not VOICE_NAME_RE.fullmatch(name):
        raise HTTPException(status_code=400, detail="Invalid voice name")
    voice_dir = VOICES_DIR / name
    transcript_path = voice_dir / "transcript.txt"
    if not transcript_path.exists():
        raise HTTPException(status_code=404, detail=f"Voice '{name}' not found")

    clips = sorted(glob.glob(str(voice_dir / "clip.*")))
    if not clips:
        raise HTTPException(status_code=404, detail=f"Voice '{name}' has no reference clip")
    return Path(clips[0]), transcript_path.read_text(encoding="utf-8")


@app.get("/health")
def health():
    voices = sorted(
        path.name
        for path in VOICES_DIR.iterdir()
        if path.is_dir() and (path / "transcript.txt").exists()
    ) if VOICES_DIR.exists() else []
    return {"status": "ok", "provider": "mlx-audio", "model": DEFAULT_MODEL, "voices": voices}


@app.post("/v1/audio/speech")
def create_speech(req: SpeechRequest):
    if not req.input.strip():
        raise HTTPException(status_code=400, detail="Input text is required")

    ref_audio_path, ref_text = load_voice(req.voice)
    file_prefix = f"api_{uuid.uuid4().hex[:8]}"
    generate_audio(
        text=req.input,
        model=model,
        ref_audio=str(ref_audio_path),
        ref_text=ref_text,
        output_path=str(OUTPUT_DIR),
        file_prefix=file_prefix,
        audio_format="wav",
        join_audio=True,
    )

    output_path = OUTPUT_DIR / f"{file_prefix}.wav"
    if not output_path.exists():
        raise HTTPException(status_code=500, detail="Generation failed")
    return FileResponse(output_path, media_type="audio/wav")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
