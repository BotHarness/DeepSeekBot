# Local Computer video: Windows to Android

This first slice is implemented for one Windows x64 primary display and one Android viewer. Native package, physical-device performance and Human acceptance must be recorded against the exact build before qualification is claimed. Other senders and the Container viewer retain their existing paths.

Start Local Computer with **Check permissions** or `deepseekbot computer-start --target local`. This existing explicit install/verification flow installs the pinned capture helper when needed. The helper downloads Electron 44.9.3 for Windows x64 (158,508,870 bytes; extracted size must be measured on the qualification machine). The Host supervises it as a separate process. The Android development client needs a rebuild for the local native video module; reloading JavaScript into an older client is insufficient.

Setup also compiles the bundled Windows Job launcher with the system .NET Framework compiler, invoked directly with no compiler server. This bounded step runs only during explicit setup; observation never downloads or compiles a helper. Compiler, verification or desktop-access failures leave video unavailable. The launcher owns the entire Electron process tree. Unproven cleanup blocks another capture instead of treating root-process exit as success.

Open a Bot with Computer Access and choose **Computer**. Watching does not pause Bots. **Take control** first saves a Computer-wide pause and waits for earlier Bot operations to finish. Only then may a tap send a desktop click. This slice offers direct clicks; additional gesture and text-entry qualification belongs to later slices.

Video and input use the primary display's physical pixel dimensions. Before granting control and before each input, the owner checks the Windows driver's display size against capture. DPI scale is not applied a second time; mismatched or changed geometry refuses input.

**Release control** leaves Bots paused. **Resume Bots** explicitly ends control, waits for Human input to finish, and saves the resumed state. Pause survives losing the phone, helper failure and Host restart. No controller is restored after restart. Resume remains available through the CLI when media cannot start.

Backgrounding or locking the phone stops its media and releases control. Return to the foreground to observe again, then explicitly take control. A second viewer is refused with `viewer-limit` without evicting the first. Frozen or unconfirmed video disables input. A static live desktop must still pass the qualification journey; repeated canvas frames alone do not establish capture health.

The new viewer has no image fallback, including manual snapshots. Missing native support, negotiation failure and lost media show a refusal/retry state. It never polls `/api/computer/frame`. Legacy frame, input and takeover routes return `update-required` for the migrated Windows Local Computer. Bot screenshots remain separate and are refused while paused.

T1 uses direct WebRTC with no configured STUN/TURN servers. Self-configured TURN and cross-network qualification are later slices. Hosted Connect refuses this route until the shared encrypted carrier is integrated; do not bypass that refusal. Audio, clipboard, background viewing and unlocking are absent.

## Agent operation

The same Computer owner serves the phone, authenticated Host and Device gateway, and CLI. Use the [CLI commands](bot-cli.md#local-computer-video) for current pause, global viewer/control state, signaling and explicit resume. `controller` and the grant are caller-scoped; `viewerCount` and `controlHeld` report global state. Signaling data is private and never printed by the CLI.

Control heartbeat silence marks the connection lost after 6 seconds and releases its reservation and media by 30 seconds. Receiver presentation must progress within 5 seconds; the helper separately requires genuine capture progress within 2 seconds and encoding progress within 4 seconds. These checks are independent of whether desktop contents changed. Commands and drains wait at most 10 seconds; cleanup waits at most 3 seconds. The owner admits at most eight pending commands, including separately bounded native input work. Request bodies are limited to 128 KiB and SDP to 96 KiB. Limits return coded refusals and never resume Bots.

## Qualification

The [native verification journey](../.agents/skills/verify-deepseekbot/features/local-computer-video.md) covers control fences, revocation of an established peer, static-screen liveness and moving-screen measurement. Capture counters, decoded frames, EGL swaps, TextureView updates and physical screen output are different measurements. Cross-check attempt-correlated render counters with visible moving frame identifiers. Require at least 15 actual presented FPS and input-to-visible p95 no more than 500 ms on the declared LAN rig, with readable static text. No unit test or signaling response establishes those results.
