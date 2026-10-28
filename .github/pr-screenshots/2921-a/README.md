# Physical Android Profile and gesture QA — baseline #2921

Tested source: **686c79a3068d4f2e11c21e4738ea7e5d93427785**. Native arm64-v8a development Debug binary rebuilt from merged #3082 main **07bf489384743ff1aed9d113bdee01d37a703925**, with unchanged native inputs through the tested JS. Host source matches the tested JS; DSH0.2.1-rc.3 / opencode-go/deepseek-v4.1-flash. Android16, 1220×2712, gesture navigation, Chinese UI.

This evidence is baseline QA, not acceptance of later main or the new #3127 cache/paging implementation. Baseline findings: #3108, #3113, #3114, #3118, #3125. Human reported vibration has no problem and requested cached/finger-following tab pages; TalkBack speech was not confirmed. Android emulator was explicitly skipped; iOS/Live Activity belong to Mac QA. Development video does not establish Release FPS.

## Provenance and redaction

Original PNG/XML, recordings, failed attempts, builds and canonical readbacks stay in the private Windows QA archive outside disposable code worktrees. These are deterministic full-resolution derivatives: top124px masks personal status-bar data; black rectangles additionally hide actual private computer names or paths. No product content was generated or retouched. Video audio/metadata were removed; only waiting portions were trimmed, and reply clips end before the private computer-name Chats header.

The [manifest](manifest.json) maps every image to its original hash, capture time, source, appearance, exact font_scale/density, masks and derivative hash; it also records original-video hashes and clip intervals. Max-work screenshots disclose visual-only capture; the matching native Work tab selection was separately observed. Native-popup screenshots are explicitly identified. Files TXT taps use the system share sheet per current DESIGN; no recipient was selected, and external file viewing is not claimed.

Static matrices: original density480, font_scale1.0/1.3/2.0 in both themes; manufacturer Settings slider maximum was density610, with font1.0 representative pages and font2.0 header/Work plus actual native Work selection. First-open real Gboard and quote/cancel checks cover all six original-density text cells. Repeated IME failure is separately shown by ime2/ime3; the light control used A after a real field-tap/Back precondition, while the dark clean sequence used B. Live font changes are not qualified by these cold-start matrices.

## Recordings

| Clip | Actual journey | Appearance | Interval |
|---|---|---|---|
| [v-tab-d.mp4](v-tab-d.mp4) | Native Memory / Work / Files selection | dark | 29–44s of original |
| [v-search-d.mp4](v-search-d.mp4) | Horizontal native search-result drag incorrectly opens B | dark | 10–23s of original |
| [v-reply-d.mp4](v-reply-d.mp4) | Native reply, real IME, profile push and tab changes | dark | 22–48s of original |
| [v-reply-l.mp4](v-reply-l.mp4) | Same actual native motion sequence in light appearance | light | 23–54s of original |

## Screenshots

