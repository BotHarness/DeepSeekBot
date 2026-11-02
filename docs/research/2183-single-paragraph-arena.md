# Android single-paragraph streaming Arena

For [#2183](https://github.com/BotHarness/DeepSeekBot/issues/2183), within [#1845](https://github.com/BotHarness/DeepSeekBot/issues/1845).

## Decision

Retain **source-matched block-token reuse**. Three alternating trials per arm reduced combined JS-runtime CPU by **10.6%** in the sampled windows. Native text drawing remains the bottleneck: this is a CPU reduction, **not a 120 FPS qualification** for a huge single paragraph.

Reject the separate native notification-coalescing experiment at screening. Its one-run main-thread p95 changed from 58.116/109.716 ms to 53.764/107.663 ms; inclusive text drawing fell only 5.9%, below the predeclared 15% native-benefit threshold. Combining it with token reuse did not establish an additional native benefit. The production native module and 48-grapheme fade remain unchanged. These screening observations are not three-run native comparisons.

## Protocol and provenance

- Base: `006db189dda951b9342f942df9169fb9b549db2c` (current main when the experiment started).
- Physical Android 16 phone, arm64 minified Release, Expo SDK 58 / RN 0.88. Active physical/render refresh was 120 Hz before and after every included run. Thermal-service status was normal.
- One APK contained four private QA arms: control, token reuse, native invalidation coalescing, and both. APK SHA-256: `62062fe48a67e67fc9e917dc7bb4161ab882c10a8b33979b5f0cd0361710e553`. All routing switches, baseline copies and completion logs are removed from the final normal build.
- The existing `plain` local replay sent 19,221 UTF-16 code units in 242 chunks, at 80 graphemes per scheduled chunk / 32 ms. Actual producer duration was 7.715–7.725 s; maximum scheduling lag was 15–41 ms in the six matched runs. No real LLM was called.
- Each trial cold-opened a fresh task-owned DM through the paired QA Host and sent through the real CLI. The dedicated Host was deliberately frozen at DSH 0.2.0-rc.2; the mobile dependency baseline is 0.2.1-rc.2. This comparison qualifies client rendering against that fixed Host, not the newest Host release.
- Screen all four arms once. Then compare the selected token-reuse arm with control in **A B B A A B** order, three trials each. Predeclared acceptance: at least 10% median JS CPU reduction, no greater than 10% UI-p95/completion regression, no material memory regression, and complete content in every run.
- Capture 45 seconds of Perfetto. Compare 2–22 s and 22–42 s after trace start. Stop mirror, recording, builds and tests; do not poll accessibility or take screenshots inside the trace.
- Count only root numbered `Choreographer#doFrame` slices (`GLOB 'Choreographer#doFrame [0-9]*'`). A broad `Choreographer#doFrame*` filter also counts nested resynchronization slices and overstates UI work. Presentation timing is derived separately from SurfaceFlinger-associated app frames.
- Read JS CPU from scheduled `mqt_v_js` threads, summed over both 20-second windows. Inclusive native draw/measure slices are not additive CPU accounting.
- Measure the local presentation-cursor completion separately from source/Host completion. Correct device wall time with pre/post clock-offset samples. Most round-trip-derived uncertainty was 31–61 ms; one control-start sample was 559 ms, yielding about ±302 ms for that run's averaged correction. Final accessibility/screenshot inspection follows the trace and only gives a later visible-completion bound.

Sanitized per-run values and medians are retained in [the data file](data/2183-single-paragraph.json).

## Included trials

All six CLI commands succeeded, and canonical/full-visible completion and 120 Hz checks passed independently.

| Order | Arm         | JS CPU, 40 s | UI p95 early | UI p95 late | Cursor completion | PSS, KiB |
| ----- | ----------- | -----------: | -----------: | ----------: | ----------------: | -------: |
| A1    | Control     |     22.308 s |    59.449 ms |  113.134 ms |          45.975 s |   338339 |
| B1    | Token reuse |     20.255 s |    51.512 ms |  106.641 ms |          44.740 s |   344071 |
| B2    | Token reuse |     19.711 s |    63.280 ms |  109.004 ms |          45.665 s |   339759 |
| A2    | Control     |     22.660 s |    53.951 ms |  107.159 ms |          47.438 s |   342847 |
| A3    | Control     |     22.750 s |    55.729 ms |  107.809 ms |          46.502 s |   335971 |
| B3    | Token reuse |     20.279 s |    52.806 ms |  106.243 ms |          44.549 s |   336069 |

| Median                             |    Control | Token reuse |                Change |
| ---------------------------------- | ---------: | ----------: | --------------------: |
| Combined JS CPU                    |   22.660 s |    20.255 s |                −10.6% |
| Main-thread p95, early             |  55.729 ms |   52.806 ms |                 −5.2% |
| Main-thread p95, late              | 107.809 ms |  106.641 ms |                 −1.1% |
| Presentation gap p95, early        |  58.052 ms |   58.012 ms | Essentially unchanged |
| Presentation gap p95, late         | 116.150 ms |  116.178 ms | Essentially unchanged |
| Presentation-cursor completion     |   46.502 s |    44.740 s |                 −3.8% |
| Post-run PSS                       | 338339 KiB |  339759 KiB |                 +0.4% |
| Inclusive text drawing, full trace |   26.266 s |    27.091 s |                 +3.1% |

One earlier pure-main triage run failed its CLI wait even though an independent canonical reread recovered the exact full reply and the Host doctor passed. Preserve that failure; it is excluded from the matched group. All six included commands completed normally without recovery.

## Semantic and lifecycle safeguards

The parser retains the lexer output it already computed, tagged with its exact source. Android rendering and window-support checks consume it only while the source matches. If Markdown repair changes the tail, or a source-only block has no matching result, the existing lexer path runs. Document-wide references retain the full token context. Boundary lookback reconciles unchanged local blocks to preserve memoized view identity.

Differential tests compare every append with the original repair-plus-lexer result for Chinese, joined Emoji, combining marks, entities, emphasis, references, lists, fenced/indented code, tables, HTML and line endings. The original renderer test caught a completed-block rerender during development; preserving block identity fixed it. The parser-call regression test fails on the old double-lex path and passes with reuse.

The final build changes no native code, dimensions, typography, reveal budget, playback cadence or durable state. Default/intermediate/maximum font and light/dark comparisons, mixed-Markdown smoke checks and their concrete results are recorded in the PR. iOS native hardware and physical gesture performance are separate qualifications.

## Final-build and visual checks

The normal arm64 Release compiled successfully after removing every private Arena switch, baseline renderer copy, cursor log and native change. Its APK SHA-256 is `b77dc749df0436c5dc43019b903565b4761f734ae8ff51fcac32f5457f125033`. The installed QA binary retains only the lane's existing loopback network configuration; production app configuration is unchanged.

Independent matched screenshots/native accessibility checks at font scales 1/1.3/2 in light/dark reached complete text in both arms. During two sequential configuration sweeps, control at 1.3/light showed a blank paragraph; an independent cold launch restored it. Both failed captures are retained, and [#2188](https://github.com/BotHarness/DeepSeekBot/issues/2188) records the unresolved baseline lifecycle failure. Do not interpret the later successful snapshots as a fix for that race.

Source validation: 674 mobile tests passed, 8 skipped; the focused Markdown group passed 51 tests. Mobile typecheck, lint and bilingual change-fragment validation passed. Physical gesture/selection/link/TalkBack interaction remains unqualified here because Android refuses injected touches; iOS native hardware was not part of this Windows lane.

The final normal build completed a fresh 100-section prose replay and a fresh mixed-Markdown replay, including the final marker and exact canonical bodies. One earlier mixed run had a failed CLI waiter and held the final paragraph until cold reopen; [#2190](https://github.com/BotHarness/DeepSeekBot/issues/2190) retains that unresolved result. The same committed body rendered fully after reopening; later pure-main and candidate fresh-DM rich replays both completed normally. This is not attributed to, or claimed fixed by, token reuse.

## Remaining work

Huge single paragraphs still repeatedly measure and draw a growing native text layout. Windowing completed Markdown blocks cannot bound work inside that one block. A future measured slice must address that layout/drawing boundary while preserving line wrapping, text selection, links, accessibility and history anchors. The broader [#1845](https://github.com/BotHarness/DeepSeekBot/issues/1845) remains open.
