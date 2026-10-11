# Panopticon (repo OrgNotes)

Read `HANDOFF.md` before any work: the workflow with the user, the architecture map, storage, testing notes and open items.

Rules that apply to every change:

- **Language:** answer the user in Russian. The UI is Russian; code comments are English.
- **Branches:** start a new branch from up-to-date `main` for each task and open a PR. The user merges.
- **Never commit `sample-notes/`:** use `git stash -q -u -- sample-notes` around branch switches.
- **Don't touch the user's dev session:** never stop their `tauri dev` (port 1420). Run e2e with `E2E_PORT=1431`.
- **Attribution:** commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR bodies end with
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Tests:** commit only after `npx vitest run` and `E2E_PORT=1431 npx playwright test` pass.
