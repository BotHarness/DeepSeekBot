# System text size — bounded native QA

Historical first pass. The [platform typography and large-text follow-up](v2/native-qa.md) supersedes the uniform iOS scaling implementation and expands the native matrix.

Date: 2026-10-17. Refs #2004; stacked on #1966. No merge or release approval.

## Revisions and environment

- Before source: `7b19c3fb2c882af9650936e5e4ec5541e2ff927c` (#1966); local QA equivalent `b292630ce`.
- After source: `e114fa47bd8429903775de2cd286aa3fb2130ebf`; local QA equivalent `ff5ef5a35`.
- Existing shared iOS 26 Simulator, portrait 402 × 874; compatible Batch 6 development binary `0.0.1 (1)` / source `1f0531dba1f4ea9536b55bd1d9dbe84bc2a420e8`. JavaScript reload only. This does not qualify a latest-main native build.
- Same task-owned Host, test Bot and conversation. Original retained Host and its seven pending approvals are outside the test scope.
- Before/after use the same native binary and maximum accessibility category (fontScale 3.571). Search: `needle`, collapsed For you, keyboard visible. Chat: `Typography QA draft`, keyboard visible; compare the composer/title, not the changing time or message scroll offset. Settings: same usage data and dark appearance.
- Source was switched only for owned files in the reserved batch checkout and restored afterward. Images are unmodified native captures, not generated layouts.

## Results

| Check                    | Result and evidence boundary                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live system size updates | Default → maximum → extra-small → default exercised across Activity and chat. Final numeric font/line metrics update on iOS; no screen remount is used by the implementation.                                                                                                                                                   |
| Search geometry          | Before: text exceeds the native toolbar's fixed-height capsule. After: complete text in measured floating search, equal outside gutters, one native clear control. Both appearances captured.                                                                                                                                   |
| Search interactions      | Maximum-size blank-space tap closed search and keyboard; reopening retained `needle`. At extra-small, native Clear text removed query and restored sections.                                                                                                                                                                    |
| Composer and title       | Before: top of draft and title clipped. After: full two-line draft and visible action row. Both appearances captured. Earlier final-composer check preserved draft through maximum → extra-small → default and native Send persisted `Typography QA draft` in the task DM.                                                      |
| Settings and usage       | Before: Settings/Usage wrap into narrow columns and amount unit truncates. After: labels occupy separate rows, amount/unit can wrap. Dark pair captured; Settings content could be scrolled to Connections.                                                                                                                     |
| Filter and sort          | At maximum, selected Newest first, scrolled to All conversations and Reset all, reset and swiped the sheet down. Lower options remain reachable. An After-only capture illustrates the layout; this is not a matched baseline pair.                                                                                             |
| Status bar               | Final settled light/dark screenshots have readable clock/icons. This is bounded navigation/size-change evidence, not exhaustive lifecycle qualification.                                                                                                                                                                        |
| Mobile source tests      | 442 passed, 8 skipped. Typecheck, formatting, source policy, lint, CLI parity, CI-plan coverage and changelog checks passed. Wrapper tests cover live scaling, Android passthrough, nested/default text, multiplier semantics, and input-node/draft/selection retention in the test adapter. They do not prove native geometry. |
| Review                   | Standards: 0 remaining actionable findings. Spec: 0 remaining actionable findings after fixes. Independent incremental review includes final Composer/Settings changes. Human review remains pending.                                                                                                                           |

## Failures and remaining gates

- Driver initially reported text-entry mismatch and a keyboard-return XCTest failure; fresh snapshots and native typing recovered. These attempts are not product pass evidence. AX bridge was circuit-disabled; XCTest fallback was used.
- Chinese text injected by the driver appeared as missing-glyph boxes while accessibility held the string. Cause is unresolved; Chinese glyph rendering and actual CJK IME composition are **not passed**.
- Android native, physical iPhone, landscape/iPad, VoiceOver, large display zoom, complex Markdown/code/tables/streaming, very long drafts and selection/IME editing need native acceptance.
- Pairing/Host editing, attachment picker and preview, all request approval/question/private-input states, permission dialogs and error/retry sheets were covered by source review/shared primitives where applicable, but not by a complete native large-font matrix. No fabricated before/after evidence is supplied for these states.
- The installed binary is reused; no new native dependencies, dependency upgrade, native build, OTA, deployment or merge was performed.
- #1966's separate request-lifecycle, cross-device state and Human-QA gates remain as recorded in that PR. This font follow-up does not close them.

## Reproduction

Run the PR's mobile JavaScript with a compatible iOS development client and a task-owned paired Host. Open Activity search and a DM composer at default text size; change iOS Text Size to the largest accessibility category while the field is focused. Check text and controls, change back to smallest/default, and verify the query/draft. Repeat in both appearances, open Settings and scroll filter options to their final row. Use the system font setting; do not substitute a page-only zoom or a mocked fontScale.
