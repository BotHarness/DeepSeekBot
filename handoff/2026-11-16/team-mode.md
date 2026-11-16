# Team mode — Cloud takeover

## Scope and actual state

Read spec [#4137](https://github.com/BotHarness/DeepSeekBot/issues/4137), hub [#4138](https://github.com/BotHarness/DeepSeekBot/issues/4138), their current comments and architecture docs. The old entry worktree `claude/team-mode-m0-m11-053808` is only an orchestration base at `60fcf2efc`; implementation is on slice branches. Do not resume coding on that stale base.

Closed implementation issues observed: M0–M6 (#4139–4145), M9–M11 (#4147–4149), M13 #4187, M14 #4188 and member Memory #4200. Still open: M7 #4150, M8 #4146, M12 #4183, M15 #4197, desktop/environment follow-ups #4201 and IM-style workspace #4222. Read the hub and current claims to establish the exact remaining scope; do not reopen closed work just because it is absent on the orchestration branch.

| Work | Current PR / branch | Observed status |
| --- | --- | --- |
| M7 Bot visibility/Role Policy | [#4258](https://github.com/BotHarness/DeepSeekBot/pull/4258), `claude/4150-bot-visibility`, `5c2683cfa` | OPEN, CLEAN, all reported checks green/skipped, **4 unresolved review threads** |
| M8 mobile invitation/login | [#4165](https://github.com/BotHarness/DeepSeekBot/pull/4165), `claude/4146-mobile-sign-in`, `70b026bfb` | OPEN DRAFT, conflict with main; local merge still unfinished |
| M14 Channel invitations | [#4262](https://github.com/BotHarness/DeepSeekBot/pull/4262), `76197792e` | MERGED; #4188 closed |
| Member Bot Memory | [#4263](https://github.com/BotHarness/DeepSeekBot/pull/4263), `a63fc4393` | MERGED; #4200 closed |
| Desktop login/shared host-client H1/H2 | [#4265](https://github.com/BotHarness/DeepSeekBot/pull/4265), `claude/4201-desktop-sign-in`, `406e21f15` | OPEN, based on M8, checks green/skipped, 0 open inline review threads; native acceptance separate |

PR state was queried live during transfer. CI success does not override unresolved review or hardware gaps. Later thread history includes Human authorization to merge when CI and review are both clear; refresh that condition on the final head. Do not merge M7 while these four threads remain unresolved.

## M7 next actions

Current unresolved #4258 findings:

1. `bridge/methods.ts`: DM mention must refuse private Bot targets the Human cannot reach. [thread](https://github.com/BotHarness/DeepSeekBot/pull/4258#discussion_r4582232597)
2. `bridge/methods.ts`: retained readable DM Bot aliases must remain valid for roster batch arrangement (unpin etc.), without restoring send access. [thread](https://github.com/BotHarness/DeepSeekBot/pull/4258#discussion_r4582232605)
3. `channels/sqlite-store.ts`: `dm-member-H` participant IDs can collide with legacy `dm-<botSlug>` IDs; validate stored Human and Bot identities before reuse and allocate safely. [thread](https://github.com/BotHarness/DeepSeekBot/pull/4258#discussion_r4582232612)
4. `runtime/human-attention.ts`: completed Assignment reports in a shared-Bot DM must reach its requester, preserving other recipients' privacy filters. [thread](https://github.com/BotHarness/DeepSeekBot/pull/4258#discussion_r4582232618)

Delegate these logic fixes to Codex, prove refusals and successes with behavioral regressions, re-run exact-head verification. The parent reported 8,280 affected tests, typecheck/lint/format and 20 smoke checks passing at `5c2683cfa`; transfer did not rerun them. Real Host/Web e2e had real UI/CLI replies, read-only DM retained in Alice's list, owner-only profile tools hidden. An early policy-conflict screenshot was invalid due to `Salaries` vs `salaries`; refresh final-head evidence and verify which PR images were replaced. Existing public R2 artifact URLs are in PR bodies. M14 real Host tests showed Owner adding Alice, Alice adding Bob, live Channel visibility and corrected member labels. Do not relabel those Web receipts as installed native acceptance.

## M8 unfinished merge recovery

Original HEAD: `70b026bfb54472d8d37ed2c4d4f17d174187642f`.
Pending merge target: `fc827e046be51a3fa7beef272cf2413eb2b29dfc`.
Snapshot: `handoff/20261116-team-m8-merge-wip` (`f609d2e4b7dd178ef7bbd6b63bb0e3cc2c94e76b`). It contains 96 changed files and deliberately preserves conflict markers. Seven index paths remain unresolved: both bot-cli guides, schema-plan, team/service, schema-migration-ledger test, team-minimal-members test, schema-migrations manifest. Some worktree text was already manually resolved but not marked resolved in the original index.

In a fresh Cloud checkout, create a recovery branch from the original HEAD and start a no-commit merge of the recorded target. Read the checkpoint version of each unresolved path and the original index stages in `.cloud-handoff/source-state.json`. Review and carry over the actual manually resolved work; retain contributions from main and M8. Use the checkpoint as recovery material, **not a merge commit to cherry-pick**. Keep main's `channel-membership-basis` migration before M8's append-only `member-devices`. Respect the schema ledger and refuse incompatible prior migration order without touching the database. Finish all conflicts, inspect the complete merge diff and run migration/typecheck/Team/device tests before committing/pushing the PR branch. The previous thread failed on credit during validation, so this merge has no completed validation receipt.

## Managed Tailscale ingress

Child original branch `codex/team-trusted-ingress`, HEAD `97d852cebd37d7045859fe5a08cd522098e6faf8`, based on M8 rather than main. Final committed branch **`codex/team-trusted-ingress`**, commit **`149f6e4f9cea310bf9e54218152a75140955ab4a`**, now pushed. Prefer this implementation commit to the older recovery branch `handoff/20261116-team-trusted-ingress-wip`. It contains the same 22 source/doc/test files and ADR-0347 (check numbering collisions before integration).

Design: the Host owns a dedicated loopback-only listener; only its own Tailscale Serve mapping targets that listener. The route attaches an internal unforgeable request marker; normal-port proxy headers remain untrusted. Invitation URLs advertise only genuinely login-capable endpoints. No blanket trust of forwarded headers, arbitrary Serve mappings, or client-provided flags. Preserve the existing Connect trust boundary. Review the full dirty implementation before integrating into resolved M8, then sync dependent #4265.

Final stopped-child report: all 343 files completed, 4,237 tests passed and 19 skipped, with two unchanged timeout reruns passing. Root/mobile typecheck, format, docs/public-surface, slides and isolated smoke passed. **Full lint did not pass:** two proven M8-base violations remain (migration generation 155 order; prohibited comment at `apps/mobile/src/team/team-link-path.ts:4`). Real Tailscale publish/sign-in/cleanup verification was not started. Claude still needs trust-status UI and the `paired-devices.tsx` Host-port label adjustment: `serveCommand` now names an ingress port, so read the actual loopback route port instead. See [stopped child report](reports/trusted-ingress.md). These are child receipts; transfer did not rerun them.

## Native acceptance — only lane that returns to the Mac

Old session used a Simulator whose UDID starts `D802AF44`, Metro and isolated Host `m8ios` with a Tailscale `:8447` mapping. Inventory and owner/queue state must be checked fresh; old PIDs/ports/leases are not current guarantees. Preserve all inherited state and do not erase/reinstall/take over devices without the required session authorization.

Old Simulator receipt: development-build invitation deep link initially hit Unmatched Route; fix pushed and login screen then appeared. Expired invite, tampered invite and fingerprint mismatch refusal passed; fingerprint mismatch refused before sending the password. Login then blocked because the Host did not trust the Tailscale ingress. Still untested after ingress fix: correct/incorrect password, forced password change, per-member content isolation, self-pair another device and account switching. Android native gate also remains separate. No physical-iPhone completion is claimed.

Cloud should finish source/Web/tests first, then connect to the Mac for iOS only. Under T3 use device_list → device_open(hostId,deviceId) and its bound agent-device command for interaction. Recheck installation/build/transport/launch/interaction separately.

## Preserved unrelated local files

Several Team worktrees contain four untracked docs-site files (`private-named-tunnel.mdx`, `private-relay.mdx`, en/zh). They were excluded from transfer as unrelated generated/local work. They remain untouched on the Mac. Node modules, databases, credentials, raw screenshots and mobile signing material were not uploaded. Recover published screenshots from PR R2 links; request local-only device receipts when needed.
