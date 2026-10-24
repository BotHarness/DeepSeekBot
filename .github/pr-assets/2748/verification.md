# Timeline navigation verification — #2748

Tested on 2026-10-25 JST in a task-owned DSH 0.2.1-rc.3 Host and real Chromium Web Client. Product source: `3897a8b8e4cb4b87292ee682c745ffdece8736d6`; base: `04c46c745589be374a3c64c7910f160554d4c1b9`. Only synthetic task-owned conversations appear in the screenshots. This qualifies desktop Web behavior; native Electron and Expo devices were not run.

## Real E2E

Run `BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-timeline-navigation.mjs` after launch/doctor. The caller owns the Host; the journey closes its browser in `finally`. Set `BH_TIMELINE_BASELINE=1` for the old behavior. The same real direct Bot `channel_send` implementation seeds messages without requiring model output; no message/position response is mocked and no database fixture is written directly.

| Check                                              | Observed result                                                                                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 260 messages, item 120 marked read, 140 unread     | Opening sends `around(readAnchor)` and renders 41 nearby messages. Divider follows item 120, first unread is item 121, divider is inside the viewport.                          |
| Reach top                                          | One older cursor request adds 50 messages (41 → 91); prepend retains the reading anchor.                                                                                        |
| Reach bottom of the loaded window                  | One newer cursor request adds 50 messages (91 → 141). Subsequent deliberate scrolls load the remaining newer pages.                                                             |
| Stay at either edge                                | No further request during each 1.8-second idle observation; no automatic loading cascade. Existing cursor pagination is retained.                                               |
| Ordinary history, no new arrival                   | Before: button absent. After: return button above the composer at its right edge.                                                                                               |
| Three new live Bot messages during history reading | Count shows 3, history is not pulled to the latest. Clicking returns to the newest message and hides the button.                                                                |
| Four-line unsent draft                             | Actual composer height grows from 52px to 152px; button stays above it. Canonical latest message ID remains unchanged: the draft is not submitted.                              |
| 900×750, light/dark                                | Button remains visible, inside the viewport and clear of the composer; actual application appearance changes were awaited and inspected. These are supplemental after captures. |
| Read complete, reload and reopen                   | Canonical read position is the newest live message. No stale unread divider; bottom distance 0 and button hidden.                                                               |
| Separate 150-message DM, 140 unread                | Newest message is absent from opening window. Clicking Return to latest performs a latest-window request, displays item 150, reaches bottom and hides the button.               |
| Ordering and browser diagnostics                   | Loaded seeded IDs stay ordered and unique; no page exception or console warning/error in the final journey.                                                                     |

Numeric geometry and bounded request counts are in `measurements.json`. The opening around window is 20 older + anchor + 20 newer where available; ordinary directional pages are 50. Cursor request tests and pending/error/end checks remain owned by the existing timeline actions. This PR changes the return control, not the Host paging contract or CLI.

## Automated checks

- Final CI-selected related tests: 311 passed, 2 skipped (20 files).
- Focused timeline, UI and lifecycle tests: 80 passed, 1 skipped; updated working-row test group: 10 passed.
- Build, typecheck, lint, format check, changelog, CLI parity and feature-map checks passed.
- An initial full-suite run completed with 9,593 passed, 28 skipped and two failures. One was the old working-row expectation that history scrolling has no return button; it was updated for the requested behavior and passed the final 311-test related run. The other is an unchanged VRM `outdoors.test.ts` daylight assertion (actual 0.987364679 versus expected 1 ±0.005), reproduced independently using files exported from the exact main base. Full suite is therefore not reported green.

## Preserved failed attempts

Private task evidence retains tutorial-overlay navigation failures, a geometry assertion that mistakenly selected Home's composer, an invalid multiline fill that submitted lines (marked invalid before replacement), and the normal Group direct-tool refusal without a trusted Source Event. Final evidence uses scoped Messages controls, Shift+Enter, a no-submission assertion and supported DM fixtures. No private logs, login URLs, Profiles, credentials or canonical runtime dumps are included here.

## Review

Existing pill-button composition and native DSH tokens are retained. The existing 80px latest threshold remains the scroll authority. The zero-height anchor follows the composer in layout, retaining the existing activity inset. A separate HTML explainer is omitted because the runtime change is one display condition and one layout anchor; the PR outline and real captures show the full behavior. Human visual acceptance remains for review; no merge or deployment is included.

The task-owned Host and browser were stopped after verification; the Host process exited and its loopback port was released. Source and private failure evidence are retained.
