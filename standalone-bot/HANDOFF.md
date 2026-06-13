# Handoff

Current state:
- Standalone bot lives in `standalone-bot/`
- It does not use or modify `chatbot-lisa`
- Default model is `qwen3:4b`
- Server config is exposed at `GET /api/config`
- Chat API is `POST /api/chat`

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
- `curl http://127.0.0.1:3320/api/config`
- `curl -X POST http://127.0.0.1:3320/api/chat -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"Reply with only: ok"}]}'`
- Browser at `http://127.0.0.1:3320`

Known environment detail:
- Detached background processes are unreliable in this managed tool environment
- Foreground `npm start` is the safer live-server path here

Quota-saving rule:
- Avoid full `ps aux` dumps unless a PID is strictly needed
- Prefer one targeted check per suspected issue
- Avoid verbose Ollama outputs unless they explain the failure
