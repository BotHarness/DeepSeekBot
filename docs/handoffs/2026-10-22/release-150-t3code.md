# Release 1.5.0 — same-Mac t3code handoff

Snapshot: 2026-10-22. Read `AGENTS.md` first. This is a continuation handoff, not release approval.
The user is moving from Codex to t3code on the SAME Mac; local evidence and Profiles remain available.

## Scope and permission

This task owns macOS desktop and iOS integration/acceptance. The Human handles Windows/Android
on the other computer. Desktop and mobile must finish testing/debugging before a coordinated
release, then Vain explicitly approves publication. Code merges do not authorize tag/npm,
store submission/publication, site deployment or test-account deletion. Vain clicks this task's
PR merges. No release/deploy/account deletion was performed by this task.

## Git and version identities

| Ref | SHA | Meaning |
| --- | --- | --- |
| `codex/release-150-acceptance-87724a3` | `87724a3b58d556807ef1ba860adcbb96bda6d92f` | Frozen tested candidate; NOT accepted, native recording failed |
| `codex/release-150-t3code-handoff` | This document's commit | Documentation only, based on candidate; NOT a new acceptance SHA |
| Latest observed `origin/main` | `914bfa57ed04807dc3f94a1ed6a4e678da898591` | Includes #2595 native-button repair; native retest pending |
| `codex/2590-question-channel-projection` | `905e295c0cd002fac94d832cd145b6ff0194ac1f` | Original #2593 head, pushed and merged |
| `codex/release-150-static-format` | `d347d0ed704f2114702ad4730eec95a5db6a0ef7` | #2582 superseded/closed; no release dependency |

#2585 forwarding fix, #2572 evidence convention and earlier integration work are reachable from
remote main. The main checkout is old and has unrelated dirty files: do not reset/stash/clean it.
Use the clean release worktree in the local handoff or an isolated worktree. The historical
`BotHarness/BotHarness` remote redirects to `BotHarness/DeepSeekBot`; shared remote config was not changed.
Fetch and inspect before resuming. A later fix requires a new `ACCEPTANCE SHA: <full-sha>` comment
on #2524 plus merged delta and affected reruns. Existing evidence never automatically qualifies newer main.

## Public authority

