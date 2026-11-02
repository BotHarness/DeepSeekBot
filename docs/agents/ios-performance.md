# iOS performance tuning and physical-device verification (AX)

This is the required iOS performance workflow for native UI performance reports and changes
that affect rendering, lists, keyboard coordination, streaming, animations or sustained CPU.
It extends [AX performance policy](ax-performance.md) and [shared device QA](device-qa.md).
Follow resource ownership and [cleanup](ax-resource-cleanup.md); this document allocates no
resources and creates no schedule. Research and source rationale are in the
[iOS profiling note](../research/2026-10-28-ios-performance-profiling.md).

## Evidence boundaries

- **Simulator diagnoses; physical devices qualify.** Simulator CPU/JS profiles and interaction
  captures can locate candidate causes. They do not reproduce iPhone CPU/GPU or prove device FPS.
- **Release means native Release plus production JavaScript.** A Debug dev client running
  minified production JS is still a Debug native binary. Development/profiling ratios do not
  automatically carry over to Release; validate improvements again in the qualifying build.
- **Separate measurement surfaces.** JS execution, React rendering, native main-thread/layout,
  render-server/GPU work and displayed frames are different metrics. Video and callback frequency
  are not native frame-presentation evidence. Canonical Host state is not visible-content evidence.
- **Refresh rate is measured, not inferred from a model name.** Record actual cadence and thermal,
  power and refresh settings. A 60 Hz iPhone cannot qualify 120 FPS. Keep the existing
  [mobile performance bar](../../apps/mobile/AGENTS.md#profiling); unavailable measurements are
  UNTESTED, not a relaxed target or a pass.

Apple explicitly distinguishes Simulator from device performance:
[device execution](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices).
Display intervals and rendering deadlines are explained in Apple's
[render loop](https://developer.apple.com/videos/play/tech-talks/10855/) and
[ProMotion guidance](https://developer.apple.com/documentation/quartzcore/optimizing-iphone-and-ipad-apps-to-support-promotion-displays).

## Establish a valid workload before optimizing

1. Freeze base/candidate source, dirty diff, dependency lock, native input fingerprint, binary
   identity/build settings, matching dSYM and JS bundle/source map. Rebuild after native changes.
2. Use deterministic data and actions. For streaming, freeze fixture hash, chunk sequence and
   producer timing. Verify both the canonical reply and its visible appearance in the intended
   conversation during the capture. Record presentation mode; explicitly enable Streaming when
   testing it, retain Complete as a separate control, and restore the original setting.
3. Define the interval and success condition before capture. Wrong conversation, missing reply,
   reload, disconnected tooling, incomplete trace or interrupted workload makes a run INVALID.
   Preserve the first failure and its reason. A profiling capability failure does not establish
   a product failure; an invalid run never enters improvement statistics.
4. Reproduce the symptom with measurements. Attribute the expensive thread/function/phase before
   changing code. A screenshot showing a jump is correctness evidence, not its CPU root cause.

## Capture the layer that can answer the question

| Layer                | Preferred capture                                                              | Output and interpretation                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| JS / React           | RN DevTools Performance and React Profiler; Hermes CPU sampling                | Export timeline or `.cpuprofile` with matching source map; JS stacks, GC, render counts/durations, not display FPS                 |
| Native CPU / layout  | Instruments Time Profiler; CPU Profiler where supported                        | Symbolicated `.trace`, exact scenario interval, per-thread self/inclusive cost; samples are estimates, not exact invocation counts |
| Blocking             | Thread State Trace / scheduling inspection                                     | Investigate waits when stalled without substantial CPU; do not assume arithmetic is the cause                                      |
| Display / hitches    | Physical iPhone Release, Animation Hitches; Core Animation FPS where supported | Commit vs render hitches, duration/ratio and available display cadence; average FPS alone is insufficient                          |
| Own operation timing | Native OSSignposter; JS User Timing                                            | Bounded run/sequence markers and intervals; align clocks before computing cross-layer latency                                      |
| Field trends         | MetricKit / Organizer                                                          | Aggregated production trends, not the immediate local A/B experiment                                                               |

Use the exact task-owned target. A template appearing in `list templates` does not prove support
on that device. Probe support, retain errors and name unavailable metrics. Do not silently
substitute JS rAF for a failed native instrument. React profiling is disabled in ordinary
production builds; a missing hook is not zero cost. Check runtime capabilities rather than
assuming inspector commands or performance entry types work on every version.

```sh
xcrun xctrace list templates
xcrun xctrace list devices
xcrun xctrace record --template 'Time Profiler' --device '<owned-device>' \
  --attach '<exact-app-pid>' --time-limit 25s --output '<unique-run>.trace'
xcrun xctrace record --template 'Animation Hitches' --device '<physical-device>' \
  --attach '<exact-app-pid>' --time-limit 25s --output '<unique-run>-hitches.trace'
xcrun xctrace export --input '<unique-run>.trace' --toc --output '<unique-run>.toc.xml'
```

Resolve placeholders from the verified running app. Inspect the exported table of contents
before choosing schemas/XPath; keep raw traces private. Tool availability depends on Xcode,
OS and hardware. See [RN DevTools](https://reactnative.dev/docs/react-native-devtools),
[React Profiler](https://react.dev/reference/react/Profiler),
[Apple CPU profiling](https://developer.apple.com/videos/play/wwdc2025/308/) and
[OSSignposter](https://developer.apple.com/documentation/os/ossignposter).

### Measurement overhead and helper limitations

Do not log, allocate unbounded objects, bridge to JS or change list heights every frame merely
to measure performance. Use bounded native buffers and flush after the scenario when probes
are necessary. Check probe-on/off overhead and keep instrumentation identical across A/B.
CADisplayLink timestamps describe callbacks/deadlines; they do not prove every frame was presented.

`apps/mobile/scripts/rn-profile.mjs` is diagnostic scaffolding, not a Release FPS gate. Its current
React-hook requirement can prevent production-JS capture; its `frames` are JS rAF timestamps,
`droppedFrames` assumes 60 Hz, and `selfMs` accumulates `selfBaseDuration`, not current-update
self CPU time. Audit sampling attribution and overhead before quantitative use. Do not label
these fields native FPS, exact per-frame cost or measured display drops. Prefer supported
DevTools exports or a validated sampling-only path when the React hook is unavailable.

## Matched physical-device A/B acceptance

- Freeze the data, gestures, scenario window, settings and dependencies. Warm each binary the
  same way; alternate **A/B/B/A/A/B**, yielding at least three valid runs per version. Record
  thermal/power conditions; keep other builds and competing profiling off the measurement host.
- Capture CPU and display traces in controlled runs. Record visual evidence separately, or keep
  recording conditions identical and disclose overhead. Keep Debug/Simulator diagnostic results
  separate from physical Release results; do not pool them.
- Report median and spread, valid/invalid run counts and raw evidence links. Include native
  hitch count/total/ratio/maximum and available frame interval distribution; CPU/GC, layout
  intervals, React metrics (profiling condition only), producer lag and visible latency remain
  separate columns with units and measurement definitions. Do not invent unavailable metrics.
- Preserve correctness: reading anchor, no blank gaps, draft/caret, interactive keyboard dismissal,
  scroll/stream concurrency, completion/cancellation and reduced motion. For affected UI, include
  actual default/intermediate/maximum Dynamic Type and light/dark checks; record exact settings.
  A faster run with missing content, a lost draft or unwanted scroll fails.
- Apply the existing product budgets without silently relaxing them. State regression tolerances
  before comparing runs; raising a budget needs Human approval under the parent AX policy.
  An improvement with an unmet product target is not full acceptance.

## Required evidence and handoff

Index raw profiles, traces, producer logs, screenshots and videos under the main checkout's
`.humanlayer/tasks/<task>/`, following [QA evidence](qa-evidence.md). Record device model/OS,
source/build identities, symbols/maps, replay hash, settings, tool versions, capture conditions,
metric definitions, valid/invalid runs and before/after results. Keep secrets and message text
out of instrumentation. Publish only reviewed, authorized derivatives; never raw private traces.

The issue/PR reports **Simulator**, **physical Release**, and **Human QA** independently as
PASS / FAIL / UNTESTED, with INVALID samples listed separately. Source tests, CI, Web evidence
and a video do not replace native performance acceptance. Restore changed settings, revoke only
test-owned pairings and release only owned resources; preserve the evidence and unresolved failures.
