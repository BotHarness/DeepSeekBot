# Native UI check — #2644

- Before: `5f093cf0b5023cf5ccfdd7a8849b86763dd36805`. After application source: `f6f3fa09f3adb04401668d90ce151e77f946ec77`.
- iOS 27 Simulator, iPhone 17 Pro, 402 × 874 points. English light screenshots use the same public catalogue entries. Menu images crop the same 300-point menu region to exclude unrelated chats.
- Existing Debug development client + task-owned Metro. Native fingerprint `4176fdf936e537bf2a1b7f6f5d906e2ca1615ecc` matches the installed binary; no native dependency changed. Executable SHA-256 `ba8bad85455ffe4664485a30244b13ea3251ce04dfef4041f08f47ffc8628988`.

| Case                                                                                                 | Result                                                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Four direct creation/import entries; standalone blank and Git forms                                  | PASS                                                                |
| Zip opens the system file picker; cancel returns to Chats, repeated                                  | PASS                                                                |
| Marketplace public catalogue cards and corresponding detail artwork                                  | PASS                                                                |
| Search keyboard, submitted query and empty result                                                    | PASS                                                                |
| Topic filtering (coding returns two matching Bots); sorting control                                  | PASS                                                                |
| English and Chinese, light and dark, default and maximum system text size, scrolling/back            | PASS for captured paths                                             |
| Zip file selection/upload, actual Git/market import, create mutation, interrupted-operation recovery | NOT RE-RUN; existing controller coverage is automated evidence only |
| Android native and physical iOS 18 for this UI candidate                                             | NOT VERIFIED                                                        |
| Offline/image-failure injection, middle text sizes, complete locale/theme matrix                     | NOT VERIFIED                                                        |

The initial candidate presented the Zip picker during the route transition and could remain waiting. The final source waits for native route readiness; repeated picker/cancel passed. Maximum text size moves the Marketplace title below its toolbar.

The native checks used existing local Simulator connections only for navigation and public catalogue browsing. No Host mutation was submitted. A separate isolated Host health/state check stayed unchanged; it is not claimed as proof of an import through the Simulator connection. The original local creation draft, default text size and light appearance were restored. Task-owned Host/Metro/driver processes exited and ports were released. The retained phone environment was untouched.

Automated: 1,552 mobile tests passed, 9 skipped; lint, format, root/mobile type checks and changelog validation passed. Screenshots are real native captures; no generated imagery. The commit containing these evidence files changes no application source.
