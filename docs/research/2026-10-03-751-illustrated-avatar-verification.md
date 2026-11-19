# Illustrated Avatar first-slice verification

Scope: [#751](https://github.com/BotHarness/BotHarness/issues/751), under
[spec #748](https://github.com/BotHarness/BotHarness/issues/748) and
[ADR-0118](../decisions/bots.md#adr-0118).
Implementation reviewed at `23e37c93745ddf1cfe0eb57b6c425c6e0cee5477`, based on
`db6f1bb3ccee4b491ef8bc1e1ce68a1bbbfb068b`. Follow-up commits add verification
coverage and evidence; the first Human visual acceptance is pending.

## Observable path

The real isolated DSH 0.2.0 RC1 Profile offered two face shapes, three hairstyles,
optional glasses and three color controls. An unsaved bob/glasses draft did not
reach the Host. Cancel restored the committed choice. Explicit Save stored the
long-face/sweep/glasses recipe and its Host-derived PNG together.

Authenticated re-read returned the recipe/revision and the existing snapshot URL,
without embedding raster bytes. Sidebar and the 160px Profile preview had identical
SVG contents after a browser reload. Fresh Registry coverage independently checked
the same durable record and exact served PNG bytes.

Real model Turns created owned Assignment Sessions through an existing Workspace
Grant. One native `bash` call executed a 75-second wait and returned
`AVATAR_ASSIGNMENT_READY`; another owned Assignment's native approval remained
pending. Both sidebar and large Profile showed `working` / `executing` with an
independent approval count of one. Rejecting the other request cleared the count.
No historical approval resurrected after Host restart: a new Projection generation
read the same appearance revision and zero pending approvals.

An earlier approved Orchestrator Shell call was refused by the native authorized
workspace guard. Its failure was retained; it is not execution proof. The actual
successful execution above used the granted Assignment seam. The development
pitfall is recorded in [dsh-dev](../../.agents/skills/dsh-dev/SKILL.md).

## Initial measurements

Chrome `153.0.8010.36`, macOS arm64, 1440×960, one Bot and four visible Avatar
instances (34px, 22px, 64px and 160px). These are initial measurements, not the
mixed-family scale acceptance reserved for #757.

| Observation                                                        | Result                                                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 119 steady requestAnimationFrame intervals during actual execution | median / p95 16.7ms                                                                      |
| Whole-page JavaScript heap sample                                  | 54.73 MiB, including native shell, charts and conversation                               |
| Saved 512×512 PNG                                                  | 22,072 decoded bytes; limit 131,072                                                      |
| Client bundle                                                      | 1,912,562 raw bytes / 502,163 gzip bytes; base build reported 1.90 MB, candidate 1.91 MB |
| Shared reduced motion                                              | zero composed-SVG animations; activity and approval facts remain visible                 |
| Offscreen Profile preview / removed editor                         | zero remaining owned pose animations                                                     |

The renderer uses local Web Animations on stable SVG nodes; frame samples cause no
Registry writes, RPC calls or SessionEvent emission. Visibility-change regression
checks cancel and resume each mounted instance independently. Both head and gaze
retarget from their displayed transforms before looping.

## Regression and review

- Full suite: 268 files passed, 2,150 tests passed, three existing skipped cases.
- Typecheck, lint, formatting, bilingual Release Ledger and DSH Skill Ledger passed.
- Focused coverage includes atomic writer refusal, invalid/version/color rejection,
  trusted DM targeting, snapshot bounds, image compatibility, Save/Cancel/failure,
  same-Bot instance isolation, hidden/reduced-motion cancellation and cleanup.
- Independent Standards and Spec reviews found one gaze transition issue; it was
  corrected and both axes reported no remaining code findings.

## Human reproduction

1. Build this branch and launch a fresh task-owned Profile using
   `node scripts/dev-instance.mjs --home <isolated-home> --port <free-port> --build`.
   Use the launcher's local login URL; keep its token and cookies private.
2. Create a PersonaBot, open its Profile, choose **Design avatar**, change parts
   and colors, then Cancel. Reopen, change a choice and Save.
3. Compare its sidebar identity with the large preview; reload, reconnect and
   restart the exact isolated Host. The saved identity must recover.
4. Authorize a dedicated QA Workspace. Ask the Bot to create two bounded
   Assignments whose native Shell commands only wait and print markers. Approve
   one call once; leave the other pending. Inspect execution and its separate
   approval count in the sidebar and Profile. Reject the remaining request and
   check that the count clears after another Host restart.
5. Exercise the shared reduced-motion preference, scroll the large preview out
   of view and close Profile. Inspect both 1440×960 and 390×844, light and dark.

Screenshots and original browser recordings are under
[`docs/assets/pr/751-avatar`](../assets/pr/751-avatar/). The PR embeds the matched
Before/After views and uploaded playable videos. Detailed editing, the abstract
family, compatibility fallback and full mixed-family scale remain #752–#757.

## Artwork redesign (2026-10-04)

Human rejected the first artwork as unattractive. A flat, outline-free portrait
followed. Human judged it still too realistic. Ink-line (Notion-Faces-like) and
pixel directions were then compared at 22/34/64/160px in both themes
([sheet](../assets/pr/751-avatar/redesign-directions.png)), and Human chose
**pixel art with a much richer part catalog** modelled on Notion Faces' many
choices.

The illustrated family is now an original 48×48 pixel portrait with a 1px ink
outline on a recipe-tinted rounded tile. The recipe selects nine parts plus
four colours:

- head (8: round, oval, square, long, heart, pointed chin, chubby, diamond)
- angle (front, left 30°, right 30°)
- hair (19, including anime long twin tails, drill twin tails, high and side
  ponytails, hime cut, twin buns and messy with ahoge)
- eyes (8)
- brows (6)
- nose (4)
- mouth (8)
- cheeks (3)
- glasses (5)
- accessory (12, including cat ears, hair clip and little horns)
- outfit (T-shirt, shirt and tie, hoodie, turtleneck, sailor collar, blazer,
  overalls)
- backdrop decoration (sparkles, hearts, stars, dots, none)
- skin, hair, eye and shirt colour

After Human judged the first pixel pass correct in direction but not yet
attractive, Picrew pixel image makers were studied for what makes them appealing.
The portrait was then redrawn on those principles (original artwork, no copied
assets):

- chibi proportions, with the face filling most of the tile
- 3×4 eyes with an iris colour, a dark lash row and a highlight
- three-tone hair (base, shadow edge, highlight band)
- hue-matched dark outlines instead of pure black

Human then supplied two direction images: a finer, softer version of this
design and a three-quarter pixel portrait. The grid moved from 32 to 48
pixels, with these refinements:

- fringes split into pointed locks with strand shading
- 5×6 eyes with glints
- softer chins
- pastel tile with optional corner decorations
- turned angles projected on a sphere, following the method in bloub: each
  eye sits at R·sin(yaw ± eye angle) and is foreshortened by cos; the jaw, nose
  and mouth follow the yaw; back hair and tails move toward the back of the
  head, so the far tail is hidden by the face; the far ear, cups and earrings
  are hidden while the near ear shows. Asymmetric hairstyles keep their side
  instead of being mirrored. Human rejected two earlier attempts, one covering
  the far cheek with hair and one keeping hair in the frontal position.

All parts are trusted catalog data rendered as merged `<rect>` runs with
`crispEdges`. There are no paths, `defs`, ids or external references.
The [catalog sheet](../assets/pr/751-avatar/redesign-catalog.png) shows every
option. The editor follows the Notion Faces pattern: a category bar, a grid of
live preview tiles, colour swatches with a custom picker, and Shuffle. Preview,
Cancel and Save stay local until Save.

Motion moves in whole pixels using `steps()` easing. Working avatars shift the
head one cell per effect. Large ones also move their gaze, swap in a closed-eye
blink frame, and show a small state mark at the corner:

- `?` while thinking
- a magnifier while searching
- a drop while coding
- `!` while executing
- `…` for generic work

An idle large avatar blinks occasionally. Waiting and blocked avatars stay
still, and small avatars move only the head. Reduced motion, hidden and
offscreen views, and unmount still cancel every owned animation.

The recipe keeps schema, asset and rig version 1, because version 1 has never
shipped; the fields now describe the pixel catalog. A development Profile that
saved an earlier illustrated recipe on this branch is rejected by the new
validator. Remove its `appearance` and `avatar` fields and save again. The QA
profile was reset this way, and every runtime step above was re-run against the
rebuilt Host:

- draft, Cancel, Save and reload
- real Assignment work with one pending native approval, in both themes
- reduced motion, plus offscreen and unmount cleanup
- narrow layouts
- a Host restart

With 4 visible instances, steady rAF p95 was 16.8ms.

## Thinking head turn

Human pointed out that bloub drives natural head turns with looping noise while
thinking. A large thinking avatar now carries four extra pre-rendered yaw
frames (±7° and ±14° around its saved angle) produced by the same sphere
projection. A looping noise schedule (three summed sines, sampled every 220ms
over 8.8s, phase varied per avatar) shows exactly one frame at a time using
discrete WAAPI opacity steps. Small avatars, reduced motion, hidden or
offscreen views and the Host snapshot do not include or play these frames. A
real model turn was recorded showing the frames and the `?` mark
(`docs/assets/pr/751-avatar/thinking.webm`).

## Name-seeded default appearance

A PersonaBot with neither a saved appearance nor a custom image now shows a
pixel portrait derived deterministically from its display name. This replaces
the Blobatar default. The create dialog previews it live as the name is typed.
Until a Human saves an appearance, renaming the Bot changes the portrait; the
editor starts from the seeded recipe. Saving persists that recipe in the
Registry, after which renaming no longer affects the portrait. Seeded recipes
always face front and avoid the palest skin and hair swatches. Real-browser QA
confirmed the preview changes for "Ada", "Grace Hopper" and "小明".
