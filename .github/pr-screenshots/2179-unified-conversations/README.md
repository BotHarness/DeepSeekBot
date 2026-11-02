# Slice #2179 — UAT native evidence

- PR: https://github.com/BotHarness/DeepSeekBot/pull/2185
- Source / integrated QA head: `d9155abe412dbdf4445394744f54d0e1f8743c4e`.
- Before source: `4c6acb7eae2b0c72cf036fa6934b893054a0a5aa`.
- Retained SDK 58 native build source: `494a20f1e`; JS-only reload, no rebuild.
- Environment: designated iOS Simulator, 402 × 874 captures; TOB UAT only.
- CI: https://github.com/BotHarness/DeepSeekBot/actions/runs/39125360611 — success.

## Observed results

| Check                                                   | Result                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mixed Computer and Cloud rows, source icons and filters | Passed; organization filter also survived restart                                                                                                                                                                        |
| Computer send                                           | One canonical Host message, Human author; explicit keyboard Send passed after moving the development tool overlay                                                                                                        |
| Computer receive                                        | Bot channel_send CLI message visibly received through the normal Host conversation                                                                                                                                       |
| Cloud send                                              | Canonical sequences 19 and 20, expected cloud user and organization; no Computer context switch                                                                                                                          |
| Computer route disconnected                             | Cloud sequence 20 committed while Host client reported unreachable; Computer Send unavailable; cached history and draft retained                                                                                         |
| Cold restart                                            | Cloud identity/directory restored; Computer draft restored after reconnect                                                                                                                                               |
| No automatic resend                                     | Unsent DRAFT-KEEP marker absent from Host canonical history after restart/reconnect                                                                                                                                      |
| Display checks                                          | Default/intermediate/maximum text, light/dark captured; scrolling retained. Maximum text truncates names substantially; screenshots document that limitation                                                             |
| Cleanup                                                 | Own WorkOS session revoked, latest refresh rejected, prior sessions preserved; new Host device revoked/unpaired; original signed-out configuration, draft/filter files, shared checkout, light/large and locale restored |

## Recordings

- `offline-cloud-and-draft-4x.mp4`: actual continuous test recording accelerated 4×; preserves the offline Computer draft → Cloud send/readback UI sequence. Resolution reduced for review; no synthesized frames or UI.
- `restart-draft.mp4`: actual recording after a cold restart and explicit reconnect; opening the Computer channel restores the unsent draft. Unchanged idle time retained.

The first failed cold-start run was preserved privately: an empty organization sentinel made the vault invalid and blocked the list. The source head above fixes it, with failing-then-passing regressions and fresh CI. The failed fixture was normalized only after preserving its private backup; all successful observations above used the corrected source. Credentials were never recorded or published.

Before/after list captures use the same fixture accounts and viewport. Computer-channel after captures include new uniquely marked test messages; those demonstrate source-correct delivery, not a pixel-identical history baseline.

Cloud latest-message summaries/read counts/pins remain #2181. Cloud uses the existing channel screen. Cold-starting with an offline Computer does not repopulate its roster until reconnect; retained text drafts are restored when the conversation can be opened. Android, physical device, VoiceOver and Human QA remain unverified. No Prod change, merge, or later-slice implementation.
