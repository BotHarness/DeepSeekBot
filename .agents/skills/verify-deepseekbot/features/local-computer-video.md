# Local Computer video on Android

One Windows x64 primary display reaches one Android viewer through a supervised video helper and the existing authenticated Device gateway. The Computer owner separately manages observation, exclusive control and durable Bot pause. See the [operation guide](../../../../docs/local-computer-video.md) and [CLI contract](../../../../docs/bot-cli.md#local-computer-video).

## Sub-features

- `observe`: native WebRTC video without Bot pause, screenshots or image fallback. Opening a second viewer returns `viewer-limit` while the first keeps rendering.
- `takeover`: explicit grant only after persisted pause and drained Bot operations; actions and model screenshots from every Bot are refused. A late screenshot is withheld.
- `input`: direct click with current device/runtime/attempt/grant and monotonic sequence. Wrong or old identity causes no driver effect. An acknowledgement loss never causes replay.
- `release-resume`: release keeps pause; explicit resume invalidates control and drains Human input before committing resume. Restart restores pause but no grant; CLI resume remains available without media.
- `lifecycle`: background/lock, device revoke, last viewer close, runtime/Fiber disposal and helper failure stop established peer/tracks. Late startup/callbacks cannot resurrect resources. Control loss closes input at 6 seconds and reservation/media by 30 seconds; pause stays set.
- `freshness`: source capture progress and receiver presentation gate input. Static-live is distinct from source/decoder stall; duplicated canvas frames alone prove neither source health nor moving-scene FPS.

## How to get to it (user POV)

Start/check Local Computer on the Windows Host. Pair the rebuilt Android development app through its existing pairing flow. Open a Bot with Computer Access, then its Computer screen. Watch, choose Take control, click the harmless fixture counter, then separately try Release control and Resume Bots. Reopen after background/lock as an observer.

## Driving it with verify-app

Use the [Windows device queue](../../../../docs/agents/android-device-qa.md); the designated testing-center runner owns the phone, build, Metro and isolated Host. No model is needed for direct Computer tool checks. Bind every result to the exact branch/head, batch SHA, APK/native module fingerprint, helper version/hash, hardware and display scale.

1. Launch/doctor the batch Host using `scripts/verify-app.mjs`. Save its home for the restart test. Start Local Computer via CLI and record helper install/verification, startup and missing-dependency results. Open the harmless fixture at `packages/computer/test/fixtures/local-video-motion.html` on that display.
2. Observe beyond 30 seconds. Verify native output and `computer-video status`: pause false, one viewer, no controller. Tap without takeover: the fixture must not change. Exercise direct tools for two Bots.
3. Take control, click once, release, wait beyond expiry, and resume. Compare UI/CLI/fixture and both Bots' action/screenshot refusals. Owner regressions inject delayed operations, persistence failures, drain timeout, queued stale input and lost acknowledgement; mark simulated faults separately from device evidence.
4. Pause then restart only this Host with the same home. Check pause remains true, runtime changes and old grant fails. Explicitly resume by current runtimeId without media. Use legacy frame/takeover/input commands to prove `update-required` rather than a bypass.
5. Separately interrupt control, capture and receiver presentation. Verify no input against a confirmed stale picture and static text remains usable. Record the first failure and run `verify-app observe` before retry. Revoke an established device and observe cessation of new receiver frame IDs plus actual peer/track/helper cleanup, not just a status change.
6. Exercise background/foreground, phone lock, immediate startup cancellation, helper crash, slow consumers, bounded teardown and second viewer refusal. Preserve callback/queue boundary regression results and exact task-owned process census. Native media errors and Connect refusals must never request a replacement image.
7. On a declared LAN path, warm up 10 seconds and record 60 seconds of unique moving frame IDs. Cross-check EGL/TextureView counters against visible frame output; require at least 15 actual presented FPS. For 100 isolated taps record physical touch and first visible counter change on one clock, then nearest-rank p95 (sample 95), including temporal uncertainty; require at most 500 ms. Check static text readability separately. Selected ICE pair evidence identifies the path; RTT and encoded/decoded FPS are separate metrics.
8. Obtain Human feedback on observe/takeover/release/resume, light/dark and reachable large-text controls. Record pass/fail/untested per requirement. Missing native or Human evidence blocks qualification, even if all source tests pass.

## Gotchas

- This journey is prepared, not an execution result. The initial implementation checkpoint has no allocated native/runtime check window.
- Web exports and Container Selkies probes do not exercise this native Local Computer path.
- EGL render/swap and TextureView updates are not proof of physical scanout; correlate the current attempt and moving frame IDs. A redraw of an old buffer is not a new captured frame.
- Keep signaling files, device credentials, paths/addresses and desktop content private. Publish only redacted evidence. Preserve the stronger channel-only Connect policy when integrating its separate carrier work; T1 grants no raw Connect exception.
