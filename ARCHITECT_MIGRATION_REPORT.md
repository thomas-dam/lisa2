# Architecture Migration Report: lisa → lisa2

Date: 2026-07-12

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
