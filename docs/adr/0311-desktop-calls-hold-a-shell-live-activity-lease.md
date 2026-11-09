# ADR-0311: Desktop calls hold a shell live-activity lease and follow the native window

- Status: Proposed (needs the DSH Desktop window-presence capability; see Upstream)
- Date: 2026-11-10
- Issue: #3833 (follows #3424, PR #3810; amends ADR-0310)

## Context

ADR-0310 kept the desktop call in the renderer and relied on Chromium's background exemptions, and said that if throttling still delayed the heartbeat on a platform the fix belonged in the shell. Windows acceptance of #3424 on DSH Desktop 0.2.2-rc.1 found exactly that: a minimized window lost the call after about 32.5 s and 15.3 s, one hidden heartbeat dispatch gap reached 10.7 s against the Host's 8 s limit, and a tray-hidden call ended after about 53 s. Clicking the call notification switched the page to the right Bot DM but left the window hidden, because a page's `focus()` cannot restore a minimized or tray-hidden Electron window, and the notice could be posted again while the window stayed hidden.

The installed shell keeps Electron's default `backgroundThrottling: true`, exposes no keep-running or restore/show/focus operation to product documents, and isolates the renderer. Electron documents that disabling background throttling also keeps `document.visibilityState` at `visible` while the window is hidden.

## Decision

**The shell owns background execution and native window presence; the Client asks for them per call.** DSH Desktop exposes two preload capabilities on `window.dshDesktop`, available only to the primary application document:

- `liveActivity.acquire('call')` returns a lease; while any lease is held the shell disables background throttling for that document. `release(lease)` ends it, and a navigation, renderer crash, window close or quit drops every lease.
- `window.state()`, `window.subscribe(listener)` and `window.reveal()` report whether the window is shown, minimized and focused as the OS sees it, and restore, show and focus it through the shell's own activation path (the same one the tray and a second launch use).

The Client holds a lease exactly while a call is opening or live (`holdCallActivity`). The background notification follows the native window state when the shell provides it, because page visibility no longer changes while a lease is held; clicking the notification calls `reveal()` and then opens the Bot DM. A notice the Human clicked or dismissed is not posted again until the window has been seen again. The 8-second heartbeat limit is unchanged, so a stalled window still ends the call as `connection-lost`.

**A heartbeat request that hangs or is reset is retried at once.** The call client keeps one heartbeat in flight, so a single request that the Electron proxy or the Host connection drops (`ECONNRESET`, or a request that never answers) silenced the call until the Host's 8-second limit. The desktop transport now gives each heartbeat request 3 seconds and retries it once after a network error or timeout; other call commands are not retried. A heartbeat is idempotent, so a late duplicate only refreshes the Host's timestamp.

**Older shells and browsers keep ADR-0310 behaviour.** Both capabilities are feature-detected; without them the Client keeps using page visibility and `focus()`.

## Consequences

- No Host contract, bridge method, route or Bot tool changes, so there is no new CLI command; `deepseekbot call-status` remains the observation surface for the hidden call.
- The fix ships in two places: the DSH Desktop shell change upstream and this Client change. Windows acceptance needs a Desktop build that contains the shell change.
- System sleep still ends the call as `connection-lost`; the lease does not prevent sleep.
- Measured on Windows 11 with the same injected WAVs, 70 s minimized: the official 0.2.2-rc.1 shell lost 1 of 3 calls (one heartbeat hung 9.9 s); with background throttling disabled 5 of 5 stayed live; the candidate shell with the lease and the heartbeat retry kept 6 of 6 live with at most a 3.5 s gap once the retry was in. Tray-hidden, 6 min 40 s minimized, notification click and full cover were accepted on the same candidate.
- The Host itself still pauses for 1 to 6 seconds around transcription and the start of reply playback, in the foreground as well. That margin belongs to the Host and is tracked separately; this decision does not raise the heartbeat limit to hide it.
- General desktop notifications (approvals, questions, mentions, replies) use the same `reveal()` on click, so they also bring a minimized or tray-hidden window back.
- Quitting and the busy-quit confirmation stay as ADR-0310 and #3829 describe.
