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
| `typing.p50/p95/max` | Event Timing duration per key event while typing 43 characters, i.e. how long until the key shows on screen |
| `typing.scriptMs` | Script time spent while typing; a high value means each key re-renders far too much |
| `idleHottest`, `typing.hottest` | Top self-time functions from the CPU profile (`--profile`) |

`--animate` adds one small infinite CSS animation, standing in for Tob, a working indicator or a
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
- `content-visibility: auto` on `.bh-message-block` cut the DOM work sharply but broke opening
  at the latest message and loading older history, because the scroll-anchoring code reads real
  heights. It needs the scroll logic reworked first (#2413 follow-up).
- Seeding 600 messages takes about two minutes. Reuse the fixture.
- Stop the Host with `verify-app stop` when done; see resource cleanup in the skill.
