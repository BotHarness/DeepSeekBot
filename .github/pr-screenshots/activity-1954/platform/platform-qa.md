# Activity platform controls — Batch 7 follow-up, 2026-10-16

PR #1966 remains Draft. No merge, release or physical-phone use.

- Before source: `e93c0e2b92a567aa0ee189c3e7f5b1aac031efb2` (three controls and flat filter drawer).
- After source: `0febc32a8d6b96da396331a125f10ec2c3bcebee` (two native iOS controls and grouped filter/sort sheet).
- Installed binary: `0.0.1 (1)`, Batch 6 `1f0531dba1f4ea9536b55bd1d9dbe84bc2a420e8`. Compatible existing native modules reused; no rebuild or erase. Latest main adds native dependencies and available disk was below the 15 GiB build floor: this is targeted source QA, not latest-main integration qualification.
- Same iOS 26 Simulator, authenticated task Host and dataset, English/default text size. Fourteen unedited native PNGs at 402 × 874 points, individually inspected. The gear is the development-client overlay. Captures were taken at different times; relative ages advance.
- Dataset: 39 production-Channel-owner seeded messages and one real model-generated question. Existing provider quota error retained. No request was answered or approved.

| Check               | Observed result                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Floating header     | Exactly two native iOS entries: Filter and sort, Search. Native navigation controls supply iOS 26 glass. Content scrolls under the native edge; title stays readable.                                   |
| Combined settings   | Newest + For you applied together by Done; reply precedes mention. Cancel discards pending selection. Native downward swipe also discards pending selection; reopening confirms Default order retained. |
| Reset and scrolling | Lower Channel choices and Reset all are reachable; Cancel/Done stay available. Reset restores default ordering and all filters. Search preservation is covered by source interaction tests.             |
| Native search       | Integrated top search finds `needle`, the early matching message among 35 ordinary unread messages. Keyboard leaves result reachable; Close clears the query and restores sections.                     |
| Light/dark          | Overview, grouped settings and search captured in both appearances; native navigation theme corrected to match app theme. **Open:** dark status-bar text/icons still have poor contrast.                |
| Bottom clearance    | Final scrolled light screenshot shows the last row above the floating tab bar.                                                                                                                          |
| Android             | Material-style leading radio selections, native switch, opaque/ripple toolbar actions and bottom sheet with Cancel/Done implemented. Source tests only; no Android device verification.                 |

Full mobile suite: 432 passed / 8 skipped. Final mobile typecheck and lint passed; final focused Activity/style tests: 19 passed. Two-axis source review found no additional actionable defects in the platform-control changes; native limitations remain separate. No exact-head CI success is claimed by this document.

Untested in this follow-up: Android/physical phone, VoiceOver/larger text, request submission/private input, per-section pagination/retry and cross-Host collapse. Bot/Channel/unread combinations passed on the preceding drawer revision; the new combined editor has automated coverage but these exact native combinations were not rerun. Prior transient question-card clipping after theme/keyboard transitions remains a historical observation; final stable captures show the complete card.

Platform references: [Apple toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars), [Apple sheets](https://developer.apple.com/design/human-interface-guidelines/sheets), [Android bottom sheets](https://developer.android.com/develop/ui/compose/components/bottom-sheets), [Android radio buttons](https://developer.android.com/develop/ui/compose/components/radio-button), [Expo native stack toolbar](https://docs.expo.dev/router/advanced/stack-toolbar/).

Cleanup: temporary task pairing removed, original Host and seven pending approvals retained. Task Host, Metro and device-control session stopped. Shared Simulator remains booted/light. Existing native binary and unrelated batch checkout files preserved.
