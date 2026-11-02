# Motion

Every move answers to Disney's principles. The kit (`kit/motion.js`) turns each one into a helper so nobody hand-tunes easing per element.

| Principle | Helper | What it does / defaults |
| --- | --- | --- |
| Follow-through and overlap | `sprS(s, z, f)` | Damped spring step response after `s` seconds. `z` 0.5–0.62 overshoots once and settles; `f` 1.5–2.4 Hz. The default for anything that arrives. |
| Anticipation | `go(t, a, { ant, ta, z, f })` | Pulls back `ant` (0.04–0.12) over `ta` (0.14–0.22 s) before `a`, then springs. Use for big moves: letters spreading, cards morphing to the grid, logo shrinking to the end card. |
| Squash and stretch | `popS`, `drop`, `moveFx` | `popS` lets y lead x so a pop stretches growing and squashes settling. `drop` falls with gravity and squashes on landing. `moveFx(e, t, P)` stretches along the velocity and leans into horizontal speed automatically. |
| Arcs | `arc(p, ax, ay, bx, by, bend)`, Bézier paths | Nothing travels in a straight line: stickers, cursors, flyers bow sideways. |
| Slow in / slow out | `eIn`, `eOut`, `eIO`, `ioq` | Camera pans and pushes use `eIO`; exits accelerate (`eIn`), entrances decelerate. |
| Staging | camera layers, dimming | One subject at a time: focus a bento card and drop the others to 0.3 opacity; titles leave while the camera is close. |
| Staggering (overlapping action) | `stag(items, t, a, gap, f)` | Letters 0.035–0.07 s apart, cards 0.07–0.08 s, rows 0.24–0.42 s. |
| Exaggeration | overshoot, `flash(at, d, peak)` | A white flash (≤ 0.55 peak) on the drop, on a scene that bursts in, at 100%. Deduped by time. |
| Secondary action | `bob(t, ph, amp, hz)`, live card demos | Held elements keep floating (amp 2–6 px, 0.3–0.5 Hz); cards perform a tiny demo when focused. |
| Exits | `outS(t, a, d)` | A small swell, then accelerate away (anticipation for leaving). |
| Timing | `T(bar)`, `TB(beat)` | Every start time sits on the beat grid. |

## Recipes

- **Entrance:** `pop(e, t, at, { r: ±4..12, z: 0.42–0.5 })` for stickers and chips; `rise(e, t, at, { dy: 20–120 })` for text and panels; `drop` for letters and the logo.
- **Typing:** type with a blinking caret at 9–17 characters/s, a `tick` cue every one or two characters.
- **Camera:** put content in a `cam` layer and drive `translate(960 − cx·z, 540 − cy·z) scale(z)`. Interpolate zoom in log space. Advance between targets with a sum of springs (`c(t) = −1 + Σ sprS(t − tsₖ)`), so every stop overshoots slightly and settles; add `blur` proportional to speed above ~900 px/s.
- **Scene transitions** (`tin` / `tout` in `S()`):
  - `zoom`: zoom out of one scene and into the next; good after a title.
  - `push`: slide in a direction; good between chapters.
  - `iris`: a circle opening at a point.
  - `expand`: grow from a card's rect, with a color crossfade.
  - `fade`: 0.3–0.6 s; use it when the zoom would show black edges around a light scene.
- **Velocity readouts** (`dv(f, t)`) drive stretch, motion blur and trail length; never hard-code them.
- **Counters:** count up with `eOut(prog(...), 3)` over about 1.2 s.

## Determinism rules

- All motion is a pure function of `t`. No `requestAnimationFrame`, no CSS transitions or keyframes; `buildAll` injects a no-transition style into iframes.
- `fx()` owns `transform`, `opacity` and `display` on the element it touches. It sets `display: ''`, so an element that needs `display: flex` must wrap its flex content in an inner element.
- `cue(key, t, type, gain)` registers a sound once per key: `whoosh`, `swish`, `click`, `pop` or `tick`. Call it inside `draw` with a stable key.
