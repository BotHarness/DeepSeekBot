# #1471 — Bot Primary Color: Profile setting and DM author names

Task: `claude/local/37eb3a23-6854-4f76-b09d-3cfd4641e567`.
Claim: [issue comment](https://github.com/BotHarness/DeepSeekBot/issues/1471#issuecomment-6124502529).
Baseline: `83928288` in a separate detached checkout. Captured on October 12, 2026.

One task-owned isolated DSH Profile served both builds, so every pair shows the same PersonaBot
("Ada", a name-seeded pixel Avatar with main hair color `#e2b04a`) and the same real DM: one Human
message and one reply from the DeepSeek flash model. Headless Chromium, 1280 CSS pixels wide at
2× scale, Chinese locale. The dark theme was set through the `data-ds-dark-theme` body attribute
that DSH itself uses. Browser evidence is not physical-device QA.

## DM author name

| State                   | Before                                  | After                                    |
| ----------------------- | --------------------------------------- | ---------------------------------------- |
| Automatic, light        | [Before](before-dm-automatic-light.png) | [After](after-dm-automatic-light.png)    |
| Automatic, dark         | [Before](before-dm-automatic-dark.png)  | [After](after-dm-automatic-dark.png)     |
| Custom `#f4f1ec`, light | no predecessor                          | [After](after-dm-custom-white-light.png) |
| Custom `#f4f1ec`, dark  | no predecessor                          | [After](after-dm-custom-white-dark.png)  |

Computed styles read from the same pages:

| State                   | Bot name color       | Background           | Contrast | Human name           |
| ----------------------- | -------------------- | -------------------- | -------- | -------------------- |
| Before, light           | `rgb(97, 102, 107)`  | `rgb(255, 255, 255)` | 5.80     | `rgb(97, 102, 107)`  |
| Before, dark            | `rgb(207, 211, 214)` | `rgb(21, 21, 23)`    | 12.11    | `rgb(207, 211, 214)` |
| Automatic, light        | `rgb(154, 111, 0)`   | `rgb(255, 255, 255)` | 4.52     | `rgb(97, 102, 107)`  |
| Automatic, dark         | `rgb(226, 176, 74)`  | `rgb(21, 21, 23)`    | 9.16     | `rgb(207, 211, 214)` |
| Custom `#f4f1ec`, light | `rgb(121, 118, 114)` | `rgb(255, 255, 255)` | 4.52     | `rgb(97, 102, 107)`  |
| Custom `#f4f1ec`, dark  | `rgb(244, 241, 236)` | `rgb(21, 21, 23)`    | 16.19    | `rgb(207, 211, 214)` |

Bubble backgrounds were identical before and after in each theme (`rgba(38, 49, 72, 0.1)` light,
`rgba(255, 255, 255, 0.14)` dark).

## Profile setting

These views are new; the prior state is the Avatar dialog without the Bot Primary Color row.

| View                                         | Capture                                        |
| -------------------------------------------- | ---------------------------------------------- |
| Avatar dialog entry, Automatic               | [Capture](after-avatar-area-entry.png)         |
| Editor on Automatic, explaining the source   | [Capture](after-editor-automatic.png)          |
| Custom draft with the light and dark preview | [Capture](after-editor-custom-draft-white.png) |
| Failed Save: the draft is kept and reported  | [Capture](after-editor-save-failed.png)        |
| Avatar dialog entry after a successful Save  | [Capture](after-avatar-area-custom-saved.png)  |

## What the run checked

- A Custom draft and Cancel left the Host record without a `primaryColor`.
- A Save whose request was aborted in the browser showed the failure, kept `#f4f1ec` in the editor
  and left the Host record unchanged. This is a transport failure, not a Host-side write failure.
- The Host rejected `url(https://example.invalid)` with `invalid-input` and kept the record.
- Save stored `{ mode: 'custom', color: '#f4f1ec' }`. After the Host process was stopped and
  started on the same Profile, a separate authenticated read returned the same value and the DM
  name rendered with the same colors.

Not covered here: Group Channels, sharing and import, deletion, charts, a rename or hair edit
through the UI (covered by automated tests only), and a physical device.
