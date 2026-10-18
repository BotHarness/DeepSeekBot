# TOB T1 native UAT evidence

Captured on 2026-10-18 (JST), existing iPhone 17 Pro / iOS 26 Simulator, English/default text/light mode. Native screenshot size: 402 × 874. The Expo development overlay is visible.

- Runtime JavaScript: `216963322c70c7ea009392da66e9a0e1f4327727`.
- Native build source: `a0b2919072af8fee62d8bb5fbb402fc52fb0d852`; subsequent changes only affect JavaScript and documentation.
- UAT service: `1ad3e6605a02965b3f9079f302ced02ca4a8f4c6`.
- Native executable SHA-256: `9afe634f14300fedd692f455eb2feaacdf07ba8d89e1777f5a0999a2f1afd753`.

## Observed

| Check                                                                     | Result                                                                                                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unpaired entry opens Cloud services without a Host                        | Pass                                                                                                                                             |
| An ordinary URL is rejected as configuration                              | Pass                                                                                                                                             |
| Public JSON recovers from the invalid input                               | Pass; the automation driver initially read the long text before entry finished; complete input and successful parsing were subsequently observed |
| Trust review displays the verified UAT server/instance before import      | Pass                                                                                                                                             |
| Explicit import reaches Configuration imported / Signed out               | Pass                                                                                                                                             |
| System WorkOS sign-in browser opens                                       | Pass; recording stopped before sign-in                                                                                                           |
| User authentication, callback, refresh, cold restart and logout isolation | Pending at initial capture; see subsequent unattended session report below                                                                       |

The screenshots compare states within the same revision, not an older-code baseline. `02-trusted-import.mp4` records the trust confirmation → imported result. Authentication forms, account details, codes and tokens are excluded. These assets do not qualify physical QR scanning, Android, dark/large-text/VoiceOver, or the rest of T1. The existing Simulator system CJK-font failure is a separate known environment limitation; no system font repair was attempted.

## Subsequent unattended session run

[Native session report and recording](unattended/README.md): real API authentication, native identity check, refresh rotation, cold restart and own-session logout/CLI isolation passed without Human login. Successful Hosted AuthKit/PKCE browser return remains unqualified.
