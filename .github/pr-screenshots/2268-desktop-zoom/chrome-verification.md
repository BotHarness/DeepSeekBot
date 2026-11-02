# macOS corner at 144%

Source: `24cfc1b1f9a7d1d2c5aabf03c3c961c28ca41483`. Existing S1 desktop/Profile reused. macOS arm64, DSH 0.2.1-rc.2, Chinese/light, 1261×820 CSS pixels (2522×1640 screenshot pixels).

Before source `dbef7e7d8`: native-corner background incorrectly expanded to 126.71875×57.59375 screen pixels; Channel title button overlapped it by 30.5703125 pixels. After: corner is 88×40 screen pixels and title overlap is zero. Panel content/allocation bounds also passed after Human activation.

The Human explicitly accepted: “标题完整，没有遮挡”. The complete native After capture includes the computer-use status/pointer overlay. No matched native Before was captured: coordinate actions returned `noWindowsAvailable`, and earlier captures had stale frames while the document was hidden. Those stale captures are not published as proof. Before DOM measurements are separately labeled in `chrome-verification.json`.

Browser regression: `node scripts/e2e-workspace-chrome.mjs` — 204 cases across all 17 levels, 0/4/16px gaps, rail positions, fullscreen and non-macOS exclusion. Focused tests: 47 passed in four files. Local lint, format, TypeScript, Client build and changelog checks passed.

Native review: in the same controlled composition, open Bot mode and use Settings/targeted CLI to compare level 2 (144%) at base `dbef7e7d8` and this source. Inspect the leftmost header against the physical window controls, move the control rail and check fullscreen. Finish a full linked build before launching a desktop that consumes those outputs. The browser fixture does not render operating-system controls.

This Human QA accepts the shown header scene. It does not qualify GUI reset at both extremes, all native placements/levels, IME/custom bindings, or repeated webview foreground restoration. The PR remains Draft and unmerged.
