# Handover — Lisa Local AI

## Current State

### What Works (PROVEN)

| Component | Status |
|-----------|--------|
| Chat (text) | ✅ Working — send/receive messages via /api/chat |
| Retrieval (reference.md) | ✅ Working — keyword-based, visual + z-image split |
| /commands (/create image, /iterate image) | ✅ Working |
| Voice sidecar (port 3330) | ✅ Running — health endpoint responds |
| TTS generation (sidecar) | ✅ Working — returns WAV on form-urlencoded POST |
| WAV serving (sidecar) | ✅ Working — serves WAV files via /api/audio/ |
| TTS proxy (Lisa server) | ✅ Working — POST /api/voice/tts forwards to sidecar, returns audio_url |
| Audio proxy (Lisa server) | ✅ Working — GET /api/voice/audio/ forwards WAV bytes |
| Static file serving | ✅ Working — serves public/ files |
| Infrastructure scripts | ✅ ./start-lisa.sh starts all services, ./stop-lisa.sh stops them |
| Unified logging | ✅ .runtime/logs/bot.log + voice.log, logs-lisa.sh tails both |
| npm test | ✅ All tests pass |
| Browser Mixed Content | ✅ Fixed — TTS and audio requests now same-origin through proxy |

### What's Unknown / Broken

| Component | Status |
|-----------|--------|
| Browser WAV playback | ✅ VERIFIED — `/api/voice/audio/tts_1781540989534_F1.wav` played successfully via `/voice-test` |
| Server-side pipeline (chat → TTS proxy → audio proxy → valid WAV) | ✅ VERIFIED — `test-e2e-voice.js` passes, returns valid 16-bit 44100Hz PCM WAV |
| Autoplay policy | ✅ FIXED & VERIFIED — switched from `<audio>.play()` to Web Audio API (`AudioContext.decodeAudioData` + `BufferSource`), primed on user gesture (form submit) |
| Voice pipeline end-to-end (chat → gate → proxy TTS → AudioContext playback → speaker) | ✅ VERIFIED — user confirmed voice came through speakers at `https://farm.typhon-kelvin.ts.net:3320/` |
| Audio lifecycle events | ⬜ UNKNOWN — loadstart, canplay, play, playing, ended not yet observed from browser |

### Last Error Observed

**Mixed Content** — browser blocked HTTP requests from HTTPS page. Fixed by adding `/api/voice/tts` and `/api/voice/audio/*` proxy routes on the Lisa server (same-origin).

### Test Page Available

`voice-test.html` was removed — it was a diagnostic tool used during debugging. The full pipeline is verified end-to-end.

## Architecture

```
Browser GUI (port 3320, HTTPS via Tailscale or HTTP localhost)
  │
  ├─ POST /api/chat → lisa-chat.js → Ollama → reply
  │
  └─ Voice pipeline (if speakResponses enabled):
       └─ POST /api/voice/tts (same-origin proxy)
            └─ server.js proxy → http://127.0.0.1:3330/api/tts (sidecar)
                 └─ Supertonic TTS → WAV file
            └─ returns {"audio_url": "/api/voice/audio/tts_xxx.wav"}
       └─ GET /api/voice/audio/tts_xxx.wav (same-origin proxy)
            └─ server.js proxy → http://127.0.0.1:3330/api/audio/tts_xxx.wav
            └─ streams WAV bytes to browser
       └─ new Audio(url).play() → browser playback
```

### File Layout

```
lisa2/
├── config/voice.json              ← Shared config (sidecar port, ASR/TTS settings)
├── start-lisa.sh                   ← Start all services (Ollama + voice + bot)
├── stop-lisa.sh                    ← Stop all services
├── status-lisa.sh                  ← Status of all services
├── logs-lisa.sh                    ← Tail all logs
├── start-voice.sh                  ← (deprecated — use start-lisa.sh)
├── package.json                    ← npm scripts: lisa:start/stop/status/logs
├── .runtime/                       ← Runtime artifacts (logs/, pids/)
│
├── standalone-bot/
│   ├── server.js                   ← HTTP server, API routes, voice proxy
│   ├── lisa-chat.js                ← Message assembly, retrieval, history ownership
│   ├── public/
│   │   ├── index.html              ← Main chat UI
│   │   ├── app.js                  ← Frontend logic (chat + voice + diagnostics)
│   │   ├── styles.css              ← UI styles
│   │   └── voice-test.html         ← WAV playback diagnostic page
│   ├── test-assembly.js            ← Acceptance test (reference retrieval)
│   ├── test-url-fetch.js           ← Acceptance test (URL fetch)
│   ├── test-routing.js             ← Acceptance test (command routing)
│   ├── visual-reference.md         ← Lisa's appearance (normal chat retrieval)
│   ├── z-image-reference.md        ← Image prompt knowledge (/create, /iterate)
│   └── test-reference.md           ← Test fixture (sentinel sections)
│
└── voice-sidecar/
    ├── app.py                      ← FastAPI: /api/health, /api/asr, /api/tts, /api/audio
    ├── providers/
    │   ├── asr_whispermlx.py       ← WhisperMLX transcription
    │   └── tts_supertonic.py       ← Supertonic speech synthesis
    ├── scripts/run_supertonic_tts.py  ← CLI fallback for TTS
    └── requirements.txt            ← Python dependencies
```

