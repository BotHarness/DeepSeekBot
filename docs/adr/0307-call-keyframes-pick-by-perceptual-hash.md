# ADR-0307: Call keyframes are picked by perceptual hash, with a local check on screens

- Status: Accepted (VC8)
- Date: 2026-11-09
- Issue: #3499 (spec #3490, hub #3491; amends the keyframe picker of ADR-0286)

## Context

ADR-0286 picks call keyframes on the client with one number: the mean absolute difference of a grey thumbnail (64 px wide for the camera, 128 px for a screen) against the last keyframe, with starting thresholds (camera 0.08, screen 0.004) left for VC8 to tune. VC8 asked for six end-to-end cases judged automatically, a comparison of the grayscale pixel difference with a perceptual hash, and the chosen defaults recorded here.

`scripts/call-keyframe-eval.mjs` renders the six cases as 2 fps JPEG sequences with known ground truth for every sample (which page, screen, window, shot or held object it shows, and whether it is mid-scroll), so a keyframe can be judged without a person:

| Case    | Source | Length | Expected keyframes                                                                        |
| ------- | ------ | ------ | ----------------------------------------------------------------------------------------- |
| reading | screen | 45 s   | one per page and one after a single typed line; a blinking cursor sends nothing           |
| scroll  | screen | 29 s   | one per screen of code (6), none caught mid-scroll                                        |
| windows | screen | 25 s   | one per window (5)                                                                        |
| movie   | screen | 30 s   | one per shot (5), shots panning slowly                                                    |
| camera  | camera | 23 s   | one or two per held object or hand sign (5), with sensor noise, jitter and exposure drift |
| silence | camera | 300 s  | one or two per change (a card, leaving the frame, another card), nothing for noise        |

Each case ends with a typed question during the call (the scroll case asks for line 137, readable only by zooming with `call_frame`), and the live run judges the Bot's spoken answer by keywords, in order where order matters.

Measured on the generated cases (`--compare`; cases passed per source):

| Metric                       | Screen (4 cases)                                                         | Camera (2 cases)                                                     |
| ---------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Pixel diff 0.002–0.004       | 2/4: misses the typed line (0.0013 of the frame); a panning shot sends 2 | —                                                                    |
| Pixel diff 0.008–0.016       | 1–2/4: also misses scrolled screens of similar code                      | —                                                                    |
| Pixel diff 0.02–0.03         | —                                                                        | 2/2, but the noise floor of a still camera already reaches 0.015     |
| Pixel diff 0.04–0.08 (old)   | —                                                                        | 0–1/2: misses an apple, an open palm and the Human leaving the frame |
| pHash 0.1                    | 3/4: one per shot, scroll, page and window; misses the typed line        | 2/2 (pHash 0.1–0.16), noise and drift stay at 0–0.03                 |
| pHash 0.1 + detail 0.01–0.02 | 4/4                                                                      | —                                                                    |

No pixel threshold passes all screen cases: a typed line changes 0.13% of the thumbnail while a slow pan in one film shot changes 2–3%, so a threshold low enough for the line sends extra frames for every moving picture. A perceptual hash compares structure (the signs of the 63 lowest DCT coefficients of a 32×32 shrink), so a pan, noise or a brightness change barely moves it while a cut, scroll, page turn or window switch flips 15–50% of its bits. It cannot see one new line of text, so screens add a local check.

## Decision

**Perceptual hash first.** `keyframes.ts` gains `metric: 'phash'` (with `'pixel'` kept for comparison) and computes the hash from the same grey thumbnail every client already makes, so the iPhone, Android, desktop and Web pickers and `call-simulate` change together without native work. The score against the last keyframe and the motion between samples are Hamming distances over 63 bits.

**A local detail check on screens.** When the hash has not changed, a screen also compares the thumbnail in an 8×8 grid of blocks and takes the largest block's mean difference. A block change of at least 0.015 sends a keyframe only after the picture has held still (block motion at most 0.004) for the screen's 400 ms, so typing, a highlight or a toast settles into one keyframe, and continuous motion such as a film never takes this path. A blinking cursor stays near 0.003. The detail check has no maximum wait.

**Defaults.**

| Source | Metric | Threshold | Stillness | Settle | Max wait | Detail (threshold / stillness) |
| ------ | ------ | --------- | --------- | ------ | -------- | ------------------------------ |
| camera | phash  | 0.12      | 0.04      | 0 ms   | 1.5 s    | none                           |
| screen | phash  | 0.10      | 0.04      | 400 ms | 2 s      | 0.015 / 0.004                  |

The thresholds sit in the middle of the passing ranges (camera 0.1–0.16, screen hash 0.1–0.16 with detail 0.01–0.02). Sample rate, thumbnail widths and the Host side (grids, harvest, frame limits) do not change.

**One command.** `node scripts/call-keyframe-eval.mjs` generates the cases and judges the picker with the shipped defaults; `--compare` adds the sweep above; `--bot <id>` runs each case through `deepseekbot call-simulate --screen/--video` on an isolated Host and reports keyframes, uplink bytes, grid layouts and compose time, the time from the grid to the first reply audio, `call_frame` zooms, dropped keyframes and the judged answer, and saves every grid. `--stub-voice` binds a local stand-in ASR and TTS endpoint so the run needs only the model credential. Scene evaluation uses the newest DeepSeek model, `opencode-go/deepseek-v4.1-flash`, which accepts images.

## Consequences

Screens send fewer frames while video plays and catch small edits they used to miss; the camera ignores the noise and exposure drift that the old threshold sat close to, and catches objects held up and the Human leaving the frame. Hashing adds a 32×32 shrink and a partial DCT per sample: on Node a screen sample takes 0.09 ms instead of 0.05 ms and a camera sample 0.05 ms instead of 0.01 ms, at 2 samples per second. Reported `score` values are now Hamming fractions (or the block difference for a detail keyframe), not mean pixel differences. The generated cases are clean drawings; real camera footage, dark rooms and very small fonts still need device QA, and the eval accepts a recorded video folder in place of a generated one only through `call-simulate` directly. Selecting frames by what the Human says (ASR relevance) stays out of scope, as decided on 2026-11-04.
