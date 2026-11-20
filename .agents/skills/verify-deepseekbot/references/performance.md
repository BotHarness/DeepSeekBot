# Measuring timeline performance

Use this when a change touches the conversation timeline, the composer, message rendering, or
anything that re-renders while a Channel is open, and when a report says Bot mode is slow, hot
or laggy. A unit test cannot show that a render is cheap; measure the real Client on a real Host
and keep the numbers.

## Run

```bash
node scripts/verify-app.mjs launch --name perf
BH_E2E_INSTANCE=.humanlayer/verify/perf/instance.json \
  node scripts/perf-idle-timeline.mjs --messages 600 --label main --profile
```

The first run seeds a Group with three Bots in `silent` wake mode, one Human check-in every five
messages and Bot replies through the direct `bot_send_message` tool (no model). Bodies mix lists,
code blocks, tables, links and CJK text. The Group id and message ids land in
`.humanlayer/perf/idle-timeline/fixture.json`; pass `--fixture <file>` to reuse it, which keeps
an A/B pair on identical data and skips the slow seeding.

The script then opens the Group in Bot mode, scrolls to the top until the whole history is
mounted (`--no-load-all` keeps only the opening window), waits three seconds and measures:

| Field | Meaning |
| --- | --- |
| `mainThreadBusyPct` | CDP `TaskDuration` over the idle window, as a share of wall time |
| `scriptMs`, `layoutMs`, `recalcStyleMs` | Where idle main-thread time went |
| `styleRecalcs` | ~60 per second means something re-styles every frame |
| `nodes`, `mountedMessages` | DOM size; cost per frame and per render scales with it |
| `loadedMessages` | Messages the Client holds (`data-loaded-messages` on the chat body); with `--load-all` it equals the fixture size |
| `timelineGaps` | Spacer divs standing in for far message groups. With the whole history loaded and the view at the latest message, `mountedMessages` stays near one or two viewports' worth |
| `scroll` | `--scroll-check` (default with `--load-all`): steps one viewport at a time from the latest message to the top. `jumps`/`maxJumpPx` count steps where the same visible message moved by more than 1px after the scroll settled; `gapsInView`/`emptyInView` count gaps intersecting the view or blocks with zero height. All four must be 0 |
| `typing.p50/p95/max` | Percentiles over the Event Timing entries (`keydown`, `keypress`, `input`, `keyup`) of at least 16 ms recorded while typing 43 characters; each entry runs from the input to the next paint. Entries under 16 ms are not recorded, and one key yields several entries |
| `typing.scriptMs` | Script time spent while typing; a high value means each key re-renders far too much |
| `idleHottest`, `typing.hottest` | Top self-time functions from the CPU profile (`--profile`) |

`--animate` adds one small infinite CSS animation (a `transform` bob; on these runs it still caused about 60 main-thread style recalculations per second), standing in for Tob, a working indicator or a
speaking avatar. With it on, any per-frame cost that scales with the DOM becomes visible. Run
both variants: users nearly always have something animating.

`--trace` saves a Chrome trace of the idle window; open it in DevTools → Performance to see
Paint, Layerize and style work per frame. Profiles are `<label>.idle.cpuprofile` and
`<label>.typing.cpuprofile`; open them in DevTools or summarize callers with a short script.

## Budget

`--budget scripts/perf-budgets/timeline.json` checks the summary against the committed budget,
prints one `ok`/`FAIL`/`warn` line per rule on stderr, writes `<label>.budget.json`, and exits 1
when a structure budget fails. Timing budgets warn unless `--strict-timing` is set. The budget
needs the scroll check and the whole history loaded, so keep the defaults. CI runs the same
command in the `perf-budget` job; see
[performance observation and verification](../../../../docs/agents/ax-performance.md).

## A/B protocol

1. Seed once on main and keep `fixture.json`.
2. Build the Client for each side (`pnpm exec tsdown --config tsdown.client.config.ts
   --config-loader unrun` is enough for Client-only changes), reload nothing by hand: every run
   opens a fresh browser.
