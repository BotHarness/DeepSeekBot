# iOS chart inspection — #3032

Native evidence for the local `DayBars` selection / callout fix. No Web preview,
Android acceptance, Human haptic acceptance, merge or release is implied.

## Provenance

- Baseline: main `b6a3c93e9a9e90431e9d55a810e7929b76e311b3`.
- Fixed application code: `da0c4a5b21535d377799eae66a17806a46b25a11`.
- iOS 27, iPhone 18 Pro Max Simulator: freshly qualified arm64 Debug native client,
  SDK 58.0.20; matched baseline / fixed JS from the same worktree and Metro.
  Logical viewport 440 × 956, original PNGs 1320 × 2868.
- iPhone XS Max, iOS 18.1.1: two freshly signed Release builds installed in place,
  Dev bundle `ai.botharness.deepseekbot.dev`, both version 0.0.1 (1).
  Logical viewport 375 × 812, original screenshots 1125 × 2436. Existing system
  text size, Display Zoom, AssistiveTouch, pairings and data preserved.
  Physical text category was not measured and is not called “default”.
- English app UI; device locale still supplies Chinese calendar / weekday labels.
  One genuine populated calendar day (28,843 tokens), six empty days, authenticated
  `bot-activity-history` receipt. No database edits or invented historical usage.
- Original images copied byte for byte: no scaling, UI repainting or text replacement.
  The images contain only isolated QA statistics, without private routes or accounts.

Release bundle hashes (`main.jsbundle` SHA-256):

| Build    | SHA-256                                                            |
| -------- | ------------------------------------------------------------------ |
| Baseline | `cc202e8a1eeccabb1f65339ecf262ecfbd940ec6191b483780125101e8b16fa7` |
| Fixed    | `f03e1aff68d45addd9015096420ca464fd1f30ab26c268d4a485017514fe0c66` |

Both complete bundles passed deep/strict signature verification. The final PR
adds only evidence after the application-code commit above.

## Results

| Check                                                  | Simulator                               | Physical XS Max                                 |
| ------------------------------------------------------ | --------------------------------------- | ----------------------------------------------- |
| Tap retains full selected reading, second tap clears   | PASS                                    | PASS                                            |
| Full English `28.8K tokens` in light/dark              | PASS, all 3 sizes                       | PASS, retained user size                        |
| Horizontal inspection in both directions               | PASS, actual intermediate native frames | PASS, independent USB frames in both directions |
| Return to previously selected day; release clears      | PASS                                    | PASS, returns to Tuesday and clears on release  |
| Vertical page scroll starting inside plot              | PASS: chart y 319.7 → 171.0             | PASS: chart y 283.3 → 144.0                     |
| Controlled Settings → Usage day selection              | PASS: 0 tokens ↔ 28.8K tokens           | UNTESTED                                        |
| Cancellation / stale callbacks / boundary haptic dedup | 6 regression tests PASS                 | Native cancellation and Human feel UNTESTED     |
| VoiceOver adjustable gestures / spoken order           | UNTESTED                                | UNTESTED                                        |
| Three-size matrix                                      | PASS below                              | UNTESTED; retained phone settings               |
| Android native                                         | UNTESTED                                | Not this lane                                   |

The baseline already scrubbed successfully on iOS 27. Its diagnostic trace saw
126 native updates across all seven bars; this does not reproduce the older
physical “no update” report. A separate retained-callback regression failed on
baseline and passes with the stable selection owner. Baseline native taps were
cleared by a failed Pan finalizer; the fix only clears an actually started scrub.
English baseline hints truncate to `28.8K tok…`, `28.8K t…` or `28…`; fixed
native hints show the entire value.

### Physical continuous capture: confirmed with independent USB frames

The physical test runner's AVAssetWriter recorder and its timed gesture execution
share a main-thread path. Its overlaid-pointer clips alone cannot establish what
the application rendered during a drag. A separate USB video-only sampler captured
the actual designated XS Max screen, without that test runner's frame path.
No camera or audio output was used. Baseline: 180 original frames over ~29.6s;
fixed: 185 frames over ~29.6s, maximum captured gap ~0.20s. This sampling rate is
capture provenance, not an application frame-rate or performance claim.

With fresh native chart coordinates and the same scrolled Activity viewport,
**both current main and the fixed Release scrub correctly**. The older “no update”
record is not confirmed as a product failure by this comparison. An earlier
supplementary fixed-coordinate attempt hit the legend after the page retained
its scroll position; it is excluded from the chart verdict. First attempts and
capture failures are retained locally.

The fixed Release also preserves tapped readings and passes the six stale-callback,
finalize and boundary-dedup regressions. The baseline full-value hint still visibly
truncates; the fixed hint is complete. The original canonical totals did not change.

Independent physical native frames (1242 × 2688, copied unchanged from USB screen
samples): [before, truncated](p-b-pan.png) / [after, complete](p-a-pan.png),
[another day during the same drag](p-a-zero.png). The USB screen source uses its
native capture resolution; the separate XCTest stills above use 1125 × 2436.
[Baseline USB sequence](phone-b.mp4) / [fixed USB sequence](phone-a.mp4) preserve
the original sampled-frame intervals, with no synthetic pointer overlay or audio.

The USB reconnection request was resolved and the fixed Release was restored
on the phone after the independent A/B comparison. No Human action is now needed
to complete this automated chart check.

Expo Web has no usable path for the changed iOS-specific gesture / semantic native
text metrics; no Web-only runtime workaround was added.

## Comparable native images

All Simulator pairs show the same actual Activity route, selected Tuesday and
canonical usage, during a native horizontal drag.

| Native Dynamic Type category            | Light: before / after                        | Dark: before / after                         |
| --------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| `large` (default)                       | [before](s-b-n-l.png) / [after](s-a-n-l.png) | [before](s-b-n-d.png) / [after](s-a-n-d.png) |
| `extra-extra-extra-large`               | [before](s-b-m-l.png) / [after](s-a-m-l.png) | [before](s-b-m-d.png) / [after](s-a-m-d.png) |
| `accessibility-extra-extra-extra-large` | [before](s-b-x-l.png) / [after](s-a-x-l.png) | [before](s-b-x-d.png) / [after](s-a-x-d.png) |

Physical light screenshots use the same tap: [before](p-b-l.png), reading cleared;
[after](p-a-l.png), reading remains complete. [Physical dark after-only](p-a-d.png)
confirms the value renders in that theme; it is not a matched dark baseline pair.

[Actual Simulator baseline recording](sim-b.mp4) · [Actual Simulator fixed recording](sim-a.mp4).

## Automated checks

- Six chart callback / gesture regressions: baseline 6 FAIL → fixed 6 PASS.
- Mobile suite: 2,231 PASS, 11 skipped, combined after the two local-network test
  files were rerun with loopback access (initial restricted run: 9 network failures;
  their rerun: 20 PASS). Tests do not replace native evidence.
- Root lint, formatting and typecheck PASS; bilingual change fragment and feature-map
  checks PASS. Android runtime, performance budgets and Human acceptance not inferred.

## Resources

Temporary grants and encrypted QA LAN belong only to this task. Their release and
original preference restoration are recorded separately after verification.
No store, TestFlight, production Host, shared Serve or protected QA service was changed.
