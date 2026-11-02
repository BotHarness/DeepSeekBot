# Fresh Bot import draft — physical Android verification

Refs #2954, #2922. Tested 2026-10-27 UTC (2026-10-28 JST).

## Provenance

- Baseline source: `30acef24138103a325ba972f0341477ee34e728b`.
- Fixed source: `64f3008cc99f9a50c7dc59d7c719232c2720a6bd`.
- Physical POCO 24069PC21G, Android 16, arm64 Debug development client, Chinese locale, dark mode, font scale 1.0, 1220 × 2712, density 480.
- Native binary built from the baseline, SHA256 `17c969b9afad01074f1d902c8e105b55675a9807357094d829e784001433ab66`. The fix changes JavaScript only; the same native binary and isolated Host were used before and after, restarting the task's Metro and app between candidates.
- One task-isolated real Host, loopback USB transport. Existing phone pairings/data retained. No model interaction, camera QR or external network route claim.
- Real public Git source: `https://github.com/DoodleBears/doubao`. Real Host-exported Zip, 4160 bytes: `.botharness/bot.json` contains name `QA2954 Archive`, bio `Archive bio 2954`, tags `["archive"]`.
- Images crop the system status bar and resize proportionally. App content is unchanged. Source hashes, capture times and PNG checksums are in `captures.json`; raw private UI trees and pairing material are excluded.

## Results

| Journey                                                 | Baseline                                                                            | Fixed                                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Complete Git import, then start a new Zip from Chats    | FAIL: old `GitBefore2954` name and `PreviousGitBio2954` bio win over archive values | PASS: new Zip first preview shows `QA2954 Archive`, `Archive bio 2954`, `archive`                  |
| Upload/preview settles; advance to details              | FAIL: `Uploading 100% · keep app open` remains                                      | PASS: completed transfer note disappears                                                           |
| Edit name in current Zip; Back to source; preview again | Existing behavior retained                                                          | PASS: `ZipEdited2954` survives                                                                     |
| Close unfinished Zip; reopen from Chats; advance        | Existing behavior retained                                                          | PASS: `ZipEdited2954` survives                                                                     |
| Submit corrected Zip                                    | Baseline also completes with inherited metadata                                     | PASS: reaches its real DM; Host list contains exactly one `ZipEdited2954` with archive bio and tag |

The isolated Host contains five Bots after the entire run: one archive seed, two baseline imports, and two fixed imports. There is exactly one fixed Zip result. Focused controller/entry/marketplace coverage passes: 16 files, 151 tests, with one unrelated skipped file/test. Mobile typecheck, repository lint, change-fragment validation, feature-map validation, touched-file formatting and diff whitespace checks pass. CI is recorded separately in the PR.

## Limits and remaining #2922 work

This is a state-lifecycle fix; it does not change the layout, native text adapter, step shell or keyboard animation. This run does not establish iOS behavior, a complete light/dark/text-size matrix, physical iPhone acceptance, Release FPS, Connect-account pairing, or general #2922 acceptance.

During baseline pairing, entering the post-pairing customization sheet triggered a native `Cannot locate windowRecomposer; ComposeView is not attached to a window` error. The pairing had been saved; cold restart recovered Chats and the complete Git/Zip journeys above. The error is retained as an unresolved #2922 navigation/native lifecycle finding, not counted as passing. The older iOS row hit area, pairing return context and StepBar size findings also remain separate work.
