# Repository agent guidance

## GitHub access

GitHub CLI and Git-over-SSH checks may fail inside the restricted command sandbox with DNS or network errors even when authentication is valid. Before diagnosing credentials or asking the user to re-authenticate, retry the relevant `gh` or remote Git command with network escalation. In this environment, an escalated `gh api user` and `git ls-remote origin` have authenticated successfully as `thomas-dam`.

Never print, replace, or otherwise alter stored credentials while performing this check.

## Codex Working Agreement

- The only authoritative project documents are `README.md`, `spec/lisa.md`, `ARCHITECTURE.md`, `TODO.md`, `docs/local-deployment.md`, and this file.
- Read `README.md`, `spec/lisa.md`, `ARCHITECTURE.md`, and `TODO.md` before project work, plus `docs/local-deployment.md` when operations are in scope.
- Do not create a handover, audit, migration report, roadmap, decision log, alternate architecture, or archive document unless the Project Owner explicitly requests it.
- When current documentation is superseded, update the surviving authoritative document and delete the obsolete file. Do not keep stale documents in the repository for historical context.
- Before editing, Codex must read the approved task and the repository documents relevant to it.
- An audit is inspection and documentation only. Codex must not run tests, start or stop services, make live requests, or otherwise exercise the runtime during an audit unless the Project Owner separately authorizes that work.
- Codex implements only the approved task scope. It must not make independent product or architectural decisions, start or anticipate a second task, or silently resolve scope conflicts.
- Only one implementation task may be active at a time. The Project Owner chooses priority and accepts or rejects results.
- The Architect may design and review; the Implementer executes only the approved work order. Neither role may treat its own summary as acceptance.
- Codex summaries are not acceptance. Only the Project Owner accepts completed work.
- Codex must not record speculative architectural conclusions as decided facts or describe untested work as verified. Untested proposals, assumptions, and future possibilities must be labeled as such.
- Codex must distinguish three categories in all written output: **implemented state** (backed by repository evidence), **documented intent** (stated in specs or architecture docs but not yet implemented), and **unresolved questions** (open decisions with no settled answer).
- Codex must report deviations, incomplete verification, unexpected repository state, and conflicts between the approved scope and repository evidence.
- Credentials and secrets must never be printed, replaced, committed, or exposed.
