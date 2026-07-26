from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from threading import Lock

import numpy as np

from mlx_audio.tts.utils import load_model


DEFAULT_MODELS = {
    "qwen3": "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-8bit",
    "omnivoice": "mlx-community/OmniVoice-bfloat16",
}


@dataclass(frozen=True)
class VoiceReference:
    audio_path: Path
    transcript: str


@dataclass(frozen=True)
class AudioChunk:
    samples: np.ndarray
    sample_rate: int
    is_final: bool


class TTSEngine:
    def __init__(self, *, model_name: str):
        self.model_name = model_name
        self.model = load_model(model_name)
        self.sample_rate = int(self.model.sample_rate)
        self._generation_lock = Lock()

    def stream(
        self,
        *,
        text: str,
        voice: VoiceReference,
        language: str,
        streaming_interval: float,
    ) -> Iterator[AudioChunk]:
        raise NotImplementedError


class Qwen3Engine(TTSEngine):
    def stream(
        self,
        *,
        text: str,
        voice: VoiceReference,
        language: str,
        streaming_interval: float,
    ) -> Iterator[AudioChunk]:
        # MLX Audio's Qwen implementation caches the encoded reference audio
        # and transcript on the model after the first generation.
        with self._generation_lock:
            results = self.model.generate(
                text=text,
                ref_audio=str(voice.audio_path),
                ref_text=voice.transcript,
                lang_code=language,
                stream=True,
                streaming_interval=streaming_interval,
                verbose=False,
            )
            for result in results:
                yield _audio_chunk(result)


class OmniVoiceEngine(TTSEngine):
    def stream(
        self,
        *,
        text: str,
        voice: VoiceReference,
        language: str,
        streaming_interval: float,
    ) -> Iterator[AudioChunk]:
        del streaming_interval
        with self._generation_lock:
            results = self.model.generate(
                text=text,
                ref_audio=str(voice.audio_path),
                ref_text=voice.transcript,
                language=language,
                verbose=False,
            )
            for result in results:
                yield _audio_chunk(result, force_final=True)


class EngineRegistry:
    def __init__(self):
        self._engines: dict[tuple[str, str], TTSEngine] = {}
        self._load_lock = Lock()

    def get(self, *, engine_name: str, model_name: str | None) -> TTSEngine:
        normalized_name = engine_name.strip().lower()
        canonical_name = "qwen3" if normalized_name == "qwen" else normalized_name
        engine_type = {
            "qwen3": Qwen3Engine,
            "omnivoice": OmniVoiceEngine,
        }.get(canonical_name)
        if engine_type is None:
            supported = ", ".join(sorted(DEFAULT_MODELS))
            raise ValueError(
                f"Unsupported TTS engine '{engine_name}'. Supported engines: {supported}."
            )

        resolved_model = (model_name or DEFAULT_MODELS[canonical_name]).strip()
        cache_key = (canonical_name, resolved_model)
        with self._load_lock:
            if cache_key not in self._engines:
                self._engines[cache_key] = engine_type(model_name=resolved_model)
            return self._engines[cache_key]

    def loaded(self) -> list[dict[str, str]]:
        return [
            {"engine": engine_name, "model": model_name}
            for engine_name, model_name in self._engines
        ]


def _audio_chunk(result, *, force_final: bool = False) -> AudioChunk:
    samples = np.asarray(result.audio, dtype="<f4").reshape(-1)
    return AudioChunk(
        samples=np.ascontiguousarray(samples),
        sample_rate=int(result.sample_rate),
        is_final=force_final or bool(getattr(result, "is_final_chunk", False)),
    )
