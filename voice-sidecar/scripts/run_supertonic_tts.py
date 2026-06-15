from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from supertonic import TTS

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
        "\ufe0f": "",
    }
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--voice", required=True)
    parser.add_argument("--language", required=True)
    parser.add_argument("--speed", required=True, type=float)
    args = parser.parse_args()

    init_started_at = time.perf_counter()
    tts = TTS(auto_download=True)
    style = tts.get_voice_style(voice_name=args.voice)
    init_time_sec = time.perf_counter() - init_started_at

    generation_started_at = time.perf_counter()
    normalized_text = args.text.translate(CHARACTER_REPLACEMENTS).strip()
    wav, audio_duration = tts.synthesize(
        normalized_text,
        voice_style=style,
        speed=args.speed,
        lang=args.language,
    )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tts.save_audio(wav, str(output_path))
    generation_time_sec = time.perf_counter() - generation_started_at

    print(
        json.dumps(
            {
                "provider": "supertonic",
                "voice_name": args.voice,
                "speed": args.speed,
                "language": args.language,
                "output_path": str(output_path),
                "audio_duration_sec": float(audio_duration),
                "generation_time_sec": generation_time_sec,
                "real_time_factor": (
                    generation_time_sec / float(audio_duration) if audio_duration else None
                ),
                "file_size_bytes": output_path.stat().st_size if output_path.exists() else None,
                "init_time_sec": init_time_sec,
            }
        )
    )


if __name__ == "__main__":
    main()