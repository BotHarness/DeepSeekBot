# Android plain-paragraph JavaScript work (#2274)

## Scope and attribution

This is a bounded Android slice of #1845, following #2267. It reduces repeated GFM lexing of letter-led, single-line ordinary text. It does not change playback cadence, native text ownership, line breaking, reveal, virtualization or canonical message storage. It does not qualify stable 120 FPS, long-history flings, simultaneous history scrolling, iOS ProMotion, peak memory or sustained power behavior.

Baseline main is `3d6c44689e540f9e1fae97476dcf7269663a48af`. Its diff from `adcdcf98dfaaea31458f522f931e3380dd8bd69d` contains only screenshot evidence; all runtime inputs match the retained uninstrumented baseline APK. The candidate's production source is commit `e25c404674f99a18559847493018d8ba782ebce0`.

A separate minified Release diagnostic used the installed RN 0.88 Hermes sampling API, with the generated matching composed source map. Of 3,801 samples on the actual JavaScript thread, 1,634 have only the root frame, 1,170 contain native `completeRoot`, 366 contain `parseBlocks`/Marked, and 169 contain the roster projection's preview generation. The last path scans complete message bodies to generate short summaries. These are sampled stack occupancies, not exclusive scheduled CPU milliseconds. The diagnostic is excluded from accepted performance measurements. Native layout remains the largest sampled active path; playback cursor work is not the principal sampled JavaScript hotspot.

The first diagnostic build failed because the local Expo module lacked a React compile dependency. A private compile-only dependency allowed capture. Both that dependency and the native sampler were restored before building the candidate. No profiling code ships.

## Change and semantic boundary

Before, the changing single paragraph repeatedly entered the full GFM lexer. Now `parseBlocks` recognizes a conservative subset: a Unicode-letter-led single paragraph without inline syntax, entity, autolink or line-break triggers. It produces the same paragraph and text tokens as Marked 18.1.1. All other input still uses the full lexer. Each new source is classified again, so a later marker, URL, newline, replacement or truncation returns to normal parsing immediately. This deliberately leaves many harmless inputs on the slower path. It is not a general incremental Markdown parser.

The regression test first observed 157 complete lexer calls while a plain paragraph grew. After the change, it verifies the full lexer's exact token output without those repeated calls. Differential tests cover every append boundary, ASCII/control characters, Chinese and other scripts, combining marks, emoji, GFM links, numeric entities and formatting transitions. Existing block identity, references, repair and windowing tests remain in place.

## Frozen performance protocol

The same physical Android phone ran standard minified arm64 Release builds without Metro or sampling instrumentation. Actual active 120 Hz and thermal status zero were verified at both ends of every run. A fixed real-Host replay emitted 80 graphemes every 32 ms. Plain text is 19,221 UTF-16 units; ordinary prose is 21,492 units and 100 sections. Playback limits are unchanged. Each version ran three times per fixture in ABBAAB order; each slot ran plain followed by prose.

Perfetto captures lasted 45 seconds. Scheduled JavaScript CPU and presentation metrics use fixed early (2–22 s) and late (22–42 s) windows. Presentation gaps come from SurfaceFlinger presented frames, rather than treating a refresh setting or app frame lifetime as FPS. UI measurements use Choreographer work. End total PSS is a snapshot, not peak memory. Builds, diagnostic sampling and screenshot/accessibility polling were absent during these windows.

The predeclared primary threshold is at least 10% less median JavaScript CPU for the huge plain paragraph. Early/late presentation p95, UI p95 and independently sampled completion must not regress more than 10%; end PSS must not increase beyond the greater of 15% and 10 MiB. Ordinary prose is a regression control.

| Median                 | Plain baseline | Plain candidate | Change |
| ---------------------- | -------------: | --------------: | -----: |
| Scheduled JS CPU       |       20.659 s |        15.516 s | −24.9% |
| Early presentation p95 |      24.975 ms |       25.017 ms |  +0.2% |
| Late presentation p95  |      74.682 ms |       41.519 ms | −44.4% |
| Early UI p95           |      25.473 ms |       26.376 ms |  +3.5% |
| Late UI p95            |      37.295 ms |       35.245 ms |  −5.5% |
| End total PSS          |    348.501 MiB |     340.117 MiB |  −2.4% |

Ordinary prose JS CPU is 20.565 → 20.698 seconds (+0.65%); presentation p95 is 8.420 → 8.423 ms early and 8.394 → 8.390 ms late. UI p95 changes by +2.3%/+4.3%, and end PSS by +1.8%. All formal regression guards pass. Individual long frames and Buffer Stuffing variation remain; these results do not qualify the parent frame-time bar.

