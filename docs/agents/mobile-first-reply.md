# Mobile first-reply regression checks

[中文](mobile-first-reply.zh.md)

Use this journey for [#2521](https://github.com/BotHarness/DeepSeekBot/issues/2521): a new Bot DM must stay visible, keep the working indicator below the Human's message and reveal the reply above the composer while following the bottom. Reading history must retain the Human's position.

## Establish the baseline

Record the exact app source SHA, native binary provenance, Host SHA, device/OS, appearance, system text size and route class. Start with loopback on a Simulator/emulator or Tailscale HTTPS on a phone. Keep addresses and credentials private. A successful Connect request or the absence of a reconnect banner does not establish native rendering correctness.

These fixes are already on main; verify the tested build contains them before diagnosing another regression:

| Symptom                                                            | Existing change                                                                                                                                                                                      | Still needs native observation                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Working indicator above the Human's message in a short DM          | [#2510](https://github.com/BotHarness/DeepSeekBot/pull/2510), `72794500f1ed`: clamps the overlay shift when the initial scroll offset is stale                                                       | Actual indicator bounds before the first native scroll event, with keyboard open |
| First message makes the DM blank; short reply moves under composer | [#2490](https://github.com/BotHarness/DeepSeekBot/pull/2490), `3d09057811ae`: latches empty-list visibility, reveals on send, and enables visible-position preservation only during history browsing | List opacity, native visible-position behavior and composer clearance            |
| Opening history visibly chases the bottom or loads older pages     | [#2514](https://github.com/BotHarness/DeepSeekBot/pull/2514), `50df2a3a9c81`: waits for stable layout and gates older-page loading on a drag                                                         | Native batch layout and initial scroll behavior                                  |

[#2484](https://github.com/BotHarness/DeepSeekBot/pull/2484) reverted iOS per-block Markdown from [#2463](https://github.com/BotHarness/DeepSeekBot/pull/2463). A blank Markdown body during a long stream is distinct from an entire list hidden after its first DM. [#2515](https://github.com/BotHarness/DeepSeekBot/issues/2515) describes missing DM content against a long-running Host; do not label missing timeline delivery an opacity bug.

## Source regression loop

```sh
pnpm exec vitest run apps/mobile/test/conversation-streaming-rows.test.tsx apps/mobile/test/follow-latest-gestures.test.tsx apps/mobile/test/follow-latest.test.tsx --maxWorkers=2
```

The component test mounts the real `ConversationScreen` and `useFollowLatest`. Its injected timeline and native-list boundary cover empty → send → Human message → working → streaming → commit, including a working state that clears after the commit. A separate case receives the first message from another client without a local send or a size change. Assertions check chronological message rows, list visibility, the working indicator's separate overlay, scroll requests after growth, and history hold/resume.

The test deliberately omits content-size events while a short chat retains its minimum height. It supplies measured growth only when content exceeds the viewport. The hook suite covers batched layout, drag/momentum ownership and settling; the pure anchor test covers the initial stale offset. These tests do **not** render native Markdown, execute Reanimated on the UI thread, measure keyboard clearance, test transport or prove an on-device fix.

## Queued native journey

Follow [shared device QA](device-qa.md) and [Windows Android QA](android-device-qa.md). Submit an exact-head request; only the assigned runner starts a device, build, Metro or QA Host. Coordinate with the [existing iOS reproduction owner](https://github.com/BotHarness/DeepSeekBot/issues/2521#issuecomment-6319419311) before adding a duplicate Mac run. An unconfirmed runner is not an abandoned claim.

1. On the assigned isolated Host, create a neutral Bot with an empty DM. Confirm the non-Connect route and working model. Begin recording before opening the DM.
2. Focus `composer-input`, type a uniquely marked short question and activate `composer-send`. Capture Human first, working below, then a short reply such as `42` above the composer. Record through commit and the later idle state; the list must never blank or require reopening.
3. Repeat with a new Bot and a reply long enough to exceed the viewport. While at the bottom, verify streamed growth and the committed tail stay visible. With keyboard open, grow a multiline draft, dismiss/reopen the keyboard and verify the draft and reachable send action.
4. During another long reply, drag upward into history. Retain the reading position through growth and commit. Return deliberately to the bottom or use Jump to latest; the next growth must follow again.
5. Correlate the visible Human/reply with the Host's canonical Channel timeline. On failure, preserve the recording, accessibility snapshot, screen bounds and relevant redacted diagnostics **before** reopening or restarting. Record whether rows arrived, whether the list was hidden, whether only Markdown blanked, and whether the Human had left following mode. Investigate transport only when route comparison or delivery evidence warrants it.

Full acceptance needs iOS Simulator **and physical iPhone**, plus Android, with recordings and light/dark captures. Follow [mobile system-text acceptance](../../apps/mobile/DESIGN.md#system-text-and-large-text-acceptance): default/intermediate/maximum size and live resizing for the affected chat/composer flow. Capture matched baseline/head states; disclose unavailable lanes, failed model requests and missing native compatibility separately.

Report **passed / failed / blocked / unrun** per case, exact source/batch/binary identities, action, visible result, canonical Host fact and redacted evidence links. Source tests, native acceptance and Human QA are separate results. Green tests alone cannot close #2521.
