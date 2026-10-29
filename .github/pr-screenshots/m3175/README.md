# iOS 27 native verification — #3175 / #3178

Date: 2026-10-29. Simulator: iPhone 18 Pro Max, iOS 27, 440 × 956 pt (1320 × 2868 native PNG). Chinese UI, light and dark appearances.

## Source and installed artifact

- Before: latest origin/main `71ff1b41b99373bdfa40cd53c44329140daec65a`, including merged #3178.
- After: #3175 integrated with that main at `119097c172d7c84b46e6efc9ab4e045fe47e60a4`.
- Native shell: existing Release Simulator build from `2f5eecec0a4c4c049d18a820f513b86594680065`; iOS native inputs audited as compatible. Fresh production Hermes bundles exported separately for before/after, installed in place. This is not a newly compiled native binary and not physical-iPhone acceptance.
- Later changes in this PR update only these screenshots and the verification guide; runtime source remains the tested integration.
- Existing pairings retained; all Hosts offline. Public market browsing needs no Host. The Settings usage error is expected in this offline setup, not a title failure.

## Results

| Check                                                                                                                        | Result                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Settings large title → inline title on scroll, return to large title                                                         | PASS                                                                         |
| Settings Storage child opens and native Back returns                                                                         | PASS                                                                         |
| Header native search item opens keyboard and search row                                                                      | PASS                                                                         |
| Typing alone keeps discovery; keyboard Search submits and shows matching Obsidian result                                     | PASS                                                                         |
| Open result details and return, preserving query/result                                                                      | PASS                                                                         |
| Close search clears query; reopen starts empty and discovery is restored                                                     | PASS                                                                         |
| Default `large`, intermediate `extra-extra-extra-large`, maximum `accessibility-extra-extra-extra-large`, light/dark layouts | PASS for title states and market search/result/close reachability shown here |
| Maximum text sorting changes to a vertical selection list                                                                    | PASS                                                                         |
| Android native, physical iPhone, VoiceOver, performance/FPS, same-query network refresh instrumentation                      | UNTESTED in this run                                                         |

Default-size market screenshots include real keyboard input and results. Intermediate screenshots show keyboard input; maximum screenshots show submitted results and reachable Close. Settings expanded/collapsed frames cover all three sizes. This is a scoped verification of #3175 and #3178, not the complete market import journey.

A quick-fling automation attempt entered Usage instead of scrolling Settings; those frames were retained privately as invalid captures and excluded here. The repeated run used a sustained native pan and checked the resulting page before capture. No product failure was inferred from that driver attempt.

## Evidence handling

Images were reviewed for private account/Host/path/token content. Only public catalogue entries and logged-out Settings are published, at original aspect ratio. No UI was redrawn. Local driver actions and original captures remain in the indexed task folder. The pre-existing Web preview images elsewhere in this PR are not native evidence.
