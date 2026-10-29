# iOS navigation-title capsule — #3158

## Source and environment

- Baseline: `525277669594e1069bdf79435821544a1902075a` (fresh origin/main at batch start).
- Candidate runtime: `d8fb71c81d2e88526c0ad8088424b7522a735fd7`; captured from the identical runtime files before committing.
- iOS 27.0 Simulator, iPhone 17e, 390 × 844 pt / 1170 × 2532 px, Chinese UI.
- Release Simulator native shell built at `229309db02782692950d4149ebeafbc6e1690876`, reused after checking native inputs and dependency compatibility; fresh production Hermes JS embedded separately for baseline and candidate. No new native binary build, no physical iPhone test.
- Dedicated loopback QA Host built from baseline. Synthetic QA Stream conversation with an existing real Bot reply. No user conversations, credentials, private URLs or hostnames in the published images.

## Native results

| Check                                                         | Result                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| Default `large`, light + dark                                 | PASS — title and both neighboring actions visible           |
| Intermediate `accessibility-large`, light + dark              | PASS — label stays inside capsule                           |
| Maximum `accessibility-extra-extra-extra-large`, light + dark | PASS — label stays inside capsule without vertical clipping |
| Title opens profile, Back returns                             | PASS at maximum size                                        |
| More opens profile, return to Chats and reopen chat           | PASS at maximum size                                        |
| Complete accessible Bot name in native AX tree                | PASS                                                        |
| Physical iPhone, VoiceOver spoken output, pre-iOS 26, Android | UNTESTED                                                    |
| Group / Bot-to-Bot visual matrix                              | UNTESTED; same title adapter, existing behavior tests pass  |

Baseline maximum-size captures show the entire leading navigation group missing after its intrinsic content exceeds the available width. The initial width-only probe restored the group but clipped the enlarged label vertically; those rejected probes remain private and are not passing evidence. A mismatched baseline dark capture showing the analytics sheet was rejected and recaptured from baseline on the actual chat.

The final layout constrains the SwiftUI/RN width, reserves UIKit glass margins, and limits only compact iOS navigation-label scaling to 1.35 (24pt base line → 32.4pt within a 44pt bar). The complete accessible label and the profile's unrestricted title remain available. Message/composer text remains unrestricted, as the screenshots show. This is a documented local navigation exception, not a global font cap.

## Checks and boundaries

57 focused tests passed, mobile typecheck passed, lint passed, changed-file formatting and changelog checks passed. No FPS or performance improvement claim. Expo Web cannot reproduce this native UIKit/SwiftUI sizing boundary; native Simulator evidence is provided instead. Physical-device and Human QA remain pending before merge; no merge or deployment is included.

## Reproduce

1. Pair a test environment and open a Bot DM through Chats.
2. Set each Dynamic Type category above and light/dark appearance.
3. Check the navigation-title capsule, Back and trailing profile action.
4. At maximum size, open the profile from the title, return, repeat from the trailing action, return to Chats and reopen the DM.

## Cleanup

Temporary device authorization revoked (active 0, pending 0), task driver clean-stopped, dedicated Host exited and port released, task-created Simulator shut down and deleted. Original devices, pairings, shared services and physical iPhone untouched. Private source/probe evidence retained.