3. Keep runs short and bounded (a cold open, or `--distance` of a few thousand pixels). Long
   recordings drift with heat and memory pressure, and they have frozen phones and Macs. Start
   with one interleaved A/B pair, using distinct labels (`main-idle-1`, `fix-anim-1`, ...). A
   big win shows in that one pair, so take the big wins first. Repeat runs and report the median
   and spread only when chasing a small difference, or when one pair disagrees with the profile.
4. Put the table and the commit SHAs in the PR. Keep raw JSON and profiles under
   `.humanlayer/perf/` (ignored by Git); do not commit traces.

## Scroll smoothness

`scripts/perf-timeline-scroll.mjs` measures the scroll itself, which the idle run does not. It
reuses the idle run's `fixture.json`, mounts and visits the whole history, then sends trusted
CDP wheel input (120 px per tick, one tick per ~16 ms) up and back down `--distance` pixels and
reports the CDP main-thread totals over the scroll (`taskMs`, `recalcStyleMs`, `styleRecalcs`),
rAF interval percentiles, the share of frames over 8.3, 16.7 and 25 ms and Long Animation
Frames. Add `--uncapped` to lift the vsync cap: each rAF interval then is the time the page
needed for that frame, which is what the 8.3 ms (120 Hz) and 16.7 ms (60 Hz) budgets mean;
a capped run cannot show a frame under one vsync. `--mode
cold` instead opens the Group and wheels up to the first message while older pages load.
`--geometry` adds gap and anchor-jump checks on every painted frame; they read layout, so keep
them out of timing runs. A jump is a message that moved by neither the `scrollTop` change nor a
whole number of wheel steps, so Chromium's scroll-anchoring corrections for height changes above
the view do not count. Run it headed under Xvfb (`xvfb-run -a node scripts/perf-timeline-scroll.mjs
--headed ...`) for real compositor frames, and launch the Host with
`BOTHARNESS_CLIENT_DIAGNOSTICS=0` so the development-only shell observer does not add layout
reads that users never run.

## Finding the hot path

A profile shows where time went in one run; it does not show how often a path runs or how much
it amplifies. Two cheap probes answer that before any rewrite:

- **Count.** Add a temporary counter or `console.log` at the suspected entry points (a render,
  a ref callback, a scroll handler, an observer callback) and print the totals per frame or per
  scroll. A path that runs 50 times per frame, or once per message instead of once per scroll,
  is the target even when each call looks cheap.
- **Inject a delay.** Add a short busy-wait (for example 1 ms) to one path at a time and rerun
  the same bounded scroll. The path whose delay multiplies the most into frame time is the hot
  path, and the multiplier is its call count per frame.

Remove both before committing, and confirm the fix with one A/B pair.

## Reading a profile

- A hot `MessageGroupView`, `ConversationView` or React reconciler frames during typing mean
  the timeline re-renders on each key. Look for a new array, Map, Set, object or inline callback
  passed to a memoized child, or a context value rebuilt on every render.
- `renderedBackground`, `getComputedStyle` or `getBoundingClientRect` under a render or a
  MutationObserver callback mean forced style or layout per message.
- `(garbage collector)` near the top means allocation churn: per-render copies of message
  arrays or formatter construction.

## Gotchas

- Headless Chromium does not run the desktop-only paths (`dsh-app://app` window zoom and its
  tooltip observer). A clean headless result does not clear a desktop report; say which paths
  ran.
- Far message groups are not mounted: `timeline-window.ts` renders each of them as its own
  `.bh-timeline-slot.bh-timeline-gap` placeholder with that group's measured height. A group
  that was never measured renders, and so do the focus target and the group carrying the unread
  divider, so `scrollIntoView` and anchors keep working. Spacing between groups is padding on
  `[data-follows]`, not margin, so a measured height includes it and a placeholder matches
  exactly.
  The near range updates synchronously in the native scroll listener, before React's
  `onScroll`, so the read mark never sees a gap in view after a large drag.
