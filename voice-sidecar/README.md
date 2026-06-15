# Lisa Voice Sidecar

Python FastAPI server providing ASR (WhisperMLX) and TTS (Supertonic) for Lisa's voice layer.

## Quick Start

```bash
cd voice-sidecar

# Create and activate venv
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies (takes a few minutes; downloads ~5GB of models total)
pip install -r requirements.txt

# Start the sidecar
python -m uvicorn app:app --host 127.0.0.1 --port 3330
```

Or from the Lisa project root:

```bash
npm run voice
```

## Verify Health

```bash
curl http://127.0.0.1:3330/api/health
```

Expected:

```json
{"status":"ok","asr_provider":"whispermlx","asr_model":"large-v3","tts_provider":"supertonic","tts_voice":"F1"}
```

## Test ASR

Upload a WAV file for transcription:

```bash
curl -X POST http://127.0.0.1:3330/api/asr \
  -F "audio=@/path/to/speech.wav" \
  -F "language=en"
```

Response:

```json
{"transcript":"hello how are you","provider":"whispermlx","model":"large-v3","language":"en","elapsed_sec":1.23}
```

**First call loads the model (~3GB) — allow up to 5 minutes.** Subsequent calls are fast (~100-500ms for short audio).

## Test TTS

```bash
curl -X POST http://127.0.0.1:3330/api/tts \
  -F "text=Hello, this is Lisa testing her voice." \
  -F "voice=F1" \
  -F "language=en"
```

Response:

```json
{"audio_url":"/api/audio/tts_1234567890_F1.wav","voice":"F1","language":"en","audio_duration_sec":2.5,"generation_time_sec":0.8}
```

Download the generated WAV:

```bash
curl -O http://127.0.0.1:3330/api/audio/tts_1234567890_F1.wav
```

**First call downloads the Supertonic model (~2GB) — allow up to 5 minutes.**

## Configuration

Edit `config/voice.json` to change:

| Field | Default | Description |
|-------|---------|-------------|
| `asr.model` | `large-v3` | Whisper model size (`tiny`, `base`, `small`, `medium`, `large`, `large-v3`) |
| `asr.device` | `cpu` | `cpu` or `mps` (Apple Silicon GPU) |
| `tts.voice` | `F1` | `F1`, `F2`, `M1`, or `M2` |
| `tts.speeds.*` | `1.05` | Speaking rate per voice |

## Environment

The sidecar reads `config/voice.json` from the parent project. No `.env` files needed for voice.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/asr` | Transcribe audio (multipart: `audio` + `language`) |
| `POST` | `/api/tts` | Synthesize speech (form: `text` + `voice` + `language`) |
| `GET` | `/api/audio/{filename}` | Download generated WAV |

## Troubleshooting

**Port 3330 already in use:**

```bash
lsof -ti :3330 | xargs kill
```

**Model download fails:** Check disk space (~5GB free required) and network connection. Models download on first use.

**"Failed to fetch" in Lisa UI:** The sidecar is not running. Start it with `npm run voice`. Lisa shows "Voice sidecar offline" when the sidecar is unreachable.