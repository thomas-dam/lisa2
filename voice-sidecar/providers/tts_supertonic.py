from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any


CHARACTER_REPLACEMENTS = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u201a": ",",
        "\u201c": '"',
        "\u201d": '"',
        "\u201e": '"',
        "\u2026": "...",
        "\u2013": "-",
        "\u2014": "-",
        "\u00a0": " ",
    }
)


class SupertonicTTSProvider:
    def __init__(
        self,
        *,
        voice: str = "F2",
        speeds: dict[str, float] | None = None,
        language: str = "en",
        fallback_python: str | None = None,
        auto_download: bool = True,
    ) -> None:
        self.voice = voice
        self.language = language
        self.speeds = speeds or {"F2": 1.05, "F1": 1.0, "M1": 1.0, "M2": 1.0}
        self.auto_download = auto_download
        self._tts = None
        self._styles: dict[str, Any] = {}
        self._init_time_sec: float | None = None
        self._fallback_python = fallback_python

    def _get_tts(self):
        if self._tts is not None:
            return self._tts

        try:
            from supertonic import TTS
        except ImportError as exc:
            if self._fallback_python and Path(self._fallback_python).exists():
                return None
            raise RuntimeError(
                "supertonic is not installed in the active environment, and no fallback Python was found."
            ) from exc

        started_at = time.perf_counter()
        self._tts = TTS(auto_download=self.auto_download)
        self._init_time_sec = time.perf_counter() - started_at
        return self._tts

    def _get_voice_style(self, voice: str):
        if voice in self._styles:
            return self._styles[voice]
        tts = self._get_tts()
        if tts is None:
            return None
        style = tts.get_voice_style(voice_name=voice)
        self._styles[voice] = style
        return style

    def generate(
        self,
        *,
        text: str,
        output_path: Path,
        voice: str | None = None,
        language: str | None = None,
        speed: float | None = None,
    ) -> dict[str, Any]:
        tts = self._get_tts()
        voice = voice or self.voice
        language = language or self.language
        speed = speed or self.speeds.get(voice, 1.05)
        normalized_text = text.translate(CHARACTER_REPLACEMENTS).strip()

        if tts is None:
            return self._generate_via_subprocess(
                text=normalized_text,
                output_path=output_path,
                voice=voice,
                language=language,
                speed=speed,
            )

        style = self._get_voice_style(voice)

        started_at = time.perf_counter()
        wav, audio_duration = tts.synthesize(
            normalized_text,
            voice_style=style,
            speed=speed,
            lang=language,
        )

        output_path.parent.mkdir(parents=True, exist_ok=True)
        tts.save_audio(wav, str(output_path))
        elapsed = time.perf_counter() - started_at

        return {
            "provider": "supertonic",
            "voice_name": voice,
            "speed": speed,
            "language": language,
            "output_path": str(output_path),
            "audio_duration_sec": float(audio_duration),
            "generation_time_sec": elapsed,
            "real_time_factor": (elapsed / float(audio_duration)) if audio_duration else None,
            "file_size_bytes": output_path.stat().st_size if output_path.exists() else None,
            "init_time_sec": self._init_time_sec,
        }

    def _generate_via_subprocess(
        self, *, text: str, output_path: Path, voice: str, language: str, speed: float
    ) -> dict[str, Any]:
        runner_path = Path(self._fallback_python)
        if not runner_path.exists():
            raise RuntimeError(
                "Supertonic fallback runner not found. Set fallback_python to a Python binary where supertonic is installed."
            )

        script_path = Path(__file__).resolve().parent.parent / "scripts" / "run_supertonic_tts.py"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        command = [
            str(runner_path),
            str(script_path),
            "--text",
            text,
            "--output",
            str(output_path),
            "--voice",
            voice,
            "--language",
            language,
            "--speed",
            str(speed),
        ]

        try:
            completed = subprocess.run(command, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip()
            raise RuntimeError(f"Supertonic synthesis failed in fallback runner: {stderr or exc}") from exc

        try:
            return json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError("Supertonic fallback runner returned invalid metadata.") from exc