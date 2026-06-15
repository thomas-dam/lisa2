from __future__ import annotations

import time
from pathlib import Path
from typing import Any


class WhisperMLXProvider:
    def __init__(self, *, model_name: str = "large-v3", device: str = "cpu") -> None:
        self.model_name = model_name
        self.device = device
        self._model = None

    def _get_model(self):
        if self._model is not None:
            return self._model

        try:
            import whispermlx
        except ImportError as exc:
            raise RuntimeError(
                "whispermlx is not installed. Install it in the voice-sidecar environment to enable push-to-talk."
            ) from exc

        self._model = whispermlx.load_model(self.model_name, device=self.device)
        return self._model

    def transcribe(self, *, audio_path: Path, language: str | None = None) -> dict[str, Any]:
        model = self._get_model()
        started_at = time.perf_counter()
        result = model.transcribe(str(audio_path), language=language or None)
        elapsed = time.perf_counter() - started_at

        segments = result.get("segments") or []
        transcript = result.get("text") or " ".join(
            segment.get("text", "").strip() for segment in segments if segment.get("text")
        )

        return {
            "provider": "whispermlx",
            "model_name": self.model_name,
            "language": result.get("language") or language,
            "transcript": transcript.strip(),
            "segments": segments,
            "elapsed_sec": elapsed,
        }