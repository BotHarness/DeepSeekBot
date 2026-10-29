# Android tag entry — historical native verification

Issue #3027 / PR #3030. Physical Android 16, arm64 Debug, Chinese locale, portrait 1220 × 2712.

## Current integration status

This report records the original physical QA runtime through `837036ab9`. Its screenshots, one-Host layout and Send-action observations are historical evidence, not verification of the integrated field. The current implementation preserves main's shared native text-field adapter: the chips and editable input use separate Compose Hosts. Integrated native smoke testing and Human visual acceptance remain pending under #3027 and the shared Windows QA queue.

## Historical provenance

- PR base: `3b79218873262f29d73d082d62469c60ae0c7e1a`.
- Before: frozen QA baseline `e686147549f05fe49e038eb20fd57e77b41bf973`, including unchanged #2986 and #2999 prerequisites (both now merged).
- After: QA combination `c4b2e1c69a6604625b2692161a531f619f9cc7f3`, including the tag implementation through commit `837036ab9`.
- The same fresh arm64 native binary ran before and after: SHA-256 `dd7712b947f46936d50dc4c246bcd4b95ab60d803445e684e2adfaae4f58e970`.
- This PR changes JavaScript only; no native dependency, module or app configuration was added.
- Public images are real phone captures, cropped only to remove the status bar and resized from 1220 to 488 pixels wide. Raw captures, native hierarchy, source manifests, build logs and the APK remain in the main checkout's ignored task evidence.

## Historical runtime results

| Journey                                                               | Result                                                                             |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Soft-key action adds tags consecutively and clears the input          | Pass                                                                               |
| Empty or duplicate submission adds no duplicate chip                  | Pass                                                                               |
| Remove first/last chips while retaining unfinished input and keyboard | Pass                                                                               |
| Gboard Chinese: soft-key pinyin, candidate selection, submit to chip  | Pass                                                                               |
| Back/Next and Close/Reopen retain chips plus unfinished input         | Pass                                                                               |
| Direct creation includes remaining typed text                         | Pass; canonical Host `roles` = `Alpha`, `Beta`, `Pending`; created Bot chat opened |
| Real Host-exported Zip prefills `Imported` as a chip                  | Pass                                                                               |
| Add `ZipTag`, remove `Imported`, finish Zip import                    | Pass; canonical Host `roles` = `ZipTag`; imported Bot chat opened                  |
| System font 1.0 / 1.3 / 2.0 × light/dark, real keyboard open          | All six pass; input and submit stay above the keyboard                             |

All six matched screenshot pairs have the same viewport, theme, locale, synthetic draft data and keyboard top (1402 px). The before field contains `Alpha, Beta`; the after field has those two committed chips and an empty pending field.

In that historical runtime, the input and chips shared one native Compose Host, with the chip container retained at zero chips. Its native Send editor actions submitted the event's current text without invoking Done's keyboard dismissal. That runtime used no JavaScript hide/refocus cycle. These observations do not qualify the integrated field.

## Scope and cleanup

- iOS retains its existing tag editor; native iOS acceptance belongs to the other engineer.
- Git and Marketplace enter the same details editor, but their network import journeys were not repeated for this PR. Zip was exercised end to end.
- Debug interaction/layout results do not establish Release FPS. No frame-rate improvement is claimed.
- Historical implementation: 134 focused related tests passed, along with mobile typecheck, lint, format and changelog checks. Current integration results and CI are reported separately on the PR.
- Original phone APK hash, input method, font/theme/density/navigation settings and all five existing pairings were verified after restoration. The task pairing was revoked, the task Zip removed, only the task's Metro/Host and USB mappings were stopped/removed, and the phone lease was released.
- Human visual acceptance remains pending.
