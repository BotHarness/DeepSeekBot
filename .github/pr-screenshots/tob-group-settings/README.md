# Tob Group settings and member removal evidence

Refs #2090. Implementation source: `9186759c32b578759b31e4c51ac6e933d7472b78`; base: `383dec656df7e2ea24595078a88d2a455efc4644` (#2114). Captured 2026-10-18 JST using pinned DSH 0.2.0-rc.2, real official DeepSeek replies, task-isolated Profiles and synthetic Bots/Groups only.

These are **before/after interaction states on the candidate**, not a visual redesign or screenshots claiming a base-revision model run. Existing Channel list, Members and Group settings UI is reused unchanged. On the base revision these edits were absent from Tob's scoped CLI allowlist.

| Image pair                                             | Observable change                                                                                                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `before-web-group.png` / `after-web-rename.png`        | Web 1440 × 900, dark, Chinese: natural Home request, reviewed CLI rename, new group name in roster/header; both members retained.                                                  |
| `before-macos-members.png` / `after-macos-removal.png` | Installed macOS Desktop renderer 2560 × 1640, dark, Chinese: two Bot members before; one after approved removal, with departure event. The removed Bot still exists in the roster. |

## Verification

- 212 focused tests across 10 suites passed, covering CLI parsing, broker errors/body limits, approval authority, stale fingerprints, shared Group owner, Bot identity replacement and persistence paths.
- Lint, formatting, full TypeScript checks (including mobile), release-fragment checks and production build passed.
- Web and installed macOS Desktop: simple natural prompts rename the Group, set one member to mentions, deny a removal, approve a stale rename after an independent Human edit, and approve a member removal. Completed Shell calls and canonical CLI snapshots agree with rendered UI; no dedicated Tob management model tools were used.
- Both surfaces: natural reviewed avatar clearing; independent Human CLI rename and stale-removal refusal.
- Web and macOS: real same-Profile Host/Desktop restart preserves name, remaining membership, custom attention mode and cleared avatar; the UI renders the saved state.
- Candidate Desktop was stopped and the existing main Desktop was restored and its renderer endpoint checked after each run.

## Reproduction

Use `scripts/e2e-tob-group-settings.mjs journey` with an isolated verified Web instance, or the native CDP variables from the maintained `verify-deepseekbot/features/tob-home.md` guide. The `avatar` and `direct` phases consume the preceding `group-fixture.json`; restart the same Profile's Host externally, then run `restart-read` with the latest fixture. Profiles, login URLs, full traces and synthetic IDs remain in ignored local evidence; public screenshots contain no credentials.

The first focused run caught a read operation starting a write transaction to initialize an inherited attention default. The getter is now read-only, and the regression passes. Initial lint also caught source-comment and verification-inventory hash issues; both were corrected before the passing checks.

Human QA and CI are separate from these local checks. This PR does not close all of #2090: invitation cancellation/join decisions, personal Channel options, deletion and external identities remain follow-ups. No schema migration is added by this slice.
