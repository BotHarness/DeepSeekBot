# Skills S1–S8 — Cloud takeover

Hub: [#4231](https://github.com/BotHarness/DeepSeekBot/issues/4231). Read all current sub-issues and comments; early ADR draft numbers in the hub are stale. The S1 implementation was squash-merged, so preserve stack semantics while retargeting later PRs; prefer deliberate reviewed integration over a blind merge/force-push.

| Slice | Issue / PR | Observed status |
| --- | --- | --- |
| S1 DM `/` invocation | #4232 / [#4252](https://github.com/BotHarness/DeepSeekBot/pull/4252) | MERGED, issue CLOSED; squash `0d0625d` |
| S2 Group invocation | #4233 / [#4259](https://github.com/BotHarness/DeepSeekBot/pull/4259) | OPEN, branch `claude/skills-s2-group`, `deacc6747`; all checks green/skipped, **2 unresolved threads** |
| S3 live catalog | #4234 / [#4264](https://github.com/BotHarness/DeepSeekBot/pull/4264) | OPEN, branch `claude/skills-s3-live`, `8098fe893`; based on S2, all checks green/skipped, **3 unresolved threads** |
| S4 Bot installs Skills | #4235 / [#4267](https://github.com/BotHarness/DeepSeekBot/pull/4267) | OPEN, branch `claude/skills-s4-install`, `dbfe8f3d2`; based on S3, checks green/skipped, no unresolved inline threads |
| S5 Workspace Grant Skills | #4236 | Core exists only on local child history + recovery remote branch; UI/integration/full validation pending |
| S6 profile/marketplace | #4237 | OPEN, no completion established |
| S7 import review | #4238 | CLOSED **not planned by Human decision**, not implemented |
| S8 Assignment discovery | #4239 | OPEN, no completion established |

## First integrate the pending review fixes

**S2** recovery `handoff/20261116-skills-s2-review-wip`, based on original child `s2-fixes2` at `e942d795f`. Three dirty files: runtime/bot-runtime.ts, test/skill-invocation.test.ts, changes/4233-group-skill-delivery-fixes.md. Review these before applying to current `deacc6747`:
- Add the Group `channel_id` to the excerpt's full-Skill retrieval pointer, avoiding cross-Group message-not-found.
- Limit the oversized-first-message exemption once per shared batch, not once per Group.
The parent's latest UI/docs commit is newer than the child base. Preserve restored IM read-mode/reconnect docs and the draft-empty guard that prevents old Skill chips attaching to newly typed text. Failed-message retry still sends plain `/name`; that explicit S1 exclusion needs a separate scoped change if the latest spec requires it. Final stop report: all owned wait/test processes stopped. Four new cases were red on old code; current lint, tsc, 56 focused tests and formatting passed. First affected batch: 116 files / 1,523 passed / 4 skipped. Two more 115-file batches and docs public-surface tests remain. No commit was made for the three dirty files. Outcome: https://github.com/BotHarness/DeepSeekBot/issues/4233#issuecomment-6908316834 .

**S3** recovery `handoff/20261116-skills-s3-review-wip`. Original child `s3-fixes` has commit `d86047589` implementing the three review fixes, plus a six-line uncommitted regression in `skill-catalog-retry.test.ts`:
- Invalidate pending/cold Host loads before notifying clients, not only populated caches.
- Invalidate a Bot's Project catalog when its live Agent selection changes, preserving Host cache.
- Bounded watcher retry/backoff and cancellation on removal/controller close.
The new dirty regression asks that an explicit reconciliation still recover after retry exhaustion. Child said it had added the regression before adjusting exhausted state; **this may be red/unimplemented**. Verify and fix rather than assuming the snapshot is green. Final stop report: early 99 focused tests passed before the later type fixes and new dirty assertion. Type fixes were committed but not rechecked; lint remains blocked by migration 155; affected suites were not run. See [stopped S3 report](reports/skills-s3.md).

After fixes and current-head CI/review pass, merge order remains **S2 → retarget/sync S3 → S3 → retarget/sync S4 → S4**. S4 guidance-refresh fix `dbfe8f3d2` makes an existing Assignment re-read Skill-install guidance after prompt refresh; its new regression was reported red before fix and green after, with 89 file tests passing.

## S5 recovery and UI work

Recovery `handoff/20261116-skills-s5-core`, original child `s5-core`, implementation commit `744b8e59552ff36bb6ed1ba4a40722ca8dbb56b7`, built on an older S4 commit `8b2835b27`. Review its delta, absorb current S2/S3/S4 fixes, then integrate folder identity/icon/name into the menu and chips. Claude decides how to organize the entire implementation; GPT/Codex delegation is not required in Cloud. Core covers workspace owner type, root-only scanning (not parent git root), dedup across Bots, removal on grant revocation, viewer ownership refusal and unauthorized Bot text-only receipt with denied file read. Read #4236 for every AC.

Final stopped-child report: 68 focused tests passed; 420/482 affected files finished (4,546 passed / 3 timeouts / 19 skipped), final 62-file batch interrupted. Rerun three timeout files individually. Root typecheck has **six React owner-handling diagnostics**, in channel-composer.tsx at 484, 1137, 1140 and channel-message-body.tsx at 806, 813; Claude must add exhaustive Workspace-owner UI. Lint blocked by the stale migration-155 baseline. Docs and E2E smoke not run. No S5 PR. See [stopped S5 report](reports/skills-s5.md).

## Existing runtime evidence and explicit gaps

S1: isolated real-model Host/Web `/` menu, Skill chip and real reply, CLI catalog/send parity; published R2 artifacts in #4252. S2: ordinary Group excerpts and mentioned busy Bot snapshot delivery fixes were reported tested. S4: real-model Bot wrote `.agents/skills/reply-in-haiku/SKILL.md` in Memory, committed it, and it appeared in an already-open menu; a project install via write approval was separately reported. Re-read exact source/build SHAs in PR evidence; these receipts are not installed native or current combined-stack proof.

Open external-service gap: [#4260](https://github.com/BotHarness/DeepSeekBot/issues/4260), real Discord/Lark mirror fallback (S2 AC-4). Serialization fixtures do not prove real-service acceptance. Real-model Team security suite #4197 was not on main when S1 merged; don't erase that gap.

## Human decision: S7 is intentionally cancelled

Issue #4238's closing comment says: imported/installed/restored/Git-shared Project Skills activate with Memory, with **no separate review**. ADR updated in #4252 rejects a pending quarantine directory. The issue body still describes the old plan; the closing Human decision is the later authority. Do not implement pending-skills isolation or reopen S7 as unfinished. S6 and S8 remain required.

## Environment

Cloud owns routine development/tests/Web verification. Local disk/test-slot waits from the previous sessions are historical, not a reason for Cloud jobs to wait on Mac process state. Keep worker counts appropriate to Cloud resources. Run iOS/physical acceptance only on the Mac when a slice actually needs it. Never upload local credential files, Host databases, runtime profiles or raw evidence to transfer a test environment; configure a fresh isolated Cloud Host with injected secrets.
