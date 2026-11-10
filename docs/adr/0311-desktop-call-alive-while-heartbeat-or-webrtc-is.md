# ADR-0311: A desktop call is alive while its heartbeat or its WebRTC connection is, and notices restore the window through a relaunch

- Status: Accepted (Windows, DSH Desktop 0.2.2-rc.1)
- Date: 2026-11-10
- Issue: #3833 (follows #3424, PR #3810; amends ADR-0281 and ADR-0310)

## Context

ADR-0310 kept the desktop call in the renderer and relied on Chromium's background exemptions; the Host ended a call after 8 seconds without a heartbeat (ADR-0281). Windows acceptance of #3424 on DSH Desktop 0.2.2-rc.1 found minimized and tray-hidden calls ending as `connection-lost`, and a call notification that switched the page to the right Bot DM but left the window hidden, sometimes posting the notice again.

BotHarness cannot change the DSH shell, so the fix has to work with the official shell as shipped. Windows measurements with the same injected WAVs found:

1. **A minimized page's JavaScript stops for long stretches.** With 1 s ticks side by side the page's main thread fired 11 times in 70 s (gaps up to 11.9 s). A dedicated Worker did better (44 times) but in other runs stopped too: one call lost its heartbeat for 8 s right after minimizing while the Electron main process and the Host were responsive. Disabling the shell's background throttling with Chromium switches removed the failures (5 of 5), so the cause is the shell's background policy, which BotHarness cannot change.
2. **The WebRTC connection keeps running.** During those stalls the Host's media helper kept seeing packets from the client (RTCP round-trip times kept updating; a real microphone keeps sending audio), because WebRTC runs on its own threads. Speech in and replies out do not need the page's JavaScript.
3. **One lost request ended the call.** The client keeps one heartbeat in flight; a reset request (`ECONNRESET`) silenced it until the 8-second limit.
4. **The Host itself pauses** for 1 to 6 s around transcription and the start of reply playback. After such a pause Node runs the Host's timers before it reads the sockets that queued meanwhile.

The page cannot restore its own window: `focus()` does not un-minimize or un-hide an Electron window. The official shell restores, shows and focuses its primary window when the app is launched a second time.

## Decision

**A call is lost when neither a heartbeat nor any WebRTC packet arrived for 8 seconds.** When the heartbeat is older than the unchanged 8-second limit, the Host asks the media helper for fresh stats; the helper reports how long ago the selected ICE candidate pair received any packet (RTP, RTCP or consent checks). The Host ends the call as `connection-lost` only if that is also older than 8 seconds, or the helper does not answer. A closed window, a crashed renderer, a quit app and system sleep all stop both signals, so they still end the call within seconds.

**The Host reads queued requests before judging a call after its own pause.** If the per-call 1-second tick fires late by more than a second, the Host skips the loss verdict on that tick.

**A reset heartbeat is retried once** by the desktop transport; it is never aborted, so a request queued behind a Host pause still counts.

**Notices bring the window back through the shell's single-instance handler.** A new Host route (`POST /api/botharness/desktop-window {action:"reveal"}`, CLI `deepseekbot desktop-window-reveal`) relaunches the Desktop executable the Host runs in, with the running app's `--user-data-dir`, on Windows; the extra launch hands over and exits. The call notice and the general desktop notifications call it on click, after the page's own `focus()`. A clicked or dismissed call notice stays answered until the window is seen again, so call updates while the window is still hidden do not post it again.

## Consequences

- One new Host route with its CLI command and docs; the call contract and the 8-second limit are unchanged. `deepseekbot call-status` still shows the call.
- While the page is stalled the call keeps talking; the call bar and DM catch up when the window returns.
- Web Audio graphs without a speaker output are driven by an ordinary timer and stall when minimized, so WAV injection through Web Audio cannot test turns while hidden on the official shell; real-microphone runs can.
- The Host's own 1 to 6 s pauses remain and are tracked separately.
- Quitting and the busy-quit confirmation stay as ADR-0310 and #3829 describe.
