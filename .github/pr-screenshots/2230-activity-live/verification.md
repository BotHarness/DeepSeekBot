# Activity Center live refresh verification

Issue #2230; Draft PR #2232. Production source: `f1c2fc11e8e4bf34d320b70b387cc24e0bd08ac1`.
Base: `0f458c7a3d1684e8d071127647aa66c85d3b2898`. Evidence-only journey fixes follow in the PR head.
Environment: macOS, Chromium via Puppeteer, isolated DSH `0.2.1-rc.2`, disposable QA Bots with the configured DeepSeek official Flash route. No production Profile was used.

## Automated regression and build

- Client suite plus related Host tests: 258 files passed / 1 skipped; 1,957 tests passed / 1 skipped.
- Follow-up focused set: 51 passed; repeated-disconnect and sidebar lifecycle follow-up: 13 passed (overlap, not additive totals).
- Lint, formatting, root/mobile typecheck, bilingual changelog validation and build passed locally.
- Regression first failed on base: background reads replaced all three empty sections with loading text; it passed after the implementation.

## Actual browser and canonical state

- Matched page (600×1000) and Dock (1440×1000), light/dark, Chinese locale, empty data. With a 350ms read delay the base Dock jumps 83.5→72.5→83.5px per section every 10 seconds; the fixed Dock stays at 83.5px. Page stays at 87.5px after the fix.
- Final production build: 12 healthy idle seconds, zero Activity list queries. Creating another Bot triggers a delayed background reread while the loaded empty DOM remains identical.
- Real model reply in another DM appears in Activity; visible Mark read clears it and the canonical unread query.
- Browser goes offline and its real WebSocket is explicitly closed. A second real reply commits while disconnected. Reconnect opens a second `remote.mux`, rereads the baseline and displays the new canonical item.
- In the Messages workspace, Open source reveals the exact canonical message ID in the conversation. No navigation to the Home workspace is treated as conversation evidence.
- Another real Bot calls `group_join_request` for the Human-selected Group. Its action appears, disappears on a public snooze mutation, reappears at the two-second deadline, then disappears after a public decline decision. The request owner reports `declined`.
- Live `inbox-watch --category action --watch-seconds 5`: one JSON result, 6 invalidations, initial pending request and final empty list. See [sanitized canonical identities](live-proof.json).
- Zero browser page exceptions. Console had four expected `ERR_INTERNET_DISCONNECTED` resource errors during injected offline time; raw console/ARIA and first failures remain task-local.

## Qualification limits and retained failures

- The shared AX default route returned a real provider quota failure. Only the disposable QA Bots were changed to an already configured official DeepSeek route, which produced actual replies.
- A native `ask_user_question` tool remained pending without a canonical Channel question card on this pinned Host, including a timed retry. This request-creation path is **not qualified** by this PR. The production change updates projections of canonical actions; the successful live action proof uses a group-join request. Do not label the native question branch passed.
- Early automation failures from a hidden navigation button and fresh-Profile onboarding were retained and corrected in the journey. The final scripted journey completed successfully.
- Human QA, native device UI, external IM providers, merge and deployment are not performed. Mobile evidence here is type compatibility and CI bundle checks only.

## Reproduce

Build, launch a fresh named `verify-app` instance, run `doctor`, then:

```sh
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-activity-live.mjs
```

Use the feature-map guide for page/Dock and theme comparisons. The task's local login URLs, credentials, Host home, raw logs and conversation transcript are not public artifacts.

## Bidirectional native Approve and load follow-up — 2026-10-19

Batching source: `b5c7daeac21d106c80c42c5a5acb74f9b2e4e5da`. Final integrated production source: `5cd9a6faee288aa3cc641011875f3a50af6f13f5`, including main `915b90498` and its Channel mute filtering. The final approval proof below was rerun on that integrated build. Later commits contain evidence only. Fresh isolated Profiles, macOS, real Chromium, pinned DSH `0.2.1-rc.2`. First failures remain local; no production Profile or standing permission was changed.

### Native Tool approval from either surface

Two independent browsers observe the same Host, one on Activity and one on the conversation. Each disposable Bot requests a real native bash retry after its normal sandbox denies the exact harmless marker-file write. The journey validates the command and clicks **Allow once** through the visible UI. It never fabricates a pending request or submits approval through an API.

| Clicked surface | Activity resolved | Conversation resolved | Canonical decisions | Native file effect        |
| --------------- | ----------------: | --------------------: | ------------------: | ------------------------- |
| activity        |             475ms |                 131ms |                   1 | APPROVE_2230_ACTIVITY     |
| conversation    |             513ms |                 155ms |                   1 | APPROVE_2230_CONVERSATION |

Each case checks the same request message/Source Event, exactly one canonical `allowed-once` decision, removal from Activity, a resolved notice without active decision buttons in the conversation, and actual native marker-file contents. Each browser uses its one existing `remote.mux`; there were no page exceptions or console errors. See [canonical approval proof](approval-sync-proof.json).

Earlier automation attempts retained failures for hidden layout detection and an onboarding overlay disappearing between lookup and click. The script now waits for the visible Bot layout and visible enabled approval buttons; optional onboarding dismissal tolerates an already-closed overlay. These failures occurred before any approval submission. Browser rendering is observed in separate browser instances to avoid hidden-tab suspension.

