# Memory update display — Web evidence (#2712)

The images use synthetic Bot/Group names and a synthetic canonical Group-caused Memory commit. No real user screenshot, profile, credential or login URL is published.

- Before: `d86af4ed3a266188074aa7fee314a7446c21d16c`, separate baseline checkout, Web Client built from its original source.
- After: checkout `5c140e4ed8890865f8815fe4a7edf3280c232cfb` (Client source/build `2948b1c4a`), with current main merged before capture; no further runtime source changes.
- Runtime: isolated DSH `0.2.1-rc.2`, Chromium, Chinese, light theme, device scale 1.
- Settings / desktop timeline: 1440 × 1000; narrow timeline: 390 × 844.
- Matching data and Profile across a stopped-Host source switch; Detailed before, Compact after. The original Group commit and full-diff target are unchanged.
- Unchanged Host-side packages use the already verified task build. Only the baseline Web Client was rebuilt separately; the feature diff changes Client sources only.

## Verification

- Current-main related tests: 1,666 passed, 1 skipped (191 files passed, 1 skipped).
- Focused UI coverage: 68 passed; storage/design-system boundary coverage: 12 passed.
- Lint, format, root/mobile typecheck, product build, changelog, CLI inventory and feature map passed.
- Complete suite: 9,446 passed, 27 skipped, 1 failed. The sole failure is the unchanged VRM outdoors test's wall-clock daylight expectation; the exact test and implementation extracted from the starting base reproduce it. This is not a clean full-suite result.
- Real Web: settings and action-menu Compact/Detailed selection, hide/show, disabled selector while hidden, reload persistence, same-SHA complete diff, Chinese/English, light/dark, keyboard focus, 175% zoom, visible narrow long/short names passed.
- Independent Standards and Spec reviews: zero findings each.

This is Web rendering/interaction evidence. No model, IM delivery, native mobile, release or deployment claim is made.
