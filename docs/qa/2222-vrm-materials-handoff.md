# T1 materials and room — implementation handoff

2026-10-19. **Work in progress, not accepted, do not merge.** Continue only T1 #2222 / draft PR #2265; do not start T2–T15.

## Current state (room iteration 3)

- Branch `claude/project-thread-wwzsop` carries iteration 3 on top of `codex/2222-vrm-companion` merged with current main. Results and evidence: [QA report, Room iteration 3](2222-vrm-companion.md#room-iteration-3--isolated-host-headless-chromium).
- Iteration 2 loads in an isolated Host; the stuck "Loading character" did not reproduce. An intermittent remount of the whole BotHarness shell (outside this Panel, cause undiagnosed) is the most likely explanation for a reset or reloading view; the Panel now keeps its choices across remounts and no longer shows loading as an error with Retry.
- Iteration 3 adds the plaster back wall with framed window and curtains, soft shader clouds, glow sun/moon, darker lamp-lit night and a wider desk camera. Verified only with headless Chromium/SwiftShader pixels, not in the Human's Chrome or on a GPU.

## Next work, in order

1. Human visual review against _Chill with You_ in their Chrome: desk composition, wall/curtain colors, cloud look, night exposure, and whether lilToon at night is acceptable without lamp light on the character.
2. If accepted, decide whether `codex/2222-vrm-companion` (PR #2265) takes these commits; otherwise iterate on the feedback.
3. Separately diagnose the BotHarness shell remount (sidebar, regions and every Panel rebuilt 28–75 s after load in about a third of isolated sessions, no plugin rebuild event). It is not part of T1.
4. Remaining from the earlier list: native Desktop/GPU performance sampling, alpha/outline review on a real GPU, exact-head PR explainer.

The sections below are the iteration 1–2 record and remain accurate for what they describe.

## Implemented, with verification boundaries

1. **Actual MToon/lilToon A/B**: added the pinned `@mochiya/three-liltoon@0.1.9` and reversible Scene controls buttons. Both were rendered in the Human's Chrome, same sample VRM, desk camera and Sunset setting before the room changes. MToon has harder light boundaries; the chosen lilToon preset has softer shadows/outline and stronger hair/shoulder rim light. This is a manual preset conversion, not arbitrary-VRM compatibility. MToon remains default.
2. `shading.ts` retains original material ownership and restores exact source references. VRM morph animation remains on the original skeleton. The adapter mirrors base color, opacity, emission and main UV scale/offset while lilToon is selected; it does not claim complete MToon material-expression equivalence. The sun is ordered before the secondary directional key because the port uses the first directional light. Point-lamp illumination does not carry into lilToon like it does into room PBR materials.
3. **Room iteration 1 was seen in Chrome**: procedural wood/bump and fabric weave; shaped red/black ergonomic chair with seams/armrests; desk mat/mouse; 2048 shadow map; lower lamp intensity; imported KayKit CC0 book set and decorated shelf. Asset state was `2/2`, 125 geometries / 31 textures in that view. Canvas and Panel parent bounds matched exactly, approximately 616 × 781 at the recorded split. These are one-view observations, not resource-leak/performance results.
4. **Iteration 1 was insufficient**: chair too tall, desk/fabric too dark, clouds looked like brown hills, camera cropped left-hand desk objects.
5. **Iteration 2 is implemented and built but NOT visually verified**: lower chair back, wider desk composition, hemisphere/environment fill, ACES tone mapping, softer colored cloud shader and smaller merged cloud lobes. The latest Chrome reload remained at Loading character during observation, then the Chrome extension connection disappeared. Host doctor remained healthy. Do not claim these latest changes render correctly until Chrome is reconnected and the loading state is investigated.

## Evidence

Committed images in `.github/pr-screenshots/2222-vrm-companion/`:

- `shader-a-mtoon-sunset.jpg` and `shader-b-liltoon-sunset.jpg`: actual first A/B, Chrome 1559 × 865, light theme, same camera/lighting. Clouds and idle motion were running; these are not pixel-identical animation frames. They predate the new room materials and final ACES/environment changes.
- `room-material-before.jpg`: previous room baseline.
- `room-material-iteration1.jpg`: first material/geometry iteration, visibly still needs work.

Older expanded-room screenshots and QA at the previous checkpoint are historical only. The current implementation has no Expand scene entry. Re-run work/speaking, mount/unmount, narrow/wide Panel, sunset/night and resource checks after finishing the room changes.

## Checks at handoff

- Root TypeScript check passed after iteration 2.
- The first 4-file test run found one identity-restoration failure: MToon restoration created a new array. Fixed by restoring the source array directly; the two shading tests then passed.
- Final checkpoint: `pnpm lint`, root `tsc --noEmit`, all four VRM companion test files (11 tests), and the Client rebuild passed, including the identity fix. Changed source files were formatted. Client size is approximately 18.49 MB before transport compression, plus source map.
- Full production build, mobile type checking and full-suite tests were not rerun for this handoff. Do not inherit the previous checkpoint's broader check statements as current results.
- Chrome had an existing `Multiple instances of Three.js` warning and lilToon ANGLE `isnan` optimization warnings. The inspected VRM Client bundle has one Three warning site and installed dependencies resolve Three 0.180.0; another bundled client may own a separate Three copy. The warning cause is not fully diagnosed. No shader compile error was observed in the first A/B, but this does not validate iteration 2.
- Earlier full Windows tests had 205 failures; only 12 were reproduced on the baseline. No claim that the whole suite is green or all failures are unrelated.

## Resume locally

- Reuse the task-owned worktree and isolated Host; do not restart unrelated profiles. Instance name `vrm-2222`, port `31852`, pinned DSH `0.2.1-rc.2`.
- `node scripts/verify-app.mjs doctor --name vrm-2222` checks ownership/authentication. Private launcher state and login URL are in the ignored `.humanlayer/verify/vrm-2222/instance.json`; never publish its token. The last diagnostic is `material-observation.json` in that directory.
- The Human authorized **their Chrome**. Reconnect the browser extension and discover the existing acceptance tab; do not switch to a different browser as a workaround. Chrome was absent from the tool inventory when this checkpoint was requested.
- Select QA Ada DM → VRM Companion → Scene controls. Compare MToon/lilToon under identical Sunset and Desk view. Inspect a fresh screenshot after the frame renders. The user's light theme should remain unchanged.
- Source: `packages/vrm-companion/src/client/{stage,room,outdoors,materials,chair,decor,shading,index}.ts*`. Selected glTF is embedded through `tsdown.config.ts`, not a new Host route. Run the Client builder with `config:false` to avoid accidental full config expansion.

## Iteration 2 next work (superseded)

1. Recover Chrome and diagnose the iteration-2 loading state with `verify-app observe`; confirm all new shaders/materials actually render.
2. Compare against the supplied game reference again: adjust camera/desk composition, chair scale/contact, cloud silhouette/color and room exposure. The current checkpoint is explicitly not visually complete.
3. Re-capture MToon/lilToon under the final room light/tone mapping. Verify real Activity and a new committed DM reply cause working gestures, gaze and nonzero mouth animation in both modes. T1 remains silent text-paced speaking, not audio lip-sync.
4. Check imported-asset error/late-load disposal, GPU resources after repeated closes, foreground rendering cost and alpha/outline issues. Keep the body full bleed at narrow and wide dock sizes.
5. Update the feature map and public guide to remove obsolete expanded-dialog directions; update QA, bilingual change fragment and exact-head PR explainer after actual validation. Add final matching before/after images, run the appropriate checks, push the same draft PR for Human acceptance. No merge or sibling implementation.

## Asset and shader references

- [Shader evaluation](../research/2026-10-19-three-liltoon-evaluation.md), [low-poly source research](../research/2026-10-19-low-poly-room-assets.md).
- KayKit `book_set` and `shelf_B_small_decorated` are the only imported furniture assets. Their original glTF/BIN/PNG and CC0 license are under `packages/vrm-companion/assets/kaykit`. The inspection manifest also inventories two downloaded candidates that are not shipped.
- The original pixiv sample remains under its VRM Public License. It is not final character artwork. No Tripo credits were spent.
