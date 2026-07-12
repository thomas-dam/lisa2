# Architecture Migration Report: lisa → lisa2

Date: 2026-07-12

> **Historical document.** This report captures the state of the lisa-to-lisa2 migration at the time it was written. It is not live operational state.
>
> For the active handover, read [`ARCHITECT_HANDOVER.md`](ARCHITECT_HANDOVER.md). For current architecture, read [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`spec/runtime.md`](spec/runtime.md). Current work must use the handover and current specifications rather than treating this migration report as live operational state.

## Starting a New Architect Chat

Before proposing work, read these repository sources in order:

1. [`ARCHITECT_HANDOVER.md`](ARCHITECT_HANDOVER.md) — the active handover and cold-start validation
2. [`spec/lisa.md`](spec/lisa.md)
3. [`spec/runtime.md`](spec/runtime.md)
4. [`docs/architect-working-agreement.md`](docs/architect-working-agreement.md)
5. [`AGENTS.md`](AGENTS.md), the Codex agent-guidance document
6. [`ARCHITECTURE.md`](ARCHITECTURE.md), the current architecture document
7. [`ARCHITECT_MIGRATION_REPORT.md`](ARCHITECT_MIGRATION_REPORT.md), this historical document

Repository content takes precedence over reconstructed chat memory.

### Immediate unresolved topic

- Lisa currently uses `qwen/qwen3-vl-32b-instruct`.
- Vision works through OpenRouter.
- Grounded internet access is not yet established.
- Firecrawl has been removed.
- The earlier precise weather response remains unexplained.
- No internet implementation decision has been made.
- The next Architect chat must review the current evidence before proposing architecture or a Codex task.

## Decision

The repositories have unrelated Git histories and incompatible application shells, so they were not merged. The newer `lisa2` architecture remains the base. The intended changes from `lisa` were reimplemented in it: repository-owned persona management and OpenRouter-based conversational model management.

## Resulting system

- Node remains the chat/orchestration backend on port 3320.
- The local voice sidecar remains on port 3330.
- OpenRouter replaces Ollama for chat and vision inference.
- `spec/lisa.md` replaces the external Ollama Modelfile as the canonical identity source.
- Existing persistent/ephemeral message separation, reference retrieval, image commands, browser image attachments, chat export, and voice proxying are retained.
- Startup, status, and shutdown scripts no longer start, inspect, require, or stop Ollama.

## Provider contract

The server calls `https://openrouter.ai/api/v1/chat/completions` with the configured model, canonical persona, ephemeral context, dialogue, and current turn. Browser image attachments are translated from the existing base64 representation to OpenRouter `image_url` content parts.

Provider settings live in `config/openrouter.json`, which is gitignored and written with mode 0600. The browser can set an OpenRouter model slug and API key. Readback reports only `apiKeyConfigured`; secrets never return to the client. Environment variables `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` provide defaults, and `SYSTEM_PROMPT` remains an explicit persona override.

## Important invariants

1. `spec/lisa.md` is identity; models and providers are replaceable execution engines.
2. Retrieved reference content is ephemeral and never enters persistent history.
3. OpenRouter failures are explicit; there is no silent provider fallback.
4. Voice remains a separate local capability and is not coupled to the conversational provider.
5. Secrets stay server-side and out of Git.

## Compatibility and risk notes

- A selected OpenRouter model must support image inputs if browser image attachments are used.
- Conversation history is still process-global and memory-only, as before this migration.
- Existing Ollama-specific documentation or historical test fixture text may remain as history, but no production chat route depends on Ollama.
- A live OpenRouter smoke test requires a real key and incurs provider usage; automated tests use a stubbed transport.

## Verification

The automated suite covers persistent/ephemeral assembly, image-command routing, canonical persona precedence, missing-persona failure, OpenRouter authorization/model payloads, image conversion, and missing-key failure. Shell scripts are syntax-checked separately.
