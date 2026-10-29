# Pull to Tob: native evidence

Runtime source: `7623b09b6b2dfc8e6b68d96358048161f3ddde75`; baseline `fc65dea1cd834d302285066e237623484f442bf4`. Captured 2026-10-28. Synthetic isolated Host and empty Bot DMs; no model call required. Original images retain their aspect ratios. Contact sheets are samples from real recordings, not generated UI.

- Simulator: iPhone 18 Pro Max, iOS 27.0; qualified installed dev client + this worktree's Metro. Default content size `large`, plus `accessibility-extra-extra-extra-large`. Light/dark; Reduce Motion off/on/live switch.
- Physical: iPhone XS Max, iOS 18.1.1, current system dark theme. Development-signed **Release native artifact** from `f16aadec154671ddea3876b8f079be9c21ed12d6`, with JS/resources rebuilt by Expo `export:embed --dev false --minify true --bytecode` at the runtime source above and re-signed with the same identity/provisioning. Version 0.0.1 (1). Native source/config/package diff to baseline was empty; normalized CocoaPods specs differ only by worktree paths. Strict deep codesign verification and installation passed. The attempted full Xcode compile was interrupted by the disk guard; **a fresh full native compile is not claimed**. Not a store build.

## Matrix

PASS qualifies only the substeps named here; untouched substeps remain UNTESTED. Android emulator/device and native-drawer variants are UNTESTED (Windows lane).

| Handoff row                       | iOS 27 Simulator                                                                                                          | XS Max                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1 threshold release               | PASS, enters Tob; `light.mp4`, `dark.mp4`                                                                                 | PASS, `phone.mp4`; tactile feel untested                                            |
| 2 short pull                      | PASS                                                                                                                      | PASS, final source                                                                  |
| 3 cross then retreat in one touch | UNTESTED native: driver has only straight-path pans; component/model tests pass                                           | UNTESTED                                                                            |
| 4 fast flick                      | UNTESTED native; velocity-only exclusion covered in component/model behavior                                              | UNTESTED                                                                            |
| 5 computer / All / cloud          | PASS selected + All; cloud-only UNTESTED (no test cloud login)                                                            | PASS selected; All/cloud UNTESTED                                                   |
| 6 no computer fallback            | UNTESTED native: existing pairings preserved; component tests pass                                                        | UNTESTED                                                                            |
| 7 search                          | PASS focus; nonempty-query covered by component tests only                                                                | UNTESTED                                                                            |
| 8 coexistence                     | PASS last-chat left swipe, workspace right swipe, mid-list pull                                                           | UNTESTED                                                                            |
| 9 Reduce Motion                   | FAIL before fix, PASS after: change system setting 0→1 in running app, no Metro reload; `rm-before.mp4` vs `rm-after.mp4` | UNTESTED system toggle                                                              |
| 10 accessibility                  | PASS header button; actual VoiceOver announcement/escape UNTESTED                                                         | PASS header button; actual VoiceOver UNTESTED                                       |
| 11 haptics off                    | Automated preference tests PASS; native tactile verification UNTESTED                                                     | Human tactile verification UNTESTED                                                 |
| 12 max font                       | PASS entry/return at maximum accessibility category; `max.png`; no clipping in recorded indicator                         | UNTESTED                                                                            |
| 13 down entrance                  | PASS visual recording, header and same chat/composer                                                                      | PASS visual recording                                                               |
| 14 exit                           | PASS Back, leading-edge short cancellation and committed edge return (asserted after settling)                            | PASS Back; other paths UNTESTED                                                     |
| 15 keyboard-open Back             | UNTESTED separately on final Simulator source                                                                             | PASS final source; test draft persisted over reinstall then cleared without sending |
| 16 normal Tob row                 | PASS normal DM, no `top-entrance` root; last-chat swipe returns to same normal DM                                         | UNTESTED                                                                            |
| 17 dark flash                     | No white flash observed in sampled dark recording; not a frame-time/performance measurement                               | No white flash observed in physical dark recording; not FPS proof                   |

## Failure and fix

The Reanimated `useReducedMotion` hook captures the setting at JS startup. A live Settings change therefore left Tob sliding. The entrance now uses the existing `useSystemReducedMotion` subscription and suppresses translation when enabled. Regression test: 2 failures/13 passes before, 15/15 after. Complete mobile suite: **2442 PASS / 11 skipped**. Lint, root/mobile typecheck and formatting pass. An unprivileged full run failed to bind local test servers (`EPERM`); the qualified rerun with local listening allowed passed. Raw failed/invalid attempts remain private.

Tokens: commit80pt; iOS native content offset normalized by top inset; indicator32pt/glyph18pt; Android resistance0.5 and max travel120pt. No dwell timer or velocity-only open. One threshold haptic per drag respects the saved global setting.

## Files

- `before.png` — baseline light Chats entry point before pull-to-Tob.
- `after.png` — candidate light Tob after qualified pull.
- `dark-start.png` / `dark-end.png` — candidate dark before/after gesture.
- `base.mp4` / `light.mp4` — same light native gesture at baseline/candidate.
- `dark.mp4` — candidate dark native gesture.
- `max.png` — maximum Dynamic Type Tob destination.
- `rm-before.png` / `rm-after.png` — sampled native contact sheets (6fps) for the live preference bug/fix. The raw videos accompany them.
- `phone.mp4` — final source physical pull after a valid Chats start; original test-only draft visible.

No merge, release, deployment or TestFlight update performed. Remaining native/Human rows are explicit; source tests do not close those gates.
