# PR 2813 — iOS Simulator evidence

Captured 2026-10-26 (Asia/Tokyo) on the same iPhone 18 Pro Max / iOS 27 Simulator.

- Baseline JavaScript: `624e36bd7f53fd186cdfa14f7ec7e1581a26f218`.
- Candidate JavaScript: `c7bfddc3193bffd259c3d2d962c7588bc0644a41`.
- Reused development binary source: `4cd3868f98f6`; EAS build `c3e38010-8fa3-4dc1-afc0-696a233182ee`.
- Executable SHA-256: `84fbb43860001eb9c27f925553334bc6de4ae8ab28812440b369bbb5384e3cf7`.
- Native/package/config/module inputs were compared before reuse; no native rebuild.
- App language: Chinese; appearance: light; OS content-size category: `large`.
- All four frames: 1320 × 2868 pixels (440 × 956 points at 3×).
- Synthetic environment alias: 测试电脑; synthetic Bot display name: Travel Bot.
- Development-tools floating icon is part of the development binary and remains visible. Time/caret/keyboard suggestions differ between captures. Original resolution retained; selected frames were privacy-inspected without pixel edits.

`form-before.png` / `form-after.png`: same creation form with keyboard open. The candidate uses the native primary button and moves default-model explanation into optional details. Submission remains visible.

`dm-before.png` / `dm-after.png`: each revision completed blank Bot creation through the native UI and automatically opened its resulting DM. The baseline model hint overlaps the status bar/header; the candidate opens normal DM chrome without that hint. Separate fixture identities share the same synthetic name and presentation.

These captures establish this Simulator creation path and the observed top-overlap removal. They do not qualify delayed-send timing, first-frame long-history placement, reconnect/skeleton transitions, Cloud opening, imports, dark appearance, other text sizes, screen readers, physical iPhone, Android or Human acceptance. Those remain pending in #2802–#2809.

## File integrity

- `dm-after.png`: SHA-256 `475d5737a78e1be934afb6e9c84fa75e3f07a303b0f59a83269a9d3f41cd0b21`
- `dm-before.png`: SHA-256 `e1afd5b0db9bd62877961a3ac157795b8954fc4ac8ab4493cc3e5e5a606d9fd3`
- `form-after.png`: SHA-256 `9c69a39e4d70b2c06cc3fead7571a2afb98a5bac6fa7f0fe9f4b65f4626c3b78`
- `form-before.png`: SHA-256 `ff92ef02fc45dd86a98869092d2fae3c2dcc2d9eee9c093dfd973a6ff27752d1`