## Canonical Workflow

```bash
# Start everything
./start-lisa.sh                     # Ollama → voice sidecar → bot

# Watch logs
./logs-lisa.sh                      # Tails bot.log + voice.log
./logs-lisa.sh --last 50            # Show last 50 lines, then follow

# Check status
./status-lisa.sh

# Stop (preserves Ollama)
./stop-lisa.sh
./stop-lisa.sh --with-ollama        # Also stops Ollama

# Run tests
cd standalone-bot && npm test
```

## Next Task

Voice pipeline works end-to-end. Key considerations going forward:

- **Audio cleanup**: Sidecar output directory may accumulate WAV files over time.
- **First TTS call is slow** (~5-30s): Supertonic downloads model on first request. Subsequent calls are ~0.7s.
- **Browser cache**: After code changes, hard refresh (Cmd+Shift+R) may be needed.
- **Tailscale serve** manages external access: `https://farm.typhon-kelvin.ts.net:3320/` proxies to `http://127.0.0.1:3320`.

## Key Technical Details

| Detail | Value |
|--------|-------|
| Lisa server port | 3320 (HTTP; HTTPS via Tailscale) |
| Voice sidecar port | 3330 (HTTP only, localhost) |
| Sidecar protocol | HTTP (always — it's a local process) |
| Proxy upstream | `http://127.0.0.1:3330` (hardcoded, NOT from request Host header) |
| TTS request format (proxy → sidecar) | `application/x-www-form-urlencoded` |
| TTS request format (browser → proxy) | `application/json` |
| Audio format | WAV (returned by Supertonic) |
| speakResponses default | `true` (controlled by checkbox toggle in sidebar) |
| Voice config endpoint | `GET /api/voice-config` → `{voice_enabled, sidecar_url, default_voice}` |
| Browser console logs | `[VOICE]` prefix for all voice pipeline events |
| Server proxy logs | `[VOICE-PROXY] upstream=` prefix |

## Recent Changes (Not Yet Committed)

- `server.js`: Added `/api/voice/tts` and `/api/voice/audio/*` proxy routes. All sidecar URLs now use `http://127.0.0.1:3330` (hardcoded) instead of deriving from request Host header.
- `app.js`: `callTts()` now uses Web Audio API (`AudioContext.decodeAudioData` + `BufferSource`) instead of `<audio>.play()` to avoid browser autoplay blocking. AudioContext is created and resumed on user gesture (form submit). Full `[VOICE]` instrumentation at every pipeline stage.
- `public/voice-test.html`: Removed — was a diagnostic page used during debugging, no longer needed.
- `test-e2e-voice.js`: New end-to-end test validating chat → TTS proxy → audio proxy → valid WAV header.
- `start-lisa.sh`, `status-lisa.sh`, `logs-lisa.sh`, `start-voice.sh`: Runtime infrastructure updates (voice runs by default, UNMANAGED PROCESS warnings, deprecation of standalone voice start).

## Known Issues

- **First TTS call is slow** (~5-30s): Supertonic downloads model on first request. Subsequent calls are ~0.7s.
- **First ASR call is slow** (~2-5min): WhisperMLX large-v3 downloads on first call.
- **Old WAV files not cleaned up**: Sidecar output directory may accumulate files.
- **Browser cache**: After code changes, hard refresh (Cmd+Shift+R) may be needed.
- **Tailscale serve proxy required**: Server binds to `127.0.0.1`; external access via `https://farm.typhon-kelvin.ts.net:3320/` depends on Tailscale serve being configured.

## Tests

```bash
cd standalone-bot && npm test        # test-assembly.js (reference retrieval)
node test-url-fetch.js               # URL fetch + ephemeral invariant
node test-routing.js                  # Command routing (A through E)
```

All three currently pass.