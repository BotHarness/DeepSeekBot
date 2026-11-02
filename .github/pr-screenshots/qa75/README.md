# Native Chats creation menu evidence

Before: `5692f1164f0934c4ee43367eb68290d573d08ba4`. Final application source: `3c4cb5634d48c794cddf1fad89eeb519c94f90db`; subsequent commits contain only evidence. Same iOS 27 iPhone 17 Pro Simulator, 402 × 874 pt, Debug development client with the candidate loaded from a fresh Metro. Native fingerprint `4176fdf936e537bf2a1b7f6f5d906e2ca1615ecc`; executable SHA-256 `ba8bad85455ffe4664485a30244b13ea3251ce04dfef4041f08f47ffc8628988`. This is native interaction evidence, not Release performance or physical-device acceptance.

Crops retain only the actual menu and adjacent controls. No mockups, fabricated states or private pairing data.

| Case                                                             | Result                                                                                                                                      | Capture                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Chinese default / light and dark                                 | PASS: four ordered native actions, no heading, outside dismissal selects nothing                                                            | `light.png`, `dark.png`                                                |
| Chinese intermediate / light and dark                            | PASS: native text grows, four actions reachable                                                                                             | `mid-light.png`, `mid-dark.png`                                        |
| Chinese maximum / light and dark                                 | PASS: system menu scrolls; scroll to fully reveal Git and activate it                                                                       | `max-light.png`, `max-dark.png`, `scroll-light.png`, `scroll-dark.png` |
| English default / light                                          | PASS: four complete labels in the same order                                                                                                | `en.png`                                                               |
| Blank entry                                                      | PASS: opens the dedicated native creation form with the selected Computer                                                                   |
| Zip entry and cancellation                                       | PASS: opens the native document picker; Cancel returns without selecting a file                                                             |
| Marketplace entry                                                | PASS: opens the native catalogue                                                                                                            |
| Git entry                                                        | PASS: opens the dedicated URL/import form; also activated after scrolling at maximum text                                                   |
| Existing data                                                    | Original creation draft, unsent text, preferences, sections, filter and look files preserved; only notification-avatar cache status changed |
| Android native, physical iOS, VoiceOver, Human haptic acceptance | Not verified in this batch                                                                                                                  |
| Full import, fault recovery, cloud creation/invitations          | Not run; this batch submits no creation/import                                                                                              |

Automated checks: 1,576 mobile tests pass, 9 skip; lint, formatting, root/mobile typechecks and changelog checks pass. Three existing main test-loading failures from shared header native dependencies were reproduced on the base, then fixed with missing safe-area/SVG test shims. Source-level Android tests cover opening, dismissal, one haptic, disabled state and source/destination routing; these are not Android device acceptance.

The iOS menu owns native highlight and feedback; no extra application haptic is layered on top. Android retains the preference-controlled opening haptic. Existing cloud commands retain their scope; pending cloud preparation does not navigate after a tab/scope change.
