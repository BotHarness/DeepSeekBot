# Android Markdown recovery after distant scrolling (#2284)

## Result

The candidate restores the complete latest Markdown message when a rapid return ends before Fabric's measured scroll position catches up. It keeps block windowing and native scroll events; no polling, timer, diagnostic logging or global virtualization change ships. This is a correctness prerequisite for #2283, not a speedup or qualification of #1845.

Base: `024d1c675b246b8ef1e402fa4d4d557d270bebf3`. Runtime candidate: `e952589cb0a70cd38cd9dc9bc7e5e661ee54584a`. Both minified arm64 Release APKs use the same native dependencies and private test-only loopback access. The baseline APK was built from `554e28a00c1f7c0e58d611c2b408421e8d235f70`, whose runtime is equivalent to merged main. APK hashes and sanitized results are in the companion JSON; no instrumentation is included in either accepted arm.

Device: Xiaomi model `24090RA29C`, Android 16 (API 36), arm64; actual render mode was verified at 120 Hz. QA batch: `windows-markdown-return-2284`, branch `qa/windows-batch-2284` at base `024d1c675b246b8ef1e402fa4d4d557d270bebf3`, with the two runtime files copied from candidate `e952589cb0a70cd38cd9dc9bc7e5e661ee54584a` and a private loopback-only build overlay. Baseline binary came from QA commit `579dbd2439f87d3fd9921bec48112de7a4256aaa`. Both APK hashes identify the exact installed artifacts; device identifiers and local configuration stay private.

## Reproduction and cause

One owned synthetic conversation contains 300 unique, ordered messages: 240 plain, 30 code and 30 table messages, totaling 32,961 UTF-16 units. The final table is complete before testing. Twelve 120 ms flings with 700 ms pauses, followed by Return to latest and a five-second settle, reproduced the blank heading/table in all three minimized baseline repetitions. Three flings passed twice; six flings failed once out of three; the initial 24-fling exploratory run passed. All outcomes remain in private evidence.

The exact saved text remains intact. A bounded private probe showed the last native scroll event approaching zero while `measure(document)` still included an older Fabric scroll offset. The JS window therefore retained only a height placeholder and the last paragraph. Later frame probes measured the document correctly, but no subsequent scroll/layout dependency republished the range. A tiny scroll immediately restored both projected blocks and visible pixels. Diagnostic APK timings are excluded.

The installed React Native `ReactScrollViewHelper.updateStateOnScrollChanged` updates Fabric state and emits a scroll event in a race; Reanimated `measure` uses relative layout metrics from the shadow tree. The correction measures the document and inverted content container in the same coordinate space, cancels their shared older scroll offset, and applies the current native `scroll.value`:

```text
window top = content.pageY - document.pageY
             + content.height - viewport.height - current scroll offset
```

The container ref is attached and cleared with the original animated list ref. Existing half-viewport publication thresholds, overscan, screen-reader bypass and saved content authority are preserved. Missing measurements keep the existing conservative path. The regression runs the real viewport hook and Markdown window with the observed stale geometry: it fails before the fix at the missing-block assertion and passes after it.

## Frozen scrolling regression guard

Six trials in A1/B1/B2/A2/A3/B3 order use twelve identical 120 ms flings at 1.5-second cadence. Perfetto records 23 seconds; analysis uses the fixed 18 seconds starting at the first gesture's device clock. Return-to-latest runs after tracing, so a blank baseline return cannot be counted as a performance advantage. No build, screen recording or accessibility polling overlaps the timing window. Actual render mode is 120 Hz and thermal status is 0 in all runs; traces have no reported errors/data loss and contain native scrolling events.

| Median measure                  |     Main | Candidate | Change |
| ------------------------------- | -------: | --------: | -----: |
| JS CPU seconds / sampled second | 0.327355 |  0.335701 | +2.55% |
| UI doFrame P95, ms              | 6.828677 |  7.306707 | +7.00% |
| Presentation interval P95, ms   | 8.341092 |  8.344997 | +0.05% |

All three stay within the predeclared +15% regression limits. There is a measurable cost; this PR does not claim a performance improvement. The candidate restores the full table in all three guard runs; the slower guard cadence also allows two of three baseline runs to recover. Do not combine this rate with the faster minimized reproduction rate. The interval includes pauses between gestures, so its presentation density is not sustained scrolling FPS. Native slow frames remain; #1845 is not complete.

## Native correctness verification

All six candidate font/theme cases restore the table after the rapid twelve-fling loop; four baseline cases stay blank, while baseline default/intermediate dark cases happen to recover. The six matched after-return screenshots were inspected separately from OCR (which checks independent table words, not column order).

The extended candidate run crosses older history with 24 flings; stage captures retain complete content and no ellipses. The sampled native accessibility text/bounds remain identical over a five-second idle; this is a stationary-position check, not a claim of pixel-perfect anchoring through all pagination/momentum. Returning restores the complete latest table. Focus navigation exposes both the older table (message 230) and code block (message 235) in actual pixels; both return actions restore the full latest table. Precise centering is not qualified. Canonical history re-read: 300 unique messages, two pages, every body exactly matches the fixture.

### iOS acceptance status

All six iOS Dynamic Type/theme cases below are **blocked / untested**. This batch runs on Windows with the Human-designated Android runner; it has no assigned Mac, iOS Simulator or physical-iPhone runner for this PR. The separate iOS work tracked by #2176 was not taken over. Android captures and the successful iOS JS bundle build do not establish native iOS acceptance. Although the viewport reaction is Android-active, the shared conversation ref attachment changed, so the platform record remains explicit.

| iOS text size         | Light              | Dark               |
| --------------------- | ------------------ | ------------------ |
| Default               | Blocked / untested | Blocked / untested |
| Intermediate          | Blocked / untested | Blocked / untested |
| Maximum accessibility | Blocked / untested | Blocked / untested |

An assigned iOS batch must verify complete Markdown, distant-history return, focus navigation and reachable composer/actions in those six cases. This PR supplies no iOS native or ProMotion acceptance result.

## Automated checks and limits

The focused viewport/window suite passes 9 tests. Full mobile suite: 819 passed, 9 skipped, with the existing process-only English Intl test shim for this machine's Chinese locale. Root/mobile types and lint pass. The static Standards and Spec reviews have no actionable findings at the runtime commit. CI and external review remain separate gates.

No iOS native result or ProMotion 120-FPS claim. Exact centering of a focused old message is a pre-existing unqualified behavior, not proven fixed by this coordinate correction. Broader history-only and simultaneous streaming/scrolling performance remains in #2283. Public screenshots show only synthetic QA content.

[Sanitized measurements](data/2284-markdown-return.json) and [native captures](../../.github/pr-screenshots/2284-markdown-return) preserve the comparison. Agent task: `codex/local/01a15013-1309-7d42-a802-be72a1185b41`.
