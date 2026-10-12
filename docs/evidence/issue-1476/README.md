# #1476 — Bot-colored usage chart with token tone levels

Task: `claude/local/37eb3a23-6854-4f76-b09d-3cfd4641e567`.
Claim: [issue comment](https://github.com/BotHarness/DeepSeekBot/issues/1476#issuecomment-6127385706).
Baseline: `bb0053c7` (main with #1471–#1474) in a separate detached checkout. Captured on
October 13, 2026 (Asia/Tokyo).

One task-owned isolated DSH Profile served both builds. Its usage comes from real replies through
the DeepSeek flash model by five current PersonaBots and three deleted ones (Ada with a hair color,
Bea with a Custom near-black, Cam with a carried fallback). Two current Bots share the name and
color of deleted ones. Headless Chromium, 1280 CSS pixels wide at 2× scale, Chinese locale; dark
theme through the `data-ds-dark-theme` body attribute. Browser evidence is not physical-device QA.

## Captures

| View                        | Before                           | After                                |
| --------------------------- | -------------------------------- | ------------------------------------ |
| Seven days, light           | [before](before-week-light.png)  | [after](after-week-light.png)        |
| Seven days, dark            | [before](before-week-dark.png)   | [after](after-week-dark.png)         |
| Today, light                | [before](before-today-light.png) | [after](after-today-light.png)       |
| Tooltip on a Bot bar        | [before](before-tooltip.png)     | [after](after-tooltip.png)           |
| Seven days at 860 px, light | not captured                     | [after](after-week-narrow-light.png) |

## Bar fills read from the page (today, light)

| Bot                                                                                                | State   | Name color         | Bar segments in drawing order                            |
| -------------------------------------------------------------------------------------------------- | ------- | ------------------ | -------------------------------------------------------- |
| Ada                                                                                                | deleted | `rgb(144, 105, 0)` | `cached #b48408` · `uncached #cdaf63` · `output #decda1` |
| Bea                                                                                                | deleted | `rgb(29, 27, 34)`  | `cached #1d1b22` · `uncached #6f6e73` · `output #a7a7aa` |
| Cam                                                                                                | deleted | `rgb(0, 126, 112)` | `cached #2d9c8e` · `uncached #79beb6` · `output #add6d1` |
| The same three rows had the same fills in the seven-day view at 860 px. The tooltip marker for the |
| first row computed to `rgb(180, 132, 8)`, the cached tone of that Bot. The daily total chart kept  |
| its token-type colors in every capture.                                                            |

## What else changed in the picture

In the baseline a row whose total is unknown had no bar and no slot, so every bar below it sat one
row too high. The chart now keeps an empty slot for such a row and the bars line up with their
names.

Not covered here: a phone-width layout (at 520 px the client shows its mobile conversation list and
the Overview was not reached), a saved color change while the chart is open (automated tests cover
re-derivation from new sources), and a physical device. In this Profile output is under 1% of each
Bot's usage, so the output tone is too thin to see in the captures; the automated chart test draws
all three tones.
