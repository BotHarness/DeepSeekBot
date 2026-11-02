# Activity indicator verification — #2231, slice 2

Recorded 2026-10-19. Isolated DSH Host and real Web Client using the pinned `0.2.1-rc.2` CLI, authenticated bridge, canonical Channel/Source Event/read-position owners, and disposable QA conversations.

## Revision and screenshots

- Before: `d6775e6ad119e52ddab2bc19b46b22cb94ed5936` (current main, including Channel mute #2243 and live refresh #2232).
- After implementation: `3fd174a9c5f516bdd000286756206cf5832d5796` (integrated capture revision; the following evidence commit changes no runtime source).
- Before/after: 1440 × 1000, Chinese, light and dark, same Profile, Activity Dock open, identical canonical unread and read-position snapshots. Before uses the existing broad dot; after selects Off. The panel retains the read personal records and the true global unread count remains four.
- Menu images show all five choices; unknown image deliberately injects an HTTP 503 for the status call. Its ellipsis uses neutral tokens, not the notification color.
- Screenshots contain only disposable QA data. The floating character can move independently between captures.

## Real browser journeys

The nine successful cases and status readback are in `results.json`.

1. Right-click and Shift+F10 open the Activity context menu without toggling Activity; Escape returns focus to its trigger.
2. All, Needs you, Related, Other unread and Off obey the complete Host summary. Read-but-retained personal messages do not light Related.
3. Off leaves the Activity button clickable and its accessible state truthful. Header category/clear-filter changes and indicator preference changes preserve each other.
4. Two windows synchronize in both directions on one origin. Reload preserves Off.
5. Two independently authenticated Host origins in the same browser keep separate preferences.
6. An actual Bot tool turn creates a canonical Human mention. Related lights, Channel mute clears it, unmute restores it, and marking read clears it while retaining the personal Activity record.
7. Declining a disposable Group join request clears Needs you. The declined request remains in its Channel owner's history.
8. Deliberately failed status requests show unknown. Off stays effective during failure and after recovery.
9. An invalid persisted preference falls back to All.

Normal successful journeys recorded no browser console errors. Bridge and CLI `inbox-status` returned matching full message-category summaries. The preceding slice's expanded real DM/Group message matrix also covers ordinary text, literal @ text, canonical mention, reply, combined mention+reply (count once), arrivals while muted, UI/CLI changes, read positions and reload: [#2243 E2E record](https://github.com/BotHarness/DeepSeekBot/pull/2243#issuecomment-6254454580).

## Integration with the newly merged live refresh

During verification, #2232 merged into main. This branch integrates it; conflicts were limited to the feature map, architecture paragraph and bilingual CLI documentation, and both intents were preserved. Typechecking, building and nine focused files (48 tests) passed after integration.

The actual two-window rerun in `integration-results.json` verifies a new Bot-authored canonical mention, mute/unmute, unchanged read position during mute, mark-read with retained personal history, independent header filters, same-origin preferences, and status-failure recovery. Failure injection now uses a real Channel mutation to trigger the existing invalidation stream; it does not depend on the removed healthy-connection polling. No extra transport or polling was added. A first integration attempt hit a background-window click timeout; explicitly foregrounding that window corrected the harness, and the rerun passed all three journeys without page errors.

The paired screenshots were recaptured from the new main baseline and integrated feature head with identical canonical data. Earlier CI at the pre-integration head is not substituted for the final integrated-head checks.

## Reproduce with an isolated test Profile

Start the worktree's verified Host using `scripts/dev-instance.mjs` and open its authenticated Web Client. Use existing CLI Channel commands to read actual unread/read positions and `deepseekbot inbox-status` to read the summary. Create ordinary and canonical personal messages through normal Channel tools; a string containing @ alone does not create a mention. Keep a pending disposable Human request for the action-only case.

Open Activity, right-click its control-rail button and exercise the five choices. Leave the panel open while changing header filters, muting/unmuting the Group from its existing menu, and marking its conversation read. Repeat via CLI and observe the Web refresh. Open a second same-origin window, reload, and compare with an independently authenticated second origin. Repeat in both themes. For failure recovery, intercept only the status request in browser tooling, then remove interception.

## Qualification limits and retained failures

- Initial browser automation attempts stalled on background-tab animation-frame waits and on second-origin authentication. Bringing pages forward and performing that origin's normal login corrected the harness; neither needed a product bypass.
- A journey initially expected a declined Group join request in Activity's handled list. The existing handled query does not expose that request type. The corrected assertion checks the canonical declined Channel record and the cleared action dot; this PR does not claim new handled-list behavior.
- An initial broad related-test run was interrupted after three long-running Channel test failures while browser QA was also active. Those two test files passed all 13 tests in an isolated low-concurrency rerun. The complete final related-run result is recorded in the PR.
- The full low-concurrency run completed with 3,691 passed, one skipped and one failure: the English copy guard rejected the internal term "Attention". CI reproduced the same failure (3,729 passed, one skipped). The fix uses "Notification status unavailable"; the focused copy check and replacement CI run are recorded in the PR.
- Source checks, browser journeys and CI are separate proof categories. Native Simulator/device behavior, Human QA and deployment are not claimed. The new preference targets the Web control rail only.
- A local HTML explanation supplements this record; it is not a reviewer-hosted artifact or runtime proof.
