# Lisa2 Architecture

## Product boundary

Lisa2 is a local-first companion system built for Lisa. Lisa is the product; this repository is not pursuing a catalogue of characters.

The runtime must nevertheless keep persona, knowledge, conversation state, tools, model providers, speech recognition, speech synthesis, and voice creation behind clear boundaries. A component should be replaceable without redefining Lisa or rewriting unrelated parts of the system.

The browser chat is Lisa's sole user-facing interface. The browser communicates with the Lisa server; the server coordinates internal providers, sidecars, memory, tools, and external engines. Internal component boundaries must remain invisible to the user unless status or intervention is genuinely useful.

The primary delivery goal is a fast, low-friction path from user intent to a useful result in the browser conversation.

### Product principles

- Prefer a coherent, useful Lisa over novelty or maximum system complexity.
- Keep durable identity, knowledge, and workflows under local control where practical.
- Treat cloud providers and model families as replaceable execution layers.
- Grow capability through focused knowledge and tools rather than one expanding system prompt.
- Keep internal operational complexity out of the browser experience.
- Prefer one trusted launch, stop, status, and logging path.
- Respect local hardware and memory pressure when combining models and services.

## Implemented system

### Component overview

Lisa2 currently consists of more than its voice sidecars:

1. Lisa's identity and persona source.
2. The browser conversation interface.
3. Node orchestration and HTTP API.
4. In-memory conversation state and request assembly.
5. OpenRouter model access.
6. Ephemeral knowledge retrieval and image-prompt guidance.
7. Image input and model vision requests.
8. Speech recognition, speech synthesis, voice selection, and local voice creation.
9. Configuration, secrets, and runtime lifecycle tooling.

### Browser application

Location: `standalone-bot/public/`

Responsibilities:

- Render chat and settings.
- Send user messages and image attachments.
- Record microphone input.
- Request synthesized speech and play returned WAV data with the Web Audio API.
- Export the current chat.

The browser does not own canonical conversation history and should not need to know how to reach individual internal services.

### Node orchestration server

Main files:

- `standalone-bot/server.js`
- `standalone-bot/lisa-chat.js`

Default address: `http://127.0.0.1:3320`

Responsibilities:

- Serve the browser application.
- Expose chat, settings, reset, export, and voice-proxy routes.
- Load Lisa's persona and local configuration.
- Assemble model requests.
- Call the configured OpenRouter model.
- Expose ASR connection configuration and proxy TTS requests to the local synthesis service.

`lisa-chat.js` owns process-global in-memory dialogue history. The browser sends only the current turn.

The implemented direct browser-to-ASR route is a boundary exception, not the intended architecture. ASR should eventually be reached through the Lisa server, as TTS is now.

### Persona

Canonical source: `spec/lisa.md`

The server loads the persona at startup and refuses to start if it is missing or empty. `SYSTEM_PROMPT` is an explicit development override.

Lisa's identity does not belong to OpenRouter, a model slug, a voice file, or a provider. Changing any of those components must not silently change the persona.

### Conversational provider

Current provider: OpenRouter chat completions

Endpoint: `https://openrouter.ai/api/v1/chat/completions`

Local settings live in gitignored `config/openrouter.json`. The selected model and API key are loaded for each call, so changing the model does not require restarting the server. The browser can read the selected model and whether a key exists, but the API never returns the saved key.

Provider failures are returned as visible errors. There is no silent fallback provider.

### Message construction

Normal provider calls are assembled in this order:

1. Lisa's persona.
2. Request-scoped retrieved or tool context, when applicable.
3. Existing user/assistant dialogue.
4. The current user turn and any attached images.

Persistent dialogue:

- persona system message,
- user turns,
- assistant replies.

Request-scoped context:

- retrieved reference sections,
- skill instructions,
- tool results,
- the previous image prompt used during `/iterate image`.

Request-scoped context may influence one call but is not appended to dialogue history.

### Current knowledge routing

The current retrieval system is deliberately small:

- `standalone-bot/visual-reference.md` contains Lisa's visual reference and may be retrieved during relevant normal chat.
- `standalone-bot/z-image-reference.md` contains Z-Image prompting guidance.
- `/create image` loads the image skill and Lisa's visual reference.
- `/iterate image` loads the image skill, the preceding generated prompt, and Lisa's visual reference only when Lisa remains the subject.
- Normal chat must not load the Z-Image skill.
- `standalone-bot/test-reference.md` is a test fixture.

The former empty `standalone-bot/reference.md` placeholder was removed.

### Local voice services

Voice is provider-independent from chat.

#### Speech recognition

- Service: WhisperMLX ASR sidecar
- Source: `voice-sidecar/`
- Address: `http://127.0.0.1:3330`
- Health route: `GET /api/health`
- Transcription route: `POST /api/asr`

The browser sends recorded audio directly to the configured ASR sidecar. The sidecar enables CORS for this local browser path.

#### Speech synthesis

- Current service: repository-owned MLX Audio adapter
- Source: `mlx-audio-service/`
- Address: `http://127.0.0.1:8000`
- Health route: `GET /health`
- Synthesis route: `POST /v1/audio/speech`
- Current voice selection: `rose`

The Node server sends JSON shaped as:

`{"input":"Text to speak","voice":"rose"}`

