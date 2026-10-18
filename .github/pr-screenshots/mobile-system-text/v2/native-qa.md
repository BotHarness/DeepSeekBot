# Platform typography and large-text usability — native QA

Date: 2026-10-17. Refs #2004; Draft PR #2007, stacked on #1966. No merge or release approval.

## Revisions and capture conditions

- Before: `851bed40c94f125c3d05473c8dd3c5f3d17409a5` (previous uniform-scaling implementation); mobile-equivalent QA `ff5ef5a35`.
- Final source: `50a5232e02a7d6dc80d335f7a16a92934a81f8ba`; mobile-equivalent QA `101960f4de15e90ee002156656982763d8cc4e47`. The mobile trees were compared and match.
- Filter/search images were captured at `c88f646c747b9dca9f52e83929e815d39b6d295f`; the only subsequent source change is the expanded editor's modal presentation. Composer/editor final captures use the corrected presentation.
- Shared iOS 26 Simulator, portrait 402 × 874, same compatible development binary. JavaScript reload only; no dependency/native configuration change or native rebuild. Build metadata can show the earlier Metro-start revision. This does not qualify latest-main native integration.
- Default: system category `large` (fontScale 1). Intermediate accessibility size: `accessibility-large` (~2.143). Maximum: `accessibility-extra-extra-extra-large` (~3.571). “Intermediate” is a selected accessibility category, not the system category named “Medium”. All three use light and dark appearance.
- Task-owned Host and fixtures only. The original shared Host and its pending approvals were protected. Before/after captures use the same viewport, language, query, draft and usage amount. Clocks and scroll/caret offsets can differ.
- All 54 PNGs are native captures. Usage is cropped at capture to the card, excluding private connection details. No synthetic screen or image edits. Temporary baseline source was restored to final QA HEAD; unrelated files were preserved.

## Observed results

| Area                         | Actual check and result                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native type                  | iOS uses semantic Dynamic Type ramps; Android retains native scaling. Live iOS size changes remeasure noneditable root text while input identity/draft remain intact. Default/intermediate/maximum checked in both appearances.                                                                                                                        |
| Filter and sort              | At all three sizes, selected Newest first, scrolled to the final choices and Reset all, reset, and returned to the top. The heading scrolls with the choices; no fixed large heading consumes the sheet. Immediate application remains. Twelve before/after images.                                                                                    |
| Activity search              | Typed `needle`, retained the query across live size changes, and observed only the matching Other unread section. At maximum, native Clear restored all sections; blank-space tap dismissed search/keyboard. Large rows prioritize conversation and message before time/count. Twelve before/after images.                                             |
| Inline composer              | Same 104-character draft retained across sizes and appearances. Maximum-size native input height changed from 401 to 175 points on this viewport; long text scrolls inside it and the action row remains available. Twelve before/after images.                                                                                                        |
| Expanded editor              | Opened and edited the shared draft, returned with Done and read back the exact 104 characters. At maximum, Send closed the editor and canonical Host history contained the exact draft. Six new-view captures across all sizes/appearances.                                                                                                            |
| Channel mentions             | At maximum, opened the expanded Channel editor, typed `@`, selected Activity QA, typed a message and sent from the editor. Canonical Host history retained `@Activity QA large text mention QA` plus the selected Bot identifier and mention range 0–12. This proves the mention/send seam, not a model reply.                                         |
| Appearance changes in editor | Found that a fullscreen modal could keep the old background after appearance changed. Changed it to opaque overFullScreen, rechecked, and replaced all six editor captures. Final light/dark backgrounds and keyboards agree.                                                                                                                          |
| Settings and Usage           | Scrolled Settings to its final controls at maximum; opened Usage details, waited for the loaded chart/data and swiped back. Maximum Usage card height changed from 461 to 259 points. Amount keeps the display type role; the compact large-text card omits the decorative sparkline but retains the detail entry. Twelve cropped before/after images. |
| Status bar                   | Settled screenshots after size/theme/navigation changes show readable status bar content. This is not an exhaustive lifecycle or developer-reload matrix.                                                                                                                                                                                              |

Draft used for paired composer/editor checks:

> Please review the release checklist. Confirm the budget and send the final plan after approval. Checked.

## Source and review evidence

- Mobile suite: **443 passed, 8 skipped**. An initial sandboxed attempt had three listen-permission failures; the authorized rerun passed. Final modal change additionally passed 19 focused tests and mobile types.
- Formatting, lint/source policies, CLI parity, CI-plan coverage and change-fragment checks passed. Existing unrelated lint warnings remain; no new warning was introduced.
- Standards and Spec reviewers found no remaining confirmed source findings after corrections to Usage type-role continuity, Activity metadata, documentation and editor mention/selection handling. Human QA is pending. CodeRabbit explicitly skipped this Draft; that is not review approval.
- [CI on final source](https://github.com/BotHarness/DeepSeekBot/actions/runs/38933936745): affected tests, static/type/build and isolated Host smoke passed. Full shards/docs were skipped by the diff plan; real-model scenarios were skipped.

## Limits and remaining gates

- **Android native blocked:** device discovery returned `TOOL_MISSING: adb not found in PATH`. Android uses native scaling in source, but default/intermediate/maximum native rendering and interactions remain unverified.
- Physical iPhone, landscape/iPad, VoiceOver/TalkBack, display zoom, full CJK IME composition and complex Markdown/code/table/streaming remain unqualified. Earlier injected CJK missing-glyph observations have not been closed by this round.
- The full approval/question/private-input, attachment and error/retry form matrix was not exercised at all sizes. This fixture had no pending requests; Activity request metadata was source-reviewed, not newly native-qualified.
- Provider replies hit a quota limit. User-message persistence and mention metadata were verified; no successful model response is claimed.
- Noneditable iOS text remounts after live category changes to discard stale RN 0.86 paragraph measurement, so active noneditable text selection may end. Inputs do not remount. Complex selection/IME composition still needs device acceptance.
- At maximum with the keyboard open, decorative empty-chat introductory text can sit under the floating header. The draft and send controls were usable; this report does not claim every screen is free of overlap.
- The driver had intermittent text-entry mismatch and accessibility timeouts. Fresh snapshots/native typing recovered; failed attempts are not counted as passes and invalid captures were replaced.
- #1966's independent lifecycle/cross-device/Human gates remain open. No new native build, store submission, deployment or merge occurred.

## Cleanup and reproduction

Task pairing was removed, then the original connection was observed still connected. The task Host, seed process, Metro and device-control session were stopped. Default system category `large` and light appearance were restored. The original shared Host remains listening; its requests were not acted on.

Run this JavaScript source in a compatible development client with a disposable authenticated Host. Use the system font setting, not a mocked fontScale. Repeat the table's operations at `large`, `accessibility-large` and `accessibility-extra-extra-extra-large`, then repeat in the other appearance. Compare the paired files in this directory. For expanded editing, compare the inline composer before-state with the new editor after-state.
