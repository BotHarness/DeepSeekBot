# Integrated iOS 27 revalidation

Runtime: 1fc3214c76a2935202d546346369fbd9e3803114, integrating main d211952c078aaccdf1b48a15d1b668696a3bbadb. iPhone 18 Pro Max Simulator, iOS 27.0; light/dark; large and accessibility-extra-extra-extra-large. No physical device or Android validation in this batch.

Build: signed Release RN 0.88.1 native shell from 7e0dbe1def2e8965bf06cb91cada3792ece85bd0, with fresh production Hermes JS/resources from the runtime SHA and ad-hoc re-signing preserving entitlements. Native dependency/module inputs match; app config delta is Android-only predictive back. This is not a fresh full native compile or store build.

| Check                                                                            | Result                                                                                                                              |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Short 45pt/600ms pull stays on Chats                                             | PASS                                                                                                                                |
| Threshold 290pt/1000ms enters Tob                                                | PASS light/dark                                                                                                                     |
| Latest empty Tob conversation upward pull returns to Chats (#3155)               | PASS light/dark                                                                                                                     |
| Header Tob action opens same route                                               | PASS                                                                                                                                |
| Keyboard-open Back returns to Chats                                              | PASS; draft persistence not qualified                                                                                               |
| Fast short 35pt/80ms pull stays on Chats                                         | PASS for this injected path; not all flick velocities                                                                               |
| Maximum accessibility size enters Tob, settled header/composer visible           | PASS dark                                                                                                                           |
| Selected QA environment survives entry/return                                    | PASS                                                                                                                                |
| Search opens and blocks pull                                                     | FAIL observed: two taps do not expose search; also observed after cold launch before entering Tob. Attribution to this PR unproven. |
| Draft persistence                                                                | UNTESTED: automated text entry returned TEXT_ENTRY_MISMATCH twice, empty field visible; keyboard did open.                          |
| Cross threshold then retreat during same touch                                   | UNTESTED: current driver provides straight pan paths                                                                                |
| No computers / cloud-only / VoiceOver escape / live Reduce Motion / long history | UNTESTED in this batch; existing data/pairings retained                                                                             |
| Physical haptic feel / display performance                                       | UNTESTED; screenshots/video are not performance measurements                                                                        |

48 focused tests PASS, mobile TypeScript PASS, touched source formatting PASS. New CI is separate from native acceptance. Existing historical matrix remains bound to its older SHA; its passes do not qualify this integrated version.

Public images contain only the isolated synthetic Tob conversation, reviewed at original aspect ratio. First failures, AX snapshots, transition recording and an early mid-transition maximum-font image remain private under `.humanlayer/tasks/3117-revalidation`; the early image is excluded from layout conclusions.

Temporary pairing removed in UI and Host device revoked; original three pairings retained. Simulator restored light/large and shut down, own driver stopped cleanly. No phone, LAN, Serve, production or store changes. No merge performed.
