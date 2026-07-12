# Lisa Runtime

## Current boundaries

Lisa2 keeps identity, knowledge, conversation state, tools, and providers separate. `spec/lisa.md` is the canonical identity source. Retrieved reference documents may inform one request but must never rewrite the persona or enter persistent dialogue history.

## Conversational provider

OpenRouter is the active chat provider. `standalone-bot/lisa-chat.js` converts the assembled messages to the OpenRouter chat-completions format, including data-URL image parts for vision-capable models. The selected model and API key are loaded for every call so model changes do not require a restart.

Settings are stored locally in gitignored `config/openrouter.json` with owner-only permissions. `GET /api/settings` exposes only the model slug and whether a key exists. It never returns the key. `POST /api/settings` preserves the current key when the submitted key is blank.

Provider failure, missing credentials, malformed responses, and empty completions remain visible errors. The application does not silently fall back to Ollama or another model.

## Persona and message construction

At startup the server loads `spec/lisa.md`; failure to load a non-empty persona stops startup. `SYSTEM_PROMPT` remains an explicit development override. Normal calls contain the persona first, ephemeral retrieved context next, then dialogue and the current user turn.

`lisa-chat.js` owns in-memory history. Only persona and user/assistant dialogue persist. Visual reference, Z-Image guidance, and other tool context are request-scoped.

## Independent local services

The voice sidecar remains local and provider-independent. It handles ASR and TTS on port 3330 while the Node server proxies browser requests. Moving chat inference to OpenRouter does not move recorded audio or synthesized WAV handling to OpenRouter.

## Deferred work

Durable memory, multi-user authorization, automatic model routing, generalized tool orchestration, and automatic secret provisioning remain outside this migration.