### Multi-Channel performance regression

The workload uses public `botToolRun` → `channel_send` with a trusted Human Source Event in every Group: 24 silent Groups, 3 rounds × 240 real committed messages, 24 concurrent writes per wave, a minimum 100ms wave period. Actual rates are reported below; they are not the nominal 240 messages/s ceiling. Main and candidate run sequentially on this machine with fresh Profiles. All 24 latest message identities are compared against canonical writes after every round. [Sanitized metrics](load-proof.json).

The main baseline fails in its first round: 240 messages at 109.3/s; the renderer remains unconverged when the check returns after 33.2s, with 39.5s browser task time, a 1,450ms maximum long task, and a loading mutation. The configured 15s observation deadline cannot preempt a blocked renderer; 33.2s is the observed elapsed time, not a precisely enforced timeout. Later baseline rounds were not run.

Diagnosis: every latest-message event synchronously published Bot and Channel roster changes, repeatedly rebuilding the roster and avatar/layout work. The focused red regression measured **480 store publications for a 240-event burst**. The fix keeps the newest preview per Channel and maximum activity time per Bot, then publishes once per bounded 25ms batch. The green regression measures **one publication** for that burst. It preserves load/error state and tests out-of-order events, mode exit, disposal, Channel deletion, and purged content.

| Candidate round | Messages | Actual messages/s | Write p95 | All Channels converge after writes | Activity queries | Query p95 | Maximum long task |
| --------------- | -------: | ----------------: | --------: | ---------------------------------: | ---------------: | --------: | ----------------: |
| 1               |      240 |             121.2 |     223ms |                              257ms |               16 |     521ms |             141ms |
| 2               |      240 |              70.9 |     731ms |                              269ms |               15 |    1305ms |             124ms |
| 3               |      240 |              60.6 |     709ms |                              174ms |               12 |    2140ms |             108ms |

Candidate: all 720 messages passed; zero loading mutations, zero Activity queries in both 12-second idle windows, one `remote.mux`, and zero browser exceptions. JS heap after forced GC was 34.9 MiB before load and 35.6 MiB after settled idle; the natural post-run sample was 74.5 MiB. This is a bounded recovery observation, not a long-duration leak proof.

Limits: under this artificial load, frame p95 was 83–100ms and query p95 reached 2.14s; this is **not** a 60fps or unlimited-capacity claim. Maximum long task was 141ms. The regression removes the reproduced main-thread amplification and verifies convergence/recovery at the measured rate; it does not establish zero regressions under every workload.

### Automated checks and reproduction

The Client suite passed 1,916 tests / 1 skipped in 252 passing files / 1 skipped after batching. After the final load/error-preservation helper, the focused 21 tests, lint, formatting, typechecks and build passed. These totals overlap prior tests and must not be added together. Final exact-head CI is linked in the PR handoff after completion.

On separate fresh named instances after build and doctor:

```sh
BH_E2E_INSTANCE=.humanlayer/verify/<approval-name>/instance.json node scripts/e2e-activity-approve-sync.mjs
BH_E2E_INSTANCE=.humanlayer/verify/<load-name>/instance.json node scripts/e2e-activity-load.mjs
```

For main, run the same load journey from the candidate scripts with main as the working directory and `BH_LOAD_BASELINE=1`. Retained raw failures, profiles, traces and ARIA stay private. The original native `ask_user_question` limitation remains unchanged. Human QA and native mobile UI are still separate gates. Draft PR only; no merge or deployment.

After integrating main, 38 focused feed/live/roster tests passed, including both the mute-change stale-response regression and shared live refresh. Lint, root/mobile types and build passed.

The first integrated-build load rerun ran alongside unrelated test workers, Simulator and bundling. All three rounds converged (0.78–2.03s), but only 8.6–16.6 messages/s were achieved and query p95 reached 28.2s. The immediate post-load check failed on two late queries while other refreshes were still in flight. That failed attempt is preserved in `load-proof.json`; it is not called a pass or a controlled throughput comparison. The journey now records a separately bounded drain phase (at most 15s, no in-flight query and 500ms quiet) before starting the unchanged 12-second idle check. This keeps catch-up work visible instead of misclassifying it as idle polling.

### Final integrated load confirmation — passed

Same production source `5cd9a6faee288aa3cc641011875f3a50af6f13f5`, fresh Profile; the heavy concurrent compilation had subsided. The final script includes the explicit drain measurement above. All 720 messages and exact latest identities passed.

| Round | Messages/s | Write p95 | Convergence after writes | Activity queries | Query p95 | Max long task |
| ----- | ---------: | --------: | -----------------------: | ---------------: | --------: | ------------: |
| 1     |      137.2 |     214ms |                    167ms |               18 |     371ms |         124ms |
| 2     |       94.6 |     289ms |                    198ms |               18 |     864ms |         117ms |
| 3     |       72.5 |     390ms |                    274ms |               12 |    1778ms |         107ms |

No loading mutations, one existing mux, no page errors. Drain took 0ms with 0 additional queries; both 12-second idle windows had zero queries. Forced-GC heap: 35.1 → 35.7 MiB; natural post-run sample: 43.7 MiB. Frame p95 remained about 83ms under this artificial load; maximum long task was 124ms. The earlier contended failure remains part of the evidence.
