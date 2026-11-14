# Team mode implementation handoff

The Human approved implementing [spec #4137](https://github.com/BotHarness/DeepSeekBot/issues/4137) through [hub #4138](https://github.com/BotHarness/DeepSeekBot/issues/4138), slices M0–M11 (#4139–#4150). Design: [ADR-0336](../adr/0336-hosts-have-members.md), [Team mode design](../architecture/team-mode.md), and the bilingual glossary. This handoff is a starting point. Before relying on any dependency, read the latest issues, claims, PRs, repository guidance and source; do not assume a dependency has merged.

## Goal

Deliver M0–M11 as narrow, stacked or independent PRs. Each PR must have real verification, CLI parity, refusal-path regressions, required CI passing on its final head, and before/after screenshots for UI changes. This authorizes implementation and PR delivery only. It does not authorize merging or a release.

**Feedback gate:** after M1 (#4140) works end to end on a real Host, stop expanding. Report to the Human and wait for feedback. Keep fixing M1 while you wait. Start M2 and later slices only after the Human responds.

## Division of labour

The local Claude Code session is the **orchestrator and UI/UX owner**. Codex CLI is a **sub-agent for logic**.

| Codex (logic)                                                                                                                                                                      | Claude (UI/UX and integration)                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/**`: persistence, migrations, Host methods, API Gateway policy, auth and credentials, permissions, audience containment, approvals routing, Workspace guards, usage | `packages/client/**`: every component, layout, style, copy (en + zh), interaction, empty, loading and error state, accessibility |
| `deepseekbot` CLI commands and their tests                                                                                                                                         | Mobile screens and components in `apps/mobile/**`                                                                                |
| Non-visual mobile modules: API client, secure storage, session handling                                                                                                            | Wiring Client views to the Host methods Codex ships                                                                              |
| Unit and integration tests for the above                                                                                                                                           | Real-Host verification (`verify-deepseekbot`), screenshots, PR body (`visual-pr`)                                                |

Rules:

- Codex never edits `packages/client/**` or mobile screen and component files, and never writes user-visible copy. If logic needs a UI change, Codex reports it and Claude makes it.
- Claude does not rewrite Codex's logic. Claude sends review findings back to Codex as a follow-up task.
- Claude reviews every Codex diff before committing it on the slice branch. Check `git diff --stat`, and refuse any diff that touches UI paths.
- Wire contracts (Host method names, payloads, refusal codes) are agreed **before** the parallel work in a slice starts, and recorded in that slice's issue claim comment.

## Running Codex

Run `codex exec --help` once to confirm the flags for the installed version. A typical non-interactive call, pointed at the Codex sub-branch worktree (never the slice worktree Claude edits):

```bash
codex exec -C ../botharness-4139-logic "$(cat .tmp/codex-4139.md)"
```

Put the task prompt in a file under the worktree's gitignored `.tmp/`. Each prompt includes:

- the issue number and acceptance criteria
- the agreed contract
- the "do not touch" UI paths above
- "read AGENTS.md first"
- the tests to run, and that Codex should finish with a summary of changed files and test results

Codex runs in the background. Start it with the shell's background mode, monitor its output file, and keep working on UI in the meantime.

## Worktrees, claims and branches

Follow [worktree discipline](worktree-discipline.md) and the [coding-agent issue trace](agent-work-trace.md): claim each issue before substantive work, keep at most 10 worktrees, and never work in the main checkout.

- One slice = one worktree, one branch `claude/<issue>-<short-name>`, and one PR.
- Within a slice, Codex works on a sub-branch `codex/<issue>-logic` in its own worktree, branched from the slice branch.
- Claude builds UI on the slice branch against the agreed contract, then merges the reviewed Codex branch into it.
- Record both tasks in the issue claim: Claude's session reference and Codex's `CODEX_THREAD_ID`.

## Order and concurrency

```
M0 #4139 ─► M1 #4140 ─► [feedback gate] ─┬─► M2 #4141 ─────────────┐
                                          ├─► M3 #4142 ─┬─► M4 #4143 ┼─► M7 #4150
                                          │             ├─► M6 #4145 ┘
                                          │             ├─► M5 #4144 (also needs M2)
                                          │             ├─► M9 #4147
                                          │             ├─► M10 #4148
                                          │             └─► M11 #4149
                                          └─► M8 #4146
```

- **M0** is pure logic (Codex only); Claude reviews it.
- **M1** has both halves:
  - Codex: Human/credential persistence, password hashing, rate limiting, grant binding, Gateway default-deny, plain-HTTP refusal, public Channel join, CLI `team-mode` / `members` / `--as`.
  - Claude: Team mode settings, Owner password setup, member creation with the one-time password display, the sign-in and forced password-change screens, the public Channel browse/join UI.
- After the gate, run M2, M3 and M8 concurrently. After M3, run M4, M6, M9, M10 and M11 concurrently. M5 waits for M2 and M3; M7 waits for M4 and M6.
- Respect the 10-worktree budget. Remove merged worktrees as you go.

## First steps

1. The design docs are on branch `claude/stoic-euler-25n60k` (ADR-0336, `team-mode.md` and `.zh.md`, glossary, this handoff). Open a docs PR from it if none exists, and ask the Human to merge it. M0 does not depend on it.
2. Start M0:
   ```bash
   git fetch origin main
   git worktree add -b claude/4139-human-context ../botharness-4139 origin/main
   ```
   Claim #4139, write the Codex prompt, run Codex, then review its diff.
3. Agree the M1 contract and start both halves of M1.

## Facts gathered while designing

- Today the only Human ID is `LOCAL_HUMAN_ID = 'local-human'` (`packages/core/src/channels/channel.ts`).
- These tables are already keyed by `human_id`: `channel_human_members`, read receipts, `human_inbox_snoozes`, `human_inbox_dismissals` (`database/schema-plan.ts`, `LOCAL_HUMAN_RECEIPTS_MIGRATION`).
- These files interpolate the literal into SQL: `runtime/human-attention.ts` (24 uses) and `channels/sqlite-store.ts` (25 uses). Smaller users: `mark-all-read.ts`, `management.ts`, `activity-today.ts`, `memory/accepted.ts`, `memory/recovery.ts`.
- External IM people already have Roles, Authorization Groups and Behavior permission items. Role Policy (M7) reuses that evaluator; it does not build a new one.
- ADR-0067's guard is a capability boundary, not a sandbox. ADR-0205 says Shell follows the DSH mode and its asks. M5 and M6 depend on both.
