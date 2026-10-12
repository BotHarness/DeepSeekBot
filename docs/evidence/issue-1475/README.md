# #1475 — single-Bot activity heatmaps in the Bot's color

Task: `claude/local/37eb3a23-6854-4f76-b09d-3cfd4641e567`.
Claim: [issue comment](https://github.com/BotHarness/DeepSeekBot/issues/1475#issuecomment-6127820842).
Baseline: `afb49f06` (main with #1471–#1476 except this slice) in a separate detached checkout.
Captured on October 13, 2026 (Asia/Tokyo).

One task-owned isolated DSH Profile served both builds, with two current PersonaBots: Ada
(Automatic, main hair color `#e2b04a`) and Bea (Custom `#1d1b22`, a near-black). Their activity is
real: DM and Group Channel messages answered through the DeepSeek flash model, and the Memory
commits those turns made. Headless Chromium, 1280 CSS pixels wide at 2× scale, Chinese locale; dark
theme through the `data-ds-dark-theme` body attribute. Browser evidence is not physical-device QA.

**Limit of this evidence.** Both Bots were created on October 12, so each heatmap has only two day
cells and one of them has activity. The captures therefore show one colored cell per heatmap at a
single intensity level (level 1 or 2) next to one neutral zero cell. Four intensity levels and
loading older weeks while scrolling were not exercised in the live instance; the automated heatmap
tests cover both.

## Captures

| Bot | View    | Before                                                                      | After                                                                     |
| --- | ------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Ada | Profile | [light](before-ada-profile-light.png) · [dark](before-ada-profile-dark.png) | [light](after-ada-profile-light.png) · [dark](after-ada-profile-dark.png) |
| Ada | Popover | [light](before-ada-popover-light.png) · [dark](before-ada-popover-dark.png) | [light](after-ada-popover-light.png) · [dark](after-ada-popover-dark.png) |
| Bea | Profile | [light](before-bea-profile-light.png) · [dark](before-bea-profile-dark.png) | [light](after-bea-profile-light.png) · [dark](after-bea-profile-dark.png) |
| Bea | Popover | [light](before-bea-popover-light.png) · [dark](before-bea-popover-dark.png) | [light](after-bea-popover-light.png) · [dark](after-bea-popover-dark.png) |

## Token charts of the same Bots

Added after Human QA asked for the Bot's own token charts to match. The popover captures above
include the token sparkline; the Profile's daily view is captured separately.

| Bot | Profile daily tokens, before                                              | Profile daily tokens, after                                             |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Ada | [light](before-ada-tokens-light.png) · [dark](before-ada-tokens-dark.png) | [light](after-ada-tokens-light.png) · [dark](after-ada-tokens-dark.png) |
| Bea | [light](before-bea-tokens-light.png) · [dark](before-bea-tokens-dark.png) | [light](after-bea-tokens-light.png) · [dark](after-bea-tokens-dark.png) |

Distinct bar fills read from the PR build, in cached / other input / output order:

| Bot, view, theme  | Fills                             |
| ----------------- | --------------------------------- |
| ada popover light | `#b48408` · `#cdaf63` · `#decda1` |
| ada popover dark  | `#e2b04a` · `#a08243` · `#73623e` |
| ada profile light | `#b48408` · `#cdaf63` · `#decda1` |
| ada profile dark  | `#e2b04a` · `#a08243` · `#73623e` |
| bea popover light | `#1d1b22` · `#6f6e73` · `#a7a7aa` |
| bea popover dark  | `#828088` · `#65646a` · `#515155` |
| bea profile light | `#1d1b22` · `#6f6e73` · `#a7a7aa` |
| bea profile dark  | `#828088` · `#65646a` · `#515155` |

## Composer token usage popover

Also added after Human QA: the popover opened from the token count at the bottom right of the
composer colors the Bot name and the per-Session share meters.

| Bot | Before                                                                                    | After                                                                                   |
| --- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Ada | [light](before-ada-composer-usage-light.png) · [dark](before-ada-composer-usage-dark.png) | [light](after-ada-composer-usage-light.png) · [dark](after-ada-composer-usage-dark.png) |
| Bea | [light](before-bea-composer-usage-light.png) · [dark](before-bea-composer-usage-dark.png) | [light](after-bea-composer-usage-light.png) · [dark](after-bea-composer-usage-dark.png) |

Meter fills and widths read from the PR build:

| Bot, theme | Name color           | Meter fill and width      |
| ---------- | -------------------- | ------------------------- |
| Ada, light | `rgb(151, 110, 0)`   | `rgb(178, 130, 2)` 100%   |
| Ada, dark  | `rgb(226, 176, 74)`  | `rgb(226, 176, 74)` 100%  |
| Bea, light | `rgb(29, 27, 34)`    | `rgb(29, 27, 34)` 100%    |
| Bea, dark  | `rgb(129, 127, 135)` | `rgb(116, 114, 122)` 100% |

Each of these Bots has one Session, so every meter is at 100%; several meters at different widths
were exercised only in the automated test.

## Cell colors read from the page

`--bh-heat-color` is empty on the base build, where the cells mix the brand accent instead.

| Build                                                                                              | Bot, view, theme  | Heatmap           | `--bh-heat-color` | Computed cell background per level present                                                          |
| -------------------------------------------------------------------------------------------------- | ----------------- | ----------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| Before                                                                                             | ada popover light | 事件活跃热力图    | `None`            | level 0: `rgba(38, 49, 72, 0.06)` · level 2: `color(srgb 0.24902 0.447712 0.867538 / 0.529412)`     |
| Before                                                                                             | ada popover dark  | 事件活跃热力图    | `None`            | level 0: `rgba(255, 255, 255, 0.08)` · level 2: `color(srgb 0.516364 0.690909 1 / 0.539216)`        |
| Before                                                                                             | ada profile light | 事件活跃热力图    | `None`            | level 0: `rgba(38, 49, 72, 0.06)` · level 2: `color(srgb 0.24902 0.447712 0.867538 / 0.529412)`     |
| Before                                                                                             | ada profile light | Memory 提交热力图 | `None`            | level 0: `rgba(38, 49, 72, 0.06)` · level 2: `color(srgb 0.24902 0.447712 0.867538 / 0.529412)`     |
| Before                                                                                             | ada profile dark  | 事件活跃热力图    | `None`            | level 0: `rgba(255, 255, 255, 0.08)` · level 2: `color(srgb 0.516364 0.690909 1 / 0.539216)`        |
| Before                                                                                             | ada profile dark  | Memory 提交热力图 | `None`            | level 0: `rgba(255, 255, 255, 0.08)` · level 2: `color(srgb 0.516364 0.690909 1 / 0.539216)`        |
| Before                                                                                             | bea popover light | 事件活跃热力图    | `None`            | level 0: `rgba(38, 49, 72, 0.06)` · level 1: `color(srgb 0.24099 0.427193 0.820552 / 0.322353)`     |
| Before                                                                                             | bea popover dark  | 事件活跃热力图    | `None`            | level 0: `rgba(255, 255, 255, 0.08)` · level 1: `color(srgb 0.565967 0.722611 1 / 0.336471)`        |
| Before                                                                                             | bea profile light | 事件活跃热力图    | `None`            | level 0: `rgba(38, 49, 72, 0.06)` · level 1: `color(srgb 0.24099 0.427193 0.820552 / 0.322353)`     |
| Before                                                                                             | bea profile light | Memory 提交热力图 | `None`            | level 0: `rgba(38, 49, 72, 0.06)` · level 2: `color(srgb 0.24902 0.447712 0.867538 / 0.529412)`     |
| Before                                                                                             | bea profile dark  | 事件活跃热力图    | `None`            | level 0: `rgba(255, 255, 255, 0.08)` · level 1: `color(srgb 0.565967 0.722611 1 / 0.336471)`        |
| Before                                                                                             | bea profile dark  | Memory 提交热力图 | `None`            | level 0: `rgba(255, 255, 255, 0.08)` · level 2: `color(srgb 0.516364 0.690909 1 / 0.539216)`        |
| After                                                                                              | ada popover light | 事件活跃热力图    | `#b48408`         | level 0: `rgba(38, 49, 72, 0.06)` · level 2: `color(srgb 0.674946 0.499564 0.0453159 / 0.529412)`   |
| After                                                                                              | ada popover dark  | 事件活跃热力图    | `#e2b04a`         | level 0: `rgba(255, 255, 255, 0.08)` · level 2: `color(srgb 0.894545 0.712727 0.341818 / 0.539216)` |
| After                                                                                              | ada profile light | 事件活跃热力图    | `#b48408`         | level 0: `rgba(38, 49, 72, 0.06)` · level 2: `color(srgb 0.674946 0.499564 0.0453159 / 0.529412)`   |
| After                                                                                              | ada profile light | Memory 提交热力图 | `#b48408`         | level 0: `rgba(38, 49, 72, 0.06)` · level 2: `color(srgb 0.674946 0.499564 0.0453159 / 0.529412)`   |
| After                                                                                              | ada profile dark  | 事件活跃热力图    | `#e2b04a`         | level 0: `rgba(255, 255, 255, 0.08)` · level 2: `color(srgb 0.894545 0.712727 0.341818 / 0.539216)` |
| After                                                                                              | ada profile dark  | Memory 提交热力图 | `#e2b04a`         | level 0: `rgba(255, 255, 255, 0.08)` · level 2: `color(srgb 0.894545 0.712727 0.341818 / 0.539216)` |
| After                                                                                              | bea popover light | 事件活跃热力图    | `#1d1b22`         | level 0: `rgba(38, 49, 72, 0.06)` · level 1: `color(srgb 0.118363 0.117218 0.152913 / 0.322353)`    |
| After                                                                                              | bea popover dark  | 事件活跃热力图    | `#828088`         | level 0: `rgba(255, 255, 255, 0.08)` · level 1: `color(srgb 0.592075 0.585548 0.611655 / 0.336471)` |
| After                                                                                              | bea profile light | 事件活跃热力图    | `#1d1b22`         | level 0: `rgba(38, 49, 72, 0.06)` · level 1: `color(srgb 0.118363 0.117218 0.152913 / 0.322353)`    |
| After                                                                                              | bea profile light | Memory 提交热力图 | `#1d1b22`         | level 0: `rgba(38, 49, 72, 0.06)` · level 2: `color(srgb 0.115686 0.110675 0.141612 / 0.529412)`    |
| After                                                                                              | bea profile dark  | 事件活跃热力图    | `#828088`         | level 0: `rgba(255, 255, 255, 0.08)` · level 1: `color(srgb 0.592075 0.585548 0.611655 / 0.336471)` |
| After                                                                                              | bea profile dark  | Memory 提交热力图 | `#828088`         | level 0: `rgba(255, 255, 255, 0.08)` · level 2: `color(srgb 0.545455 0.538182 0.567273 / 0.539216)` |
| The zero level is the same neutral color on both builds in each theme. The tooltip on Ada's active |
| event cell showed the date 2026-10-12, a total of 3 and one line each for DM messages, Group       |
| mentions and Group messages on the PR build; counts and wording are unchanged.                     |

Not covered here: four intensity levels and older-history scrolling with real activity, a saved
color change while a heatmap is open (automated tests only), a narrow layout, and a physical
device.
