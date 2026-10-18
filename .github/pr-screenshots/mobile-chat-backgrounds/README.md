# Native chat background evidence — #2118 / PR #2122

These are original Android captures with a neutral, procedurally drawn fixture. No screenshot is an AI repaint. The preview messages are the editor's labeled sample content; the conversation contains a real native-composer `hello` and the provider's actual reply. The group is an isolated QA fixture.

## Provenance

- Date: 2026-10-18 (Asia/Tokyo).
- Before: `47a2fbf4553e7760480fe10f3c47c1bd5cb3ef19`; the entire `apps/mobile` tree is identical to the original issue base `0f75f3e38f7d0e3b59189203998bd7c817aad496` (`git diff` is empty).
- Initial matrix: `1e2294329147e15ff9272393c0e48a127141d341` for Settings/global entry and conversation-save captures. DM editor and Group frames use `dd1fa3275282f7150b85c9e2e24b082d727f14f5`; their runtime modules were unchanged through `1e2294329`. The review follow-up below records the later changes separately. Evidence-only commits do not alter runtime code.
- Native binary: existing SDK58 / RN0.88 development client built from the before checkout. Mobile package, app configuration and config-plugin inputs have no diff against the after revision. No native dependency or generated native project changed.
- Host: task-isolated pinned DSH0.2.0-rc.2 Host, built at the original issue base. This preference has no Host API or model dependency. The merged main's unrelated peer-review changes are not used by these local background checks.
- Android16 / API36; 1080×2400 physical pixels, 420dpi (about411×914dp), portrait, Chinese locale, native font scales1.0/1.3/2.0, light/dark OS appearance.
- One Human-authorized separate emulator lane was used. The shared physical phone, its lease, reverses and processes were left alone.
- Photos are owned neutral fixtures. No pairing URL, credential, raw Profile, private conversation, account identifier or device serial is included.

## Verified behavior

- Real system photo picker → app-owned image → preview → Done → saved conversation; cold launch retains it after deletion of the library original. Private feature-only metadata and owned-file readback agree.
- Device default solid/photo applies to an inheriting group; a DM image override survives global changes. Group solid override survives restoring the global theme; Use default removes only the group override.
- Native Fit preserves all corner markers; Fill crops proportionally. A vertical drag changes normalized position from0.5 to0.3852167941097201, survives reopening, and Center restores0.5. A wide image also preserves all four markers in Fit; a horizontal Fill drag persists x0.1609078038408842 across a cold launch. Fade0/60/100 saved/read back; content surfaces retain their opacity.
- Replacement + Cancel, system Back and the native sheet Close affordance leave the complete saved record unchanged. Each abandoned image is reclaimed; the referenced image remains.
- A fresh nonexistent owned-image reference shows the theme canvas and a visible replacement hint. Real picker replacement then saves a working image. Removing a previously displayed file alone was masked by the native image cache, so that first probe is not claimed as fallback proof.
- Keyboard-open/closed captures preserve image landmarks. A real multiline IME draft remains visible above the keyboard. At fixed system size, a composer draft survives background preview/cancel, and the attachment menu remains operable.
- Six light/dark ×1.0/1.3/2.0 cold-launch DM editor cases exercise scrolling, Done/cancel reachability. Settings and Group entry/editor cases use the same six combinations. Each case includes an actual DM Done and a global palette selection followed by Cancel.
- The canonical Host DM timeline is byte-identical before and after all background checks; only the separately tested native `hello` and actual provider reply exist.

## Limits and separate statuses

