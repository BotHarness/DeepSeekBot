# iOS performance diagnosis and capture for keyboard and streamed messages

Date: 2026-10-28. Issue: [#2942](https://github.com/BotHarness/DeepSeekBot/issues/2942).
Status: research and capture plan, not a performance result or implementation decision.
Local source inspected: `7e212a52c6d068dc6de27d82327863440260f085`; Expo 58.0.20, React Native 0.88.0, React 19.3.0. This note supplements the confirmed [first-slice design in #2942](https://github.com/BotHarness/DeepSeekBot/issues/2942), [AX performance policy](../agents/ax-performance.md), and [mobile profiling rules](../../apps/mobile/AGENTS.md).

## Decision

Use Simulator to diagnose JavaScript, React updates, native CPU work and reproducible interaction correctness. Use a physical iPhone with an optimized native Release binary and embedded production JavaScript to qualify rendered frames and hitches. Apple explicitly says Simulator does not reproduce physical-device performance. A simulated “Pro Max” name does not give the Mac a ProMotion iPhone's render pipeline. [Apple device execution guide](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices)

For #2942, first prove the fixed reply actually reaches the visible conversation during the capture. Then record a short native CPU trace and a separate JS/React diagnostic trace. Decide which work to change only after attributing time to a specific thread/function/phase. Run matched native Release A/B measurements after that change. This sequence applies the repository's measured-cause rule to native mobile; its Chromium DOM counters are not native metrics.

## What each measurement means

| Question                                                               | Tool / observation                                         | Limit                                                                                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Is JavaScript busy, and which functions account for sampled execution? | React Native DevTools Performance; Hermes CDP CPU profile  | Not UI-thread time, GPU time or displayed FPS                                                            |
| Which component re-renders and how expensive is React rendering?       | React DevTools Profiler / React Performance tracks         | Profiling overhead; ordinary production React disables profiling                                         |
| Which native thread/function consumes CPU?                             | Instruments Time Profiler; CPU Profiler where supported    | Sampling estimates, not exact duration of every invocation                                               |
| Does the app miss its display deadlines, and where?                    | Physical-device Animation Hitches and render/commit tracks | Simulator instrument support must be tested; a template being listed proves nothing about target support |
| What is the screen's frame-rate timeline?                              | Core Animation FPS instrument where supported              | Average FPS alone hides isolated hitches and variable refresh behavior                                   |
| When does our own operation start/end?                                 | Native `OSSignposter`; JS `performance.mark/measure`       | Operation duration is not automatically visible latency                                                  |
| Do callbacks arrive on time?                                           | Native `CADisplayLink` timestamps; JS rAF gaps             | Callback cadence is not proof that each new frame was presented                                          |
| Are regressions happening in shipped apps?                             | MetricKit / Xcode Organizer                                | Aggregated field reports, not the immediate local A/B loop                                               |

Sources for the tool distinctions: [RN DevTools](https://reactnative.dev/docs/react-native-devtools), [React Profiler](https://react.dev/reference/react/Profiler), [Apple sampling limitations](https://developer.apple.com/tutorials/instruments/determining-execution-frequency), [render loop](https://developer.apple.com/videos/play/tech-talks/10855/), [Core Animation FPS](https://developer.apple.com/videos/play/wwdc2022/10083/), [OSSignposter](https://developer.apple.com/documentation/os/ossignposter), [ProMotion timing](https://developer.apple.com/documentation/quartzcore/optimizing-iphone-and-ipad-apps-to-support-promotion-displays), [MetricKit](https://developer.apple.com/documentation/metrickit?language=objc).

A 60 Hz interval is approximately 16.67 ms; 120 Hz is approximately 8.33 ms. These are display intervals, not a full allowance for JavaScript alone. Event handling, commit/layout, render preparation and GPU execution have their own pipeline deadlines. A commit hitch originates in app work; a render hitch originates in render-server preparation/execution. Reduce the measured expensive phase, rather than assuming every hitch is caused by JS. [Apple render loop](https://developer.apple.com/videos/play/tech-talks/10855/)

Dynamic refresh can change with thermal/power conditions and system policy. Record actual intervals; do not calculate “drops” by dividing all gaps by 16.67 ms. Apple recommends using `targetTimestamp` for custom animation timing and minimizing independent display links. A preferred frame-rate range is a hint, not a guarantee. Avoid changing that hint merely to improve a benchmark counter. [Apple ProMotion guidance](https://developer.apple.com/documentation/quartzcore/optimizing-iphone-and-ipad-apps-to-support-promotion-displays)

## Native capture: start with the relevant phase

1. Build the baseline in Release with matching dSYM and embedded bundle; keep binary UUID, source/lockfile/native-input hashes and build configuration. A Debug native shell serving `--no-dev --minify` JS is a separate diagnostic condition, not Release.
2. In Instruments, select the exact device and app process. Begin with a short Time Profiler capture over the known interaction. Expand main/UI, JS and worker threads; narrow the interval to the problematic keyboard transition or paragraph boundary. Distinguish self time from inclusive time and retain symbolication artifacts. Time Profiler samples active execution; it cannot tell invocation count or exact cost of every small call. [Apple sampling tutorial](https://developer.apple.com/tutorials/instruments/determining-execution-frequency)
3. If the main thread is busy, inspect its hot stack. If the app stalls with little CPU activity, use Thread State Trace / relevant scheduling data to investigate blocking rather than optimizing arithmetic. [Apple hang diagnosis](https://developer.apple.com/videos/play/wwdc2023/10248/)
4. For CPU optimization on a supported target, also consider CPU Profiler. Apple recommends its cycle-based sampling over timer sampling for CPU-resource attribution; deferred recording reduces analysis overhead. Availability is target-specific, so retain a failed capability probe rather than silently substituting a metric. [Apple CPU optimization](https://developer.apple.com/videos/play/wwdc2025/308/)
5. On the real iPhone, run Animation Hitches to correlate commit versus render hitches. Inspect layout/text measurement for commit cost; inspect layer-tree complexity, masking and offscreen rendering for render cost. A mask change is only a hypothesis until measured, and #2942 keeps the existing bubble shape. [Commit phase](https://developer.apple.com/videos/play/tech-talks/10856/), [render phase](https://developer.apple.com/videos/play/tech-talks/10857/)
6. Instruments 27 additionally supports Run Comparisons. Filter both runs to the same signpost interval before comparing stack deltas; this improves analysis, not experiment validity by itself. [Apple Instruments 27 workflow](https://developer.apple.com/videos/play/wwdc2026/268/)

CLI outline, verified against the installed `xctrace` command's usage text on this research date; placeholders must be resolved from the owned running app. No recording was started by this research:

```sh
xcrun xctrace list templates
xcrun xctrace list devices
xcrun xctrace record --template 'Time Profiler' --device '<UDID>' \
  --attach '<exact-app-PID>' --time-limit 25s --output '<unique-path>.trace'
xcrun xctrace record --template 'Animation Hitches' --device '<physical-UDID>' \
  --attach '<exact-app-PID>' --time-limit 25s --output '<unique-path>.trace'
xcrun xctrace export --input '<path>.trace' --toc --output '<path>.toc.xml'
```

Inspect the export table-of-contents before choosing an XPath/schema for export; do not assume a fixed table layout across Xcode versions. Keep raw traces private in the indexed task evidence. This is a reproducibility procedure, not a statement that every listed instrument works on the current simulator.

## JS and React capture

The current RN documentation provides a Performance panel combining JS execution, React tracks and custom User Timings. Expo opens RN DevTools through the development server (`j`); this is the preferred interactive diagnostic entry. Export the trace and keep its exact JS bundle/source map. Use React's Profiler to find repeated component renders and actual render durations, not to infer Core Animation or GPU cost. [RN DevTools](https://reactnative.dev/docs/react-native-devtools), [Expo tools](https://docs.expo.dev/debugging/tools/)

React profiling is disabled in normal production builds and adds overhead when enabled. Do not “fix” a missing React DevTools hook by treating the resulting empty profile as zero cost. If a profiling build is needed, qualify the native renderer's supported configuration; the React DOM profiling alias is not an iOS recipe. A development/profiling diagnostic can locate a candidate hotspot; Release A/B must validate the outcome. [React Profiler](https://react.dev/reference/react/Profiler), [React Performance tracks](https://react.dev/reference/dev-tools/react-performance-tracks)

Hermes exposes `Profiler.start` and `Profiler.stop` through its inspector protocol, independently of React's commit hook. Probe the actual target and record unsupported optional commands. Preserve `.cpuprofile` plus the matching map, report sampling estimates and GC, and never label this file a native frame trace. [RN Hermes protocol](https://cdpstatus.reactnative.dev/devtools-protocol/hermes/Profiler)

RN also exposes User Timing, Event Timing and Long Tasks APIs, with `PerformanceObserver` usable in production according to the RN 0.83 release notes. Check `PerformanceObserver.supportedEntryTypes` on this binary; the installed RN 0.88 source derives this list from native capabilities. A long-task signal is useful for JS stalls but is too coarse to qualify every 8.33 ms frame. [RN API announcement](https://reactnative.dev/blog/2025/12/10/react-native-0.83), local source `apps/mobile/node_modules/react-native/src/private/webapis/performance/PerformanceObserver.js`.

### Existing helper audit

Local `apps/mobile/scripts/rn-profile.mjs` is useful diagnostic scaffolding but is not a Release FPS gate:

- It requires `__REACT_DEVTOOLS_GLOBAL_HOOK__` before starting CPU profiling; the production-JS attempt's rejection is expected for this path.
- Its `frames` are JS `requestAnimationFrame` timestamps. It derives `droppedFrames` from a fixed `1000 / 60` interval within a React-commit window. Neither the cadence assumption nor the measurement surface proves native displayed frames.
- `selfBaseDuration` is accumulated under `selfMs`; it must not be interpreted as exact current-update self CPU time. React distinguishes base estimates from current `actualDuration`.
- It selects a target automatically. Any reused automation should require and verify the task's target identity and a successful replay, rather than trusting the first inspector endpoint.

These are source observations, not a change to the helper in this research. Before using its summary for quantitative conclusions, audit its sample attribution and instrumentation overhead too. The current installed RN Perf Monitor uses `CADisplayLink` callbacks for its graphs (`React/CoreModules/RCTPerfMonitor.mm`); the official RN guide calls that overlay a guide and recommends native tooling for accurate measurements. [RN other debugging methods](https://reactnative.dev/docs/other-debugging-methods)

## Small, bounded instrumentation if the trace cannot explain the cause

Proposed markers for this task: replay received, JS presentation update, native text/layout interval, keyboard transition interval, surface animation start/retarget/settle and first visible-content observation. Use a run ID and sequence number without message text, tokens or pairing data. Native `OSSignposter` gives paired intervals and point events in Instruments. JS `performance.mark/measure` gives corresponding JS phases. Do not subtract timestamps from different clocks without an explicit alignment method. [OSSignposter](https://developer.apple.com/documentation/os/ossignposter), [RN DevTools timing support](https://reactnative.dev/docs/react-native-devtools)

If a display-link probe is needed, keep a bounded native buffer for callback timestamps, target timestamps and callback entry/exit time; flush after the scenario. Do not send a JS event, allocate unbounded objects or print every frame. Treat its output as callback/deadline diagnostic data. It does not replace render-server/display evidence. Check probe-on/off overhead and use the same probe in both A/B binaries. This is a proposed measurement design grounded in Apple's display-link timing contract, not an implemented benchmark. [Apple display-link timing](https://developer.apple.com/documentation/quartzcore/cadisplaylink/targettimestamp)

MetricKit is appropriate for later production trend monitoring: traditional metric reports cover the preceding day and arrive at most daily, while diagnostic delivery differs. It is not a substitute for a controlled 25-second measurement. Its hitch metrics have their own semantics. Current APIs include newer OS-specific types; select only APIs available on the test devices, including iOS 18.1.1. [MetricKit](https://developer.apple.com/documentation/metrickit?language=objc), [MXAnimationMetric](https://developer.apple.com/documentation/metrickit/mxanimationmetric/hitchtimeratio)

For a repeatable native regression test, XCTest supports signpost metrics and scrolling/deceleration metrics; custom animation intervals can expose animation measurements. Reset to the same content/position between iterations. Older videos use now-deprecated scroll metrics, so follow the installed SDK's availability and current `scrollingAndDecelerationMetric` API. [Apple XCTest technique](https://developer.apple.com/videos/play/wwdc2020/10077/), [current metric](https://developer.apple.com/documentation/xctest/xctossignpostmetric/scrollinganddecelerationmetric)

## Matched #2942 experiment

This is the proposed execution protocol, not collected results:

1. Qualify one fixed replay end to end: same fixture hash, chunks/timing, expected canonical Bot reply, visible appended content and end state. No reply, wrong conversation, tool disconnect, reload, thermal interruption or missing trace means INVALID; preserve that run but exclude it from improvement statistics.
2. Freeze A/B source, native inputs, dependency lock, optimization settings, app/dSYM and JS/source-map identities. Rebuild after native changes. Keep instrumentation identical.
3. Separate cases: held long-history reading plus keyboard; fixed streaming; streaming while typing; paragraph boundary; rapid burst; end/cancel; Reduce Motion. Preserve existing playback cadence, draft, interactive dismissal and history anchor. Explicitly enable Streaming, record original setting and restore it; Complete is a separate control.
4. Warm each binary identically. Use ABBAAB (three valid runs per side), identical gesture/window/data, fixed font/theme and controlled thermal/power state. Record actual display cadence rather than assuming constant 120 Hz. The XS Max qualifies its own 60 Hz behavior only; the product's ProMotion gate needs a real ProMotion iPhone.
5. Capture native CPU and native hitch runs first without screen recording. Capture matched visual evidence separately, or keep recording conditions identical and label their overhead. The video proves visible behavior, not FPS. If JS tooling changes execution conditions, its diagnostic table stays separate from native Release results.
6. Report medians and spread: native hitch count/total/ratio, longest hitch, frame/display interval distribution when available, main-thread sampled CPU, JS sampled CPU/GC, React commit count/duration only in the profiling condition, measured layout intervals, producer lag and content-visible delay separately. Report anchor drift/jumps/gaps and draft correctness alongside speed. A faster run with wrong content or lost reading position fails.
7. Only then choose the smallest proven fix. Repeated parsing suggests reducing repeated parse work; repeated native layout suggests reducing invalidations; render-phase masking cost suggests investigating layer composition while preserving the agreed shape. These are conditional hypotheses, not findings about the current app.

Do not turn historical Apple hitch-color thresholds into a new acceptance bar: current Organizer guidance and older talks use different thresholds/contexts. Preserve the repository's stricter explicit target and compare like-for-like raw metrics. [Current Apple hitch guidance](https://developer.apple.com/documentation/xcode/understanding-hitches-in-your-app), [older render-loop guidance](https://developer.apple.com/videos/play/tech-talks/10855/)

## Current evidence boundary

The task handoff reports a Simulator `Animation Hitches` failure, `Hitches is not supported on this platform`, and a JS profile whose replay produced no actual Bot reply. The first is a tool/platform limitation; the second is an invalid scenario. Neither proves poor or good product FPS. Prior keyboard screenshots show a visible reading-position change but are not a CPU cause. No device was launched, no benchmark run, and no product optimization was performed for this research. Next action: requalify replay, collect a valid CPU diagnostic, then obtain matched real-device Release hitch data.
