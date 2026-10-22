# iOS QA handoff to t3code — 2026-10-22

The Human requested continuation in t3code on the same Mac. Codex's `ios-qa` heartbeat is paused. The native test environment is explicitly retained for the successor; this is **not a completed cleanup, native acceptance or release approval**.

## Entry point

Open the existing `.worktrees/qa-batch-50` checkout, on `qa/batch-55`. The full machine-local handoff is in the main checkout at `.humanlayer/tasks/qa-batch55/HANDOFF-T3CODE.md`. Read it, current `.humanlayer/device-qa/queue.md`, the batch manifest and repository device/resource rules before any operation. Acknowledge sole t3code ownership in the queue after checking process identities and device state. Do not start a parallel driver or duplicate services.

Private Profiles, authentication material, original app backups, raw account screenshots and logs remain on that Mac; they are deliberately not committed. The main checkout has unrelated dirty files that must be preserved.

## Remote refs

| Branch | Exact commit |
| --- | --- |
| qa/batch-55 | 87724a3b58d556807ef1ba860adcbb96bda6d92f |
| qa/batch-55-before-2583 | c0db581e5ef3dea13988b9437e919346cf666ea8 |
| qa/batch-55-before-2589 | 6582a946c0a3ddcf2307e8437ab261b4e8478cd0 |
| qa/batch-55-before-2592 | 78daa78ee44d12aa93289dd94d0441dec275c524 |
| qa/batch-55-before-2593 | 19fdebf407f728a2023a8644ad42a98d595ad59a |
| qa/b55-progress-evidence | 03abe4fb5274da8ba49c9c2d39013b111ffdbd1f |

The batch stays frozen. Each Before removes only its named PR; qualify dependencies and full native inputs before loading it. This handoff branch is documentation only, not a new app candidate.

## Qualified build and partial findings

JS/Host source is 87724a3b58d556807ef1ba860adcbb96bda6d92f. Strict native fingerprint is b3e74315f0c2d639dd1c1ff73e56182e0fb86c0e; final installed executable SHA-256 is 55de08577ac5ddb38fb0221427750b8d5096dfe10b55a1561bb438c3bf95807a. This is a Debug Simulator development build. Same-source ad-hoc relinking restored the required Simulator entitlements after an unsigned-build qualification failure; earlier executable receipts are historical.

- PASS within stated limits: real short and long first DM on distinct empty-history Bots, direct DeepSeek responses, visible long tail above keyboard, Channel Light and Activity Dark question answers followed by canonical resolution and resumed replies. Only the observed default-size/theme combinations are proved.
- FAIL: #2592 real tap/hold reaches onHeld but no onStart or native speech events despite the correct loaded module. Both diagnostic observers were explicitly restored. Historical immediate-stop behavior is a separate unresolved observation.
- FAIL: Human requires both Sign out and Delete account text and icons red. Actual Sign out is blue and Delete's icon is blue. See [account finding](https://github.com/BotHarness/DeepSeekBot/issues/2581#issuecomment-6340882898). No account deletion was performed.
- Phone account login is complete. Task Host A/B account enrollment and the 12-case native account matrix remain pending. Host B has just booted and passed API health, which does not establish UI readiness.
- Still pending: matched Before/After light/dark × three text sizes; account A/B sequencing, duplicate/cancel/failure/rename and encrypted outer capture; long-history scroll hold; rows/menus/drawer; remaining composer/recording cases. Android, physical devices, assistive technology, CJK/orientation and Release performance are independently untested.

[Public partial evidence report](https://github.com/BotHarness/DeepSeekBot/blob/03abe4fb5274/.github/pr-screenshots/b55/report.md) and [release progress comment](https://github.com/BotHarness/DeepSeekBot/issues/2524#issuecomment-6340831567). That earlier report's pending-login statement is superseded by this handoff. Its screenshots are partial evidence, not a matched matrix or release pass.

## Continuation and release boundary

Keep the existing Host A/B, Metro, three task Bots, task pairing and phone login as documented locally; revalidate ownership before reuse. Task model plans must use the machine-local DEEPSEEK_API_KEY through direct DeepSeek for both Orchestrator and Assignment. Host B's launcher default is not qualified; set a complete task Bot plan through the owning API and verify a real reply before model testing. Never edit shared credentials or another Host.

#2595 is merged as 914bfa57ed04807dc3f94a1ed6a4e678da898591 (source085fdcde4d6e5169f162265a8d688f64bf791e16). It replaces iOS hold/drag recording with native tap Start/Stop and Cancel. It needs a new frozen batch and native verification; do not insert it into Batch55. The older callback probe's removed ref is not a valid oracle for the new control. No audio/transcript/options/raw errors or secrets in diagnostics.

Finish or explicitly defer Batch55, preserve evidence, clean only its own keys/Bots/registrations/services, restore original pairing/theme/text/photo state, verify ports and driver release, then write RELEASED. Do not create/erase a Simulator, merge product PRs, publish or delete the Human account. Do not resume Codex's automation while t3code owns the lane.

The release coordinator's separate handoff is `.humanlayer/tasks/release-1.5.0/HANDOFF-T3CODE.md` locally and `docs/handoffs/2026-10-22/release-150-t3code.md` on `codex/release-150-t3code-handoff`. Verify its current remote receipt independently. Acceptance candidate87724a3b is not release authorization; platform results and final Human approval remain separate.


Composer/recording source handoff: main checkout `.humanlayer/tasks/2594-native-recording-button/T3CODE-HANDOFF.md`. Source owner reports its worktree clean, relevant source/evidence refs remote-verified and its automation-2 deleted; it did not release or modify this QA lease. The successor must acknowledge its own source task identity.
