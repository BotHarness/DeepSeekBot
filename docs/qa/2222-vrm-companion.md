# T1 VRM Panel verification

Date: 2026-10-19. Issue: [#2222](https://github.com/BotHarness/DeepSeekBot/issues/2222). Base: c124687079368a4156de00c3edc016bb7c50cad2. This report accompanies the first implementation PR; Human acceptance remains pending and T2–T15 remain blocked.

## Real runtime

- Isolated Windows Host using the worktree-pinned DSH 0.2.1-rc.2, native Web Client, Chrome 153.0.8010.36, 1440 × 900.
- Independently installed the local VRM Bundle with the native plugin CLI into the same isolated Profile. A CLI Profile mutation required restarting this Host. Removal then restart removed the registration and character views while preserving Bot messages; reinstall then restart restored the saved fixed binding. No claim of hot uninstall is made.
- A real Bot DM used an existing authorized DeepSeek provider and DeepSeek-V4.1-Flash. The initial Go provider returned QUOTA; that failed attempt was preserved and is not counted as success.
- Real UI requests produced thinking, a shell-tool working state, a committed Channel reply and simultaneous working/speaking. Existing bot-activity and channel-messages CLI/Host reads corroborated the visible state. The old floating overlay was not needed.
- Two global instances kept distinct Ada/Bob bindings across chat selection, page refresh and graceful browser restart. Restored views did not speak historical messages. The Group header had no contextual character entry; fixed global instances remained bound.
- Reduced-motion rendering, actual WebGL context loss, readable fallback/retry, and deletion were exercised. The deleted renderer reported context loss while the other renderer remained usable. Successful journeys recorded no page/console errors.
- An earlier QA script forced browser termination and a later run lost persisted instance metadata. The script now first closes normally, with a bounded task-owned fallback; the full browser restart path then passed. Private layout snapshots retain the investigation.

## Automated checks

The affected selection (Client, VRM bundle, browser preview, development-model helper, source policy and verification inventory) passed: 260 test files / 1,990 tests, plus one skipped file/test. After the last changes, the three delta suites passed 32 tests and the built VRM bundle contract passed separately. Type checking and production build passed after a fresh frozen-lockfile dependency installation.

The full Windows suite was attempted and **was not green**: 205 failed, 6,966 passed, 40 skipped. Failures included Windows fsync/permission/path assumptions and timeouts; stale assertions caused by this change were corrected and the affected selection rerun. A clean export of the base reproduced 12 failures across the Lark provider contract, iOS voice preflight and links CLI suites (13 passed). That baseline sample does not establish that every full-suite failure is unrelated. Full CI is a separate status on the PR.

## Original standing-view two-renderer sample

Both independent renderers held 13 geometries, 28 textures and 20 draw calls each over a five-second observation, with 129 additional rendered frames per instance (about 25.8 fps at a configured 30 fps cap). These are Three.js resource counters, not measured GPU memory. Model loading was below 1.2 seconds in these local observations; it is not a network-download benchmark. The embedded technical sample is 10.28 MiB and the Client bundle is about 16 MB before compression. No mobile/native Desktop or sustained performance qualification is claimed.

## Room iteration — Chrome acceptance

The subsequent Human-authorized scene iteration was verified in the Human-selected Chrome against the same isolated Host. The in-app browser could not reach that Host; Chrome successfully used the normal authenticated session. No authentication or browser security setting was weakened. Screenshots below describe the new room; the earlier counters and captures above describe the original standing view, not its current rendering cost.

- The canvas fills the Panel body, with status, scene controls and committed speech overlaid. Expanding uses a native dialog with the same renderer; returning preserves the current scene. Both the narrow dock and expanded 1559 × 865 viewport were inspected. QA caught a closed-dialog interaction failure after returning: the inline view now stays an open non-modal dialog, switching to modal only while expanded. Expand → Return → Expand and Escape were rechecked through real controls.
- Self-authored geometry supplies walls, ceiling, floor, window frames, desk, keyboard, chair, books, lamp, cup, plant and headset. The window looks into a 3D exterior: sky sphere, instanced cloud volumes, balloons, sun/moon and stars. Local time drives sky/light color and sun direction; Sunset/Night are explicit previews. Cloud drift, plant sway and steam are bounded ambient animation, paused by reduced motion. This is a view-local room, with no new durable world state.
- The character starts seated. Hands reach the keyboard through a two-bone IK solve. Stand, bounded walking behind the desk, and return-to-chair were driven through the real controls; the final seat returned to `(0.580, -0.150)` with seated amount `1.000`. Camera presets, sunset/night, expand/return and refresh were exercised. Native skeletal axes are preserved when attaching the original headset.
- `QA-WORK-1019` ran a real 20-second waiting shell tool. The screenshot showed `working` and a typing pose; the online `bot-activity` command corroborated revision 20, `executing`, `pwsh`, one active tool. Its committed reply then drove head gaze and an open mouth; the DOM observation recorded mouth weight `0.65`. The earlier `QA-MOUTH-1019` independently captured a visible open mouth with weight `0.2`. These are silent text-paced expressions, not audio lip-sync.
- At the expanded Room view, the renderer reported 151 geometries, 30 textures and 166 draw calls. Counts varied with the frustum and first-use GPU uploads. Chrome window occlusion throttled animation even while document visibility was `visible`; no foreground frame-rate or sustained room-performance claim is made. The current Client bundle is approximately 16.16 MB before compression.
- The inspected Chrome log contained no errors. Reloads emitted the existing multiple-Three.js-import warning; this is retained as a qualification limit. The room's new disposal path is covered by ownership inspection; the prior standing-view context-loss/deletion journey is not presented as a new room leak test.

The final scene regression selection passed 32 tests in six files, including local motion and wall-clock environment behavior. Repository lint, format check, root/mobile type checking and production build passed. The earlier full Windows-suite failures remain disclosed above; this iteration did not rerun that full suite.

The comparison follows the game's close desk camera, warm window light, seated companion, overlay controls and time-varying exterior. It does not claim identical character art, furniture assets, animation quality or the game's full interaction system. The existing licensed VRM sample remains in use. Research on official game screenshots, Three.js room examples and Tripo limitations is recorded under `docs/research/2026-10-19-*.md`; no game assets were copied and no Tripo credits were spent.

For Human acceptance, open VRM QA Ada → Messages → VRM Companion and widen the Panel split. Use Scene controls to compare Desk/Room/Portrait, Sunset/Night/Local time, and Stand up/Walk around/Sit down. Send a new DM to inspect the independent Activity and speaking channels. Selected room screenshots live in `.github/pr-screenshots/2222-vrm-companion/room-*.jpg`; raw browser observations and the login link remain private.

## Room iteration 3 — isolated Host, headless Chromium

Date: 2026-10-19. Branch head before this iteration: `4699c324` (T1 merged with current main). A Linux cloud container ran an isolated Host with the worktree-pinned DSH 0.2.1-rc.2, the native VRM Bundle installed with the Profile CLI and a Host restart, and Puppeteer's headless Chromium using SwiftShader WebGL at 1560 × 865. The Human's Chrome was not available to this run; these are software-rendered pixels and say nothing about frame rate or GPU cost.

- **Iteration 2 loads.** The handoff's stuck "Loading character" did not reproduce: every load reached `data-vrm-loaded`, assets `2/2`, with no page or console errors. Separately, the whole BotHarness shell (sidebar, regions, workspace mount and every Panel) was torn down and rebuilt by the DSH React tree in 6 of 19 traced sessions, 28–75 seconds after page load. No plugin `rebuilt` event preceded it. The VRM view therefore reloads; before this iteration it also reset to Desk/Local time/MToon and briefly showed "Loading character…" inside the error box with a Retry button. The shell remount cause is not diagnosed and is outside this Panel.
- **Remount handling.** Loading is now a transient status without Retry; only load failure or WebGL context loss offers Retry character. Camera, room time and shading are remembered per Bot for the page session and reapplied on remount. Closing and reopening VRM Companion after choosing Sunset and lilToon restored `vrmMood=sunset`, `vrmShading=liltoon`.
- **Room.** The back wall is plaster with a framed 2.4 × 1.5 m window opening, mullion/transom, sill and linen curtains with slow sway; the desk gained a front apron. Clouds are soft fbm-shaded billboards in three depth layers instead of faceted marching-cube blobs; the sun and moon are glow disks. Night drops ambient/fill/key/environment light and raises the desk lamp, which then dominates the desk under MToon.
- **Desk camera.** The previous framing cropped the lamp and cup at a 609 px Panel. The new default (38° FOV, higher and further back) keeps the lamp, cup and seated character in frame, with the desk in the lower third. Inspected at 364, 609 and 977 px wide Panels.
- **Shader A/B.** MToon and lilToon were captured at the same camera under Sunset and Night. lilToon is darker and cooler at night because the port uses only the first directional light; the lamp does not light the character in that mode. MToon remains the default.
- **Real DM.** `QA-WORK-0716` to VRM QA Ada through the visible composer, model DeepSeek V4.1 Flash via the configured opencode-go route. The Panel showed idle → thinking → working → speaking, with mouth weight 0.4 while the committed reply was shown. `bot-trace` recorded `bash` `sleep 6` then `channel_send`; `channel-messages` returned the committed Bot message. Silent text-paced speaking, not lip-sync.
- **Movement.** Stand up → Walk around moved the character along the lane behind the desk; Sit down returned it to `(0.580, -0.150)` with seated amount 1.000, clear of the new wall.
- **Resources.** Five close/reopen cycles each settled at 144 geometries / 34 textures / 142 draw calls in the default view, and every closed renderer's WebGL context was lost while the open one stayed live. Closing three times mid-load, then reopening, loaded `2/2` assets with no page or console errors. These are Three.js counters, not GPU memory measurements.

Selected captures: `room-iteration2-sunset.jpg` (before), `room-iteration3-light.jpg`, `room-iteration3-dark.jpg`, `room-iteration3-narrow-night.jpg`, `room-iteration3-room-view.jpg`, `shader-ab-iteration3.jpg` and `room-iteration3-working-speaking.jpg` in `.github/pr-screenshots/2222-vrm-companion/`.

## Activity facial expressions (#2304)

Date: 2026-10-19. Sub-issue [#2304](https://github.com/BotHarness/DeepSeekBot/issues/2304) of T1. Same isolated Host setup and SwiftShader caveat as iteration 3.

- **Mapping.** The sample model exposes `happy relaxed sad angry surprised` (`data-vrm-faces`). Each Activity drives a blend of these: idle relaxed with an occasional smile, thinking a slight frown with raised gaze, working focused brows, waiting an expectant smile, blocked a troubled frown. Speaking clears the relaxed eyes and adds a smile except when blocked. Weights ease at a 4/s rate; reduced motion snaps them and drops the idle smile. A view that is not live (reconnecting, unavailable, paused) returns to neutral.
- **First pass was too subtle.** At 0.1–0.4 weights the five faces were barely distinguishable in a portrait close-up; weights were roughly doubled. At `angry` above 0.3 this model nearly closes its eyes, so working uses `angry` 0.2 with a little `surprised`.
- **Close-ups.** A scratch harness mounted the same `mountStage` with each Activity snapshot and captured a portrait close-up per state; dominant face: idle → relaxed, thinking → sad, working → angry, waiting → happy, blocked → sad, working + speaking → happy, reconnecting → neutral (`face-activities.jpg`).
- **Real DM.** `QA-FACE-1019b` to VRM QA Ada (DeepSeek V4.1 Flash via opencode-go) moved the Panel idle → thinking → working → speaking (mouth 0.2) → idle; `bot-trace` recorded `bash` `sleep 12` then `channel_send`. The stage reported the thinking face while thinking and the relaxed idle face after the reply. Software rendering runs at a few frames per second, so the blend visibly lags the label by a few seconds there.

## Idle gestures (#2305)

Date: 2026-10-19. Sub-issue [#2305](https://github.com/BotHarness/DeepSeekBot/issues/2305). Same isolated Host and SwiftShader caveat.

- **Gestures.** Window glance (head and torso turn toward the window side), stretch (both arms released from the keyboard and raised, eyes closed), chin rest (right hand to the chin), sip (right hand reaches the mug handle, carries the mug to the mouth and back, steam fades while it is lifted) and a smiling glance at the viewer.
- **Close-ups.** A scratch harness forced each gesture at a fixed progress through the real `mountStage` (`idle-gestures.jpg`). Inspected for hand contact, arm crossing and mug position; the first window pose twisted the torso enough to fold the keyboard arm and was reduced.
- **Sip grip rework (Human feedback).** The first sip only pulled the wrist to the handle with two-bone IK; the hand stayed flat and the wrist unrotated, so it read as poking the mug. The mug now declares a grip: a wrist point and a hand orientation relative to the mug, and a finger curl. The arm IK reaches the grip, the wrist turns to the grip orientation, the fingers and thumb curl through the handle, and the mug follows a planned path (turned so the handle is on the character's right, bottom raised, rim at the mouth). The mug moved to within arm's reach with the handle facing the character: with the previous, oversized mug the wrist ended 0.021 m from the grip at the table and on it while lifting and drinking. Side and desk views before and after: `idle-sip-grip.jpg`.

## Real-scale low-poly room (Human feedback on #2305)

Date: 2026-10-19. Same scratch harness through the real `mountStage`, with both KayKit models loaded; SwiftShader caveat as above.

- **Feedback.** The cup was far too big, every object should follow real-world proportions, and the style should follow Chill with You: low-poly rather than realistic, with an anime-like toon shader and strong mood lighting.
- **Proportions.** Mug 8.2 cm across and 9.5 cm tall (was 17 × 18 cm); tenkeyless keyboard 35 × 12.5 cm with 80 instanced keys at 19.5 mm pitch (was 57 × 20 cm); 27-inch monitor (was about 34-inch) on a smaller stand; 4 cm desk top; articulated desk lamp about 40 cm tall (was a 15 cm-radius base); books scaled to about 20 cm; a boombox and a penguin plush on the window seat; a smaller plant. The keyboard hand targets moved with the keyboard, and the mug's grip (wrist point, rim) was redefined for the smaller mug while keeping the same hand-sized wrist offset.
- **Style.** All room materials, including the KayKit models, are flat-shaded `MeshToonMaterial` with a three-step gradient; wood grain, weave bump, clearcoat and sheen were removed; boxes have a single chamfer and cylinders 10–12 sides. The lamp is a spotlight inside a dark shade with a lit interior; at night the ambient light turns blue so the lamp pool carries the warm light.
- **Check.** Sunset and Night in the desk view and an over-the-shoulder view, typing and mid-sip (`room-lowpoly.jpg`). Both hands rest on the smaller keyboard; in the sip the fingers go through the handle and the rim reaches the mouth. Contact was inspected visually; it was not re-measured numerically after the rescale.
- **Natural trigger.** In the isolated Host, VRM QA Ada at idle started `stretch` after 8.1 s of render time with no input.
- **Work.** `QA-IDLE-1019` (real DM, DeepSeek V4.1 Flash) moved the Panel to thinking and working; `data-vrm-idle` stayed `none` throughout. Retreat from a gesture already in progress is covered by unit tests, not by a captured frame.

## Richer room and model files (Human feedback)

Date: 2026-10-19. Same scratch harness and SwiftShader caveat.

- **Feedback.** The cup and keyboard were better, the low-poly direction was fine, but the room was still rough; also try official free models such as VRoid's.
- **Props.** Desk hutch with procedurally sized books, sprout and reed diffuser; pen cup, phone, notebooks, coaster and succulent on the desk; a three-drawer cabinet; an octagonal rug; baseboards; a star-chart poster; a wall clock driven by local time; a floor lamp; string lights across the window; a candle, a book stack and a cushion on the window seat. The floor lamp, string lights and candle follow the room's darkness. Desk, room and night views: `room-props.jpg`.
- **Model files.** VRoid Hub and its CC0 sample models are not reachable from the agent environment, and downloading needs a signed-in account, so no VRoid model is bundled. Scene controls gained **Open VRM file…**, which loads a local `.vrm` through an object URL for that Bot's view in the page session (`data-vrm-model="file"`), and **Sample character**. VRM 0.x models are rotated to face the camera and their normalized-bone rotations are mirrored (x and z negated, wrist targets turned 180°), as three-vrm requires; `data-vrm-spec` reports `0` or `1`. In the isolated Host, choosing a local copy of the sample switched the view to `data-vrm-model=file`, reloaded it (`data-vrm-spec=1`, loaded) with the file name shown as pressed, and **Sample character** returned it to `sample`. The VRM 0.x path is untested until a real VRM 0.x file is provided.

## Chill with You composition and VRoid models (Human feedback)

Date: 2026-10-19. Same scratch harness and SwiftShader caveat, 960 × 540 frames.

- **Feedback.** Move the computer like the Chill with You screenshot and recreate that composition as closely as possible; try official VRoid models.
- **Layout.** The monitor moved from the desk's left end to the front of the character, turned 0.6 rad toward the camera; the desk lamp stands beside it and leans over the keyboard; a nine-book row with a bookend sits behind the mug; the penguin plush is larger and sits on the window seat between the plant and the boombox. The chair is dark with red piping and a red seat base; the keyboard has dark keys; a sketch board with sticky notes hangs left of the window.
- **Camera and light.** Desk view moved beside the desk at the character's front-left (offset 0.98, 0.2, 0.78 from the target), so the face reads three-quarter, the monitor frames the left edge and the window and chair fill the right. Room view comes from the front-right so the monitor no longer hides the character; Portrait comes from the same side. Sunset sky and clouds are redder and more saturated, the toon gradient is darker in shadow, twilight front light is reduced, ambient turns orange at twilight and teal-blue at night. The lamp shade is unlit-dark outside (Lambert) because toon wrap lighting lit it from inside.
- **VRoid.** Vain provided `AvatarSample_A`, `AvatarSample_B` and `AvatarSample_C` (VRoid Project, VRM 0.x; embedded licence: everyone, redistribution and modification allowed, credit unnecessary). All three load with `data-vrm-spec=0`, face the monitor, type with both hands on the keyboard, and A completes the sip with the mug at the mouth. They are not bundled; they were loaded only in the scratch harness.
- **Panel shapes.** In a narrow docked Panel (about 770 × 816 in the isolated Host) the first framing lost the monitor, so the desk view now pulls back by up to 1.8× as the panel narrows; a 770 × 816 frame keeps the monitor, books, mug, character and window.
- **Comparison.** Reference and Panel at sunset and night, plus room and portrait views: `room-composition.jpg`.

## Weather, screen and desk motion (Human feedback)

Date: 2026-10-19. Same scratch harness and SwiftShader caveat, 960 × 600 frames.

- **Feedback.** Model and shader detail, scene richness, weather and cloud rendering; specifically background weather with moving clouds and rain, a simulated computer screen with glow, spill and changing content, desk clutter such as open books and paper moving in the wind, more motion overall, and suitable external low-poly models.
- **Weather.** Scene controls gained **Clear** and **Rain** (`data-vrm-weather`), remembered with the other scene choices. Rain eases in over about a second: 1,400 animated streaks outside, a grey overcast sky and clouds, faded sun, moon and stars, sunlight cut by 65 %, and a shader pane of droplets sliding down the window glass. Clouds were redrawn as two rows of lobes with three toon tones, a light rim and a darker base, lit from the current sun or moon direction.
- **Screen.** The monitor is a live canvas redrawn at 10 fps from the Bot's Activity: working types code line by line with a blinking cursor, thinking adds a scrolling log with a spinner, waiting and blocked show an amber or red dialog, and idle or away-from-desk shows a music player with album art, the local time, an equaliser and a progress bar. A coloured point light in front of the screen and a glow behind the bezel follow the mode and grow at night. The five screens rendered on their own were checked for content before the scene shots.
- **Desk motion.** An open book turns a page every 16 s with a curled, eased flip; three ruled sheets (two on the desk, one on the window seat) lift and ripple at their free edge in slow gusts; 70 dust motes drift in daylight and fade at night.
- **External models.** Five more CC0 KayKit Furniture Bits models (two cacti, a small picture frame, a pillow that replaces the procedural cushion, a single book) were added unchanged, with source URLs, sizes and SHA-256 in `assets/kaykit/inspection.json`; they add 914 triangles and use the same toon materials. VRoid Hub, opengameart and other model sites are not reachable from the agent environment.
- **Frames.** Sunset working, rainy night thinking, night idle with the music player, and the room view in rain at sunset: `room-weather.jpg`.
- **Not done this round.** Object outlines (inverted hull) and further character shader work were left for the next round.

## Lo-fi look (Human feedback)

Date: 2026-10-19. Same scratch harness and SwiftShader caveat, 960 × 540 frames.

- **Feedback.** Better each round; Vain estimated the match with Chill with You at 65–70 % and asked for 85 %.
- **Gap analysis.** Against the reference frames, the largest remaining differences were the screen treatment (outlines, glow, halftone, colour grade, atmosphere), the sun, and framing; the character design itself (glasses, jacket) depends on the loaded VRM.
- **Screen pass.** The scene renders into a multisampled half-float target with a depth texture. A composite pass draws dark outlines where depth jumps between near objects (fading beyond 3–5 m so clouds and sky stay clean), adds a quarter-resolution blurred glow of values above 2.4, darkens deep shadows with a 45° halftone dot screen, grades toward warm red with orange haze at sunset and cool blue-teal at night (grey haze in rain), and applies a vignette before ACES tone mapping. **Lo-fi look** / **Plain** in Scene controls switches it (`data-vrm-effects`).
- **Scene.** The sun is larger with concentric halo rings and a brighter core that blooms; five birds cross the sky every 70 s in clear daylight or twilight; the lamp bulb and lit shade interior are bright enough to glow; two more papers lie on the desk; the desk camera moved closer to the character (target 0.5, 1.02, 0.1; offset 0.88, 0.18, 0.72).
- **Frames.** Reference and Panel side by side at sunset and in rainy night: `chill-compare-2.jpg`; room view at sunset: `room-lofi.jpg`.

## VRoid default, L-shaped desk and density (Human feedback)

Date: 2026-10-19. Same scratch harness and SwiftShader caveat, 960 × 540 frames.

- **Feedback.** Switch the model; lighting and shader quality and information density are still well short of Chill with You; the model is about 60 % of its detail; the room layout should have more style, for example an L-shaped desk.
- **Model.** VRoid Project's AvatarSample_A (provided by Vain; VRoid Hub conditions allow redistribution and modification without credit) is now the bundled default, closest to the reference's short-haired character with headphones. Its 4096 px texture atlases were downscaled to 2048 px (thumbnail 256 px) by rewriting only the GLB image buffers, so the file is 13.3 MB instead of 26.8 MB; geometry, materials, bones, expressions, spring bones and metadata are untouched. It loads as VRM 0.x (`data-vrm-spec=0`) with happy, relaxed, sad and angry expressions. The previous technical sample and its VRM Public License PDF were removed.
- **Layout.** The desk is now L-shaped: the main top was shortened to end at x −1.5 and a 0.6 m wing runs along the left wall to the window seat. The book hutch moved onto the wing facing the chair; the wing also carries a turntable whose record spins, four leaning record sleeves, an open laptop with a sunset wallpaper, a small speaker, a wall shelf with books, a figurine and a plant, and a corkboard with photos and sticky notes.
- **Density.** Book spines have a label band and marks; a desk calendar shows the real month and date; a firefly jar on the window seat glows and twinkles at night with its own small light; three framed prints hang right of the window; a hanging pothos at the top of the window sways.
- **Lighting.** The lamp spotlight now targets the desk in front of the book and mug and is about 35 % weaker at night, so the hands are no longer blown out. MToon surfaces get a rim light that follows the time of day (neutral by day, warm orange at sunset, blue at night), and their base color is reduced by 10 % so pale skin and white clothes keep shading under the room lights.
- **Frames.** Reference beside the Panel at sunset and in rainy night, plus night portrait and the night room view with the L-shaped desk: `chill-compare-3.jpg`.

## Softer glow (Human feedback)

Date: 2026-10-19.

- **Feedback.** Much better; keep this direction, but glow and strong highlights are overdone and objects have glowing outlines.
- **Change.** The glow pass now only picks up values above 3.2 (was 2.4) and is added at 0.28–0.42 strength (was 0.5–0.8), so lit paper, cups and hands no longer halo; the lamp bulb and sun core still glow. The monitor's back glow is at about a third of its former strength, and the character's time-of-day rim light is roughly halved.
- **Video.** A 37-second tour (sunset typing, sip and window gestures, rainy night thinking, portrait, room view) was rendered frame by frame at 24 fps in the scratch harness with a stepped clock, because SwiftShader cannot render in real time; it is shared with Vain, not committed.

## Finger typing, zoned lights, painted look and detail (Human feedback)

Date: 2026-10-19.

- **Feedback.** Typing looks like the palms bob up and down instead of fingers striking keys; lighting is good but should have more ambient and zoned lights, not just one lamp; surfaces should feel more hand-painted and less low-poly; the room and desk need more detail and layering.
- **Typing.** The upper-arm bob is gone. Each keystroke picks a hand and a finger (index, middle, ring or little); that finger dips while the others rest in a light curl, and only the striking hand moves slightly on the keys.
- **Look.** Room materials use a smooth four-step toon ramp (flat shading removed) with a world-space brush-noise texture, and the screen pass adds a faint paper grain and slightly wobbly outlines.
- **Lights.** A wall sconce, a glow inside the book hutch and an LED strip under the wall shelf light up at night; at sunset a warm bounce light and soft sunbeams come in from the window.
- **Detail.** Cables run behind the desk to a wall outlet; an air conditioner with a swinging louver and blinking LED, a basket of blankets, slippers, a floor cushion and a printed mug were added.
- **Frames.** Sunset desk typing and the night room with zoned lights: `painted-zoned-lights.jpg`.
- **Video.** A new tour is shared with Vain as `vrm-room-tour-r5.mp4`, not committed.

## Hands on keys, misty clouds, smoother motion and speech bubble (Human feedback)

Date: 2026-10-19.

- **Feedback.** Another step up. Hands poke into the keyboard and should sit higher so fingers press the keys; clouds are still too low-poly and should be misty rather than blocky; head turns and typing should move more smoothly and naturally; record a video that triggers expressions and speech, and show speech in a text bubble like the Bot avatar's.
- **Hands.** The wrist targets sit 2.5 cm higher, so the fingertips rest on the keycaps; a keystroke dips the hand 4 mm. Keystrokes come in bursts at a varying rate with a quick press and slower release, and the neighbouring finger moves slightly with the striking one.
- **Motion.** The gaze follows a damped spring instead of jumping to a new target, the head eases more slowly than the limbs, idle gestures ramp in and out over one second along an S-curve, and the cup reach, lift and tilt are eased the same way.
- **Clouds.** Each cloud is a soft sum of rounded lobes distorted by noise, with shading from density toward the sun and a lit rim, so the edges fade into mist.
- **Speech bubble.** Speech text sits in a bubble above the head with the Bot name, the same border, radius, shadow and tail as the Bot avatar's bubble, and a short pop-in that is skipped for reduced motion. The stage writes the projected head position to the panel, so the bubble and tail follow it; the bubble stays inside the panel.
- **Video.** `vrm-speech-expressions.mp4` (45 s, shared with Vain, not committed) shows typing, a spoken line, a window gaze and a sip, rainy-night thinking, blocked and waiting lines with their faces, and a glance and stretch at sunset.
- **Frames.** Speaking at the desk and in the portrait view: `speech-bubble.jpg`.

## Change character from the panel header (Human feedback)

Date: 2026-10-20.

- **Feedback.** Models should be freely loadable, the motions should adapt, and the panel header should have a button to import a replacement character. Publishing as a separate opt-in npm package is the chosen direction for later, but polishing comes first; nothing about packaging or release changed.
- **Change.** **Change character…** and, for a custom model, its file name and **Use default** sit under the Bot status at the top of the panel; the Scene controls model group was removed. The chosen file is stored per Bot in this browser's IndexedDB and restored before the stage mounts, so a reload shows the custom model without first loading the default; **Use default** deletes it. If storage fails, the panel notes that the model is kept for this session only. The bundled headphones are only added to the default character. With a Pin button present, the header moves below it so the two do not overlap in a narrow panel.
- **Host.** In the isolated Host (1280 × 800, narrow panel) uploading another VRoid model (`b.vrm`, VRM 0.x) loaded it with typing hands on the keys; after a page reload the panel still showed `b.vrm`. At 1440 × 900 a third VRoid model (`c.vrm`) loaded and typed the same way; **Use default** restored the sample and, after another reload, no custom model remained. The IndexedDB helper has no unit test because no IndexedDB implementation is available in the Node test environment; the Host runs above are its evidence.
- **Frames.** Custom model at the desk with the header controls: `change-character.jpg`.

## Controls in the panel header and auto camera tour (Human feedback)

Date: 2026-10-20.

- **Feedback.** Controls should not sit inside the Three.js panel body; they belong in the panel header, including settings such as an automatic camera loop and switching character.
- **Change.** Panel definitions gained an optional public `headerAction`, rendered by the native dock header; fixed instances receive their own `botId` and `instanceId`. The VRM Panel's header now shows the Bot state and a **Scene** menu holding Character (Change character…, Use default, MToon/lilToon), View (Desk/Room/Portrait, Reset view, Auto camera tour), Time, Weather, Look, Movement, and Pin character globally or Delete instance. Submenus would open off-screen for a right-docked panel, so the groups are flat sections of one menu. The canvas keeps only speech, attention, loading and error overlays. **Auto camera tour** cycles desk, portrait, wide, over-the-shoulder and room shots, holding each for 12 seconds of wall-clock time and gliding 3 seconds between them; dragging pauses it for 20 seconds and picking a view stops it.
- **Host.** At 1440 × 900 the header showed `VRM Companion · idle · Scene`; Night set `data-vrm-mood=night`, uploading `c.vrm` through the menu loaded it, and both pinned Ada/Bob instances carried their own Scene menu. The `instances` journey passed with no console errors after the Host was restarted on the fresh build (a Host started before the rebuild returned 404 for the appearance-control route). With the tour on, `data-vrm-shot` moved portrait → wide → shoulder → room at 18, 28, 47 and 63 seconds under software rendering.
- **Frames.** Whole app with the header menu: `app-header-scene.jpg`, `app-header-menu.jpg`; tour shots: `camera-tour.jpg`.

## Icon buttons in the panel header (Human feedback)

Date: 2026-10-20.

- **Feedback.** The header should not use a text button; follow the other Panel headers and use icons.
- **Change.** The text **Scene** button became four ghost icon buttons with tooltips, sized and colored like the native header actions: play/pause for **Auto camera tour** (`aria-pressed`), a person icon for the **Character** menu (Change character…, Use default, MToon/lilToon), sliders for the **Scene** menu (View, Time, Weather, Look, Movement, and Delete instance on a fixed instance) and a pin for **Pin character globally** on a contextual Panel.
- **Host.** At 1440 × 900 the header read `VRM Companion · idle · ▷ · person · sliders · pin`; the tour toggle set `data-vrm-tour=on` and relabelled itself Stop camera tour, both menus opened under their icons, and the `instances` journey (pinning through the pin icon) passed with no console errors.
- **Frames.** `app-header-icons.jpg`, `app-header-icons-menu.jpg`.

## Speech pages, facing the viewer and performance (Human feedback)

Date: 2026-10-20.

- **Feedback.** On Windows: measure performance; dragging the Panel width flashes white; long replies should show page by page with a pause after each; while talking the character should face the camera and look at the viewer, finishing a sip first, with free motion only when idle; and every movement and expression should feel natural.
- **Baseline (Human's Windows PC, RTX 3090, 332 × 418 Panel, DPR 1.14, head `64451bc2`).** 26 fps on a 120 Hz display, main thread 4.9 ms p50 / 6.2 ms p95 per frame, 229 draw calls, 362 geometries, 37 textures, no long tasks.
- **Causes.** The 30 fps throttle compared exact frame intervals, so at 120 Hz it skipped to every fifth frame. `ResizeObserver` called `setSize`, which clears the canvas, and the redraw waited for the next animation frame. The presentation published the whole reply cumulatively. Speaking turned the head at most about 8° and the pause between sentences cleared `speaking`, so the gaze returned to the desk; an interrupted sip shrank all weights together, sliding the cup home.
- **Change.** Frame pacing allows a 4 ms tolerance and targets 60 fps, falling back to 30 and then lower resolution steps when a view stays below 80% of target. Resize redraws synchronously. The sun shadow map is 1024². Per-frame metrics attributes update every 15 frames, and `data-vrm-fps`/`data-vrm-work`/`data-vrm-pace`/`data-vrm-pixel-ratio` report every 2 s. The presentation adds `page` and `conversing`; the bubble shows only the current sentence and clears after the last hold. While conversing, an interrupted sip plays out to the put-down point, then the spine, chest, neck and head turn toward the camera with eased attention and a small nod at each pause; typing yields. Blinks use irregular 1.8–6 s intervals with occasional doubles.
- **Checks.** A presentation test covers paging, holds and the end of conversation; an idle test covers the sip put-down. A stepped-clock render shows typing → turned to the camera → still facing in a pause → back to work: `talk-turn.jpg`.

## Smooth status, inbox notice, typing rhythm and local sun (Human feedback)

Date: 2026-10-20.

- **Feedback.** The status above the message box often flashes from thinking to a tool call for an instant, and the same state drives the VRM character; with an orchestrator and assignment sessions it should switch smoothly and rarely. When the Bot receives a message the scene should show it (a phone lighting up, an envelope from the screen, an exclamation mark, the character noticing) before typing starts, typing should differ between thinking and idle, and day and night should follow the system clock.
- **Cause.** Core maps each tool call to working and everything else to thinking, and the client applied every revision as it arrived, so a 200 ms tool call between thinking events showed as a flash in the composer line, sidebar and stage.
- **Change.** The client store presents Activity through `ActivitySmoother`: a new state must hold 0.7 s (0.9 s before idle) and the shown one must have lasted 1.5 s; tool details change at most every 1.5 s; waiting, blocked and leaving idle switch at once. Raw sessions are kept for detail views. The presentation adds `inbox`, counted when a live Bot wakes from idle; the stage then lights and buzzes the desk phone, pops an envelope out of the phone screen, pops a `!` and glances at the phone (`data-vrm-notice`). Typing weight eases in and out, with `data-vrm-typing` fast (6–8 keys/s), slow (intermittent) or none. Sunrise and sunset come from the date and a location approximated from the time zone (`data-vrm-sunrise`/`data-vrm-sunset`), and the Time menu reads **Follow system clock** with both times.
- **Checks.** Unit tests cover the smoother (a short tool call never shows, hold and settle, urgent states, detail throttling, the store timer), the inbox counter, the notice timeline and reduced motion, and sunrise/sunset by season and zone (Shanghai on 2026-10-20: 6:00 and 17:18). A stepped-clock render shows idle → envelope in flight → `!` above the head → typing: `inbox-notice.jpg`.

## Replies after tool calls and long bubbles (demo recording)

Date: 2026-10-20.

- **Found while recording the demo on the Human's Windows PC (head `a8680ffa`).** A reply that followed two tool calls showed only its first character in the bubble and was cleared as the Bot returned to idle; two re-recordings matched, while replies without tools played normally. A long page pushed the bubble's first line above the Panel top. The desktop companion character and its bubble overlapped the VRM Panel and spoke the same text; how to handle that is waiting on the Human.
- **Cause.** The presentation cancelled queued speech whenever the client's Activity sync left `live`, and dropped any reply that arrived while it was not live. On that PC the Activity stream briefly reports stale around turn transitions (the same blip seen at wake for the inbox notice), so the reply was discarded.
- **Change.** A stale Activity sync now pauses speech instead of cancelling it: the mouth closes, the bubble keeps its text, and playback resumes when sync is live again. A reply that arrives during the blip is queued. Speech is dropped only if Activity stays stale for more than 10 s, or when the companion stream itself disconnects or the Bot is paused or deleted. The bubble's height is capped so its top stays inside the Panel, and its text keeps the newest line visible.
- **Checks.** Presentation tests cover a blip during speech, a stale period over 10 s and a reply that arrives while stale; both fail on the previous code. In the isolated Host, a reply after two shell calls played every sentence through the return to idle. A 333 × 418 render with the head anchor 110 px from the top kept a long bubble 24 px below the Panel top.

## Desk height, armrests, chin wrist, phone and plain speech (Human feedback)

Date: 2026-10-20.

- **Feedback.** During the chin rest the wrist should turn more. The seat looked too low: the hands hovered above the keyboard instead of resting with the elbows on armrests, as on a study chair. The character should sometimes pick up the phone and look at it, not only the coffee. The demo recording also showed long pages scrolling inside the bubble and Markdown tables, bold markers and code ticks spoken literally.
- **Change.** The desk now sits 0.22 m above the seat instead of 0.30 m, the typing target is lower, and the elbow pole points outward, so the forearms are nearly level with the elbows at armrest height; the armrests moved in under the elbows. The chin grip turns 0.9 rad about the vertical and tilts back so the knuckles support the chin, with a slow ±0.08 rad rub. A new `phone` idle action (6.5 s) picks the phone up with the right hand, holds it in front of the chest with the screen toward the face and lit, looks down at it and puts it back; when interrupted it puts the phone down first, like the cup. The phone moved to the right of the keyboard. Speech pages are capped at about 40 characters, and the spoken text drops Markdown: table rules and header rows are removed, rows read as `a · b · c`, list markers, emphasis, inline code and fenced code are stripped.
- **Windows run (`01227ad2`, 376 × 418 Panel, 60 fps).** Sip, phone and chin each reached their pose without clipping, typing forearms were level, and a table reply showed 19 pages with no Markdown symbols, no scrolling page and 0 px overflow. Phone came up 5 times in 3 minutes while chin waited until 180 s, and a few pages were only 4–11 characters or split `13:35` at its colon. The scheduler now skips the last three actions instead of only the last one, pages shorter than 10 characters join the next sentence when both fit, and a colon between digits is never a soft break.
- **Checks.** Unit tests cover the shorter page limit, the Markdown-to-speech conversion and putting the phone down when interrupted. Renders of typing, the chin rest, the held phone and an inbox notice from the new phone spot: `posture-chin-phone-notice.jpg`.

## Acceptance limits and next action

The default model is VRoid Project's AvatarSample_A; its provenance, license and the texture downscale are recorded with the asset. This is silent text-paced speaking, without TTS, audio lip-sync, VRMA packs, model uploads or final character art. Pause/disconnect/hidden-document cancellation and late callbacks have focused regression coverage; all Activity poses exist, but real waiting/blocked transitions and native hot-disable/HMR were not separately qualified in this run.

Open the isolated Host, select VRM QA Ada, open Messages and choose VRM Companion. Send a normal DM and inspect the posture and mouth timing; pin Ada/Bob globally, switch to the QA Group, then return to the DM. Give feedback on character size, motion strength and text/speaking pacing. Keep #2222 open until that feedback and any required fixes are recorded.

Raw logs, authentication URLs, private Profile data and credentials stay local. The PR contains only selected screenshots of this synthetic QA conversation. The public developer contract is in [the Panel guide](../panel-plugin.md).