- Human feedback accepted the first runnable Android DM slice and authorized expansion. Later agent checks are not a second Human acceptance claim.
- iOS native picker, navigation, cold reopen, keyboard, Dynamic Type and VoiceOver are **blocked**: no accessible Mac/iOS QA lane; the environment device API reports device access disabled. The Human asked to finish the verifiable portion. iOS bundle export is a static check only. Issue #2118 remains open for native qualification.
- Live ADB font-scale changes reproduce pre-existing [#2110](https://github.com/BotHarness/DeepSeekBot/issues/2110) on both before and after: duplicate linking warning, navigation reset and no live-resize draft-retention qualification. Cold-launch font cases do not close that gap.
- TalkBack adjustment remains inconclusive: two bounded attempts were intercepted by the Android Accessibility Suite notification permission dialog. The original accessibility settings were restored. Slider labels/actions have deterministic coverage; neither the native gesture nor spoken feedback is qualified.
- Landscape, native EXIF/HEIC, real storage exhaustion, approvals with pending requests, and extended-history return-to-latest are not qualified by these captures. Deterministic owner/adapter tests cover injected copy/decode/write failures, corruption recovery, path rebasing and asset references; they are not native failure-injection proof.
- Full mobile run:79 files passed,6 skipped;579 tests passed,8 skipped. Focused owner/editor/render/position/navigation run:30 tests passed. Typecheck passed. Source Standards and Spec reviews each have0 unresolved findings.
- Windows monorepo full-suite attempt did not pass: multiple core assertions/timeouts occurred, then child Git processes stalled. Only the verified task process tree was stopped; raw logs remain private. Source-head Linux CI at `1e2294329147e15ff9272393c0e48a127141d341` passed all three full-suite shards, lint/format/typecheck/build, docs, mobile bundles and Host smoke ([run](https://github.com/BotHarness/DeepSeekBot/actions/runs/39072580362)). Final evidence-head CI is reported in the PR.
- Merge and post-merge recording are reported separately; these screenshots alone do not establish either.

## Capture index

The before editor state is its former profile/settings/group entry point: no chat-background editor existed. Scroll offsets differ when needed to reveal the new row or controls; locale, data, viewport, font and appearance are matched. Status-bar clock differences are capture time.

| Appearance / font scale | Conversation                                                            | New DM editor (prior profile)                                                                                           | Global setting / editor                                                                                                                                                  | Group entry / editor                                                                                             |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| light-100               | [before](before-light-100-chat.png) / [after](after-light-100-chat.png) | [before](before-light-100-profile.png) / [after](after-light-100-editor.png) / [controls](after-light-100-controls.png) | [before](before-settings-light-100.png) / [after](after-settings-light-100.png) / [editor](global-editor-light-100.png) / [palette](global-color-controls-light-100.png) | [before](before-group-light-100.png) / [after](after-group-light-100.png) / [editor](group-editor-light-100.png) |
| light-130               | [before](before-light-130-chat.png) / [after](after-light-130-chat.png) | [before](before-light-130-profile.png) / [after](after-light-130-editor.png) / [controls](after-light-130-controls.png) | [before](before-settings-light-130.png) / [after](after-settings-light-130.png) / [editor](global-editor-light-130.png) / [palette](global-color-controls-light-130.png) | [before](before-group-light-130.png) / [after](after-group-light-130.png) / [editor](group-editor-light-130.png) |
| light-200               | [before](before-light-200-chat.png) / [after](after-light-200-chat.png) | [before](before-light-200-profile.png) / [after](after-light-200-editor.png) / [controls](after-light-200-controls.png) | [before](before-settings-light-200.png) / [after](after-settings-light-200.png) / [editor](global-editor-light-200.png) / [palette](global-color-controls-light-200.png) | [before](before-group-light-200.png) / [after](after-group-light-200.png) / [editor](group-editor-light-200.png) |
| dark-100                | [before](before-dark-100-chat.png) / [after](after-dark-100-chat.png)   | [before](before-dark-100-profile.png) / [after](after-dark-100-editor.png) / [controls](after-dark-100-controls.png)    | [before](before-settings-dark-100.png) / [after](after-settings-dark-100.png) / [editor](global-editor-dark-100.png) / [palette](global-color-controls-dark-100.png)     | [before](before-group-dark-100.png) / [after](after-group-dark-100.png) / [editor](group-editor-dark-100.png)    |
| dark-130                | [before](before-dark-130-chat.png) / [after](after-dark-130-chat.png)   | [before](before-dark-130-profile.png) / [after](after-dark-130-editor.png) / [controls](after-dark-130-controls.png)    | [before](before-settings-dark-130.png) / [after](after-settings-dark-130.png) / [editor](global-editor-dark-130.png) / [palette](global-color-controls-dark-130.png)     | [before](before-group-dark-130.png) / [after](after-group-dark-130.png) / [editor](group-editor-dark-130.png)    |
| dark-200                | [before](before-dark-200-chat.png) / [after](after-dark-200-chat.png)   | [before](before-dark-200-profile.png) / [after](after-dark-200-editor.png) / [controls](after-dark-200-controls.png)    | [before](before-settings-dark-200.png) / [after](after-settings-dark-200.png) / [editor](global-editor-dark-200.png) / [palette](global-color-controls-dark-200.png)     | [before](before-group-dark-200.png) / [after](after-group-dark-200.png) / [editor](group-editor-dark-200.png)    |

Additional flow captures:

- [system-photo-picker](system-photo-picker.png)
- [cold-reopen](cold-reopen.png)
- [dm-fit-chat](dm-fit-chat.png)
- [dm-position-reopened](dm-position-reopened.png)
- [wide-fill-chat](wide-fill-chat.png)
- [wide-position-reopened](wide-position-reopened.png)
- [wide-fit-chat](wide-fit-chat.png)
- [fade-zero-chat](fade-zero-chat.png)
- [fade-sixty-chat](fade-sixty-chat.png)
- [fade-full-chat](fade-full-chat.png)
- [dark-preview-zero](dark-preview-zero.png)
- [dark-preview-full](dark-preview-full.png)
- [preview-theme-isolation](preview-theme-isolation.png)
- [cancel-preserved-chat](cancel-preserved-chat.png)
- [missing-owned-reference](missing-owned-reference.png)
- [missing-image-replaced](missing-image-replaced.png)
- [multiline-keyboard](multiline-keyboard.png)
- [draft-after-editor](draft-after-editor.png)
- [attachment-menu](attachment-menu.png)
- [group-inherits-color](group-inherits-color.png)
- [group-inherits-photo](group-inherits-photo.png)
- [group-override-after-global-reset](group-override-after-global-reset.png)

## Review follow-up

The four source-review findings were fixed in352c6e9da416d521398581ca8f0501c0e69f5298. Both Standards and Spec review have0 unresolved source/documentation findings. A subsequent native probe found the error alert below the initial scroll fold;3f4786f3b7cf2c9afa535d1d61cced44f5ce8158 moves it beside fixed Done/Cancel actions. That tiny delta also has0 findings on both axes.

- [Before inherited-image controls](before-inherited-image-controls.png), source1e2294329 (before review fixes; scrolled to controls). [Read-only inherited preview](after-inherited-image.png), source352c6e9da. A drag plus Done leaves the group override absent (record25), and [changing the global default still updates it](after-inherited-default-change.png) (record26). Explicit-image editing is unchanged.
- Source3f4786f3b, [unreadable metadata save refusal](unreadable-metadata-save-refused.png) at light/1.0 and [dark/2.0](unreadable-metadata-large-dark.png): only this task’s newest feature record temporarily had read permission removed. Done shows its error beside reachable actions. Save/cancel preserve the exact record and owned image. Restoring the original permission and cold reopening [recovers the original DM background](readable-metadata-recovered.png); revision26 and image file are unchanged. Font scale and night mode were restored. This is a native metadata-I/O failure probe, not native disk-exhaustion or image-decode proof.
- Conversation route regressions reject empty/partial/unknown scope; only Settings permits parameter-free default editing. Deterministic journal coverage distinguishes text I/O failure from incomplete JSON fallback. Failed hydration blocks writes and collection until a fresh successful read.
- Updated Windows mobile run:79 files passed,1 failed,6 skipped;590 tests passed,1 failed,8 skipped. The existing stream-replay test reported fetch failed/bad port. A focused rerun of that file plus the touched background/conversation paths passed all44 tests. It does not erase the full-run failure. Editor/style follow-up6 tests passed; typecheck, lint and format passed. New-head CI remains separately reported on the PR.
