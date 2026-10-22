# Batch51 — iOS composer #2567

## Exact comparison

Product source `da4f6cf7b074bf3e444efda5f9f772033a8a6401`, merged as `b54b218a487a88373c5bbba5cb45959afc47b20b`.
Before `eb25496bfe2976706ea9fff16841f1edc494aa89`; After `2f2f8bd81dc0d1331327b9ed7107cff4c3ae8156`. Both carry the same three pairing/notice presentation changes from `cb65e435e76f`; their diff is exactly #2567. Later main/Connect merges are not included in this comparison and need their own batch.

Existing iOS27 iPhone17Pro Simulator, 402×874 points, English, installed signed Debug dev client. Qualified build source `683b0cbe9c0f158e80929601f59a312ff5f9c4bf`; strict native fingerprint `2ab2d67bec3a3fd2186c6ea9cf85ceadb07c4b7a` matched the recomputed frozen batch. Installed executable SHA256 `cbf75e97a9776956bca0bcdf081a0dc5da2a6ba858d5bf4fbd26a58e3e5c62e7`. Expo58.0.17/RN0.88.0. No app install/rebuild/new Simulator/erase. The automation helper rebuilt its XCTest runner once; this is separate from the app binary. Disk remained below the native-build floor.

## Results

| Step | Result | Evidence / limit |
|---|---|---|
| Pair and open Chat without post-pair restart | Pass | Online synthetic workspace then native composer; no original sheet error |
| Matched short draft, real keyboard, light/dark × large/accessibility-large/accessibility-extra-extra-extra-large | Pass | `bl1..bl3`, `bd1..bd3` / `al1..al3`, `ad1..ad3`; same draft and synthetic timeline; keyboard prediction words vary |
| Integrated attachment island and reachable send | Pass | The After control is inside the continuous taller rounded surface at all three sizes |
| Live default→maximum→default draft preservation | Pass for text and visible keyboard | Exact draft retained; automation transient focus/readback limitations mean precise caret-selection continuity is not fully qualified |
| Actual typing and multiline growth | Pass | Native keyboard typing, three-line draft; `b-multi.png`, `a-multi.png` |
| Expanded editing → Done | Pass | Same three-line draft returned on both versions |
| Attachment menu open/close | Pass | `b-menu.png`, `a-menu.png`; draft retained |
| Native File picker cancellation | Pass | Cancel returned to unchanged draft |
| Owned photo pick/remove | Pass | `a-pick.png`; selected one batch-owned screenshot and removed it; subsequent message had no attachment |
| Native multiline Send → canonical Host readback | Pass | Exact `Composer QA draft\nSecond line\nThird line`, Human message, revision3, no attachment/mention metadata |
| Real Bot reply through direct DeepSeek | Pass | Human selected DEEPSEEK_API_KEY; full QA Bot plan read back as `deepseek-official/deepseek-flash` (V4.1 Flash), high for Orchestrator and Assignments. Native request `Batch51 direct route verified: reply READY51 now.` received committed `READY51`, matched replyTo and handled delivery; `a-reply.png` |
| Dictation start | Fail / environment unresolved | Human granted speech+microphone; repeated native tap immediately shows “Dictation stopped before it finished”; `a-voice.png`. Do not infer a composer regression or successful recording |
| Dictation Stop/Cancel/transcription | Untested | Recording never remained active; requires separate native audio diagnosis / physical confirmation |
| Empty-state six-case matrix, Reduce Transparency, explicit mention selection | Untested | Not covered by the captured short-draft matrix |
| CJK IME, VoiceOver, rotation, Android, physical iPhone, Human acceptance | Untested | Separate lanes; no inference from these screenshots |

Initial OpenCode Go attempts failed with429 GoUsageLimitError. They are preserved as historical failures; the later direct DeepSeek run is independent. Host default was launch-locked, so only the synthetic Bot's complete model plan was changed. No global credentials were changed. Driver `fill` failed readback; native `type` and the observed Select All menu succeeded. Sparse row accessibility required a screenshot-grounded tap. JavaScript reload replayed the original expired pairing link; Back/Close returned to the already paired workspace, without a native crash. These automation/setup limitations are not reported as product passes.

## Cleanup

Test pairing removed, original workspace retained, both task-owned Host keys revoked, synthetic Bot deleted through the owning preview/confirmation API with memory evidence retained. The single imported test photo was deleted from the library (10 originals remain; fixture retained by Photos Recently Deleted for30days). Light/large restored. Only the two newly granted app permissions existed; app-scoped reset restored their original prompt state and terminated the dev app. Driver session closed; owned Host/Metro stopped. Native products, Simulator and physical device preserved. This is not release1.5 acceptance or authorization to publish.

## Screenshot key

`b`=Before, `a`=After; `l`=light, `d`=dark;1=large,2=accessibility-large,3=accessibility-extra-extra-extra-large. Original files are unmodified screenshots of synthetic test data; no private routes, credentials, device IDs or personal conversations appear. Each public copy was hash-checked against its local original.
