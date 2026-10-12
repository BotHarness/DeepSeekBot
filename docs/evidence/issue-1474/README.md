# #1474 — deleted Bots keep their Bot Primary Color in history and usage

Task: `claude/local/37eb3a23-6854-4f76-b09d-3cfd4641e567`.
Claim: [issue comment](https://github.com/BotHarness/DeepSeekBot/issues/1474#issuecomment-6126789291).
Baseline: `6d023c3d` (main with #1471–#1473) in a separate detached checkout. Captured on
October 13, 2026 (Asia/Tokyo).

One task-owned isolated DSH Profile served both builds. Three PersonaBots cover the three
policies: Ada (Automatic, main hair color `#e2b04a`), Bea (Custom `#1d1b22`) and Cam (uploaded
image, Automatic with a carried fallback `#2f9e8f`). In a Group Channel the Human mentioned all
three and each gave one real reply through the DeepSeek flash model. Each Bot was then deleted
through the real UI: its Profile → More → Delete Bot → "Delete Bot, retain Memory". Headless
Chromium, 1280 CSS pixels wide at 2× scale, Chinese locale; dark theme through the
`data-ds-dark-theme` body attribute. Browser evidence is not physical-device QA.

## Captures

| State                                     | Group Channel history                                                                 | Usage list                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Before deletion, PR build                 | [light](after-live-messages-light.png) · [dark](after-live-messages-dark.png)         | [light](after-live-usage-light.png) · [dark](after-live-usage-dark.png)         |
| After deletion, base build                | [light](before-deleted-messages-light.png) · [dark](before-deleted-messages-dark.png) | [light](before-deleted-usage-light.png) · [dark](before-deleted-usage-dark.png) |
| After deletion, PR build                  | [light](after-deleted-messages-light.png) · [dark](after-deleted-messages-dark.png)   | [light](after-deleted-usage-light.png) · [dark](after-deleted-usage-dark.png)   |
| After deletion and Host restart, PR build | [light](after-restart-messages-light.png) · [dark](after-restart-messages-dark.png)   | [light](after-restart-usage-light.png) · [dark](after-restart-usage-dark.png)   |

The deletion dialog used is in [after-delete-dialog.png](after-delete-dialog.png); it is unchanged.

## Computed name colors and contrast

Each cell lists the name, its computed text color and the contrast against the background
composited behind it.

| Build      | Surface and state              | Names                                                                                            |
| ---------- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| PR build   | live bot author names light    | Ada `rgb(151, 110, 0)` 4.62 · Cam `rgb(0, 132, 118)` 4.6 · Bea `rgb(29, 27, 34)` 17.04           |
| PR build   | live bot author names dark     | Ada `rgb(226, 176, 74)` 9.16 · Cam `rgb(47, 158, 143)` 5.57 · Bea `rgb(129, 127, 135)` 4.62      |
| PR build   | live usage names light         | Ada `rgb(144, 105, 0)` 4.61 · Bea `rgb(29, 27, 34)` 15.75 · Cam `rgb(0, 126, 112)` 4.6           |
| PR build   | live usage names dark          | Ada `rgb(226, 176, 74)` 6.07 · Bea `rgb(161, 159, 168)` 4.63 · Cam `rgb(70, 177, 161)` 4.64      |
| PR build   | deleted bot author names light | Ada `rgb(151, 110, 0)` 4.62 · Cam `rgb(0, 132, 118)` 4.6 · Bea `rgb(29, 27, 34)` 17.04           |
| PR build   | deleted bot author names dark  | Ada `rgb(226, 176, 74)` 9.16 · Cam `rgb(47, 158, 143)` 5.57 · Bea `rgb(129, 127, 135)` 4.62      |
| PR build   | deleted usage names light      | Ada `rgb(144, 105, 0)` 4.61 · Bea `rgb(29, 27, 34)` 15.75 · Cam `rgb(0, 126, 112)` 4.6           |
| PR build   | deleted usage names dark       | Ada `rgb(226, 176, 74)` 6.07 · Bea `rgb(161, 159, 168)` 4.63 · Cam `rgb(70, 177, 161)` 4.64      |
| PR build   | restart bot author names light | Ada `rgb(151, 110, 0)` 4.62 · Cam `rgb(0, 132, 118)` 4.6 · Bea `rgb(29, 27, 34)` 17.04           |
| PR build   | restart bot author names dark  | Ada `rgb(226, 176, 74)` 9.16 · Cam `rgb(47, 158, 143)` 5.57 · Bea `rgb(129, 127, 135)` 4.62      |
| PR build   | restart usage names light      | Ada `rgb(144, 105, 0)` 4.61 · Bea `rgb(29, 27, 34)` 15.75 · Cam `rgb(0, 126, 112)` 4.6           |
| PR build   | restart usage names dark       | Ada `rgb(226, 176, 74)` 6.07 · Bea `rgb(161, 159, 168)` 4.63 · Cam `rgb(70, 177, 161)` 4.64      |
| Base build | deleted bot author names light | Ada `rgb(97, 102, 107)` 5.8 · Cam `rgb(97, 102, 107)` 5.8 · Bea `rgb(97, 102, 107)` 5.8          |
| Base build | deleted bot author names dark  | Ada `rgb(207, 211, 214)` 12.11 · Cam `rgb(207, 211, 214)` 12.11 · Bea `rgb(207, 211, 214)` 12.11 |
| Base build | deleted usage names light      | Ada `rgb(15, 17, 21)` 17.46 · Bea `rgb(15, 17, 21)` 17.46 · Cam `rgb(15, 17, 21)` 17.46          |
| Base build | deleted usage names dark       | Ada `rgb(249, 250, 251)` 11.57 · Bea `rgb(249, 250, 251)` 11.57 · Cam `rgb(249, 250, 251)` 11.57 |

## What the run checked

- After the UI deletions the Host list returned each Bot as deleted with
  `retained` `#e2b04a`, `#1d1b22` and `#2f9e8f`, and the same values after the Host process was
  stopped and started on the same Profile.
- Author names, sent mentions and usage-list names had the same computed colors before deletion,
  after deletion and after restart.
- The usage rows kept their token totals and the "retained statistics" label; the bars keep their
  token-type colors.
- The base build reads the same Profile: it shows deleted Bots with neutral names. It does not
  understand `retained`, so it drops the whole color policy for those records when reading; it does
  not rewrite them.

Not covered here: deletion with Memory erasure, an older deleted identity without a retained color
(automated tests only), DMs of deleted Bots, and a physical device.
