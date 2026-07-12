ARCHITECTURE.md

Lisa2 Architecture

Lisa2 is a local-first companion system built around a clear separation of character, skills, tools, runtime state, and external services.

The system should remain modular enough that Lisa can be replaced by another persona without rewriting the engine.

⸻

Current Core Components

1. Browser UI

Location:

public/

Responsibilities:

* render chat
* send user messages
* display assistant replies
* handle image upload UI
* handle voice controls
* request TTS playback
* export chats

The browser is display and interaction only.

It should not own Lisa’s persistent conversation history.

⸻

2. Node Backend

Main files:

* server.js
* lisa-chat.js

Responsibilities:

* expose HTTP API
* receive user turns
* call Lisa chat logic
* manage runtime routes
* connect to OpenRouter
* expose voice config
* serve frontend assets

The backend should remain a thin orchestration layer where practical.

⸻

3. Lisa Chat Core

Main file:

lisa-chat.js

Responsibilities:

* own persistent conversation history
* assemble provider-neutral chat history and OpenRouter message payloads
* inject ephemeral retrieval context
* manage command-specific context
* prevent retrieved/tool content from becoming persistent memory

Hard invariant:

lisa-chat.js is the owner of persistent chat history.

⸻

4. Persona and Model Provider

Responsibilities:

* `spec/lisa.md` owns Lisa's identity, voice, and behavioral boundaries
* OpenRouter supplies replaceable conversational models
* `config/openrouter.json` stores the local API key and selected model and is gitignored

The application loads the checked-in persona as the first persistent system message. `SYSTEM_PROMPT` is an explicit development override; provider models do not own Lisa's identity.

⸻

Runtime Services

OpenRouter

Endpoint: `https://openrouter.ai/api/v1/chat/completions`

Used for conversational and vision-capable inference. The code-default model slug is `openai/gpt-4.1-mini` (`server.js:13`), overridable in the browser. The currently configured model (in local gitignored `config/openrouter.json`) is `qwen/qwen3-vl-32b-instruct`. The model is loaded per-call, so changes do not require a restart. The API key remains server-side.

⸻

Lisa Bot Server

Default URL:

http://127.0.0.1:3320

Used for:

* browser UI
* chat API
* runtime config
* backend orchestration

⸻

Voice Sidecar

Default URL:

http://127.0.0.1:3330

Health endpoint:

/api/health

Known providers:

* ASR: whispermlx
* TTS: supertonic
* default voice: F2

TTS endpoint expects:

application/x-www-form-urlencoded

Not JSON.

Known-good manual TTS flow:

* POST /api/tts
* receive audio_url
* GET /api/audio/
* play WAV locally

⸻

Canonical Runtime Commands

From repo root:

Start full stack:

./start-lisa.sh

Stop bot and voice:

./stop-lisa.sh

Status:

./status-lisa.sh

Logs:

./logs-lisa.sh

The normal Lisa test path must not require manual cd into subdirectories.

Voice is part of normal Lisa startup.

⸻

Runtime Directory

All runtime artifacts should live under:

.runtime/

Current structure:

.runtime/
├── logs/
│   ├── bot.log
│   └── voice.log
└── pids/
├── bot.pid
└── voice.pid

.runtime/ is ignored by git.

⸻

Knowledge and Retrieval

Current Knowledge Files

visual-reference.md

Contains Lisa’s stable visual identity.

Used for:

* normal appearance questions
* image generation involving Lisa

z-image-reference.md

Contains image-prompt skill knowledge.

Used for:

* /create image
* /iterate image

Must not be retrieved during normal chat.

test-reference.md

Test fixture for retrieval and sentinel assertions.

reference.md

Currently empty or legacy placeholder.

Should be removed or documented if retained.

⸻

Identity vs Skill

A major architectural boundary:

Identity is who the character is.

Skills are what the character can do.

Examples:

Lisa identity:

* appearance
* personality
* voice
* stable canon

Image skill:

* prompt structure
* lighting
* lens
* composition
* aspect ratio
* iteration rules

These must not be mixed in the same retrieval path.

⸻

Command Routing

