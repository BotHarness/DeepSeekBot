# iOS Chats search after Tob

Runtime source: `a5d982dbf`; base integrated main: `d211952c078a`.
iPhone 18 Pro Max Simulator, iOS 27.0, 440 × 956 pt, default `large` text, light/dark.

The final fix is JS-only. The original pager native patch and lockfile are unchanged from `81fe0feec`. Final installed app uses the previously qualified RN 0.88.1 Release native artifact from `7e0dbe1def2e`, with a fresh official Expo Hermes bundle/resources from this source and verified ad-hoc signature. Native repair experiments were rejected and reverted; their newly compiled binaries do not qualify this final result. No phone update.

| Check                                                                      | Result                                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Tob entry → Back → Search, after transition settles                        | PASS: 3 light + 3 dark cycles                                              |
| Search opens repeatedly and accepts query                                  | PASS                                                                       |
| Search blocks left swipe into last chat and downward Tob entry             | PASS                                                                       |
| Closing Search restores left swipe into last chat                          | PASS                                                                       |
| Downward Tob entry and upward exit                                         | PASS                                                                       |
| Screen-keyboard candidate input, Back, re-entry retains exact unsent draft | PASS; cleared using keyboard Delete, no send                               |
| Bulk automation fill into Tob composer                                     | UNQUALIFIED: TEXT_ENTRY_MISMATCH; actual screen-keyboard input works       |
| Physical haptics / performance / Android / older iOS                       | UNTESTED in this repair batch                                              |
| Maximum text / VoiceOver / no-computer / cloud-only                        | UNTESTED in this repair batch; prior evidence remains tied to prior source |

72 focused tests and mobile TypeScript pass. The new regression fails on the pre-fix source: opening Search changes eligible native pages from three to two. The fix keeps those pages mounted and suspends paging gestures while Search is active. Existing native page-cache behavior is unchanged.

Before image: `1fc3214c76a2`, search tap leaves the toolbar collapsed. After: final candidate keeps the search field focused and keyboard visible. Same simulator, viewport and default font; original screenshot aspect ratios preserved. Only synthetic QA content appears.

## Repeatable native regression

Pair a disposable Host and open Tob. Return to Chats and wait until its visible Search button is uncovered and the top entrance has disappeared. Open Search, type a query, attempt left and downward pans, then close Search and verify left navigation resumes. Repeat after a Tob round trip in both themes. Use screen keyboard input to test the unsent draft, return and reopen, verify exact text, then delete it without sending.

An early Search tap during the exit animation is not a settled-state result. Invalid transition samples and rejected native experiments are retained privately in the indexed task evidence. CI is separate from native acceptance; no merge, release or FPS claim.
