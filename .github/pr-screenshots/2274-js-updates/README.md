# Android JS update evidence (#2274)

Runtime baseline: `3d6c44689e540f9e1fae97476dcf7269663a48af`. Candidate production source: `e25c404674f99a18559847493018d8ba782ebce0`. Standard minified arm64 Release on the designated Android phone. Synthetic messages only.

- `font-a-10-light.png` / `font-b-10-light.png`: matched baseline/candidate completed ordinary text, font 1.0, light.
- `font-a-20-dark.png` / `font-b-20-dark.png`: same message, font 2.0, dark; pre-existing header overlap is present on both.
- `semantic-long-recovery-observe.png`: natural mixed-language long ending after the initial accessibility-idle failure, without reopening.
- `semantic-rich-end.png`: natural rich-text completion with table ending.
- `plain-selection.png`: message long-press copy menu.
- `plain-draft-keyboard-closed.png`: copied 112-character message remains exact in the unsent composer after keyboard dismissal. Draft later cleared.
- `rich-scroll-margin.png` / `rich-back-bottom.png`: visible scroll away and return to ending.

These images verify rendering/interaction only. Timing comes from separate uninstrumented Release captures; see the [report](../../../docs/research/2274-android-js-updates.md). No stable 120 FPS claim.

The complete font/theme matrix is published: `font-{a,b}-{10,13,20}-{light,dark}.png` (12 captures). A is baseline, B is candidate; 10/13/20 mean font scale 1.0/1.3/2.0.
