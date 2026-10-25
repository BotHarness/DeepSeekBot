# Expo Web layout previews — PR #2839

Captured 2026-10-26 (Asia/Tokyo) from real Expo Web exports, Chrome headless, 390 × 844 CSS pixels, DPR 2 (780 × 1688 PNG), zh-CN, default browser text scaling, matching light/dark themes. No image editing or redaction was needed; all displayed data is synthetic.

- Before (`bl.png`, `bd.png`): source `6cc30b5ace8e406f1c85a7b0b5100b79ff6310ca`.
- After (`al.png`, `ad.png`) and unsaved draft (`dl.png`, `dd.png`): source `07c5bf0a816cb49afed71880353f8c67525cf7bf`.
- Both use the repository's opt-in `BOTHARNESS_MOBILE_WEB_PREVIEW=1` language/theme and Material-symbol adapters. The baseline export used the base versions of every modified mobile file in the same dependency environment; candidate source files were restored afterward. A separate checkout export failed on cross-drive dependency resolution and was not used.
- Browser session storage was seeded with one synthetic offline environment, `Research`, to open the actual `/host-look` screen. The app's components/layout were not replaced. Draft frames were produced by filling the name and clicking the actual lab/green controls.
- These images prove layout and visible draft-preview changes only. They do not establish successful real pairing, automatic post-pair navigation, persistence, swipe/keyboard behavior, or native rendering. Save was not invoked in this capture because Expo Web lacks the native file-system persistence path.
- The visible Save button is the Web fallback. It is not an iOS Liquid Glass or Android Compose screenshot. Native/Human QA remains pending in #2782 and the shared device queue.
- Matched initial frames show Close/no-save before versus Back/Save after. Draft frames show `Research Lab`, a lab icon and green accent without claiming persistence.