- [Acceptance SHA](https://github.com/BotHarness/DeepSeekBot/issues/2524#issuecomment-6338455288)
- [Desktop results and blocker](https://github.com/BotHarness/DeepSeekBot/issues/2524#issuecomment-6340518434)
- [Batch55 native partial results](https://github.com/BotHarness/DeepSeekBot/issues/2524#issuecomment-6340831567)
- [Reopened recording failure](https://github.com/BotHarness/DeepSeekBot/issues/2591#issuecomment-6340519117)
- [#2593 merged-main proof](https://github.com/BotHarness/DeepSeekBot/pull/2593#issuecomment-6340520220)
- [#2595 native button](https://github.com/BotHarness/DeepSeekBot/pull/2595)
- [#2581 account list follow-up](https://github.com/BotHarness/DeepSeekBot/issues/2581)

Original release order is on `origin/claude/project-thread-ki8aui` under `docs/handoffs/2026-10-22/`:
`01-integration-merge-order.md`, `02-ios-device-testflight.md`, `04-final-acceptance-screenshots.md`.
Use `git show` to read without switching a dirty checkout.

## Verified at 87724a3b58d5

Desktop: two isolated Hosts, pinned DSH0.2.1-rc.2, actual direct DeepSeek V4.1 Flash.

- Real question appears in remote Channel/Activity; Activity answer commits owning resolution and
  resumes same call to `ANSWER_QA: Light`; no local Host Channel write.
- Synthetic private input submits, native ask_secret succeeds, value absent from ordinary DOM/timeline.
  Actual Allow once leads to secret_cli success and local version output. Earlier model-call error retained.
- PNG decodes180×180; actual61-byte download matches source SHA256; light/dark captures.
- Real browser Notification constructor: reload baseline0/new real question1/reload replay0/disabled
  question0 with card present. This is not OS banner, closed-page or mobile push proof.
- CLI revoke closes1stream and shows refusal; UI Remove clears rows/preferences; full independent
  Host/device fingerprint re-pair restores roster/image; UI Remove revokes the new live pairing too.

Native Batch55: existing iOS27 Debug Simulator, fingerprint
`b3e74315f0c2d639dd1c1ff73e56182e0fb86c0e`, executable SHA256
`55de08577ac5ddb38fb0221427750b8d5096dfe10b55a1561bb438c3bf95807a`.

- First short DM passes light/large. Distinct empty-history long DM passes:80lines/6959chars,
  32.1s video, final tail above keyboard, no manual scroll/reload.
- Channel Light answer passes revision4; Activity Dark answer passes revision8. Failed XCTest
  infinite-coordinate attempts retained; same pending question answered by real Device Hub click.
- Recording FAIL: tap/800ms hold reaches only onHeld, no onStart/native start, despite #2592 loaded.
- Human account login completed. Full multi-Host list acceptance pending. Human requests Sign out
  and Delete account text AND icons red; current dark UI fails. Private screenshot contains email.

## Next work, in order

1. Read QA/source t3code handoffs and shared queue. Complete explicit device/resource transfer first;
   no competing Simulator driver, Metro, native build or Host39100. Their cleanup can postdate this snapshot.
2. #2595 merged914bfa57 replaces iOS manual gestures with a native SwiftUI button: tap start/tap stop,
   explicit Cancel, no hold/drag/lock; Android unchanged. Qualify next batch and test actual permission,
   start/stop/cancel/interruption/retry and icon alignment. Old callback-ref probe is now inapplicable;
   adapt to native button events. Historical immediate-stop is not a proven Simulator limitation.
3. Follow existing #2581 owner for account action colours; semantic danger colour for text AND symbol,
   both themes and disabled state, confirmations unchanged. Do not click account deletion without fresh go.
4. Freeze the next integrated acceptance SHA on #2524 with #2595/other fixes; rerun affected lanes.
5. Complete account multi-add/duplicate/cancel/failure/cross-Host isolation,50+history/scroll hold,
   row/refresh/drawer, matched theme×three-size matrix, XS Max, required VoiceOver/CJK/orientation/
   Release-performance cases, two-phone2524 with Human's Android result, feature screenshots.
6. Reconcile final fragments/versions after fixes stabilize. All desktop/mobile gates then explicit go;
   tag/npm → GitHub Release draft → install-release.json PR → site PR128; TestFlight by original runbook.
   Build8 was previously observed Testing(version0.0.1); recheck App Store Connect, no new submit implied.

## Local pointers and ownership

Relative to MAIN checkout (not release worktree):

- `.humanlayer/tasks/release-1.5.0/HANDOFF-T3CODE.md`: full same-machine entry point/absolute paths.
- `.humanlayer/tasks/release-1.5.0/{README.md,manifest.json,candidate-outcome-comment.md}`.
- `.humanlayer/releases/1.5.0/87724a3b58d5/README.md`: archive/index, not accepted.
- `.humanlayer/tasks/release-1.5.0/desktop-preflight/`: private originals, failures and receipts.
- `.humanlayer/tasks/qa-batch55/`: native manifest/progress-report/recording-result/account-colour
  finding, videos, binary identity, rollback Products. Some contain account information.
- `.humanlayer/device-qa/queue.md`: authoritative owner-cut scheduling/lease.
- `.humanlayer/tasks/2594-native-recording-button/handoff.json`: source handoff.

This release task's Hosts51512/51700, browser/driver all stopped and verified12:14:31Z. New test
Bots3/group1 cleaned with Memory/evidence retained, both pairings revoked. Older closed Profiles
preserved for reproduction. Browser endpoint/instance PIDs are stale. Revalidate ownership before relaunch.
QA owns separate services/devices and prepares its own handoff: do not infer they stopped from this receipt.
No release-thread automation was found by its thread ID; each other owner handles its automations.

Never push `.humanlayer`, `.secrets`, Profiles, browser storage, invitation links or credentials.
Use latest DeepSeek with full Orchestrator/Assignment model plan; preserve secret injection locally.
Read `docs/agents/{device-qa,device-secrets,qa-evidence,ax-resource-cleanup}.md` and applicable skills.
Private scripts are conveniences, not proof that their recorded SHA/endpoint is current. Build, doctor,
real UI, canonical readback, preserve failures, then exact-process cleanup. Driver pitfalls: restore
viewport on reconnect; match control roles (accessible labels also match groups); install Notification
observation before app initialization; fingerprint ceremonies need both independent comparisons.
