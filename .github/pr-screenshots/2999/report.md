# Android pairing return and detached creation menu

Refs #2922. The Human assigned iOS testing to another engineer; this run covers Android only. The umbrella issue was independently closed at the Human's direction while this follow-up was active; its closure does not imply these fixes were already shipped.

## Candidate and provenance

- Baseline main: `30acef24138103a325ba972f0341477ee34e728b`. Baseline pairing also reproduced after the independent Zip fix from #2986.
- Public runtime fixes: `e9db82ccb` (retain creation route), `c8e9f733afa96a56a5313f7937390eb9b45d9e96` (detached native menu). Private QA combination: `d73d4ed4b516e4070cb41dffa216409b3cc310be`, also containing #2986 and the same native regression test.
- Physical POCO 24069PC21G, Android 16, arm64 Debug development client, Chinese locale, 1220 × 2712, density 480, gesture navigation. Default-text dark captures compare the actual native client.
- Baseline native APK SHA256: `17c969b9afad01074f1d902c8e105b55675a9807357094d829e784001433ab66`. Rebuilt fixed native APK SHA256: `fa5e8e08d99f229ba89fab9ca9291b8adc5edb3f131d68506adda7e24f4b9a62`.
- Two real task-isolated Hosts over exact USB loopback mappings. Host A retains the import fixtures from #2986; Host B starts empty. Existing phone pairings retained. Full Host and device fingerprints verified; no camera QR, account login or model calls.
- Images crop the status bar and resize proportionally. No reconstructed UI. `captures.json` pins source, time and checksums; raw UI trees/credentials remain private.

## Reproduction and result

Baseline success-to-customization navigation repeatedly raises `Cannot locate windowRecomposer; ComposeView is not attached to a window`. The creation menu wraps a real ComposeView in an ExpoView/LinearLayout, which Fabric or posted layout work can measure after detachment. A Robolectric test using that actual native view reproduces the same exception before the fix; the fixed suite passes all four tests. While detached the menu now retains the requested Yoga bounds and defers Compose measure/layout, then requests layout after attachment.

Resetting all navigation history also drops the originating creation flow. When new pairing was launched directly above `(bot-creation)`, completion now replaces only the pairing route with customization. Its creation route key, params and nested state survive. Other pairing entry points keep the existing workspace landing behavior; 21 related navigation tests pass.

| Physical Android journey                                                                               | Result                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Enter a nonempty `QA2922Name` creation draft on A; return to Environment; add B; complete real pairing | PASS: customization opens with rebuilt native client; no windowRecomposer error                                                                  |
| Save customization                                                                                     | PASS: returns to the original Environment step with the original draft name and selected A                                                       |
| Repeat with a new pairing of B; press the system Back button from customization                        | PASS: same Environment step, draft name and selected A retained                                                                                  |
| Advance to Name after each return                                                                      | PASS: `QA2922Name` still editable, normal 2/3 action; `save.png` and `back.png` show this subsequent Name step                                   |
| Native menu → Create → Close at font 1.0 / 1.3 / 2.0 × light / dark                                    | PASS in all six variants; native text heights 72 / 91 / 126 pixels, with actual background color verified; see `android-matrix.json`             |
| Cold restart, explicitly choose A after the display matrix, finish retained draft                      | PASS: real DM opens; canonical CLI reads find exactly one `QA2922Name` on A, A totals six fixture/test Bots, B remains empty; see `receipt.json` |

Mobile typecheck, repository lint, related navigation tests, native module regression, formatting/whitespace and bilingual change-fragment validation pass. CI status is separate and attached to the exact PR head. A new Android native build is required.

## Limits and independent finding

After the six display checks, restoring system font/theme settings produced a Debug LogBox warning about linking being configured multiple times. It is tracked separately in [#3001](https://github.com/BotHarness/DeepSeekBot/issues/3001). A cold process restart recovered; the retained draft then completed normally. The exact triggering transition, unchanged-main reproduction and Release impact are not established. The six successful menu checks do not establish a warning-free configuration-recreation journey.

This run does not claim iOS acceptance, a Release FPS improvement, TalkBack acceptance, account pairing, no-pairing/one-pairing variants, production delivery, store submission or the full #2922 A1–E2 fault matrix. The older iOS row hit area and StepBar sizing findings remain with the other engineer. #2986 has its own full Git → new Zip proof and tests; it is not silently included in this PR's diff.
