# Repository agent guidance

## GitHub access

GitHub CLI and Git-over-SSH checks may fail inside the restricted command sandbox with DNS or network errors even when authentication is valid. Before diagnosing credentials or asking the user to re-authenticate, retry the relevant `gh` or remote Git command with network escalation. In this environment, an escalated `gh api user` and `git ls-remote origin` have authenticated successfully as `thomas-dam`.

Never print, replace, or otherwise alter stored credentials while performing this check.

## Handover and documentation discipline

- [`ARCHITECT_HANDOVER.md`](ARCHITECT_HANDOVER.md) is the active operational handover. Codex must update it when explicitly required by an approved task.
- Codex summaries are not acceptance. Only the Project Owner accepts completed work.
- Codex must not record speculative architectural conclusions as decided facts. Untested proposals, assumptions, and future possibilities must be labeled as such.
- Codex must distinguish three categories in all written output: **implemented state** (backed by repository evidence), **documented intent** (stated in specs or architecture docs but not yet implemented), and **unresolved questions** (open decisions with no settled answer).
