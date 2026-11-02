# Android huge-paragraph viewport drawing (#2220)

Plain and prose matched ABBAAB runs meet the native drawing, presentation-gap and end-PSS thresholds. Eventual natural completion passed; delayed post-trace observations alone do not qualify completion-latency regression. The final native binary passes the font/theme matrix and active viewport gesture checks below. This is a bounded Android drawing improvement, not completion of the parent performance target.

## Provenance and method

Baseline main `0f458c7a3d1684e8d071127647aa66c85d3b2898`; implementation `e547ad313c6b11b14dadae72d67fc9bcc290dbbb`. Same physical Android 16 device, 1220 × 2712, actual rendering 120 Hz, normal thermal status. Human disabled battery saver. Matched temporary refresh policy on both arms. Minified arm64 Release, no Metro, mirror, recorder, concurrent builds or accessibility polling inside timed traces.

Native dependency inputs: Expo SDK 58 / React Native 0.88. The preserved isolated QA Host runs DSH 0.2.0-rc.2; the mobile dependency is 0.2.1-rc.2. Both arms use the same Host, profile and paired transport. Each trial creates a fresh disposable DM and sends a deterministic local provider replay through the real Host and app. No live model.

Baseline APK SHA-256: `E694700425BD91CF6FA463BEF70445C335AA17E53B7B71F6675CEE9DBE083C68`.
Candidate APK SHA-256: `F81F6B64B8E9463409CE58E5604FB7E1EC5E0CBC5123DFB51E28E98AE02FBED9`.
Both embedded JavaScript bundles: `301AACCEDE9A584E8FFC0D37D38D2C023DD6D2B75FAF68273350D37687CE0B65`.

A B B A A B, three trials per arm. Plain fixture: 19,221 UTF-16 units, 80 graphemes every 32 ms, approximately 7.72 seconds producer time. Perfetto captures 45 seconds starting about 0.2 seconds after the producer starts. Early window 2–22 seconds; late window 22–42 seconds. Root numbered Choreographer slices measure UI work. App-associated SurfaceFlinger presentations measure update gaps. Scheduled `mqt_v_js` CPU is separate from inclusive native draw/layout slices. Inclusive slices must not be added as independent CPU totals.

Acceptance was frozen before screening: at least 15% targeted native benefit, no greater than 10% presentation/completion regression, memory increase within the greater of 15% and 10 MiB, full canonical and visible body, no semantic/layout regression. Post-trace visible completion is only an observation upper bound, including trace transfer/accessibility overhead; it is not playback completion latency. Memory is end-of-run total PSS, not peak memory. The buffer itself is bounded to one screen height.

## Plain results (three-run medians)

| Measurement                           |    Baseline |   Candidate |
| ------------------------------------- | ----------: | ----------: |
| Inclusive ReactTextView draw          | 28,221.3 ms | 13,499.6 ms |
| Early UI frame p95                    |   60.520 ms |   28.589 ms |
| Late UI frame p95                     |  105.348 ms |   90.877 ms |
| Early presentation-gap p95            |   58.095 ms |   33.179 ms |
| Late presentation-gap p95             |  107.933 ms |  107.886 ms |
| Late mean presentation gap            |   87.999 ms |   26.581 ms |
| Scheduled JS CPU (two windows)        |    21.368 s |    24.087 s |
| First post-trace complete observation |    50.909 s |    52.574 s |
| End total PSS                         | 332,724 KiB | 346,624 KiB |

Drawing falls 52.2%; late UI p95 falls 13.7%; end PSS rises 4.2%. Late presentation p95 is effectively unchanged. More frequent rendering is accompanied by 12.7% more scheduled JS CPU. There is no claim of 120 FPS.

Layout work remains significant: `Constructing StaticLayout` medians 9,982.8 → 10,450.5 ms; `Generating StaticLayout For DynamicLayout` 6,902.5 → 9,445.2 ms. One candidate trial performs layout during `setText` rather than `onMeasure` (14,333.1 vs 7.3 ms), so the onMeasure label alone is not a stable total-layout metric. Retain all samples instead of treating that trial as nearly free layout.

Every plain trial passed independent canonical one-reply/body-length and visible final-marker checks; actual 120 Hz and normal thermal status held. These stationary-stream measurements do not qualify history flings, simultaneous user scrolling, iOS or the parent #1845 performance target.

## Rejected experiments

- Replacing the TextWatcher with pre-draw observation did not improve the current baseline. Restored the existing observer.
- Calling the original child directly into a clipped hardware Canvas did not improve measured drawing.
- A diagnostic software-raster buffer established that the bounded branch executed and reduced draw work. Removed diagnostics and reduced allocation from two screen heights to one before the committed candidate.

