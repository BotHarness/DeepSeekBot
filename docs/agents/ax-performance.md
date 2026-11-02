# Performance observation and verification (AX)

Performance is a behavior: a change can be correct and still make the app slow, hot or janky.
This spec says when an agent must observe and verify performance, what to measure, what counts
as evidence, and how a regression is caught before it ships. It exists because idle CPU in Bot
mode regressed unnoticed until a Human reported it ([#2413](https://github.com/BotHarness/DeepSeekBot/issues/2413)).

## When it applies

Every new feature or dependency introduction must assess performance impact before implementation:
identify the user journey, affected hot path, expected scale/concurrency and a measurable budget.
Measure that path before claiming the change is done. Existing behavior changes also require
measurement when they touch any of these:

- the conversation timeline, message rendering, the composer, or anything that renders while a
  Channel is open (`packages/client/src/client/`);
- a subscription, observer, timer, animation or polling loop that stays alive while the app idles;
- list rendering, virtualization, scroll anchoring or measurement;
- a dependency upgrade of React, the router, the style system or the markdown renderer;
- a report that the app is slow, hot, laggy, or drains battery.

Host and CLI features measure their own latency, allocations/peak memory, I/O or concurrency as
applicable; they do not need an unrelated browser test. Docs-only or genuinely non-runtime changes
may record a reasoned no-runtime-impact exemption. A new surface without a prior implementation
compares the existing surrounding journey before/after and separately budgets the added work;
an empty/no-op implementation is not a substitute for the existing-journey baseline.

## Platform routing

For native iOS, follow [iOS performance tuning and physical-device verification](ios-performance.md).
It owns native capture, valid replay, physical Release A/B and evidence requirements. The Chromium
scripts, DOM counters and Web budgets below apply to Web; they do not qualify native mobile.
Native rendering, keyboard, streaming, animation and CPU changes are in scope too.

## Observe before changing

Do not guess at a cause. Collect evidence first, in this order:

1. **Reproduce with numbers.** Run `scripts/perf-idle-timeline.mjs` on a task-owned Host
   ([the performance guide](../../.agents/skills/verify-deepseekbot/references/performance.md)).
   Run with and without `--animate`: users nearly always have something animating.
2. **Find where the time goes.** `--profile` lists the hottest JavaScript functions; `--trace`
   saves a Chrome trace. Summarize a trace by thread and event name: most idle cost is native
   (style, layout, intersection observers, paint, GC) and does not show in a CPU profile.
3. **Check what is running.** `document.getAnimations()` lists running animations;
   `nodes` and `mountedMessages` show DOM size; `styleRecalcs` near 60 per second means
   something re-styles every frame.
4. **State the cause with its evidence** (the trace event, the profile frame, the count) before
   writing a fix. A hypothesis without a measurement is not a cause.

## Isolate the cause with controlled ablations

Use component ablation (not Git history bisect) when a profile leaves several plausible causes:

1. Freeze the source and runtime artifacts, fixture, preferences, viewport and input sequence.
   Write the hypothesis and the measured interval before running. Keep profiled diagnosis runs
   separate from unprofiled timing runs.
2. Compare the unchanged control, suspect A disabled, suspect B disabled and both disabled when
   interaction is plausible: for example avatars, Markdown and their combination. Then narrow
   Markdown into parsing, React reconciliation, code highlighting, styling and layout, or narrow
   a list into window updates, geometry measurement and rendering. Change one variable per
   narrower contrast; do not replace several layers and attribute the result to one package.
3. Preserve message text/count/order, outer geometry, loaded window and workload. If a diagnostic
   needs pinned heights, record calibration and clipping/overflow, use the same pins in every arm,
   and verify geometry. Plain text, all-mounted windows and inert DOM are diagnostic controls,
   not product fixes. A reduced fixture or missing work cannot establish a performance win.
4. Run at least three interleaved trials per arm; record each trial's work counts, errors and
   geometry. Report the median and range, pairing/order and source hashes. Keep failed attempts
   and outliers; do not pool incompatible protocols. State why any run is excluded.
5. Confirm the narrower cause with its call stack/trace and a focused control. Effects need not
   add: do not sum percentage improvements across ablations or different source pairs. A faster
   diagnostic that changes semantics is not adoption evidence.

## A/B protocol for features and package selection

- Freeze exact dependency versions/lockfiles, loaded bundle hashes, Host source, fixture digest,
  build mode, cache state, hardware/display/browser and viewport. Reuse canonical data rather
  than independently reseeding; keep machine load and competing services in the evidence.
- Alternate or counterbalance base/change, at least three runs per side. Use at least five per
  side when choosing a package. Separate cold initialization, warm reuse and streaming updates;
  do not hide lazy grammar compilation, worker startup or deferred work outside the measured
  user wait. Await completed work and verify the output, not only that a function returned.
- For Markdown, compare equivalent features and safety: GFM, math, code language/highlighting,
  links/files/images, copy/navigation and untrusted-content policy. Measure parser, renderer and
  highlighter separately, then the real integrated journey. Vendor parser throughput or an
  unhighlighted renderer cannot establish a win over a fully featured native renderer.
- Include ordinary multi-Bot history, heavy unread, repeated switching, pagination, long Markdown
  and simultaneous streaming/typing where applicable. Check bounded initial loading and first
  readable/interactive time, not just response time or the eventual mounted count. Stress-only
  huge documents supplement, rather than replace, ordinary conversations.
- For scroll acceptance, use trusted/native input in a foreground headed browser at normal VSync
  on the actual display; record direction, distance, speed and settling rule. Target 60 Hz without
  dropped updates first when 120 Hz hardware is unavailable. Uncapping Chrome does not create a
  120 Hz display. Report rAF intervals, long tasks and compositor evidence as distinct metrics:
  rAF is not physical presentation, and a partial-update DroppedFrame is not necessarily a blank
  physical frame. An opening deadline (such as 1500 ms) does not relax a frame-time budget.
- Check visible gaps/jumps during motion as well as settled anchors after momentum stops; a
  post-gesture sample before settling cannot diagnose anchor drift. Record console errors,
  message fidelity, read/unread anchors and input responsiveness. Never trade correctness for
  speed or claim browser results as installed Desktop, native mobile or Human acceptance.
- Preserve raw per-run JSON and separate traces, report median/range and absolute units, and
  call overlapping/noisy or feature-mismatched comparisons inconclusive. For every micro result,
  identify its share of the user journey; validate the end-to-end effect before claiming it.
- Add a deterministic regression test/structure budget and a reproducible runtime replay for the
  affected path; keep timing gates hardware-aware. A documented procedure alone is not CI
  enforcement. Follow [resource cleanup](ax-resource-cleanup.md) on success and failure.

## Verify the change

- **A/B on identical data.** Seed once, keep `fixture.json`, build each side, run each side at
  least three times. Report the median and the spread, never a single run.
- **Correctness is part of performance.** A faster timeline that jumps, shows blank space, or
  loses the read position is a regression. The scroll check (`jumps`, `gapsInView`,
  `emptyInView` all 0) and `scripts/e2e-timeline-navigation.mjs` must pass.
- **Run the budget.** `--budget scripts/perf-budgets/timeline.json` must pass. Add
  `--strict-timing` on a quiet machine to fail on timing budgets too.
- **Say what did not run.** Headless Chromium does not cover the desktop shell paths or native
  mobile; name them as not verified.

## Evidence in the pull request

A pull request that falls under this spec includes, under Verification:

- a table with base and change side by side: `mountedMessages`, `nodes`, `heapMB`,
  `mainThreadBusyPct` (idle and `--animate`), `typing.p95`, and the scroll check;
- the commit SHAs measured, the fixture size, the viewport and the number of runs;
- the budget result, and any budget you changed with the reason.

Keep raw JSON, profiles and traces under `.humanlayer/perf/` (ignored by Git). Do not commit
traces.

## Regression guard

[`scripts/perf-budgets/timeline.json`](../../scripts/perf-budgets/timeline.json) holds the
budgets. Each rule names a metric, a limit, a kind and why it exists:

- **structure** budgets are deterministic for a fixture (mounted messages, DOM nodes, heap,
  scroll jumps, blank gaps, page errors, full history loaded). They fail the build.
- **timing** budgets (`mainThreadBusyPct`, `typing.p95`) depend on the machine. CI reports them
  as warnings; local runs enforce them with `--strict-timing`.

The `perf-budget` CI job runs the budget on every pull request that changes Client source or
the performance tooling, and on every full run ([CI test plan](development-scripts.md#ci-test-plan)).
A pre-virtualization build fails it on four structure budgets (600 mounted messages, about
187k nodes, 90 MB heap, no timeline gaps).

Budgets only tighten. When a change improves a metric for good, lower its limit in the same pull
request. Raising a limit needs the Human's approval in the pull request, with the measurement
and the reason; never raise a limit to make a failing run pass.

## Add a budget for a new surface

When a new surface can regress the same way (a long list, a live-updating panel, an animation),
extend the measurement script or add one beside it, give it a budget file under
`scripts/perf-budgets/`, cover the checker with a test, and wire it into the CI plan the same
way. A metric without a budget is observation only; it does not guard anything.
