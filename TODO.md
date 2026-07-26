# Lisa2 Work Inventory

This file records possible future work and unresolved decisions. It is not a priority order and does not authorize implementation or testing.

Only the Project Owner selects the next task. Only one implementation task may be active at a time.

## Owner decisions

- Decide whether the current uncommitted MLX Audio migration is the intended base for later voice work.
- Decide which subsystem, if any, should become the next approved implementation task.

Runtime testing or live verification is outside the documentation-audit scope and requires separate approval.

## Existing subsystem gaps

These are audit findings, not an approved work sequence:

- Replace the single process-global conversation with bounded conversational sessions suitable for roughly 20–30 minute bursts.
- Define how important information is selected into long-term memory and recalled later without placing complete old conversations in every model context.
- Define memory provenance, correction, forgetting, and whether saving requires confirmation.
- Decide whether chat export should include Lisa's private persona and whether exports should be restorable.
- Finish Lisa-specific UI naming where “Standalone Bot” and “AI” remain.
- Decide whether provider access needs a stable adapter, streaming, cancellation, timeouts, or model-capability checks.
- Replace keyword-only knowledge routing if the wiki or persistent-memory direction is approved.
- Define the integration contract through which Lisa sends semantic image intent to the separate Krea2 prompt and local-generation engine.
- Give ASR, TTS, voice selection, and voice creation explicit replaceable boundaries.
- Resolve the direct browser-to-ASR loopback path for remote or HTTPS use.
- Route ASR through the Lisa server so the browser has one gateway for every Lisa capability.
- Reconcile `voice_enabled`, ASR language, and unused voice configuration fields with actual behavior.
- Choose one canonical lifecycle path and make command names reflect whether they start the bot, ASR, TTS, or the full Lisa system.
- Review unused or historical code paths identified in the component audit before deleting anything.
- Define latency, progress, cancellation, and failure presentation for internal capabilities so slower work does not make the browser chat feel blocked or fragmented.

## Candidate architecture work

### Grounded internet access

Goal: let Lisa use current, attributable internet information through capabilities broader than a conventional web-search feature.

Questions to answer before implementation:

- Which actions are required: open a known page, browse links, retrieve documents, monitor sources, or another bounded set?
- When should Lisa use internet access automatically, and when should she ask?
- How are sources shown to the user?
- How is external content marked as untrusted and kept out of persistent memory by default?
- Which local or external component owns browsing and retrieval?
- What permissions and safety limits apply?

No provider or tool design has been selected.

### Wiki-style knowledge and persistent memory

Goal: maintain editable, durable knowledge without turning Lisa's persona into a giant prompt.

Expected conversation use is a series of approximately 20–30 minute sessions. The memory layer should recall selected important information from earlier sessions rather than loading full historical transcripts.

Questions to answer before implementation:

- What content belongs in identity, knowledge, skills, user memory, and temporary context?
- Are pages authored by the user, Lisa with confirmation, or both?
- How are mistakes corrected or forgotten?
- How is provenance recorded?
- How are relevant pages selected for a turn?
- How are important moments or facts extracted from a conversation and linked back to their source?
- How are private and sensitive entries protected?
- Is the storage plain Markdown, a local database, or a combination?

No storage or retrieval architecture has been selected.

### External image-generation integration

Goal: let Lisa hand semantic image intent to the separately developed local engine that converts it into Krea2 prompts and submits it to image generation.

Questions to answer before implementation:

- What semantic request structure does Lisa send?
- Does the external engine return a prompt, job identifier, generated images, or all three?
- How are progress, failure, cancellation, and retries reported?
- Which component stores generated-image metadata and its relationship to the conversation?

Building the Krea2 prompt and image-generation engine itself is outside Lisa2.

### Replaceable TTS and voice cloning

Goal: make speech synthesis, voice selection, and voice creation replaceable capabilities.

Questions to answer before implementation:

- What is the smallest engine-neutral synthesis request and response contract?
- How are installed voices enumerated and selected?
- What metadata and files make up a portable voice?
- Is cloning an offline preparation workflow, a runtime API, or both?
- Which OmniVoice- or Qwen-family models should be evaluated?
- How are model size, latency, quality, and hardware pressure compared?

Rose is the current voice. MLX Audio is the current synthesis implementation. Neither should be hardwired into Lisa's identity.

## Repository cleanup candidates

- Keep current documentation synchronized when the MLX Audio working tree is accepted or changed.
- Confirm that saved voice assets are intentionally local-only and backed up outside Git.
- Remove stale runtime PID files through the normal status/start workflow when the local environments are restored.
- Decide whether service adoption should validate health-response identity rather than accepting any process that answers the expected route.
- Decide whether the bot-only and full-runtime lifecycle scripts should coexist.
- Decide whether historical/manual diagnostics such as `test-e2e-voice.js` belong in the active source tree.
