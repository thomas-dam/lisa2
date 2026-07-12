# Repository agent guidance

## GitHub access

GitHub CLI and Git-over-SSH checks may fail inside the restricted command sandbox with DNS or network errors even when authentication is valid. Before diagnosing credentials or asking the user to re-authenticate, retry the relevant `gh` or remote Git command with network escalation. In this environment, an escalated `gh api user` and `git ls-remote origin` have authenticated successfully as `thomas-dam`.

Never print, replace, or otherwise alter stored credentials while performing this check.
