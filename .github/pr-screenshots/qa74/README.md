# iOS Marketplace native evidence — #2648

Before `fe817ef30c4bbe78a3d41f7ee4d92a4ed0c8f6ae` (main plus #2647). Final application/test candidate `45e5e924fc2d8177639046710d4c52f1deba0b9a`. Later evidence-only commits do not change application code.

Existing iPhone 17 Pro Simulator, iOS 27, 402 × 874 pt, Chinese. Matched default/light list, sheet and real-keyboard search before/after. Default, intermediate and maximum system text size × light/dark final-candidate captures cover the list, opened topic sheet and keyboard-visible search row. Every published image was visually inspected. Existing Debug development client with Metro; iOS fingerprint `4176fdf936e537bf2a1b7f6f5d906e2ca1615ecc`, executable SHA-256 `ba8bad85455ffe4664485a30244b13ea3251ce04dfef4041f08f47ffc8628988` freshly matched.

| Native case                                                                                 | Result                                                         |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Untitled floating native back/filter controls and automatic top scroll edge                 | PASS; `a-scroll` shows content scrolling beneath navigation    |
| Topic sheet Close material, inset alignment, Close and swipe dismissal                      | PASS                                                           |
| Visible default sort tabs; readable large-text option rows, actual selection                | PASS                                                           |
| Popular topic horizontal strip, coding selection and All reset                              | PASS; coding shows Debugging Partner and Code Review Partner   |
| Search expansion, real keyboard, draft does not filter until submit                         | PASS                                                           |
| Explicit check-button and keyboard Search submission; results and empty result; close/reset | PASS                                                           |
| Chinese default/intermediate/maximum × light/dark layout and necessary actions              | PASS for captured Marketplace paths                            |
| English default/light navigation, topic sheet and submitted empty search                    | PASS                                                           |
| Same-query network refresh and preserving topic while sorting                               | Automated regression PASS; request count not measured natively |
| Android, physical iOS 18, VoiceOver, full import/recovery, native fault injection           | NOT RUN for this candidate                                     |

Final automated mobile suite: 1,554 passed / 9 skipped. Lint, format, root/mobile type checks and release-ledger checks passed. Source tests are distinct from native evidence. No Host mutation, new pairing, physical-phone update, merge or store publication.

An initial development-server switch while the prior keyboard was open crashed in the React Native scheduler; the diagnostic is retained privately. A stale development bundle initially hid the large-text correction. Those attempts are excluded from final qualification. The task-owned Metro was restarted with its cache cleared, then the final sorting controls were located and operated after a cold launch. This run does not establish Release crash or performance acceptance.

Cleanup: returned to Chats, closed the app/driver, restored light/default text and verified seven of eight original document files unchanged, including the creation and unsent-text drafts. Only the local statistics record changed during use. Task-owned Metro/driver processes and ports were released; retained physical-phone services were untouched.
