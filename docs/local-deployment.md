# Local Deployment

Lisa runs three local processes from the `lisa2` root:

| Service | Port | Source | Runtime state |
|---|---:|---|---|
| Bot and browser UI | 3320 | `standalone-bot/` | `.runtime/pids/bot.pid`, `.runtime/logs/bot.log` |
| WhisperMLX ASR | 3330 | `voice-sidecar/` | `.runtime/pids/voice.pid`, `.runtime/logs/voice.log` |
| Current TTS adapter | 8000 | `mlx-audio-service/` | `.runtime/pids/tts.pid`, `.runtime/logs/tts.log` |

## Prerequisites

- Node.js 18 or newer.
- A Python environment at `voice-sidecar/.venv` with `voice-sidecar/requirements.txt` installed.
- A Python environment at `mlx-audio-service/.venv` with the current MLX adapter installed.
- At least one saved voice under `mlx-audio-service/voices/<name>/`, containing a reference clip and `transcript.txt`.
- `config/voice.json` must name an existing MLX voice. The checked-in default is `rose`.

Create both Python environments after cloning:

```bash
python3 -m venv voice-sidecar/.venv
voice-sidecar/.venv/bin/pip install -r voice-sidecar/requirements.txt
python3 -m venv mlx-audio-service/.venv
mlx-audio-service/.venv/bin/pip install -e mlx-audio-service
```

Downloaded models, virtual environments, generated WAV files, saved voice recordings, and secrets are local deployment data and are not committed.

## Configuration

- Lisa's canonical persona is `spec/lisa.md`.
- OpenRouter settings are stored locally in gitignored `config/openrouter.json`; the browser settings panel can update the model and key.
- `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` provide environment defaults.
- `SYSTEM_PROMPT` is a deliberate development-only persona override.
- Voice configuration lives in `config/voice.json`.

## Operations

Run all commands from the Lisa2 root:

```bash
./start-lisa.sh
./status-lisa.sh
./logs-lisa.sh
./stop-lisa.sh
```

`start-lisa.sh` adopts an already-running process when the expected health route responds, rejects a port occupant whose expected route does not respond, and cleans up only processes that it started when startup fails. The current health checks do not validate a service identity field.

## Voice contracts

- The browser sends recorded audio directly to the configured ASR sidecar on port 3330.
- Browser TTS calls `POST /api/voice/tts` on the Node server.
- Node sends `{"input":"...","voice":"rose"}` to MLX Audio at `POST /v1/audio/speech`.
- MLX Audio returns WAV bytes, which Node forwards directly to the browser.
- The current adapter loads `mlx-community/OmniVoice-bfloat16`.
- The voice-library GUI creates named voices from a reference recording and exact transcript.

There is no Supertonic fallback.

The browser and Node layers should depend on a stable speech capability rather than MLX Audio or OmniVoice internals. Engine-neutral synthesis and voice-cloning contracts remain design work.

Create or update a saved voice with:

```bash
mlx-audio-service/.venv/bin/python mlx-audio-service/app.py
```

Each named voice is stored locally under `mlx-audio-service/voices/<name>/` as a reference clip and exact `transcript.txt`.

## Service endpoints

| Service | Health | Main operation |
|---|---|---|
| Lisa server | `GET /api/health` | `POST /api/chat` |
| WhisperMLX ASR | `GET /api/health` | `POST /api/asr` with multipart audio and language |
| MLX Audio TTS | `GET /health` | `POST /v1/audio/speech` |

The first ASR or TTS use may load a large local model and therefore take longer than subsequent requests.

## Development and remote access

`npm start` runs only the Node bot and browser for focused development. The canonical complete runtime is `./start-lisa.sh`.

While the bot is running, `npm run serve:https` exposes port 3320 through the configured tailnet HTTPS service. The current direct browser-to-ASR loopback path is not compatible with the intended single-gateway architecture and may fail for a remote browser; this remains future implementation work.

## Repository boundary

Only the Lisa2 repository is required for application deployment. The former standalone `mlx-audio-gui` checkout is not read, started, or modified. Virtual environments, model caches, generated WAV files, saved voice recordings, and secrets remain local deployment data and must be provisioned separately.