## Implementation and review

Yoga and the existing React Text retain text, spans, layout, accessibility and input ownership. Only a huge active single TextView (height greater than two screens) uses a transient software bitmap for its currently visible region. The original child still draws the glyphs/styles. Viewport bounds refresh before drawing and descendant invalidations invalidate the parent. Nontrivial child composition falls back to normal drawing. Returning to normal composition invalidates the child display list; leaving the path or detaching drops the bitmap reference. No parser, reveal budget, cadence or durable state changes.

Native regression: same test fails on the baseline, passes on candidate; 13 native tests pass. Mobile typecheck/lint/changelog checks pass; full mobile suite 740 passed, 8 skipped. A pre-existing locale-dependent search test was fixed to use the application's translated label. Standards review: no findings. Spec review: no findings. These reviews do not replace physical acceptance.

## Ordinary prose results (three-run medians)

The 21,492-unit fixture contains 100 headings with short paragraphs and lists. Same A B B A A B protocol and refresh/thermal controls.

| Measurement                           |    Baseline |   Candidate |
| ------------------------------------- | ----------: | ----------: |
| Inclusive text draw                   |  5,994.4 ms |  5,997.4 ms |
| Early UI frame p95                    |    5.978 ms |    6.094 ms |
| Late UI frame p95                     |    5.776 ms |    5.548 ms |
| Early presentation-gap p95            |    8.422 ms |    8.425 ms |
| Late presentation-gap p95             |    8.406 ms |    8.417 ms |
| Scheduled JS CPU                      |    20.313 s |    20.130 s |
| First post-trace complete observation |    56.322 s |    56.454 s |
| End total PSS                         | 320,456 KiB | 323,655 KiB |

No material drawing, presentation-gap or end-PSS regression against the frozen thresholds. Completion-latency regression is not established by the delayed observations in this table. All six runs passed canonical body, visible suffix, actual refresh and normal thermal checks. No Perfetto error statistics were reported in the twelve final traces. Short prose does not enter the huge-paragraph bitmap branch; this checks overhead and normal-path compatibility, not the parent all-scenario performance target.

## Integration provenance

The branch subsequently merged main `132b33e3c9965fcb5a01066a134f2744269b2d75`, producing integration head `f724966ce9b6bdb7b092b5866759d363d35ad5ae`. Those main changes affect mobile invitation/pairing screens and Host/Web memory previews; the measured chat implementation is unchanged. Do not present the original matched-bundle numbers as measurements of this new bundle.

Integrated Release build and the same 13 native tests passed. Integrated APK SHA-256: `A42E384FFA26549C201BD35293EC2E0748B4B69F3760711D0D1D8487F8A4DFF8`; embedded JavaScript SHA-256: `5EBE8FFA13FF46A7C1AAC497524DD4571D7E3E06CBB8653E4722EFD09CA93A9B`. The initial semantic check used this integrated APK; the final matrix uses the rebuilt review binary below.

## Physical semantic method

Separate from timed performance runs, pause the deterministic long rich paragraph after 80 producer chunks for 45 seconds. Capture 20 seconds into the pause while the message remains an uncommitted draft; this exercises active drawing rather than only the ordinary completed-message path. The fixture includes Chinese, bold, links, an entity and a family grapheme. Retain active and completed screenshots, canonical text and completed accessibility snapshots.

The first attempt to dump the accessibility tree during the active spinner failed Android's idle-state wait. Preserve that failed run. Subsequent active captures use screenshots directly and verify the zero committed Bot replies during the pause; full accessibility/body checks occur after completion. No altered APK or disabled animations are used to obtain the active screenshots.

## Review follow-up

CodeRabbit identified nonzero wrapper scroll offsets as an unsupported composition case. Commit `9879ff7a2a26aab9f24ecbb005fc205dfddad717` adds zero-scroll eligibility for the wrapper and a native fallback/re-entry regression. The 13 native tests and rebuilt Release pass. Rebuilt APK SHA-256: `BE939E5442C6F8FAD10069877E6AD7F63C19D8F09074EC0EF66E6D3F53928820`. Both local review axes rechecked the follow-up without findings. The final physical font/theme matrix uses this binary. The full ABBAAB measurements above remain bound to the earlier measured binary; they are not silently relabeled to this commit.

The visual fixture ends with repeated text. Completed accessibility matching decodes Android XML numeric references before counting the family grapheme; the original raw-XML matcher incorrectly returned zero. Rechecking the retained snapshot found 320 occurrences across duplicated accessibility attributes, consistent with the 160-repeat complete body. This was a harness failure, not a missing-glyph result.

