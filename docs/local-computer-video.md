# Local Computer video: Windows to Android

This first slice is implemented for one Windows x64 primary display and one Android viewer. Native package, physical-device performance and Human acceptance must be recorded against the exact build before qualification is claimed. Other senders and the Container viewer retain their existing paths.

Start Local Computer with **Check permissions** or `deepseekbot computer-start --target local`. This existing explicit install/verification flow installs the pinned capture helper when needed. The helper downloads Electron 44.9.3 for Windows x64 (158,508,870 bytes; extracted size must be measured on the qualification machine). The Host supervises it as a separate process. The Android development client needs a rebuild for the local native video module; reloading JavaScript into an older client is insufficient.

Setup also compiles the bundled Windows Job launcher with the system .NET Framework compiler, invoked directly with no compiler server. This bounded step runs only during explicit setup; observation never downloads or compiles a helper. Compiler, verification or desktop-access failures leave video unavailable. The launcher owns the entire Electron process tree. Unproven cleanup blocks another capture instead of treating root-process exit as success.

Open a Bot with Computer Access and choose **Computer**. Watching does not pause Bots. **Take control** first saves a Computer-wide pause and waits for earlier Bot operations to finish. One finger moves a large local pointer; tap or the icon + **Left** / **Right** buttons click at that pointer. Drag either mouse button horizontally or vertically to scroll at the pointer, with a responding slider and no click on release. Two fingers freely zoom and pan the top-aligned phone preview while watching or controlling; lifting keeps its position. **Reset view** explicitly restores fit. A dedicated two-dimensional scroll pad sits between Left and Right. Android landscape retains a compact layout and a top-right exit; action rows scroll when system text needs more room. Native gesture and text-entry qualification remains build-specific.

**Keyboard** opens the phone's native IME without another visible field or Send row. Focus a computer field first, then type: committed text goes directly to that field. Chinese composition stays in the IME until the candidate is confirmed; native Backspace and Enter reach the computer. Hiding the keyboard, backgrounding the app or losing control discards unfinished composition. Input uses the same ordered grant-checked path and uncertain input is never replayed. Native focus is independent of React input refs and video updates. The preview keeps the pointer visible above the keyboard and Hand back remains available. This native module requires a new Android build; real IME and keyboard geometry still need exact-build acceptance.

The Host disables the driver's virtual cursor only for this video viewer's input session before its first command, then waits for that same session's render state to confirm the cursor is disabled. A missing or invalid confirmation refuses input. The phone's local pointer remains immediate, and clicks do not wait for that duplicate overlay animation. The same authorization and drain still apply; this is not a measured latency claim.

## Harmless input fixture

Run `node scripts/computer-input-fixture.mjs 4488 60` on the Windows computer and open `http://localhost:4488/`. The loopback-only page has separate horizontal, vertical and two-dimensional scroll regions, offset readouts, ordinary/multiline/password fields and click counters. Put the remote pointer over each region, then drag the scroll pad; verify each offset changes and no click fires. Use only synthetic text. The page stores no input outside browser memory and the server exits after the requested minutes (1–180). It serves only this fixture, not repository files. This browser fixture does not verify phone gestures.

Video and input use the primary display's physical pixel dimensions. Before granting control and before each input, the owner checks the Windows driver's display size against capture. DPI scale is not applied a second time; mismatched or changed geometry refuses input.

The same button switches to **Hand back**: one explicit action ends control, waits for Human input to finish, and saves the resumed Bot state while keeping the preview open. It uses the existing owner `resume` command. The lower-level CLI `release` command still leaves Bots paused. Exit, losing the phone, helper failure and Host restart preserve pause; no controller is restored after restart. Resume remains available through the CLI when media cannot start.

Backgrounding or locking the phone stops its media and releases control. Return to the foreground to observe again, then explicitly take control. A second viewer is refused with `viewer-limit` without evicting the first. Frozen or unconfirmed video disables input. A static live desktop must still pass the qualification journey; repeated canvas frames alone do not establish capture health.

The new viewer has no image fallback, including manual snapshots. Missing native support, negotiation failure and lost media show a refusal/retry state. It never polls `/api/computer/frame`. Legacy frame, input and takeover routes return `update-required` for the migrated Windows Local Computer. Bot screenshots remain separate and are refused while paused.

T1 uses direct WebRTC with no configured STUN/TURN servers. The phone's signaling and control use the existing encrypted LAN channel, its pinned Host key and approved device identity. Only the server-owned LAN listener dispatches the exact video command path to the Computer owner. Hosted Connect remains refused with `connect-carrier-required`, even though its encrypted carrier is available; remote media qualification belongs to a later slice. There is no WebView or plaintext fallback. Self-configured TURN, audio, clipboard, background viewing and unlocking are absent.

When video stalls, input is disabled but **Hand back**, exit and **Reconnect** remain available. Hand back is available while the Computer is paused or the caller retains a grant, separately from eligibility to send input. Reconnect closes the old attempt before opening observation again; it does not restore control, resume Bots or replay input.

## Connection checks

If the phone cannot reach a LAN Host, connect it to the computer's Wi-Fi, allow Local Network access and enable local access in the computer's **Settings → Devices**, then choose **Retry**. Turning Wi-Fi on without joining a network is insufficient. Remote connections instead show phone-network and computer-awake/DeepSeekBot checks; an error does not establish that Wi-Fi is the cause.

Computer keeps **Retry** available when the Host connection is lost, even before a viewer exists. If only video fails, keep the computer awake with Computer running and choose **Reconnect video**. Device refusal offers **Pair again**. An expired pairing code still requires a fresh code. These actions neither take control nor resume Bots; an uncertain input result still warns you to check the screen before repeating an action.

## Recovery and downgrade

After takeover, a code-only rollback is unsafe: older versions ignore `botharness/computer-pause.json` and can reopen Bot access after restart. Keep the affected Computer stopped, confirm its owned media has stopped and preserve the pause record. If the Human explicitly chooses to resume Bots, use the supported new-version resume operation and its drain before downgrading. Otherwise apply a forward fix that honors the durable pause. Never delete the record or resume automatically to make a downgrade succeed.

## Agent operation

The same Computer owner serves the phone, authenticated Host and Device gateway, and CLI. Use the [CLI commands](bot-cli.md#local-computer-video) for current pause, global viewer/control state, signaling and explicit resume. `controller` and the grant are caller-scoped; `viewerCount` and `controlHeld` report global state. Signaling data is private and never printed by the CLI.

Control heartbeat silence marks the connection lost after 6 seconds and releases its reservation and media by 30 seconds. Receiver presentation must progress within 5 seconds; the helper separately requires genuine capture progress within 2 seconds and encoding progress within 4 seconds. These checks are independent of whether desktop contents changed. Commands and drains wait at most 10 seconds; cleanup waits at most 3 seconds. The owner admits at most eight pending commands, including separately bounded native input work. Request bodies are limited to 128 KiB and SDP to 96 KiB. Limits return coded refusals and never resume Bots.

## Qualification

The [native verification journey](../.agents/skills/verify-deepseekbot/features/local-computer-video.md) covers control fences, revocation of an established peer, static-screen liveness and moving-screen measurement. Capture counters, decoded frames, EGL swaps, TextureView updates and physical screen output are different measurements. Cross-check attempt-correlated render counters with visible moving frame identifiers. Require at least 15 actual presented FPS and input-to-visible p95 no more than 500 ms on the declared LAN rig, with readable static text. No unit test or signaling response establishes those results.