The service returns WAV bytes. Node forwards those bytes through the same-origin `POST /api/voice/tts` route, and the browser decodes and plays them.

Rose is deployment configuration. Neither Rose nor MLX Audio is a permanent identity dependency.

### Runtime operations

Canonical commands from the repository root:

- `./start-lisa.sh`
- `./stop-lisa.sh`
- `./status-lisa.sh`
- `./logs-lisa.sh`

The root lifecycle scripts manage:

| Service | Port | PID | Log |
|---|---:|---|---|
| Bot and browser UI | 3320 | `.runtime/pids/bot.pid` | `.runtime/logs/bot.log` |
| WhisperMLX ASR | 3330 | `.runtime/pids/voice.pid` | `.runtime/logs/voice.log` |
| MLX Audio TTS | 8000 | `.runtime/pids/tts.pid` | `.runtime/logs/tts.log` |

`.runtime/` is ignored by Git. Scripts may adopt an already-running process when its expected health route responds and must not claim stale PID files represent live services. Current adoption checks do not validate a service identity field.

## Architectural invariants

1. Lisa's identity remains independent of models, providers, voices, and tools.
2. Lisa is the product; persona replaceability is a modularity requirement, not a multi-character roadmap.
3. `lisa-chat.js` owns current dialogue history.
4. The browser does not own canonical dialogue history.
5. Retrieved and tool-generated context is request-scoped unless a future memory system explicitly saves it.
6. Z-Image skill content does not load during normal chat.
7. Provider errors remain visible.
8. Secrets remain server-side and outside Git.
9. Voice services remain independent from the chat provider.
10. Current engine and voice choices are configuration, not identity.
11. Operational status must reflect actual processes and health checks.
12. The browser chat is the only user-facing Lisa interface.
13. The browser talks to the Lisa server, not directly to internal providers, sidecars, or engines.
14. Internal capabilities return results to the browser conversation with minimal avoidable latency and interaction overhead.

## Known implementation limitations

These are source-backed limitations in the current working tree, not an approved implementation sequence:

- Conversation state is one unbounded, process-global, in-memory history shared by all clients and lost on restart.
- Chat export includes the system persona, cannot be imported, and does not retain attached image data.
- OpenRouter is the only chat provider; requests are non-streaming and lack timeout, cancellation, and model-capability validation.
- Knowledge retrieval is first-match keyword substring routing rather than a wiki, index, or durable memory system.
- Images are visible only in the current request. Image commands write prompts but do not call the separate image-generation engine.
- The browser calls ASR directly over a loopback URL even though the intended boundary is one browser-to-Lisa-server gateway.
- ASR, TTS, voice selection, and voice creation do not yet have engine-neutral interfaces.
- Voice configuration contains fields that are ignored or overridden by browser and server code.
- Bot-only and full-runtime lifecycle commands overlap and use different PID and log locations.
- Some user-facing copy still says “Standalone Bot” or “AI.”

## Documented intent

### Replaceable voice capability

The intended voice boundary consists of three related but separate capabilities:

1. Text-to-speech generation.
2. Selection of an existing voice.
3. Creation or cloning of a voice.

The current working tree implements speech synthesis and voice selection through MLX Audio. Voice creation currently exists as a local MLX Audio GUI workflow, not as a stable engine-neutral runtime contract.

Future voice-cloning implementations may use OmniVoice- or Qwen-family models. No specific model, request schema, storage format, or migration design has been approved.

### Grounded internet access

The desired capability is broader than a conventional web-search feature. Possible abilities include opening known pages, following sources, retrieving current information, and using bounded internet tools.

No provider or tool contract is selected. Any design must keep fetched material request-scoped by default, preserve source attribution, and treat external content as untrusted data.

### Wiki-style knowledge and persistent memory

A candidate direction is an editable wiki or notebook in which knowledge is divided into maintainable pages rather than accumulated in one system prompt.

Expected use consists largely of conversational bursts of roughly 20–30 minutes. The long-term relationship should not depend on resending complete old conversations. A future memory system should instead select important information, retain it durably, and retrieve relevant memories when later conversations need them.

The design must distinguish:

- Lisa's identity,
- stable knowledge,
- learned user or workflow memory,
- temporary retrieved context,
- executable tools and skills.

Open questions include authorship, correction, provenance, retrieval, retention, and whether Lisa may save entries without confirmation.

### External image-generation engine

Image generation is intentionally outside Lisa2. A separate local engine is being built to accept semantic image intent from Lisa, translate that intent into Krea2 prompts, and submit the result to local image generation.

Lisa2 needs an integration boundary for that engine, not its own image-generation implementation. The request schema, response schema, progress reporting, and ownership of generated-image history remain unresolved.

## Explicitly not implemented

- General grounded internet access.
- Durable conversational or personal memory.
- A settled wiki storage and retrieval system.
- The integration with the separate semantic-to-Krea2 image-generation engine.
- Engine-neutral voice-cloning APIs.
- Automatic model routing.
- A generalized plugin or tool orchestration platform.
- Multi-user authorization.

These are absence statements, not a promised implementation sequence.

## Evidence discipline

Architecture documents describe structure; they do not prove runtime behavior. A source audit must not be presented as testing, live verification, or Project Owner acceptance. Runtime work requires a separately approved scope.