Slash commands create explicit skill modes.

Current commands:

/create image

Purpose:

* activate image-prompt mode
* load Lisa visual identity
* load Z-Image prompt skill
* produce a high-quality image prompt

/iterate image

Purpose:

* revise the last generated image prompt
* load Z-Image prompt skill
* include previous prompt ephemerally
* include Lisa visual identity only if Lisa remains the subject

Normal chat must not activate Z-Image skill retrieval.

⸻

Persistent vs Ephemeral Context

Persistent:

* user messages
* assistant replies
* lightweight runtime state explicitly intended to survive, such as last generated image prompt

Ephemeral:

* retrieved reference sections
* tool output
* previous prompt injection for iteration
* diagnostic context

Hard invariant:

Ephemeral context may influence one model call, but must not become persistent history.

⸻

Voice Architecture

Current voice path target:

Lisa reply
↓
browser callTts()
↓
POST voice sidecar /api/tts
↓
audio_url returned
↓
browser GET /api/audio/
↓
audio.play()

Known-good layers:

* sidecar health
* TTS generation
* WAV generation
* WAV serving
* manual playback

Current status:

* GUI chat to browser playback path: implemented and user-confirmed working
* Uses Web Audio API (`AudioContext.decodeAudioData` + `BufferSource`), primed on user gesture
* Same-origin proxy avoids mixed-content blocking

Do not re-debug proven-good layers unless new evidence appears.

⸻

Testing Philosophy

Positive assertions matter.

Tests should verify that useful context reaches the model, not only that content does not leak.

⸻

Operational Invariants

1. No default system prompt overrides Lisa’s canonical persona in `spec/lisa.md`. `SYSTEM_PROMPT` is an explicit development override only.
2. lisa-chat.js owns persistent history.
3. Browser does not own conversation history.
4. Retrieved content is ephemeral.
5. Z-Image skill does not load during normal chat.
6. Voice starts with normal Lisa startup.
7. Startup state must be managed and observable.
8. Logs and PIDs must match actual running services.
9. Unmanaged processes must be reported clearly.

⸻

Resolved Issue: Voice from GUI Chat

Lisa now produces audible voice from normal GUI chat. This was resolved by implementing `callTts()` in `app.js` using the Web Audio API (`AudioContext.decodeAudioData` + `BufferSource`), with the `AudioContext` primed on user gesture to satisfy autoplay policies. Same-origin proxy routes (`/api/voice/tts`, `/api/voice/audio/*`) avoid mixed-content blocking.

All layers are proven good:

* voice sidecar reachable
* /api/tts works manually
* audio URL returned
* WAV file served
* manual playback works
* GUI chat → TTS proxy → audio proxy → AudioContext playback → speaker (user-confirmed)

Do not re-debug proven-good layers unless new evidence appears.

⸻

Future Architecture Direction

Skill Notebook / Wiki

Likely future structure:

identity/
skills/
tools/
runtime/
tests/

Skills may become editable wiki/notebook pages.

Examples:

* skills/z-image.md
* skills/apple-mdm.md
* skills/intune.md
* skills/boliga-scraper.md
* skills/weather.md

⸻

Service Control Plane

Shell scripts are acceptable for the current two-service stack.

If Lisa grows beyond 3–4 local services, move toward a manifest-driven control plane.

Desired future operator interface:

lisa up
lisa down
lisa status
lisa logs

The operator should manage Lisa, not individual sub-processes.

⸻

Tooling Direction

Future tools should follow the same pattern:

explicit intent
↓
tool runs
↓
result injected ephemerally
↓
Lisa responds

Tool output should not become memory unless explicitly saved.

Potential future tools:

* Python script execution
* weather forecast tools
* MDM policy tools
* scraper tools
* image generation backend
* provider-specific adapter generation

⸻

Architecture Goal

The engine should support many characters and many skills.

Lisa today:

* local companion
* image prompting
* voice

Future persona example:

James:

* old Irish pirate personality
* fly fishing knowledge
* weather opinions
* pub wisdom

The engine should not care which persona is loaded.

Persona, identity, skills, and tools should be replaceable modules.
