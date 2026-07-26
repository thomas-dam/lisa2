# Lisa2

Lisa2 is a local-first companion system built for Lisa. The browser chat is the only user-facing interface; the Lisa server coordinates models, speech, memory, tools, and external engines behind it.

The product goal is fast, low-friction delivery of useful results into the browser conversation.

## Authoritative documents

Read only these documents for current project state:

1. [`spec/lisa.md`](spec/lisa.md) — Lisa's identity and behaviour.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) — implemented system, confirmed product direction, boundaries, and unresolved questions.
3. [`TODO.md`](TODO.md) — possible future work; not an approved sequence.
4. [`docs/local-deployment.md`](docs/local-deployment.md) — local setup and operation.
5. [`AGENTS.md`](AGENTS.md) — rules for coding agents.

Current source code and configuration outrank prose when describing implemented behaviour. Product intent and unresolved decisions live in `ARCHITECTURE.md`, not in handovers, session notes, migration reports, or historical documents.

Do not create additional handover, audit, roadmap, decision, or architecture documents without Project Owner approval. When an authoritative document is replaced, update the surviving source of truth and delete the obsolete file rather than archiving it in this repository.

Runtime reference files under `standalone-bot/` are prompt content or fixtures, not project documentation.

## Run Lisa

After completing [`docs/local-deployment.md`](docs/local-deployment.md):

```sh
./start-lisa.sh
./status-lisa.sh
./logs-lisa.sh
./stop-lisa.sh
```

Open `http://127.0.0.1:3320`.

## Current boundaries

- Lisa is the product; modularity is for replaceable implementations, not a multi-character roadmap.
- OpenRouter is the current chat provider.
- WhisperMLX is the current ASR implementation.
- MLX Audio with Qwen3-TTS 0.6B Base 8-bit is the current streaming TTS and local voice-library implementation; OmniVoice remains a selectable adapter.
- Rose is the current configured voice.
- Image generation belongs to a separate local semantic-to-Krea2 engine.
- Durable memory, wiki-style knowledge, generalized internet access, and the image-engine integration are not yet implemented.
