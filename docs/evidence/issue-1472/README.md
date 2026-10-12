# #1472 — Bot Primary Color in Group Channels

Task: `claude/local/37eb3a23-6854-4f76-b09d-3cfd4641e567`.
Claim: [issue comment](https://github.com/BotHarness/DeepSeekBot/issues/1472#issuecomment-6125462722).
Baseline: `5b23f683` (main with #1471) in a separate detached checkout. Captured on October 12, 2026.

One task-owned isolated DSH Profile served both builds. The Group Channel "Team" has two
PersonaBots: Ada (Automatic, main hair color `#e2b04a`) and Bea (Custom `#1d1b22`, a near-black).
The Human message was composed in the PR build by picking both candidates and pressing Send; the
Host stored both PersonaBot IDs as recipients and both Bots replied through the DeepSeek flash
model. The baseline build then rendered the same stored messages. Headless Chromium, 1280 CSS
pixels wide at 2× scale, Chinese locale; dark theme through the `data-ds-dark-theme` body
attribute. Browser evidence is not physical-device QA.

## Captures

| View                               | Before                                                                    | After                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Mention candidates                 | [light](before-candidates-light.png) · [dark](before-candidates-dark.png) | [light](after-candidates-light.png) · [dark](after-candidates-dark.png) |
| Selected mentions in the composer  | [light](before-composer-light.png) · [dark](before-composer-dark.png)     | [light](after-composer-light.png) · [dark](after-composer-dark.png)     |
| Sent mentions and Bot author names | [light](before-messages-light.png) · [dark](before-messages-dark.png)     | [light](after-messages-light.png) · [dark](after-messages-dark.png)     |

## Computed styles in the PR build

The background is the color composited behind the name, including the translucent mention chip.

| Build | Surface                  | Name | Text color           | Background           | Contrast |
| ----- | ------------------------ | ---- | -------------------- | -------------------- | -------- |
| After | candidate names light    | Ada  | `rgb(144, 105, 0)`   | `rgb(245, 246, 247)` | 4.61     |
| After | candidate names light    | Bea  | `rgb(29, 27, 34)`    | `rgb(245, 246, 247)` | 15.75    |
| After | candidate names dark     | Ada  | `rgb(226, 176, 74)`  | `rgb(53, 54, 56)`    | 6.07     |
| After | candidate names dark     | Bea  | `rgb(161, 159, 168)` | `rgb(53, 54, 56)`    | 4.63     |
| After | composer tokens light    | Ada  | `rgb(130, 93, 0)`    | `rgb(224, 226, 230)` | 4.62     |
| After | composer tokens light    | Bea  | `rgb(29, 27, 34)`    | `rgb(224, 226, 230)` | 13.17    |
| After | composer tokens dark     | Ada  | `rgb(242, 191, 90)`  | `rgb(81, 82, 84)`    | 4.6      |
| After | composer tokens dark     | Bea  | `rgb(200, 198, 207)` | `rgb(81, 82, 84)`    | 4.62     |
| After | bot sent mentions light  | Ada  | `rgb(226, 176, 74)`  | `rgb(49, 50, 54)`    | 6.42     |
| After | bot sent mentions light  | Bea  | `rgb(156, 154, 163)` | `rgb(49, 50, 54)`    | 4.6      |
| After | bot author names light   | Bea  | `rgb(29, 27, 34)`    | `rgb(255, 255, 255)` | 17.04    |
| After | bot author names light   | Ada  | `rgb(151, 110, 0)`   | `rgb(255, 255, 255)` | 4.62     |
| After | human author names light | 你   | `rgb(97, 102, 107)`  | `rgb(255, 255, 255)` | 5.8      |
| After | bot sent mentions dark   | Ada  | `rgb(122, 88, 0)`    | `rgb(216, 217, 219)` | 4.63     |
| After | bot sent mentions dark   | Bea  | `rgb(29, 27, 34)`    | `rgb(216, 217, 219)` | 12.1     |
| After | bot author names dark    | Bea  | `rgb(129, 127, 135)` | `rgb(21, 21, 23)`    | 4.62     |
| After | bot author names dark    | Ada  | `rgb(226, 176, 74)`  | `rgb(21, 21, 23)`    | 9.16     |
| After | human author names dark  | 你   | `rgb(207, 211, 214)` | `rgb(21, 21, 23)`    | 12.11    |

In the baseline every Bot name used the neutral label color of its surface.

## What the run checked

- The stored Human message kept both selected PersonaBot IDs, in order, and both Bots replied.
- Clicking a sent Bot mention still opened that Bot's DM.
- The all-Bots candidate, the Human author name, body text, chip backgrounds and bubbles kept
  their baseline colors.
- The composer tokens and candidates in this Profile draw name-seeded Avatars rather than the Bots'
  saved ones. That is the baseline behavior and is unchanged here.

Not covered here: a saved color change while the Group Channel is open (automated tests only),
hover states of candidates and mention chips, external IM clients, and a physical device.