- Giving an older page estimated heights and mounting its groups only as they come into range
  cut the per-page long frame from about 200 ms to about 120 ms and total blocking from 1.3 s to
  0.6 s. However, frames over 16.7 ms rose from about 1% to about 7%. Each estimate is corrected
  on the scroll path, so the cost moves into the steady scroll. Mounting a few groups per frame in
  the background instead gave 4× more frames over 50 ms. Neither shipped. Rendering an older
  page through `useDeferredValue` starved: the scroll listener's `flushSync` restarts the
  background render every frame, so the page never committed and loading stopped at 150
  messages.
- Style cost scales with the elements a mounted group adds, at roughly 15–20 µs each, and not
  with selector matching (selector stats put matching under 5% of style time). Per-element
  ablation in the page (clone a few mounted slots, insert them, time `offsetHeight`, repeat with
  one part removed) finds the expensive parts quickly. The hidden hover toolbar was a third of
  every bubble's elements, so it mounts on the first `pointermove` over its bubble (not
  `pointerenter`, which fires for every bubble that scrolls under a still cursor), or for every
  bubble once Tab is pressed.
- Earlier attempts with `content-visibility` failed on real runs: a skipped flex item shrinks to
  0 without `flex-shrink: 0`, `contain-intrinsic-size: auto` reports 0 before first paint, and
  `content-visibility: auto` registers an internal IntersectionObserver recomputed every frame.
- `IntersectionObserverController::computeIntersections` high in a trace means too many observed
  targets: every target is recomputed each frame while anything animates.
- A whole-document `UpdateLayoutTree` (element count near the page's node count) after every
  DOM insertion points at a `:has()` rule whose anchor is left of a combinator and whose subject
  has no class, id or attribute (`A:has(B) > div`, `:root:has(X) .y`, `html:has(X) body > :not(#root)`).
  Chromium cannot narrow its invalidation and restyles the page; with ~8k rules that was ~15 ms
  per insertion. Put `:has()` on the subject, use sibling combinators, or have script set an
  attribute on the anchor. `test/has-invalidation.test.ts` rejects the pattern in the Client CSS;
  `has-sibling-rewrite.ts` rewrites the `:has(> X) > S` shape in DSH's own sheets at runtime.
- A recalc that touches every mounted timeline element (or every placeholder) after a mount
  means sibling invalidation. Chromium schedules a sibling rule for an inserted child as a
  descendant invalidation on the parent, so a universal sibling rule anywhere in the page
  (`.x > * + *`, `div + div`, `:not(...) ~ :not(...)`) restyles the parent's whole subtree, and a
  `:has(~ X)` whose subject can match the list items re-matches every sibling. The timeline
  therefore keeps one fixed slot per message group, inside chunks of 32 slots: mounting only
  inserts into that slot, and no sibling list is longer than a chunk. Keep it that way, and keep
  `:has(~ ...)` subjects off `.bh-timeline-slot`.
- When style recalculation is a large share of a scroll, record a trace with the
  `disabled-by-default-blink.debug` category and sum the `SelectorStats` events per selector
  (`elapsed (us)`, `match_attempts`, `fast_reject_count`). The costly rules try every element and
  have no fast rejects: Chromium's ancestor filter skips a rule only through classes, ids, tags or
  attribute names in plain compounds to the left of a descendant or child combinator. A `:is()`
  in that position, an attribute name that many ancestors carry (`data-slot`), or a universal
  subject with `:has()` defeats it. Split `:is(A, B) X` into `A X, B X`, and scope a `:has()`
  subject under a specific ancestor. `has-sibling-rewrite.ts` splits DSH's leading `:is()` lists.
- A `MutationObserver` on `document.body` with `subtree: true` runs on every timeline mount. Skip
  records inside the timeline with `outsideTimeline` from `timeline-mutations.ts`.
- Before blaming an animation, run `document.getAnimations()` in the page; it lists what runs.
- Summarize a trace by thread and event name before guessing; most idle cost is native (style,
  intersections, commit), not JavaScript, and does not show in a CPU profile.
- Seeding 600 messages takes about two minutes. Reuse the fixture.
- Stop the Host with `verify-app stop` when done; see resource cleanup in the skill.