The long rich fixture's 45-second producer pause changes playback buffering. Final-body checks for the font/theme matrix intentionally reopen the committed DM before checking its complete canonical and accessible content. They are semantic checks, not natural-playback completion measurements. Plain and prose natural completion remain separately verified by the timed runs.

## Final physical semantics and interactions

The final review binary passed active rendering at font scales 1.0, 1.3 and 2.0, each in light and dark mode. Matched baseline pairs cover the same six combinations. Each active capture occurs before any canonical Bot reply is committed. Bold text, links, decoded entities, Chinese wrapping and family graphemes remain visible. All six final cases independently verified one 15,040-unit canonical reply and the complete accessible body after reopening. Bot accent colors are fixed for the matched pairs; avatars and disposable DM names differ.

Actual input was verified separately: a long press opens the existing copy/share/reaction menu, Back dismisses it, a swipe beside the message moves history and reveals the return-to-latest button, and tapping that button returns to the tail. During the producer pause, a downward swipe changes the active viewport and the opposite swipe returns to the draft tail without blank/stale regions. These are interaction correctness checks, not scrolling FPS measurements. Swiping directly on the text initially did not move the list; retained evidence does not count that attempt as successful scrolling.

Tapping a link invokes Android's external-app launch consent dialog for Edge. The dialog was dismissed; opening the external site remains untested because the phone requires a Human system-permission decision. The existing chat body has selectable=false and uses the message actions menu, so native text-selection handles are not claimed as verified. No clipboard or share operation was performed.

The QA Release APK uses a private localhost-only network-security exception for its existing USB-reversed Host connection. This transport-only plugin is absent from production source and applies equally to the compared APKs. Raw traces, device identity, Host credentials, canonical messages and XML remain private. Sanitized measurements are in [the sample data](data/2220-native-paragraph.json); active screenshots and gesture states are in [the evidence directory](../../.github/pr-screenshots/2220-native-paragraph/README.md).

The final review binary also passed separate natural-completion smoke checks without reopening: plain 19,221 units and mixed rich 4,504 units, each exactly one canonical Bot reply and the visible final marker, at actual 120 Hz. These smoke checks do not replace the matched timing comparison.

The baseline 1.3/dark capture was repeated because a system notification obscured the original. The original remains private and is excluded from the published evidence; the clean repeat is labeled visual-a-13-dark-clean.

## Independent completion-timing follow-up

Review correctly rejected using the delayed post-trace observation as proof of completion-latency parity. A separate, predeclared A B B A A B check used the same matched APKs and input at font 1.0/light, actual 120 Hz and normal thermal state. Starting 10 seconds after the producer, capture the screen at a nominal 1.5-second cadence and recognize the existing final marker on the PC. Record capture start/end times. The last negative capture start and first positive capture end conservatively bracket when the complete marker became visible. All twelve boundary images were visually checked; final canonical body length is 19,221 in every trial.

| Trial                | Arm       | Complete-marker interval (seconds) |
| -------------------- | --------- | ---------------------------------- |
| completion-plain-1-a | control   | 50.381–52.885                      |
| completion-plain-2-b | candidate | 44.272–46.401                      |
| completion-plain-3-b | candidate | 47.955–50.093                      |
| completion-plain-4-a | control   | 47.862–50.508                      |
| completion-plain-5-a | control   | 50.864–52.933                      |
| completion-plain-6-b | candidate | 49.263–51.432                      |

The median intervals are 50.381–52.885 seconds for baseline and 47.955–50.093 seconds for candidate. Even candidate upper bound / baseline lower bound = 0.9943 is below the frozen 1.10 threshold. This supports no material complete-marker timing regression under matched capture instrumentation. Capture overhead affects absolute times; this is not an uninstrumented latency or final-opacity measurement. Do not mix these trials into the unpolled frame/CPU results or infer precise speedup. Boundary images are committed alongside the visual matrix.

## Reproduction input

After claiming the shared Android QA lane, build the recorded base and candidate as minified arm64 Release with identical embedded JavaScript and pair them to the same isolated QA Host. Use a deterministic local provider to stream the following plain reply through the normal Bot tool path, 80 graphemes every 32 ms into a fresh DM. Keep device/refresh/thermal settings matched.

```js
const plain =
  '连续长段落用于检查逐字淡入的成本。已经显示的文字保持清晰，新字平稳出现，标点带来短暂呼吸，缓冲在输入变慢时继续供给文字。'.repeat(
    320,
  ) + 'PLAIN_REPLAY_COMPLETE';
```

For the native regression, run the generated Android project task `:stream-reveal:testDebugUnitTest`; the native-graphics test exercises viewport movement, offscreen skipping, composition fallback and completion while retaining the original TextView text identity and Yoga-assigned bounds. The physical replay and screenshot checks remain necessary for native appearance and performance.
