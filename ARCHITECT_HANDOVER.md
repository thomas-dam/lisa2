# Architect Handover

## Purpose

This document is the active operational handover for the Lisa2 project. It allows any Architect — the current one, a replacement model, or a cold-start session — to reconstruct the verified state of the project without relying on chat history.

The incoming Architect's first deliverable is a **reconstruction of the current state**, not an implementation proposal. The Architect must not propose work until cold-start validation is complete and the Project Owner confirms the reconstruction is accurate.

## Authoritative branch

`main` on `origin` (`thomas-dam/lisa2`).

All architecture documents, specifications, and the OpenRouter migration have been merged to `main`. Feature branches are temporary; `main` is the source of truth.

## Required reading order

A new Architect must read these documents in this order before doing anything else:

1. [`ARCHITECT_HANDOVER.md`](ARCHITECT_HANDOVER.md) — this document (active handover)
2. [`spec/lisa.md`](spec/lisa.md) — Lisa's canonical identity
3. [`spec/runtime.md`](spec/runtime.md) — current runtime boundaries and provider contract
4. [`docs/architect-working-agreement.md`](docs/architect-working-agreement.md) — working process and rules
5. [`AGENTS.md`](AGENTS.md) — Codex agent guidance
6. [`ARCHITECTURE.md`](ARCHITECTURE.md) — current architecture document
7. [`ARCHITECT_MIGRATION_REPORT.md`](ARCHITECT_MIGRATION_REPORT.md) — historical migration context (not live operational state)

Repository content takes precedence over reconstructed chat memory.

## Cold-start validation

Before continuing any work, the incoming Architect must:

1. **Confirm the authoritative branch.** State the current branch and verify it matches `main` on `origin`.
2. **Describe the current architecture in its own words.** Produce a concise reconstruction of the system: provider, persona source, voice path, message assembly, persistent/ephemeral split, and known commands.
3. **Identify conflicting or stale documentation.** Flag any document that contradicts the current implementation. See the "Documentation drift" section below for known items.
4. **State the current unresolved architectural decision.** See the "Current decision in progress" section below.
5. **Separate verified facts from assumptions.** Label each statement as verified (backed by repository evidence) or assumption (inferred from context).
6. **Stop if repository state is unclear.** If the reconstruction does not match the repository, halt and report the discrepancy to the Project Owner. Do not proceed by guessing.
7. **Wait for Project Owner confirmation before proposing implementation.** The reconstruction must be accepted before any architectural proposal or Codex task.
8. **Follow the one-task rule.** Only one Codex task may be active at a time. See the working agreement.

## Current verified system state

| Component | State | Evidence |
|-----------|-------|----------|
| Chat provider | OpenRouter (`https://openrouter.ai/api/v1/chat/completions`) | `standalone-bot/lisa-chat.js:193`, `standalone-bot/server.js:116` |
| Persona source | `spec/lisa.md`, loaded at startup; `SYSTEM_PROMPT` is an explicit dev override | `standalone-bot/server.js:11`, `standalone-bot/lisa-chat.js:13-29`, `spec/runtime.md:17` |
| Code-default model slug | `openai/gpt-4.1-mini` | `standalone-bot/server.js:13` |
| Currently configured model | `qwen/qwen3-vl-32b-instruct` (local `config/openrouter.json`, gitignored) | `config/openrouter.json`, `ARCHITECT_MIGRATION_REPORT.md:20` |
| Model reload | Per-call; no restart needed to change model | `standalone-bot/lisa-chat.js:191` |
| Voice default | F2 | `config/voice.json:18`, `standalone-bot/server.js:283`, `standalone-bot/public/app.js:553` |
| Voice sidecar | Port 3330, ASR (whispermlx), TTS (supertonic) | `voice-sidecar/app.py:59` |
| Bot server | Port 3320 | `standalone-bot/server.js` |
| Voice TTS proxy | Same-origin proxy via `/api/voice/tts` and `/api/voice/audio/*` | `standalone-bot/server.js:286-369` |
| Voice GUI playback | Implemented via Web Audio API (`AudioContext.decodeAudioData` + `BufferSource`), primed on user gesture | `standalone-bot/public/app.js:538-666`, user-confirmed per `HANDOVER.md:30` |
| Persistent history | In-memory, process-global, owned by `lisa-chat.js` | `standalone-bot/lisa-chat.js`, `spec/runtime.md:19` |
| Ephemeral context | Retrieved reference content, tool output, previous prompt injection; never persists | `spec/runtime.md:5`, `ARCHITECTURE.md:284-301` |
| Firecrawl / URL reading | Removed; no URL-reading implementation exists | `test-url-fetch.js` deleted, `ARCHITECT_MIGRATION_REPORT.md:23` |
| Shell scripts | No Ollama references; start/stop/status manage bot + voice only | `start-lisa.sh`, `stop-lisa.sh`, `status-lisa.sh` |
| Test suite | `test-assembly.js`, `test-routing.js`, `test-persona.js`, `test-openrouter.js` | `standalone-bot/package.json` |

## Architectural invariants

