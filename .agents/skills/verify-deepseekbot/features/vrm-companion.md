# VRM companion Panel

## Sub-features

- Independent native Bundle installation, activation, removal and reinstall.
- DM-bound current Bot Panel, absent in Groups; fixed global A/B instances retain identity after switching and refresh.
- Current/live Activity plus committed own-DM output drive independent body and speaking channels.
- Each Activity drives a distinct facial expression blend (`data-vrm-face` on the stage names the dominant one; `data-vrm-faces` lists what the model supports); a non-live view returns to `neutral`.
- Seated idle gestures (window, stretch, chin, sip, glance) start after 6–14 s of live idle; `data-vrm-idle` on the stage names the current one (`none` otherwise) and returns to `none` when work, speaking or movement interrupts.
- Pause/disconnect/hidden/close cancel playback; reconnect never speaks history.
- Per-instance renderer disposal, late model loads, reduced motion, resizing and visible fallback on WebGL loss.
- Full-body Panel canvas with every control as an icon button in the Panel header: tour toggle `[data-vrm-tour-toggle]`, Character menu `[data-vrm-character-menu]`, Scene menu `[data-vrm-scene-menu]` and pin `[data-vrm-pin]` (contextual only), desk/room/portrait cameras, seated keyboard contact and bounded stand/walk/return choreography. The scene is widened by resizing the native Panel split; there is no expanded dialog.
- The Character menu loads a local `.vrm` file (`data-vrm-model=file|sample`; `data-vrm-spec` is `0` for VRM 0.x such as VRoid, `1` otherwise) and switch back to the sample.
- Reversible MToon/lilToon shading comparison; camera, room time and shading survive a remount of the same Bot's view.
- Spatial exterior, local-time sky/sun/lamp lighting, explicit sunset/night previews, and reduced-motion-aware ambient movement.
- Clear/Rain weather from the Scene menu (`data-vrm-weather`), with rain streaks, overcast sky and droplets on the glass; the monitor's content and glow follow the current Activity, with a music player at idle.
- Lo-fi look (outlines, glow, halftone shadows, time-of-day grade, vignette) is on by default and Plain turns it off (`data-vrm-effects=on|off`), remembered with the other scene choices.
- While working, fingers strike keys individually; at night the wall sconce, hutch glow and shelf LED strip light their zones, and at sunset sunbeams come through the window.
- **Change character…** in the Character menu uploads a `.vrm` (drive the hidden `input[aria-label="VRM file"]`); the panel shows the file name and `data-vrm-model=file`, the choice survives a reload in the same browser, and **Use default** forgets it.
- Performance: the stage reports `data-vrm-fps`, `data-vrm-work` (main-thread ms per frame), `data-vrm-pace` (60 or 30) and `data-vrm-pixel-ratio` every 2 s of drawing; frame metrics such as `data-vrm-frames` update every 15 frames.
- The **Auto camera tour** header icon sets `data-vrm-tour=on` and cycles `data-vrm-shot` through portrait, wide, shoulder, room and desk every ~15 s of wall-clock time; picking a view turns it off.
- Idle gestures include `phone` (`data-vrm-idle=phone`): the right hand lifts the phone to the chest with its screen lit, then puts it back.
- While the Bot speaks, `[data-vrm-speech]` shows the current sentence (`page`) in a bubble above the head, holding each before the next; `data-vrm-conversing` stays `true` through pauses and the stage's `data-vrm-attending` is `true` while the character faces the camera (panel vars `--vrm-head-x`/`--vrm-head-y`), and it disappears when speaking ends.
- When the Bot wakes from idle (send it a DM), the stage increments `data-vrm-inbox` and sets `data-vrm-notice=true` for about 3 s while the phone lights, an envelope pops out of the phone and a `!` pops; `data-vrm-typing` reads `fast` while working, `slow` while thinking and `none` at idle. The composer status and sidebar hold a state at least 1.5 s, so a short tool call stays on thinking. `data-vrm-sunrise`/`data-vrm-sunset` hold today's local times.

