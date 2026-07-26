from pathlib import Path
import glob
import json
import re
import shutil
import uuid

import gradio as gr
from mlx_audio.tts.generate import generate_audio
from mlx_audio.tts.utils import load_model


BASE_DIR = Path(__file__).resolve().parent
VOICE_CONFIG_PATH = BASE_DIR.parent / "config" / "voice.json"
OUTPUT_DIR = BASE_DIR / "outputs"
VOICES_DIR = BASE_DIR / "voices"
VOICE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


def configured_model() -> str:
    try:
        config = json.loads(VOICE_CONFIG_PATH.read_text(encoding="utf-8"))
        return config["tts"]["model"]
    except (FileNotFoundError, KeyError, TypeError, json.JSONDecodeError):
        return "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-8bit"


OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
VOICES_DIR.mkdir(parents=True, exist_ok=True)
model = load_model(configured_model())


def voice_dir(name: str) -> Path:
    return VOICES_DIR / name


def list_voices() -> list[str]:
    return sorted(
        path.name
        for path in VOICES_DIR.iterdir()
        if path.is_dir() and (path / "transcript.txt").exists()
    )


def save_voice(name: str, ref_audio_path: str, ref_text: str) -> None:
    if not VOICE_NAME_RE.fullmatch(name):
        raise gr.Error("Voice names may contain letters, numbers, hyphens, and underscores.")
    destination = voice_dir(name)
    destination.mkdir(parents=True, exist_ok=True)
    extension = Path(ref_audio_path).suffix or ".wav"
    shutil.copy(ref_audio_path, destination / f"clip{extension}")
    (destination / "transcript.txt").write_text(ref_text, encoding="utf-8")


def load_voice(name: str) -> tuple[str, str]:
    destination = voice_dir(name)
    clips = sorted(glob.glob(str(destination / "clip.*")))
    if not clips:
        raise gr.Error(f"Saved voice '{name}' has no reference clip.")
    transcript = (destination / "transcript.txt").read_text(encoding="utf-8")
    return clips[0], transcript


def clone_voice(ref_audio_path: str, ref_text: str, text: str) -> str:
    if not ref_audio_path:
        raise gr.Error("Upload or record a reference clip first.")
    if not ref_text.strip():
        raise gr.Error("Enter the exact transcript of the reference clip.")
    if not text.strip():
        raise gr.Error("Enter text to speak.")

    file_prefix = f"gui_{uuid.uuid4().hex[:8]}"
    generate_audio(
        text=text,
        model=model,
        ref_audio=ref_audio_path,
        ref_text=ref_text,
        output_path=str(OUTPUT_DIR),
        file_prefix=file_prefix,
        audio_format="wav",
        join_audio=True,
    )

    output_path = OUTPUT_DIR / f"{file_prefix}.wav"
    if not output_path.exists():
        raise gr.Error("Generation failed — check the terminal for details.")
    return str(output_path)


with gr.Blocks() as demo:
    gr.Markdown("# Lisa MLX Audio Voices")
    voice_dropdown = gr.Dropdown(label="Saved voices", choices=list_voices(), value=None)
    ref_audio = gr.Audio(sources=["upload", "microphone"], type="filepath", label="Reference clip")
    gr.Markdown(
        "Use a clean 5–10 second recording of one speaker. The transcript must "
        "match the clip exactly, word for word."
    )
    ref_text = gr.Textbox(label="Reference transcript", placeholder="Exact words spoken in the reference clip")
    voice_name = gr.Textbox(label="Save as", placeholder="e.g. rose")
    save_btn = gr.Button("Save voice")
    text = gr.Textbox(label="Text to speak", placeholder="What should the cloned voice say?")
    generate_btn = gr.Button("Generate")
    output_audio = gr.Audio(label="Result", type="filepath")

    def on_pick_voice(name: str):
        if not name:
            return gr.update(), gr.update()
        return load_voice(name)

    def on_save(name: str, ref_audio_path: str, ref_text_value: str):
        if not name.strip():
            raise gr.Error("Enter a name to save this voice as.")
        if not ref_audio_path:
            raise gr.Error("Upload or record a reference clip first.")
        if not ref_text_value.strip():
            raise gr.Error("Enter the reference transcript first.")
        save_voice(name.strip(), ref_audio_path, ref_text_value)
        gr.Info(f"Saved voice '{name.strip()}'")
        return gr.update(choices=list_voices(), value=name.strip())

    voice_dropdown.change(fn=on_pick_voice, inputs=voice_dropdown, outputs=[ref_audio, ref_text])
    save_btn.click(fn=on_save, inputs=[voice_name, ref_audio, ref_text], outputs=voice_dropdown)
    demo.load(fn=lambda: gr.update(choices=list_voices()), outputs=voice_dropdown)
    generate_btn.click(fn=clone_voice, inputs=[ref_audio, ref_text, text], outputs=output_audio)


if __name__ == "__main__":
    demo.launch(server_name="127.0.0.1")