1. `spec/lisa.md` is identity; models and providers are replaceable execution engines. (`spec/runtime.md:5`, `ARCHITECT_MIGRATION_REPORT.md:49`)
2. Retrieved reference content is ephemeral and never enters persistent history. (`spec/runtime.md:5`)
3. OpenRouter failures are explicit; there is no silent provider fallback. (`spec/runtime.md:13`)
4. Voice remains a separate local capability and is not coupled to the conversational provider. (`ARCHITECT_MIGRATION_REPORT.md:52`)
5. Secrets stay server-side and out of Git. (`ARCHITECT_MIGRATION_REPORT.md:54`)
6. `lisa-chat.js` owns persistent chat history. (`ARCHITECTURE.md:72`)
7. Z-Image skill does not load during normal chat. (`ARCHITECTURE.md:280`)

## Current decision in progress

**Grounded internet access.** Firecrawl was removed. No replacement has been decided. An earlier precise weather response was observed but remains unexplained. No internet implementation decision has been made.

The Architect must review current evidence before proposing any architecture or Codex task on this topic.

## Evidence already gathered

- Firecrawl was the previous URL-reading mechanism; it has been fully removed (code, tests, config).
- The precise weather response occurred during a session but cannot be attributed to a verified data source. It may have been model knowledge, not grounded access.
- `spec/runtime.md` lists "deferred work" that remains outside the current scope: durable memory, multi-user authorization, automatic model routing, generalized tool orchestration, automatic secret provisioning.
- Voice GUI playback was implemented and user-confirmed working. The lower layers (sidecar health, TTS generation, WAV serving) were already proven and should not be re-debugged.

## Known uncertainties

- Whether the precise weather response came from model knowledge or an undiscovered data path.
- Whether the voice GUI playback path has any remaining edge cases under different browsers or network conditions. The implementation is complete and user-confirmed, but exhaustive testing was not performed.
- `standalone-bot/reference.md` exists but is empty. Its purpose is unclear; it may be a legacy placeholder.

## Decisions explicitly not yet made

- How grounded internet access should work (if at all). No architecture, no provider, no tool design has been decided.
- Whether `reference.md` should be removed or repurposed.
- Whether durable memory, multi-user authorization, automatic model routing, or generalized tool orchestration should be pursued and in what order.

## Work that must not be repeated without new evidence

- **Do not re-debug the voice lower layers.** Sidecar health, TTS generation, WAV generation, WAV serving, and manual playback are proven good. The GUI playback path is implemented and user-confirmed. Only investigate if new evidence of failure appears.
- **Do not re-investigate the Ollama migration.** The migration is complete and verified. Ollama references in code comments or old documents are historical, not active issues.
- **Do not re-litigate the Firecrawl removal.** It was intentionally removed. The decision about what (if anything) replaces it is open, but the removal itself is settled.

## Documentation drift or stale information

The following documents contain stale information and must not be treated as live operational state:

| Document | Issue | Action |
|----------|-------|--------|
| [`HANDOVER.md`](HANDOVER.md) | Pre-migration handover. References Ollama as active provider, `test-url-fetch.js` (deleted), `./stop-lisa.sh --with-ollama` (flag does not exist), `voice-test.html` (removed), and `new Audio(url).play()` (replaced by Web Audio API). | Superseded by this document. Retained for history. |
| [`standalone-bot/HANDOFF.md`](standalone-bot/HANDOFF.md) | Pre-migration handoff. Describes `Lisa-The-Bot:latest` Modelfile as default model, `/api/models` endpoint (removed), Exa/DuckDuckGo web search (removed), and Ollama-based architecture. | Superseded by this document. Retained for history. |
| `standalone-bot/lisa-chat.js:11` | Comment references "Modelfile" — stale, but in application code and not modified per task constraints. | Noted; do not treat as current architecture. |
| `standalone-bot/test-routing.js:7` | Comment references `test-url-fetch.js` — file was deleted. | Noted; do not treat as current test list. |
| `standalone-bot/voice-sidecar/README.md` | References F1 as default voice — changed to F2 in commit `6d2bcee`. | Noted; `ARCHITECTURE.md` corrected to F2. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Corrected in this session: Modelfile invariant, voice default, voice GUI status, URL reading claim. See correction log below. | Updated. |

### ARCHITECTURE.md corrections made in this session

1. Operational Invariant #1: "No default system prompt overrides Lisa's Modelfile" → references `spec/lisa.md` as canonical identity source.
2. Voice default: F1 → F2.
3. "Current unresolved area: GUI chat to browser playback path" → marked resolved (implementation exists, user-confirmed).
4. "Current Open Issue: Lisa does not yet produce audible voice from normal GUI chat" → marked resolved.
5. "URL reading" removed from "Lisa today" capability list (Firecrawl removed, no replacement).

## Last completed work

**OpenRouter migration** — merged to `main` via PR #1 (squash commit `b7fc7d5`). The migration replaced Ollama with OpenRouter as the chat/vision provider, established `spec/lisa.md` as the canonical persona source, removed Firecrawl URL fetching, and updated documentation. Voice default was subsequently changed from F1 to F2 (commit `6d2bcee`).

## Next Architect action

1. Complete cold-start validation (see above).
2. Wait for Project Owner to confirm the reconstruction is accurate.
3. If the Project Owner wants to pursue grounded internet access, gather and verify evidence about available approaches before proposing architecture. Do not assume a solution.

## Last updated date

2026-07-12
