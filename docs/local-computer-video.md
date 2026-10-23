# Local Computer video: Windows and Linux to Android

The Windows slice uses one x64 primary display and one Android viewer. The Linux x64 managed-desktop extension and its prerequisites are described below. Native package, physical-device performance and Human acceptance must be recorded against the exact build before qualification is claimed. The Container viewer retains its existing path.

Start Local Computer with **Check permissions** or `deepseekbot computer-start --target local`. This existing explicit install/verification flow installs the pinned capture helper when needed. The helper downloads Electron 44.9.3 for Windows x64 (158,508,870 bytes; extracted size must be measured on the qualification machine). The Host supervises it as a separate process. The Android development client needs a rebuild for the local native video module; reloading JavaScript into an older client is insufficient.

Setup also compiles the bundled Windows Job launcher with the system .NET Framework compiler, invoked directly with no compiler server. This bounded step runs only during explicit setup; observation never downloads or compiles a helper. Compiler, verification or desktop-access failures leave video unavailable. The launcher owns the entire Electron process tree. Unproven cleanup blocks another capture instead of treating root-process exit as success.

Open a Bot with Computer Access and choose **Computer**. Watching does not pause Bots. **Take control** first saves a Computer-wide pause and waits for earlier Bot operations to finish. Only then may a tap send a desktop click. This slice offers direct clicks; additional gesture and text-entry qualification belongs to later slices.

Video and input use the primary display's physical pixel dimensions. Before granting control and before each input, the owner checks the Windows driver's display size against capture. DPI scale is not applied a second time; mismatched or changed geometry refuses input.

**Release control** leaves Bots paused. **Resume Bots** explicitly ends control, waits for Human input to finish, and saves the resumed state. Pause survives losing the phone, helper failure and Host restart. No controller is restored after restart. Resume remains available through the CLI when media cannot start.

Backgrounding or locking the phone stops its media and releases control. Return to the foreground to observe again, then explicitly take control. A second viewer is refused with `viewer-limit` without evicting the first. Frozen or unconfirmed video disables input. A static live desktop must still pass the qualification journey; repeated canvas frames alone do not establish capture health.

The new viewer has no image fallback, including manual snapshots. Missing native support, negotiation failure and lost media show a refusal/retry state. It never polls `/api/computer/frame`. Legacy frame, input and takeover routes return `update-required` for the migrated Windows Local Computer. Bot screenshots remain separate and are refused while paused.

T1 uses direct WebRTC with no configured STUN/TURN servers. The phone's signaling and control use the existing encrypted LAN channel, its pinned Host key and approved device identity. Only the server-owned LAN listener dispatches the exact video command path to the Computer owner. Hosted Connect remains refused with `connect-carrier-required`, even though its encrypted carrier is available; remote media qualification belongs to a later slice. There is no WebView or plaintext fallback. Self-configured TURN, audio, clipboard, background viewing and unlocking are absent.

When video stalls, input is disabled but **Release control**, **Resume Bots**, exit and **Reconnect** remain available. Release follows the caller's retained grant, separately from eligibility to send input. Reconnect closes the old attempt before opening observation again; it does not restore control or replay input.

## Linux managed desktop (#2606)

The Linux x64 sender uses one Host-owned Xvfb desktop at 1440 × 900. Input and capture share the actual `DISPLAY`, private `XAUTHORITY` and desktop generation. Starting a viewer never creates a second desktop. A dead or replaced desktop invalidates old video and control; stale input cannot switch to another display. Existing X11 sessions, Wayland, multiple monitors and Linux ARM are outside this video slice. An existing desktop session is never stopped by the managed-desktop owner.

Prepare a non-root login with cgroup v2, a running systemd user manager, Python 3, unzip, Xvfb, Openbox (or another supported window manager), D-Bus, AT-SPI and Electron's system libraries. Chromium's unprivileged sandbox must work. A dedicated headless Host starts without inherited `DISPLAY` or `WAYLAND_DISPLAY`; preserve the user's `XDG_RUNTIME_DIR`. Missing prerequisites return an explicit refusal. Setup does not enable linger, install a user manager, change kernel policy or add `--no-sandbox`.

Use the same `deepseekbot computer-start --target local` and `computer-video` commands below. Explicit setup downloads the pinned Electron 44.9.3 Linux x64 archive (123,232,128 bytes), verifies its SHA-256 and installed inventory, and checks dynamic libraries. Observation does not download or install. The Linux helper retains the Electron and Chromium license notices.

Each owned Xvfb, window-manager, D-Bus or media process tree runs in a private systemd user service. Cleanup requires both an inactive service and an empty cgroup. A PID exit or process-group signal cannot establish that descendants have gone; a descendant can outlive or leave a process group. The Host start time, pipe closure and worker watchdog independently bound orphan lifetimes. Failed cleanup refuses another attempt until the Host is restarted. The Computer owner remains the only authority for pause, grants and input. An existing durable pause is never cleared by Linux recovery.

Linux uses the same encrypted LAN signaling, video-only VP8 negotiation and Android receiver as Windows. SSH remains a control-channel option and does not gain a video route exception. Host CLI commands use their own caller identity; they cannot act with the phone's grant. The current Android UI offers direct clicks. Text operations through an independently authorized CLI caller do not prove Android text entry.

This is an implementation and verification path, not Linux qualification evidence. A dedicated Linux rig must verify sandbox startup, Xauthority access, actual single-display capture, input coordinates, service/cgroup cleanup after Host death, native phone rendering and the performance thresholds below. Windows regressions and phone text-entry qualification remain separate explicit checks.

## Recovery and downgrade

After takeover, a code-only rollback is unsafe: older versions ignore `botharness/computer-pause.json` and can reopen Bot access after restart. Keep the affected Computer stopped, confirm its owned media has stopped and preserve the pause record. If the Human explicitly chooses to resume Bots, use the supported new-version resume operation and its drain before downgrading. Otherwise apply a forward fix that honors the durable pause. Never delete the record or resume automatically to make a downgrade succeed.

## Agent operation

The same Computer owner serves the phone, authenticated Host and Device gateway, and CLI. Use the [CLI commands](bot-cli.md#local-computer-video) for current pause, global viewer/control state, signaling and explicit resume. `controller` and the grant are caller-scoped; `viewerCount` and `controlHeld` report global state. Signaling data is private and never printed by the CLI.

Control heartbeat silence marks the connection lost after 6 seconds and releases its reservation and media by 30 seconds. Receiver presentation must progress within 5 seconds; the helper separately requires genuine capture progress within 2 seconds and encoding progress within 4 seconds. These checks are independent of whether desktop contents changed. Commands and drains wait at most 10 seconds; cleanup waits at most 3 seconds. The owner admits at most eight pending commands, including separately bounded native input work. Request bodies are limited to 128 KiB and SDP to 96 KiB. Limits return coded refusals and never resume Bots.

## Qualification

The [native verification journey](../.agents/skills/verify-deepseekbot/features/local-computer-video.md) covers control fences, revocation of an established peer, static-screen liveness and moving-screen measurement. Capture counters, decoded frames, EGL swaps, TextureView updates and physical screen output are different measurements. Cross-check attempt-correlated render counters with visible moving frame identifiers. Require at least 15 actual presented FPS and input-to-visible p95 no more than 500 ms on the declared LAN rig, with readable static text. No unit test or signaling response establishes those results.