All twelve formal runs preserve the exact canonical body and reach the natural visible ending without reopening. Layout call counts remain approximately unchanged, consistent with reducing parsing rather than skipping text updates. The separate completion and semantic results below complete the bounded slice verification.

## Completion and native behavior

A separate matched ABBAAB series used nominal 1.5-second screen captures with desktop OCR, with no Perfetto capture. Each completion interval runs from the last negative capture start to the first positive capture end. Median intervals are 37.256–39.304 s baseline versus 34.284–36.333 s candidate for plain text, and 40.202–42.340 s versus 40.203–42.343 s for prose. Even candidate upper / baseline lower bounds pass the 1.10 regression guard (0.975 and 1.053). These are measured completion bounds with capture overhead, not uninstrumented absolute latency or full-opacity timings. All twelve trials are included, including candidate plain trial 6 at 41.257–43.446 s. Representative negative/positive boundary images for the first A/B pair of each fixture were inspected manually; all trials have retained capture/OCR evidence.

The same completed, plain-path-eligible Chinese/emoji/combining-mark message was reopened in both builds at font scales 1.0, 1.3 and 2.0, in light and dark mode. All twelve states preserve the full 112-character body, wrapping and composer access; all twelve screenshots were inspected. Large-font header overlap exists in both builds. These captures test completed rendering, not streaming timing.

The candidate also naturally completes the 20,880-character mixed-language long paragraph and the 4,504-character rich fixture (nested emphasis, strikethrough, links, entities, hard breaks, lists, quote, 120 code lines and 40 table rows). Canonical replies match their synthetic fixtures exactly. Long-press copy on the ordinary-text message, paste into the composer, and keyboard dismissal preserve all 112 characters exactly; the unsent test draft was cleared. A swipe from the rich message margin visibly changes table rows 23–40 to code rows 105–119 and table rows 1–14; the bottom button restores the visible completion marker. The first swipe within the table did not move the view and is not counted as successful scrolling. No scrolling FPS claim follows from this smoke test.

Tapping the long paragraph's example.com link reaches the system prompt to open Edge. The runner dismisses it without changing permission. This verifies link dispatch; external browser navigation is untested. Native character-range selection inside the message is also unqualified; the message copy menu and composer selection were exercised.

## Failures, checks and limits

The long-fixture accessibility dump initially failed with `could not get idle state`. Its failed driver record is retained. Without reopening the conversation, the next screenshot shows the complete natural ending and a later accessibility dump succeeds; the exact saved body is 20,880 characters. The short font fixture initially failed a driver comparison because Android XML encoded emoji as numeric entities. Decoding those entities verifies the exact visible body; the screenshot already showed the full message. Neither driver failure changes any formal performance sample.

All twelve Perfetto traces report no nonzero error/data-loss rows and thermal status 0 at start/end. Focused Markdown tests pass (57 tests); mobile type checking passes. The complete mobile suite passes with a process-local English default for Intl (110 files, 813 tests; 7 files/9 tests skipped). With the machine's Chinese locale, five existing cloud-channel-cache expectations fail on hard-coded English strings. The unchanged baseline produces the same failure; both logs are retained. No locale workaround ships. Root/mobile type checking, lint, changelog validation and whole-repository formatting pass. Lint initially rejected three new inline comments; removing those comments leaves the measured production logic unchanged.

The primary threshold and all frozen guards pass. The remaining long frames and native layout cost keep the 120 FPS goal open. The next ranked opportunities are full-body roster-preview scans and native layout reuse, followed by independently scoped long-history scrolling and sustained-resource checks. Other agents retain ownership of iOS qualification.

## Evidence and reproduction

[Sanitized per-trial data](data/2274-android-js-updates.json) contains exact synthetic fixture bodies and hashes, build hashes, all performance/completion trials, native costs, refresh/thermal checks, font/theme results and interaction limits. [Screenshots](../../.github/pr-screenshots/2274-js-updates/README.md) show the matched rendering and selected native interactions. Raw traces, profiles, private Host metadata and device identifiers stay local.

After acquiring the shared Android lane, build the recorded base/candidate as standard arm64 minified Release and pair to the same QA Host. Send each exact fixture through a disposable Bot DM using 80 graphemes every 32 ms. Run plain then prose in each ABBAAB slot. Capture 45 seconds of Perfetto and compare fixed 2–22 s / 22–42 s windows; sum scheduled JavaScript CPU across both windows. Independently repeat ABBAAB with nominal 1.5-second screenshots for completion. Verify exact saved bodies, natural visible endings, actual 120 Hz and thermal state. Do not mix screenshots, samplers or builds into performance captures.
