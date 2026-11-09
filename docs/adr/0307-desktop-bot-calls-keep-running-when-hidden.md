# ADR-0307: Desktop Bot calls keep running when the window is hidden

- Status: Accepted (V10; Mac accepted on DSH 0.2.2-rc.1, Windows acceptance by the Windows lane)
- Date: 2026-11-09
- Issue: #3424 (spec #3397, hub #3398; builds on ADR-0281 desktop calls and ADR-0285 iPhone background calls)

## Context

A desktop call (#3403) lives in the Client window: the window owns the microphone, the WebRTC peer and the one-second heartbeat that the Host call owner needs every 8 seconds. V10 asks that minimizing, covering or closing that window, or locking the screen, keeps the call, that the system shows the call is running with a way back, and that system sleep ends the call as `connection-lost` without losing committed messages.

The desktop Client is a DSH Plugin bundle. The Mac and Windows windows belong to the DSH Desktop shell (Electron), which BotHarness does not change. On the installed shell (DSH 0.2.1-rc.3, Electron 44.7) the main window keeps Electron's default `backgroundThrottling`, there is no `powerSaveBlocker`, App Nap is not disabled, and the preload exposes no power, badge, Dock menu or tray API. On macOS, closing the main window hides it (the app stays in the Dock and **Activate** shows it again); quitting asks for confirmation first. Windows hides to its own tray. The shell grants the Web Notification permission, and the microphone check keeps passing while the window is hidden.

## Decision

**The call stays in the renderer and relies on Chromium's exemptions.** A hidden page with a connected `RTCPeerConnection` and a playing audio element is exempt from Chromium's intensive timer throttling, so the 1-second heartbeat keeps its pace under ordinary background throttling. Nothing new is added to keep the process awake, so system sleep still stops the heartbeat and the Host ends the call as `connection-lost` (ADR-0281); committed messages are already in the DM.

**A system notification marks the hidden call.** When a desktop call is live and the document becomes hidden (minimized, hidden by closing on macOS, hidden to the tray on Windows, or occluded where the platform reports it), the Client posts one silent Web Notification, "On a call with `<Bot>`", tagged `botharness-call`. Clicking it focuses the window and opens that Bot's DM, where the call bar has hang up. The notification is withdrawn when the window is visible again or the call ends, and a new one is posted only for a new call. The Client asks for the permission when the Human presses the call button if it is still undecided; without it the call still runs without a notice.

**Leaving the page hangs up when it can.** Reloading the page unloads the window; the existing `pagehide` hang-up now uses a `keepalive` request, so the Host records `hangup` instead of waiting for the missed heartbeat. Quitting the app does not reach that path in time (see Consequences).

## Consequences

- No Host contract changes, so there is no new CLI command. `deepseekbot call-status` shows a hidden call as live.
- Hanging up from the Dock (Mac) or the tray (Windows) needs a shell API that DSH does not offer. Until it does, the notification leads back to the call bar, and quitting the app hangs up. A Dock menu or tray item can replace this once the shell exposes one.
- Quitting ends the call, but not as `hangup`. Measured on the Mac with DSH 0.2.2-rc.1: an idle quit stops the Host before the window's hang-up arrives, so the call ends as `host-stopped`; committed messages remain. When a Bot is busy, DSH first shows its own quit confirmation, which blocks the shell's main process; the window's heartbeats stop, the Host ends the call as `connection-lost` after 8 seconds, and **Cancel** does not bring it back. Asking whether to hang up before quitting, and keeping the call alive while the confirmation is open, need the shell to tell the Client before it quits (or a non-blocking dialog). Tracked as a follow-up.
- Under macOS Stage Manager a minimized window reports `hidden` only after its animation settles (about 27 s in the Mac run), so the notice appears late there; the call is unaffected. A window covered by another app stays `visible` on the Mac, so covering alone posts no notice.
- Throttling, App Nap and occlusion behaviour belong to the shell's Chromium and the OS, so a 60-second hidden call with injected speech must be accepted on both a real Mac and a real Windows machine. If App Nap or throttling delays the heartbeat on a platform, the fix belongs in the shell (`backgroundThrottling: false` or a power-save blocker during a call) and is requested upstream.
