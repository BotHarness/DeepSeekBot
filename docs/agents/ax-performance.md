# Performance observation and verification (AX)

Performance is a behavior: a change can be correct and still make the app slow, hot or janky.
This spec says when an agent must observe and verify performance, what to measure, what counts
as evidence, and how a regression is caught before it ships. It exists because idle CPU in Bot
mode regressed unnoticed until a Human reported it ([#2413](https://github.com/BotHarness/DeepSeekBot/issues/2413)).

## When it applies

Measure performance before claiming a change is done when it touches any of these:

- the conversation timeline, message rendering, the composer, or anything that renders while a
  Channel is open (`packages/client/src/client/`);
- a subscription, observer, timer, animation or polling loop that stays alive while the app idles;
- list rendering, virtualization, scroll anchoring or measurement;
- a dependency upgrade of React, the router, the style system or the markdown renderer;
- a report that the app is slow, hot, laggy, or drains battery.

Pure Host, CLI or docs changes are exempt unless they change what the Client renders.

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
