# #1473 — Bot Primary Color through sharing and Zip import

Task: `claude/local/37eb3a23-6854-4f76-b09d-3cfd4641e567`.
Claim: [issue comment](https://github.com/BotHarness/DeepSeekBot/issues/1473#issuecomment-6126066101).
Baseline: `058e727d` (main with #1471 and #1472) in a separate detached checkout. Captured on
October 12, 2026.

One task-owned isolated DSH Profile served both builds. Three source PersonaBots cover the three
policies: Ada (Automatic, main hair color `#e2b04a`), Bea (Custom `#1d1b22`) and Cam (uploaded
image, Automatic fallback `#2f9e8f` from its ID). For each one the run used the real UI: Profile →
Share → Export downloaded a zip, then New → Create Bot → Import from zip uploaded that file and
created a PersonaBot with a fresh ID. The imported Bot then answered one real DM through the
DeepSeek flash model. Headless Chromium, 1280 CSS pixels wide at 2× scale, Chinese locale; dark
theme through the `data-ds-dark-theme` body attribute. Browser evidence is not physical-device QA.

## Results

| Build                                                                                             | Case     | Source Profile                | Imported record `primaryColor`                                  | Imported Profile              | DM name, light     | DM name, dark        |
| ------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | --------------------------------------------------------------- | ----------------------------- | ------------------ | -------------------- |
| Before                                                                                            | hair     | hair, `rgb(226, 176, 74)`     | `null`                                                          | hair, `rgb(226, 176, 74)`     | `rgb(151, 110, 0)` | `rgb(226, 176, 74)`  |
| Before                                                                                            | custom   | custom, `rgb(29, 27, 34)`     | `null`                                                          | hair, `rgb(217, 71, 90)`      | `rgb(209, 63, 84)` | `rgb(222, 76, 94)`   |
| Before                                                                                            | fallback | fallback, `rgb(47, 158, 143)` | `null`                                                          | fallback, `rgb(224, 122, 63)` | `rgb(187, 89, 23)` | `rgb(224, 122, 63)`  |
| After                                                                                             | hair     | hair, `rgb(226, 176, 74)`     | `{"mode": "automatic", "fallback": "#c25bb6"}`                  | hair, `rgb(226, 176, 74)`     | `rgb(151, 110, 0)` | `rgb(226, 176, 74)`  |
| After                                                                                             | custom   | custom, `rgb(29, 27, 34)`     | `{"mode": "custom", "color": "#1d1b22", "fallback": "#d9475a"}` | custom, `rgb(29, 27, 34)`     | `rgb(29, 27, 34)`  | `rgb(129, 127, 135)` |
| After                                                                                             | fallback | fallback, `rgb(47, 158, 143)` | `{"mode": "automatic", "fallback": "#2f9e8f"}`                  | fallback, `rgb(47, 158, 143)` | `rgb(0, 132, 118)` | `rgb(47, 158, 143)`  |
| In the baseline the Custom Bot came back as Automatic with its hair color and the image Bot got a |
| new fallback from its new ID. With this change both keep their identity, and the hair case is     |
| unchanged. Light and dark name colors are derived in the destination from the carried source.     |

## Captures

Files are named `<build>-<case>-<view>.png`, where the view is `source-profile`,
`imported-profile`, `imported-dm-light` or `imported-dm-dark`.

| Case     | Imported Profile                                                                              | Imported DM, light                                                                              | Imported DM, dark                                                                             |
| -------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Hair     | [before](before-hair-imported-profile.png) · [after](after-hair-imported-profile.png)         | [before](before-hair-imported-dm-light.png) · [after](after-hair-imported-dm-light.png)         | [before](before-hair-imported-dm-dark.png) · [after](after-hair-imported-dm-dark.png)         |
| Custom   | [before](before-custom-imported-profile.png) · [after](after-custom-imported-profile.png)     | [before](before-custom-imported-dm-light.png) · [after](after-custom-imported-dm-light.png)     | [before](before-custom-imported-dm-dark.png) · [after](after-custom-imported-dm-dark.png)     |
| Fallback | [before](before-fallback-imported-profile.png) · [after](after-fallback-imported-profile.png) | [before](before-fallback-imported-dm-light.png) · [after](after-fallback-imported-dm-light.png) | [before](before-fallback-imported-dm-dark.png) · [after](after-fallback-imported-dm-dark.png) |

Not covered here: Git sharing through a remote (automated tests cover the shared descriptor that
both paths read), later hair edits on an imported fallback Bot through the UI (automated tests
only), malformed archives through the UI (automated tests only), and a physical device.
