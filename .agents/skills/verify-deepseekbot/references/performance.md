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

## A/B protocol

1. Seed once on main and keep `fixture.json`.
2. Build the Client for each side (`pnpm exec tsdown --config tsdown.client.config.ts
   --config-loader unrun` is enough for Client-only changes), reload nothing by hand: every run
   opens a fresh browser.
3. Run each side at least three times, with and without `--animate`, using distinct labels
   (`main-idle-1`, `fix-anim-1`, ...). Report the median and the spread, not one run.
4. Put the table and the commit SHAs in the PR. Keep raw JSON and profiles under
   `.humanlayer/perf/` (ignored by Git); do not commit traces.

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
- Far message groups are not mounted: `timeline-window.ts` replaces runs of them with one
  `.bh-timeline-gap` whose height is the sum of their measured heights. A group that was never
  measured always renders, and so do the focus target and the group carrying the unread
  divider, so `scrollIntoView` and anchors keep working. Spacing between groups is padding on
  `[data-follows]`, not margin, so a measured height includes it and a gap matches exactly.
  The near range updates synchronously in the native scroll listener, before React's
  `onScroll`, so the read mark never sees a gap in view after a large drag.
- Earlier attempts with `content-visibility` failed on real runs: a skipped flex item shrinks to
  0 without `flex-shrink: 0`, `contain-intrinsic-size: auto` reports 0 before first paint, and
  `content-visibility: auto` registers an internal IntersectionObserver recomputed every frame.
- `IntersectionObserverController::computeIntersections` high in a trace means too many observed
  targets: every target is recomputed each frame while anything animates.
- Before blaming an animation, run `document.getAnimations()` in the page; it lists what runs.
- Summarize a trace by thread and event name before guessing; most idle cost is native (style,
  intersections, commit), not JavaScript, and does not show in a CPU profile.
- Seeding 600 messages takes about two minutes. Reuse the fixture.
- Stop the Host with `verify-app stop` when done; see resource cleanup in the skill.
