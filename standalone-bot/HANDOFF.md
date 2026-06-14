# Handoff

## Design intent

Lisa is a personality-first bot. The bot *is* the character; the underlying capabilities are pluggable and will grow. Planned integrations (not yet built): ComfyUI for image generation, other LLMs, Python scripts for task solving. When adding features, preserve the personality as the stable core — integrations should feel like Lisa gaining abilities, not like wiring together separate services.

## Current state
- Standalone bot lives in `standalone-bot/`
- It does not use or modify `chatbot-lisa`
- Default model is `Lisa-The-Bot:latest` — custom Modelfile personality on top of `hf.co/llmfan46/Qwen3.6-35B-A3B-uncensored-heretic-GGUF:Q4_K_S`, vision-capable
- **Persona is owned entirely by the Modelfile.** The server sends NO system message by default — sending one overrides the Modelfile persona. Override only via `SYSTEM_PROMPT` env if ever needed.
- Server endpoints: `GET /api/config`, `GET /api/models` (lists installed Ollama models), `GET /api/search?q=` (web search), `POST /api/chat`, `POST /api/save`
- Web search: Exa if `EXA_API_KEY` is set, else DuckDuckGo instant answers. Results are injected ephemerally into the message sent to Lisa, never stored in chat history.
- UI: markdown rendering in replies, model dropdown (populated from `/api/models`), image upload, "Search web" button
- Images are resized client-side (canvas, 768px max edge, JPEG 88%) before sending

## Architecture: persistent/ephemeral split
- `lisa-chat.js` implements message assembly where retrieved reference text is injected per-call and NEVER stored in persistent history. See the module header and `reference.md` (flat keyword→section v1 retrieval).
- Acceptance test: `npm test` (stubs the model call, no Ollama needed). Proves no retrieved section leaks into history.
- NOT yet wired into `server.js` — the browser still owns `messages`. Wiring is the next task.
- Parked/out of scope: embeddings, reference-file dedup, the memory layer.

How to run:
```sh
npm start
```

The bot itself lives in `standalone-bot/`. The repo-root `npm start` is just a launcher that forwards there. From inside the bot directory, `npm start` also works.

Stop with `Ctrl-C` in that terminal.

Detached helpers:
```sh
cd standalone-bot
npm run start:detached
npm run stop
```

What to verify after resuming:
- `npm test` (assembly invariant — no Ollama needed)
- `curl http://127.0.0.1:3320/api/config`
- `curl http://127.0.0.1:3320/api/models`
- `curl -X POST http://127.0.0.1:3320/api/chat -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"Reply with only: ok"}]}'`
- Browser at `http://127.0.0.1:3320`
- Tailnet URL at `https://farm.typhon-kelvin.ts.net:3320/` after `npm run serve:https`

Known environment detail:
- Detached background processes are unreliable in this managed tool environment
- Foreground `npm start` is the safer live-server path here

Quota-saving rule:
- Avoid full `ps aux` dumps unless a PID is strictly needed
- Prefer one targeted check per suspected issue
- Avoid verbose Ollama outputs unless they explain the failure
