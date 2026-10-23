# Local Computer video on Android

One Windows x64 primary display reaches one Android viewer through a supervised video helper and the existing encrypted LAN channel with Device Pairing admission. The Computer owner separately manages observation, exclusive control and durable Bot pause. See the [operation guide](../../../../docs/local-computer-video.md) and [CLI contract](../../../../docs/bot-cli.md#local-computer-video).

## Sub-features

- `observe`: native WebRTC video without Bot pause, screenshots or image fallback. Opening a second viewer returns `viewer-limit` while the first keeps rendering.
- `takeover`: explicit grant only after persisted pause and drained Bot operations; actions and model screenshots from every Bot are refused. A late screenshot is withheld.
- `input`: pointer clicks and four-direction wheel input with current device/runtime/attempt/grant and monotonic sequence. Wrong or old identity causes no driver effect. An acknowledgement loss never causes replay.
- `release-resume`: the phone's single Take control / Hand back button uses explicit resume for handback, invalidating control and draining Human input before committing resume while observation stays open. Low-level CLI release keeps pause. Restart restores pause but no grant; CLI resume remains available without media.
- `lifecycle`: background/lock, device revoke, last viewer close, runtime/Fiber disposal and helper failure stop established peer/tracks. Late startup/callbacks cannot resurrect resources. Control loss closes input at 6 seconds and reservation/media by 30 seconds; pause stays set.
- `freshness`: source capture progress and receiver presentation gate input. Static-live is distinct from source/decoder stall; duplicated canvas frames alone prove neither source health nor moving-scene FPS. Confirmed stall retains explicit Hand back and Reconnect; reconnect waits for old-attempt close and returns to observation without replay or Bot resume.
- `admission`: the server-owned LAN route dispatches the exact video path with the admitted device identity. Connect and normalized aliases are refused before owner/loopback effects, regardless of forged route/header/body identity. Pending cancel, channel close, revocation and request-ID reuse cannot transfer a late open or close to its replacement.

## How to get to it (user POV)

Start/check Local Computer on the Windows Host. Enable the existing encrypted LAN listener, then pair the rebuilt Android development app through the trusted Host QR/pinned-key flow. The APK needs both LanChannel and LocalComputerVideo modules. Open a Bot with Computer Access, then its Computer screen. Watch, choose Take control, click the harmless fixture counter, then choose Hand back once to release control and restore Bot use. Reopen after background/lock as an observer.

## Driving it with verify-app

Use the [Windows device queue](../../../../docs/agents/android-device-qa.md); the designated testing-center runner owns the phone, build, Metro and isolated Host. No model is needed for direct Computer tool checks. Bind every result to the exact branch/head, batch SHA, APK/native module fingerprint, helper version/hash, hardware and display scale.

1. Launch/doctor the batch Host using `scripts/verify-app.mjs`. Save its home for the restart test. Start Local Computer via CLI and record helper install/verification, startup and missing-dependency results. Open the harmless fixture at `packages/computer/test/fixtures/local-video-motion.html` on that display.
2. Observe beyond 30 seconds. Verify native output and `computer-video status`: pause false, one viewer, no controller. Tap without takeover: the fixture must not change. Exercise direct tools for two Bots.
3. In portrait and landscape, verify the toolbar has Left at its left edge, Right at its right edge, the two-dimensional scroll pad between and a separate command row below, no instruction caption, and exit as a leading Back button separated from the Host environment title capsule. In light and dark app appearance, verify the canvas, letterboxing and safe-area surround stay black with readable dark-theme controls. Check default, intermediate and maximum system text: Back stays reachable, the capsule truncates a long Host name, and the native command row scrolls horizontally without hiding required actions. Check the current paired Host display name/alias, no Bot identity or secondary status caption, green only with live capture and phone presentation, person/Bot/pause icons following Host control facts, and unknown control after disconnect. The header has no opaque band and uses the same independent islands as Android chat. PiP remains deferred to #2663. Keyboard is a native selected-state toggle; Reset and recovery use tonal buttons. Use `computer-video-control`, `computer-video-left-click`, `computer-video-right-click`, `computer-video-reset` and `computer-video-close` with their visible labels. Take control, click once, then drag each mouse button horizontally and vertically over a harmless scrollable page. Check the slider follows the chosen axis, the page scrolls at the cursor and releasing a drag causes no click. Hand back once: the same viewer stays open, control disappears and both Bots can operate. Compare UI/CLI/fixture; separately use CLI release, expiry and resume to prove durable pause remains fail-closed. Owner regressions inject delayed operations, persistence failures, drain timeout, queued stale input and lost acknowledgement; mark simulated faults separately from device evidence. Repeat toolbar reachability at default, intermediate and maximum text sizes in light/dark; leave native results unqualified until actually run.
4. Pause then restart only this Host with the same home. Check pause remains true, runtime changes and old grant fails. Explicitly resume by current runtimeId without media. Use legacy frame/takeover/input commands to prove `update-required` rather than a bypass.
5. Separately interrupt control, capture and receiver presentation. Verify no input against a confirmed stale picture, Hand back remains available and explicitly resumes Bots, and Reconnect closes the old attempt before fresh observation without a grant or Bot resume. Exit, background and connection loss must keep pause. Separately prove static text remains usable. Record the first failure and run `verify-app observe` before retry. Revoke an established device and observe cessation of new receiver frame IDs plus actual peer/track/helper cleanup, not just a status change.
6. Exercise background/foreground, phone lock, immediate startup cancellation, helper crash, slow consumers, bounded teardown and second viewer refusal. Disconnect phone Wi-Fi during LAN pairing and during Computer viewing: check for Wi-Fi/local-network permission/Settings → Devices guidance, and `computer-video-retry-connection` before a viewer exists. Restoring the network and Retry returns to observation without takeover or Bot resume. Separately fail only video (`computer-video-reconnect`), refuse the device (`computer-video-pair-again`), and expire a QR; verify each retains its own recovery. Remote connection errors must not require same-Wi-Fi. Error guidance must remain scrollable with reachable controls in landscape/large text. Preserve callback/queue boundary regression results and exact task-owned process census. Native media errors and Connect refusals must never request a replacement image.
7. On a declared LAN path, warm up 10 seconds and record 60 seconds of unique moving frame IDs. Cross-check EGL/TextureView counters against visible frame output; require at least 15 actual presented FPS. For 100 isolated taps record physical touch and first visible counter change on one clock, then nearest-rank p95 (sample 95), including temporal uncertainty; require at most 500 ms. Check static text readability separately. Selected ICE pair evidence identifies the path; RTT and encoded/decoded FPS are separate metrics.
8. Obtain Human feedback on observe/takeover/release/resume, light/dark and reachable large-text controls. Record pass/fail/untested per requirement. Missing native or Human evidence blocks qualification, even if all source tests pass.

## Input refinement checks

Run `node scripts/computer-input-fixture.mjs 4488 60` and open its localhost URL on the
Windows display. Start from the declared native build; these are pending verification steps.

- Observe and control: pinch at off-center locations, lift each finger first in separate runs,
  then release both. Compare the last two-finger frame with the released frame; no shift,
  remote click or pointer movement is allowed. Repeat below-fit and enlarged previews.
- Use `computer-video-scroll-pad` over the fixture's horizontal, vertical and 2D regions.
  Verify offsets in both directions and diagonally; no click on release. Retest the existing
  left/right drag shortcuts. An observer has no pointer, scroll pad or keyboard controls.
- Focus a field on the computer, then open `computer-video-keyboard`. Only the native phone
  keyboard appears: no second field, Send row or duplicate key buttons. Compose synthetic
  Chinese with the actual IME, change the candidate, and commit once. Compare the computer
  field. Test native Backspace after committed text, Enter, multiline paste, password target,
  hide/reopen and Android Back. Typing and video updates must not blur or reopen the keyboard.
  Header exit must still leave immediately. Repeat portrait/landscape, light/dark and all three
  text sizes. This native module requires a fresh binary; an old binary offers an update hint.
- The remote target and Hand back must stay reachable with the soft keyboard open. Stall media,
  lose connection, background the app, hand back and replace the grant during composition or
  pending input: no replay and no unfinished composition crossing grants or keyboard sessions.
  Source tests and Robolectric are separate from real IME/device acceptance.
- Move the local pointer far from the previous click and click the fixture. Inspect the
  current viewer's driver session: no duplicate virtual-cursor glide before the click.
  Bot sessions keep their own cursor setting. Record observed latency separately.

## Gotchas

- Android touch follow-up (#2559): only while controlling, show the local large arrow and
  icon + Left/Right buttons. One finger moves the arrow; tap and the
  left/right buttons click that cursor only with live media and the current control grant.
  Long press right-clicks. Two fingers pinch and pan only the phone preview, even while
  observing; the observer surface is not disabled and has no mouse or click buttons.
  Preview starts at the top, keeps its free pan/zoom on finger release and restores the
  default fit/top only with Reset view. Showing/hiding buttons must preserve the view.
  These operations never scroll or click the remote desktop. Verify zoomed clicks against
  a harmless fixture, then release/resume and confirm disabled buttons send no input.
  Rotate/change the stage size and reconnect to verify preview and cursor reset. Capture
  matched before/after states and reachable light/dark large-text controls on the actual
  Release phone build. This checklist is not a native pass result.

- Android Release startup must retain WebRTC and JNI Zero native entry points via the local
  module's consumer rules. The pinned AAR supplies none. Missing rules remove JniInit and
  cause a native SIGTRAP during JNI_OnLoad before video can render. Verify the minified APK
  and real phone; a Debug build does not exercise R8.

- Windows startup regression (no Host or phone): after verifying the installed pinned runtime, set `BOTHARNESS_VIDEO_NATIVE_TEST=1` and run `pnpm exec vitest run packages/computer/test/local-video-helper-windows.test.ts`. It opens real native capture offers twice and requires both launcher trees to drain. An optional `BOTHARNESS_VIDEO_TEST_RUNTIME` points the same verifier at a task-local runtime directory; it never installs dependencies. This does not establish Android playback, input, frame rate or Human acceptance.
- Electron 44.9.3 writes a bootstrap CRLF before loading the Windows app and supplies an EOF stub as `process.stdin`. The supervisor permits only one exact pre-ready CR payload after launcher ownership validation; the app reads inherited fd 0 directly. Empty display-metrics notifications must not invalidate unchanged primary geometry. Native capture dimensions come from an unscaled track, because DIP × scale can round one pixel away from the real display. After draining its Job and flushing the receipt, the launcher exits through the native process boundary. Windows closes its parent pipe handles during process exit; manually closing them while a background synchronous reader is active can block. The Host cleanup deadline is unchanged.

- This journey is prepared, not an execution result. The initial implementation checkpoint has no allocated native/runtime check window.
- Web exports and Container Selkies probes do not exercise this native Local Computer path.
- EGL render/swap and TextureView updates are not proof of physical scanout; correlate the current attempt and moving frame IDs. A redraw of an old buffer is not a new captured frame.
- Keep signaling files, device credentials, paths/addresses and desktop content private. Publish only redacted evidence. Preserve the stronger channel-only Connect policy when integrating its separate carrier work; T1 grants no raw Connect exception.
- Inspect bounded owner outcome logs for operation/runtime/attempt/grant correlation, initiator class, duration, coded failure source and pause state. Healthy heartbeats must not spam the log. Source regressions are separate from live log evidence.
- Do not code-only downgrade after takeover: older code ignores the pause record. Keep Computer stopped, confirm media cleanup, preserve pause and follow the recovery guide.

### Click acknowledgement feedback

On the same physical Android build, check preview tap and Left button (blue), preview long press and Right button (orange). Each ring belongs to the acknowledged click coordinate and stays there when the cursor moves; zoom/pan still maps it to that desktop location. Rapid repeats restart feedback. Wheel dragging, an invalid click, observation-only mode, lost control and a disconnected/uncertain request must not show a success ring. Enable Reduce Motion and confirm a brief static ring remains visible without expansion. Hand back/reconnect must not replay a previous click. Capture redacted key frames or a short recording; source tests do not qualify the animation timing.
## iOS → macOS slice (#2653)

Use the assigned Mac/iOS lane and record the source SHA, installed binary/embedded JS hashes, native fingerprint and Mac helper hashes. Rebuild iOS with LocalComputerVideo and LanChannel. Preserve existing device data and pairing. Start the same QA Local Computer explicitly; check Screen Recording and Accessibility. Pair or choose its approved encrypted LAN route on the same Wi-Fi. Do not treat a Tailscale HTTPS connection as this carrier.

1. Open the Computer screen from the QA Bot. Confirm moving fixture IDs actually render and a static desktop remains healthy. Record decoded, rendered and drawable-presented counters separately. Watching leaves Bots unpaused and rejects input without a grant.
2. Take control. Read back durable pause/grant, move the phone pointer and click synthetic fixture counters at several positions. Verify Retina point conversion and no off-target input. Repeated taps must not duplicate acknowledged commands.
3. Hand back once. Confirm control is absent, Bots resumed and subsequent input refused while watching continues. A disconnected/stalled viewer must not accept input; handback remains available when connected.
4. Background/lock, re-enter, reconnect and exit. Confirm the old native peer and Mac process group close; new observation never restores control or resumes a paused Bot. Revoke only a disposable test pairing and verify the established peer closes.
5. Record actual screenshot evidence and source/CLI/native/Human results separately. Use the same motion and latency measurement limits above; compilation is not video proof. Unrun cases remain unverified.

Mac capture startup regression is opt-in with `BOTHARNESS_VIDEO_NATIVE_TEST=1 pnpm exec vitest run packages/computer/test/local-video-helper-macos.test.ts`. It validates real capture offers and owned process-group drainage, but not iPhone rendering or interaction.

### iOS Computer chrome (#2662)

- Open the existing Computer entry from a paired Bot chat. Confirm the transparent native header names the selected computer (including its local rename), not the Bot; Back exits, with no duplicate bottom Exit. Canvas and letterboxing stay black in both appearances.
- On a real receiver, live presented frames give the green connection indicator; a connection failure must clear green and stale ownership. CPU means Bots can operate, hand means Human control, and pause means Bots remain paused with no Human grant. Check accessible labels rather than relying only on colour.
- Take over, click using both native left/right actions, reset the preview, and Hand back; correlate with Host grant/pause and harmless fixture counts. Exit while controlling must release the grant and leave Bots paused; returning must not take over automatically.
- Check default/intermediate/maximum system text in light/dark, including long computer names, recovery and reachable bottom commands. Verify iOS 27 native glass and earlier-iOS native fallback separately. Simulator layout evidence cannot qualify native GPU presentation or takeover. PiP is deferred to #2664.

- iOS click feedback: after takeover, tap the surface, use Left and Right, and long-press. Accepted left clicks show a blue ripple at the cursor; right clicks show orange. Pinch/pan the preview and repeat; the ring stays at the accepted click point. Reduce Motion shows a brief static ring. Disconnected/refused input, handback, and a replaced viewer/grant must not replay a previous ring. Correlate real remote clicks with fixture counters; a native component fixture only validates rendering.
