# #2933 physical-device reproduction — 2026-10-27

**PARTIAL REPRODUCTION CONFIRMED:** background/resume with keyboard open leaves the conversation body and composer visually blank. **Sustained flicker was not reproduced**; returning to the chat list and reopening the Bot restored the conversation.

## Device and installed candidate

- iPhone XS Max, iOS18.1.1.
- Existing Tobs Dev0.0.1(1), bundle `ai.botharness.deepseekbot.dev`. Prior install qualification identified source `8b08f4491b7c93a87f51858306b953874b177286`; this run did not rebuild/install or independently hash the installed executable, so it is not a current-main acceptance result.
- Reporter uses iPhone17/iOS26.6.2 and did not provide a build number. These versions remain distinct.
- TestFlight Tobs0.0.1(13) opened, but its existing selected computer was offline and had no accessible QA conversation. Chat reproduction on TestFlight remains **UNTESTED**. No new pairing was added.

## Minimal observed path

1.Open an existing short-history QA Bot DM with visible messages.
2.Tap the composer so the device's existing keyboard is visibly open.
3.Open the actual iOS Home/SpringBoard surface; verify it is the foreground system app. Wait at least5seconds.
4.Foreground the same Dev app without terminating/relaunching it.
5.Conversation content and composer disappear visually. The first failing screenshot and both sampled videos retain the title and keyboard; one second-run standalone capture was entirely white apart from system status. These differing capture moments do not establish sustained oscillation.

With a temporary unsent draft: reproduced1/1 after5.1s on Home. After clearing only that test draft, empty composer: reproduced1/1 after21.9s on Home. Both have before/after screenshots; the first blank state was still present at a second observation approximately35.5seconds later. Device's existing keyboard is a third-party keyboard; switching to Apple's keyboard was not tested.

## Direct observations

- Baseline composer accessibility rect:247×44points. After either failing resume:0×0points, not hittable.
- The unsent draft value remained available despite the invisible composer; reopening the conversation restored it. Empty-draft reproduction shows typed text is not required.
- The Dev process PID stayed the same throughout the test, including both failures. This was not a crash/relaunch recovery.
- Keyboard-closed controls:four Home/resume rounds (observed background waits about5.1s,5.1s,22.9s and34.7s) preserved the existing message and composer.
- Back→chat list→tap same Bot recovered. Subsequent captured observations were stable; no sustained flicker was established.
- The pre-existing model quota error was already present before testing. No new message/model invocation was made.

## Evidence limits and cleanup

The earliest attempted `home` commands returned success but later observation still reported the app foreground; those attempts are **INVALID TRIGGER**, excluded from the counts above. Accepted rounds use an explicitly bound SpringBoard surface. Initial XCTest timeouts were separate automation failures; after the Human granted the missing permission, initial snapshots succeeded.

Raw system recordings, accessibility snapshots and diagnostics remain private. Shared screenshots contain only the synthetic QA DM; no credentials, private address, account email or unrelated chats. No product-source fix, new installation, permission workaround or root-cause claim. This reproduction does not establish that the reporter's endless-flicker symptom has the same cause.

Only the temporary unsent draft was cleared; original empty draft and All/workspace list restored. Settings, keyboard configuration, installedapps, existingdata and pairings preserved. Own recorders/session/daemon stopped with known cleanup, no orphanedclaims/warnings; independent phone runner count0 and own daemonregistration absent. Issue should remain open.