| File | Scene | Appearance | font_scale | Density |
|---|---|---|---|---|
| [w-l.png](w-l.png) | work-actual-light | light | 1 | 480 |
| [w-d.png](w-d.png) | work-actual-dark | dark | 1 | 480 |
| [m-l.png](m-l.png) | memory-grid-light | light | 1 | 480 |
| [m-d.png](m-d.png) | memory-grid-dark | dark | 1 | 480 |
| [mr-l.png](mr-l.png) | memory-reader-light | light | 1 | 480 |
| [mr-d.png](mr-d.png) | memory-nested-reader-dark | dark | 1 | 480 |
| [mf-l.png](mf-l.png) | memory-folder-light | light | 1 | 480 |
| [mf-d.png](mf-d.png) | memory-folder-dark | dark | 1 | 480 |
| [f-l.png](f-l.png) | files-light | light | 1 | 480 |
| [f-d.png](f-d.png) | files-dark | dark | 1 | 480 |
| [fi-l.png](fi-l.png) | files-list-light | light | 1 | 480 |
| [img-l.png](img-l.png) | image-preview-light | light | 1 | 480 |
| [img-d.png](img-d.png) | image-preview-dark | dark | 1 | 480 |
| [rt-l.png](rt-l.png) | routines-light | light | 1 | 480 |
| [rt-d.png](rt-d.png) | routines-dark | dark | 1 | 480 |
| [s-l.png](s-l.png) | settings-light | light | 1 | 480 |
| [s-d.png](s-d.png) | settings-dark | dark | 1 | 480 |
| [st-l.png](st-l.png) | sticky-light | light | 1 | 480 |
| [st-d.png](st-d.png) | sticky-dark | dark | 1 | 480 |
| [p-l.png](p-l.png) | bot-pair-light | light | 1 | 480 |
| [p-d.png](p-d.png) | bot-pair-dark | dark | 1 | 480 |
| [g-l.png](g-l.png) | group-members-light | light | 1 | 480 |
| [g-d.png](g-d.png) | group-members-dark | dark | 1 | 480 |
| [gp-l.png](gp-l.png) | group-pending-confirmed-light | light | 1 | 480 |
| [gp-d.png](gp-d.png) | group-pending-confirmed-dark | dark | 1 | 480 |
| [gd-l.png](gd-l.png) | group-disband-dialog-light | light | 1 | 480 |
| [gd-d.png](gd-d.png) | group-disband-dialog-dark | dark | 1 | 480 |
| [cf-l.png](cf-l.png) | memory-conflict-light | light | 1 | 480 |
| [cf-d.png](cf-d.png) | memory-conflict-dark | dark | 1 | 480 |
| [rn-l.png](rn-l.png) | routine-end-light | light | 1 | 480 |
| [rn-d.png](rn-d.png) | routine-end-dark | dark | 1 | 480 |
| [sel-l.png](sel-l.png) | multiselect-light | light | 1 | 480 |
| [sel-d.png](sel-d.png) | multiselect-dark | dark | 1 | 480 |
| [se-l.png](se-l.png) | search-unique-light | light | 1 | 480 |
| [se-d.png](se-d.png) | search-unique-dark | dark | 1 | 480 |
| [sea-l.png](sea-l.png) | search-unique-after-light | light | 1 | 480 |
| [sea-d.png](sea-d.png) | search-unique-after-dark | dark | 1 | 480 |
| [ime1.png](ime1.png) | ime-first-reply-dark | dark | 1 | 480 |
| [ime2.png](ime2.png) | ime-second-reply-dark | dark | 1 | 480 |
| [ime3.png](ime3.png) | ime-after-field-tap-dark | dark | 1 | 480 |
| [a-l.png](a-l.png) | assignment-top-light | light | 1 | 480 |
| [a-d.png](a-d.png) | assignment-top-dark | dark | 1 | 480 |
| [as-l.png](as-l.png) | assignment-subagent-light | light | 1 | 480 |
| [as-d.png](as-d.png) | assignment-subagent-dark | dark | 1 | 480 |
| [mo-l.png](mo-l.png) | model-nested-light | light | 1 | 480 |
| [mo-d.png](mo-d.png) | model-nested-dark | dark | 1 | 480 |
| [ac-l.png](ac-l.png) | access-controls-light | light | 1 | 480 |
| [ac-d.png](ac-d.png) | access-controls-dark | dark | 1 | 480 |
| [ah-l.png](ah-l.png) | approval-history-light | light | 1 | 480 |
| [ah-d.png](ah-d.png) | approval-history-dark | dark | 1 | 480 |
| [ar-l.png](ar-l.png) | approval-rules-light | light | 1 | 480 |
| [ar-d.png](ar-d.png) | approval-rules-dark | dark | 1 | 480 |
| [bp-l.png](bp-l.png) | profile-b-light | light | 1 | 480 |
| [bp-d.png](bp-d.png) | profile-b-dark | dark | 1 | 480 |
| [off.png](off.png) | offline-no-reply | dark | 1 | 480 |
| [r10l.png](r10l.png) | reply-font-10-light-static | light | 1 | 480 |
| [r10d.png](r10d.png) | reply-font-10-dark-static | dark | 1 | 480 |
| [r13l.png](r13l.png) | reply-font-13-light-static | light | 1.3 | 480 |
| [r13d.png](r13d.png) | reply-font-13-dark-static | dark | 1.3 | 480 |
| [r20l.png](r20l.png) | reply-font-20-light-static | light | 2 | 480 |
| [r20d.png](r20d.png) | reply-font-20-dark-static | dark | 2 | 480 |
| [q10l.png](q10l.png) | quote-font-10-light-static | light | 1 | 480 |
| [q10d.png](q10d.png) | quote-font-10-dark-static | dark | 1 | 480 |
| [q13l.png](q13l.png) | quote-font-13-light-static | light | 1.3 | 480 |
| [q13d.png](q13d.png) | quote-font-13-dark-static | dark | 1.3 | 480 |
| [q20l.png](q20l.png) | quote-font-20-light-static | light | 2 | 480 |
| [q20d.png](q20d.png) | quote-font-20-dark-static | dark | 2 | 480 |
| [xp-l.png](xp-l.png) | max-work-light | light | 2 | 610 |
| [xp-d.png](xp-d.png) | max-work-dark | dark | 2 | 610 |
| [h-l.png](h-l.png) | history-stuck-light | light | 1 | 480 |
| [h-d.png](h-d.png) | history-stuck-dark | dark | 1 | 480 |
| [hr-d.png](hr-d.png) | history-after-field-focus | dark | 1 | 480 |
| [qs-l.png](qs-l.png) | reply-sent-light-final | light | 1 | 480 |
| [qy-l.png](qy-l.png) | reply-own-light-final | light | 1 | 480 |
| [qr-l.png](qr-l.png) | reply-reentered-light-final | light | 1 | 480 |
| [ime2-l.png](ime2-l.png) | ime-second-reply-light-final | light | 1 | 480 |
| [ime3-l.png](ime3-l.png) | ime-after-field-tap-light-final | light | 1 | 480 |
| [qc-l.png](qc-l.png) | question-no-reply-light-r2 | light | 1 | 480 |
| [qc-d.png](qc-d.png) | question-no-reply-dark | dark | 1 | 480 |
| [fi-d.png](fi-d.png) | files-list-dark-final | dark | 1 | 480 |
| [dis-l.png](dis-l.png) | memory-discard-after-confirm-light | light | 1 | 480 |
| [dis-d.png](dis-d.png) | memory-discard-dark | dark | 1 | 480 |
| [l13l.png](l13l.png) | list-font-13-light | light | 1.3 | 480 |
| [p13l.png](p13l.png) | profile-font-13-light | light | 1.3 | 480 |
| [m13l.png](m13l.png) | memory-font-13-light | light | 1.3 | 480 |
| [s13l.png](s13l.png) | settings-font-13-light | light | 1.3 | 480 |
| [l13d.png](l13d.png) | list-font-13-dark | dark | 1.3 | 480 |
| [p13d.png](p13d.png) | profile-font-13-dark | dark | 1.3 | 480 |
| [m13d.png](m13d.png) | memory-font-13-dark | dark | 1.3 | 480 |
| [s13d.png](s13d.png) | settings-font-13-dark | dark | 1.3 | 480 |
| [l20l.png](l20l.png) | list-font-20-light | light | 2 | 480 |
| [p20l.png](p20l.png) | profile-font-20-light | light | 2 | 480 |
| [m20l.png](m20l.png) | memory-font-20-light | light | 2 | 480 |
| [s20l.png](s20l.png) | settings-font-20-light | light | 2 | 480 |
| [l20d.png](l20d.png) | list-font-20-dark | dark | 2 | 480 |
| [p20d.png](p20d.png) | profile-font-20-dark | dark | 2 | 480 |
| [m20d.png](m20d.png) | memory-font-20-dark | dark | 2 | 480 |
| [s20d.png](s20d.png) | settings-font-20-dark | dark | 2 | 480 |
| [dl10l.png](dl10l.png) | list-font-10-light-display-max-r3 | light | 1 | 610 |
| [dp10l.png](dp10l.png) | profile-font-10-light-display-max-r3 | light | 1 | 610 |
| [dm10l.png](dm10l.png) | memory-font-10-light-display-max-r3 | light | 1 | 610 |
| [ds10l.png](ds10l.png) | settings-font-10-light-display-max-r3 | light | 1 | 610 |
| [dl10d.png](dl10d.png) | list-font-10-dark-display-max-r3 | dark | 1 | 610 |
| [dp10d.png](dp10d.png) | profile-font-10-dark-display-max-r3 | dark | 1 | 610 |
| [dm10d.png](dm10d.png) | memory-font-10-dark-display-max-r3 | dark | 1 | 610 |
| [ds10d.png](ds10d.png) | settings-font-10-dark-display-max-r3 | dark | 1 | 610 |
