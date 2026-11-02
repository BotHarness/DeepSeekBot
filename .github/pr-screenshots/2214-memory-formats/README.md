# Memory image format evidence

- Before: main `fe2926b0e43ab843665be922e5933620d42eb47c`.
- After source: `4023faca6a26e75ae507005ba792848d066646d1` (latest main integrated).
- Same synthetic Image Formats QA repository and blue/orange/green versions; English, 1440x1000 viewport (1114x1000 selected-conversation crop), 700x1000 narrow viewport, matched theme/state per filename. Real browser captures, no fabricated UI or model call.
- `scripts/e2e-memory-formats.mjs` verifies genuine decode/colours, rendered compositor GIF/WebP blue and orange frames, enlargement/return, Markdown/source, lazy historical loading, narrow stacking and unsafe SVG refusal with zero forbidden requests.
- 40 actual CLI exports: four formats, each current + two current-change sides + two staged sides + two unstaged sides + two history sides + one Markdown reference. Original bytes/MIME are checked against the selected Git/worktree source; hashes are in verification.json.
- The historical screenshot scrolls to the same WebP section; image expansion makes the document taller than the binary/text baseline. A neighbouring offscreen/lazy SVG side may still be loading; the pictured WebP before/after sides were both decoded.
- GIF/WebP motion: open the animated fixture from Memory files; blue and orange must alternate. The saved blue/orange PNGs are real rendered frames, not re-encoded source images. Canvas drawImage on an animated source did not track compositor frames, so the acceptance samples browser screenshots instead.
- Focused integrated checks: 92 tests / 8 files passed using default test timeouts, including both isolated full-suite timeout regressions, format safety, CLI standalone packaging and mobile adapter. Lint, formatting, typecheck and build passed. Earlier complete local run: 7258 passed, 24 skipped, two 15-second timeouts under concurrent build/browser load; failures retained locally and both passed on default-timeout rerun. Exact final-head CI is a separate gate.
- Native decoding/animation/SVG/share, device text-size/theme checks, physical phone, Android native and Human acceptance remain unrun, pending shared QA allocation. iOS/Android JavaScript exports are separate proof. This packet covers Memory readers and existing diff/Markdown surfaces, not editor or attachment-card previews.
- First failed build/CLI/capture/lazy-history/animation probes are retained in task-local ignored evidence. No private Profile, login token, device credential or raw runtime log is published.

An evidence-only commit adds this packet. The final PR head is rebuilt and rechecked with the same journey; its source identity and result are reported on the PR separately.