## How to get to it (user POV)

Install the local `@botharness/vrm-companion` Bundle into the task-owned Profile. Enter Bot mode, select a Bot, open Messages from the rail if closed, then choose VRM Companion in the Messages header. The header pin icon (**Pin character globally**) creates an explicitly fixed instance. **Delete instance** in the fixed instance's Scene menu removes metadata; a normal close retains it. Group headers omit the contextual entry while fixed global instances remain available.

## Driving it with verify-app

Launch and doctor an isolated Host. Seed two Bots named VRM QA Ada and VRM QA Bob and a QA Group using the public CLI, configure a working model, and install the native plugin in the same home/profile.

```sh
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-vrm-companion.mjs open
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-vrm-companion.mjs send
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-vrm-companion.mjs work
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-vrm-companion.mjs instances
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-vrm-companion.mjs lifecycle
```

The journey uses visible Web controls, captures screenshots/ARIA/console and correlates visible Activity and speaking with canonical Host reads. The instances phase recreates only the test Profile's fixed character instances, verifies A/B identity and fresh-load silence, and records a five-second two-renderer sample. Preserve failure evidence before reruns. Inspect screenshot pixels, not just data attributes.

The lifecycle phase selects the named QA Group, checks the missing contextual entry, emulates reduced motion, loses a WebGL context, retries and deletes one fixed instance while inspecting real context disposal. Separately remove the Bundle with the native CLI, restart only the task-owned Host without deleting its home, run the removed phase, then reinstall and restart again. This path is restart-required; an offline manifest change alone does not qualify live unloading. Confirm current state remains readable, no historical speaking resumes, and other Bot functions work after removal. CLI reads must match the visible Bot and Channel identities.

## Gotchas

For the room journey, use the authorized browser's visible controls: open the header Scene menu, select Room view, Stand up, then Walk around; observe actual position changes, choose Sit down, and verify the same chair position. Return to Desk view and compare Local time, Sunset and Night, each under MToon and lilToon. Close and reopen VRM Companion: the chosen camera, room time and shading must return, and loading must show only a transient status, never Retry. Send a uniquely marked real DM; capture a nonzero mouth frame and the committed text, then correlate the message ID using the online `channel-messages` CLI. Inspect hands, knees and chair contact in pixels as well as phase attributes.

The canvas must cover its entire Panel content box at narrow and wide splits; focus the Panel's separator and press ArrowLeft to widen the scene (its value is the chat share). Only speech, attention, loading and errors overlay the scene; no control is drawn inside the canvas. Keep the Chrome acceptance tab visible for motion/performance sampling: operating-system occlusion may throttle frames even when `document.visibilityState` remains visible. Do not report such a sample as foreground frame rate. Capture fresh pixels after an action settles; a browser accessibility snapshot can update before the next rendered screenshot.

The existing workspace remembers Messages visibility separately from Channel selection. A closed Messages panel must be opened from the rail. Both hidden fallback and visible workspace sidebars can contain the same accessible name; target visible controls. More than two long-lived streams make network-idle waits unsuitable: wait for DOM and the loaded character instead. In headless Chromium the SwiftShader WebGL path (`--use-angle=swiftshader --enable-unsafe-swiftshader`) renders the scene; it qualifies pixels, not frame rate. The whole BotHarness shell was observed to remount intermittently 28–75 seconds after page load in about a third of sessions in an isolated Host (not a plugin rebuild event); the VRM view reloads but keeps its choices. Re-read the stage after long waits instead of assuming the same renderer. The generic screenshot helper's old Settings precondition does not match this native shell; use this dedicated journey.

The machine's Go quota may be exhausted even when configuration checks pass. Preserve the QUOTA receipt and use only an already configured authorized model route. A real committed reply is required for a speaking claim. The current sample model and silent text clock do not establish audio lip-sync, arbitrary model compatibility, native Desktop performance or Human acceptance.
