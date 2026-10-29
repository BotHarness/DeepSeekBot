# Activity search dismissal — iOS native evidence

Issue #3172. Application fix: `4146c9c5d`. Base main: `3e5089387d92`.

- iPhone 18 Pro Max Simulator, iOS 27; 440 × 956pt, screenshots/video 1320 × 2868. Chinese UI, isolated paired Host, empty Activity.
- Baseline installed native source `9dc2f6c3b824`, production JS `a5b39e61fe4b`. The Activity toolbar/feed/search implementation is unchanged between that JS and base main. Candidate reuses the same signed native binary with a production iOS export of the application fix. No native dependency changes.
- Default text category: `large`. Largest: `accessibility-extra-extra-extra-large`.
- Original screenshots are unchanged video frames, not redrawn UI. Before shows the brief collapsed frame; after shows the stable final geometry. Videos retain the full observed transitions.
- Input used Xcode Device Hub's native accessibility controls after XCTest tap injection repeatedly failed with invalid coordinates. Those failures are retained privately and are not product failures.

| Check | Result |
| --- | --- |
| Baseline, default/light, 3 closes | FAIL: tab underline y=159 → about137 →159pt each time; maximum excursion22pt |
| Final fix, default/light, 3 closes | PASS: y=159pt throughout |
| Final fix, default/dark, 3 closes | PASS: y=159pt throughout |
| Final fix, maximum/dark, 3 closes | PASS for search layout stability: y=217.5pt throughout |
| Type `qa`, close search | PASS: no-match state returns to original empty feed |
| Search accessibility tree | PASS: resting heading/filter/search controls excluded while search input and close action are exposed |
| Android layout regression tests + style guard | PASS:12 tests |
| Mobile typecheck, touched-file lint/format, release fragment | PASS |
| Physical iPhone, Android native, VoiceOver gestures, software-keyboard animation, intermediate/max-light matrix | UNTESTED; outside this Simulator-only run |

A first min-height-only candidate passed default light/dark but still changed14pt between search and title at maximum text size; that candidate was rejected. The final fix retains the native resting layout, hides its interaction/accessibility during search, and overlays search in the same row. Existing oversized native icons at maximum text remain outside this fix; the max-size PASS above is only header position stability.

The measurement tracks the blue tab underline's y coordinate in every sampled video frame, with a2pt tolerance; it does not measure application FPS or establish physical-device performance. The native measurement script and JSON records are retained in the task evidence index. No DOM-only test is claimed to reproduce SwiftUI measurement timing.

[Before recording](before.mp4) · [After recording, dark then light](after.mp4)
