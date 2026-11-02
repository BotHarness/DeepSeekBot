# Android streaming rendering Arena

Follow-up to the [primary-source investigation](2028-expo-rendering-offload.md),
for [#2028](https://github.com/BotHarness/DeepSeekBot/issues/2028) and
[#1845](https://github.com/BotHarness/DeepSeekBot/issues/1845).

## What was compared

All candidates retain the existing canonical conversation, playback cursor and
input reserve. This experiment changes rendering after the presentation cursor.
It does not call a real LLM or replace the Host transport with a UI mock.

| Candidate                 | Change                                                                   | Disposition                                                    |
| ------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Existing React fade       | Cached Markdown blocks and animated inline text                          | Control in every matched group                                 |
| No fade                   | Same renderer without character animation                                | Diagnostic only; fails the requested reading effect            |
| Full native GFM container | Enriched's native parser and range fade                                  | Pilot only; much slower completion and range fade              |
| Native CommonMark text    | Enriched's single native text view and range fade                        | Rejected; much slower completion, different Markdown semantics |
| Native 256-grapheme fade  | Existing RN layout plus a native drawing clock                           | Three matched trials; smoother presentation but higher UI cost |
| Native range invalidation | One invalidation span covers all pending glyphs                          | Rejected after three matched trials; UI cost increased         |
| Native 48-grapheme fade   | Existing RN layout and the existing 48-grapheme budget on a native clock | Final matched comparison                                       |

The full native parser paths are different: `flavor="github"` uses the block
container, while CommonMark uses the single text view. The single-view pilot's
presentation cursor took about 87.7 seconds versus about 40.8 for the React
control, before correcting the common device/Host clock offset. Changing the
parser did not improve this workload. These are pilot observations, not three-run
comparisons.

Worklet parser offload and Bundle Mode remain untested. A named proposal in the
research document is not a tested Arena candidate.

## Matched protocol

- Physical Android 16 phone, arm64 minified Release, Expo SDK 58 / RN 0.88.
- Confirm actual 120 Hz at both ends of each run; a maximum-refresh preference
  alone is insufficient. Stop mirroring and recording during frame capture.
- One APK contains both control and candidate; select the renderer with a private
  QA route parameter. Cold-launch a fresh task-owned conversation for each trial.
- Fixed replay: 21,492 UTF-16 characters, 100 Markdown sections, 281 chunks, 80
  graphemes per chunk, 32 ms scheduling interval. Keep the real isolated QA Host
  and its CLI send path. Save producer timings and the committed reply.
- Order A B B A A B, three trials per renderer. Capture 45 seconds of Perfetto
  without screenshot, hierarchy polling, recording, compilation or test runners.
- Compare 2–22 seconds after trace start. This remains active playback for both
  candidates; later windows mix active text and completion at different times.
- Observe canonical completion, presentation-cursor completion and the visible
  last paragraph separately. Sample the phone/Host wall-clock offset before and
  after each trial, including round-trip uncertainty. Accessibility polling after
  capture gives a visible-completion upper bound, not the exact final glyph time.
- Save refresh, thermal-service status, battery temperature, memory, trace errors
  and source scheduling lag. Keep failed and rejected trials.

## Selected implementation

The final group selects the **48-grapheme native fade** for this workload.
All six replies reached canonical, presentation-cursor and visible completion.

| Median, active 20-second window                | React control | Native 48 |
| ---------------------------------------------- | ------------: | --------: |
| Main-thread Choreographer p95                  |      7.433 ms |  7.002 ms |
| Main-thread frames above 8.33 ms               |            68 |        44 |
| Combined JS-runtime CPU                        |      15.581 s |  11.253 s |
| App-associated presentations/second            |        77.343 |   119.845 |
| Presentation-interval p95                      |     24.931 ms |  8.426 ms |
| Clock-corrected presentation-cursor completion |      40.242 s |  38.862 s |

Candidate UI p95 values were 7.002, 6.906 and 7.849 ms. Presentation rates were
120.046, 119.845 and 118.395 per second. The control itself varied with the
conditions, and the first candidate's UI p95 was slightly worse than the first
control's. The clear repeatable benefit is the denser presentation cadence and
lower JS cost; this does not eliminate all slow frames or establish every
interaction at 120 FPS.

The implementation preserves the React Native paragraph and moves only its
temporary appearance spans and frame clock into the local Android module.
Parsing, line layout, canonical text and buffered playback keep their existing
owners. At most 48 native graphemes animate at once; older overflow is visible.
Reduced motion, corrections and detach settle pending spans. Older installed
builds fall back to the existing JavaScript fade; installing this module requires
a native rebuild.

## Interpretation

Main-thread `Choreographer#doFrame` execution is compared with the 8.33 ms budget.
It is not the complete rendering pipeline. FrameTimeline's platform deadline in
these traces is about 20 ms despite the 120 Hz display; a low deadline-miss count
cannot establish a 120 FPS interaction.

App-associated presentation rate describes this continuously animating streaming
window. It is not physical scroll FPS, startup speed, a guarantee for a huge
unbroken paragraph, or an iOS result. Combined `mqt_v_js` CPU sums multiple
runtime threads and is not a single-thread occupancy percentage.

The first native-clock group reduced median combined JS CPU from 13.249 to
11.223 seconds per active 20-second window and changed app-associated
presentations from 86.004 to 120.395 per second. UI p95 increased from 6.906 to
8.102 ms, with one candidate trial at 8.631 ms. It established a useful direction,
not consistent headroom for 120 Hz.

The next group rejected range-wide invalidation: its candidate UI p95 median was
9.026 ms against its control's 7.383 ms, with 164 versus 55 frames above 8.33 ms.
Its presentation rate was 118.595 versus 75.623 per second. Compare each candidate
with its own interleaved control; device warmth and runtime conditions changed
across groups.

## Reproduction and acceptance

Use the [shared Android lane](../agents/android-device-qa.md),
[fixed replay](../../apps/mobile/scripts/stream-replay.md), and
[native module checks](../../apps/mobile/modules/stream-reveal/README.md).
The native tests use a controlled frame clock; they validate timing, Unicode,
replacement, corrections, bounds, reduced motion and cleanup, not hardware
drawing. Record `gentle` and burst/gap `rhythm` separately from performance traces.

Keep the existing large-text, theme, keyboard, selection/Copy, links, TalkBack,
history anchoring and lifecycle journeys. Computer-injected phone touches are
currently refused by Android; the Human confirmed physical scrolling works.
Do not label an idle capture as a successful scroll test. iOS native acceptance
needs its own device lane.

The Human's late-playback check started near section 80, moved back to section
76, briefly held history with the jump control visible, then returned to the
advancing tail (sections 86 and later). Section 100 was visible at the end.
This verifies that basic behavior, not scroll frame rate or holding through the
canonical commit: the Host had already committed before this late drag.

The selected implementation was rebuilt without the private renderer selector
or completion logging. Its normal optional-native-module path passed a fresh
`gentle` replay, with visible character fade and canonical completion. The
installed QA APK SHA-256 is
`D291C920EA718D2217C343C86E191DEE6ADDF6802497FAB1EAEFAE7293FDAD16`.
It includes a private, loopback-only QA network exception that is absent from
the source app configuration; it is not a store artifact.

A reduced-motion replay displayed the complete reply without fading. Its CLI
wait hit a deadline; a subsequent canonical Channel read confirmed the complete
message and Host doctor was healthy. Record that recovery separately from a
successful send command. System animation settings were restored before the
fresh normal-motion replay.

Static Android checks at font scales 1.0, 1.3 and 2.0 in light and dark appearance
show the complete short reply above the composer. They do not qualify keyboard
editing, selection, links or TalkBack. The 2.0 dark capture also exposes clipping
in the existing timestamp label; that remains outside this text-reveal slice.
The OS settings were restored after capture. iOS and the remaining interaction
matrix are still untested, so this remains a draft review handoff.
