# ADR-0311: Desktop call heartbeats run in a Worker, and notices restore the window through a relaunch

- Status: Accepted (Windows, DSH Desktop 0.2.2-rc.1)
- Date: 2026-11-10
- Issue: #3833 (follows #3424, PR #3810; amends ADR-0310)

## Context

ADR-0310 kept the desktop call in the renderer and relied on Chromium's background exemptions. Windows acceptance of #3424 on DSH Desktop 0.2.2-rc.1 found minimized and tray-hidden calls ending as `connection-lost`, and a call notification that switched the page to the right Bot DM but left the window hidden, sometimes posting the notice again.

BotHarness cannot change the DSH shell, so the fix has to work with the official shell as shipped. Measurements on Windows with the same injected WAVs separated the causes:

1. **A minimized page's main thread stalls.** With 1 s ticks side by side, the page's main thread fired 11 times in 70 s minimized (gaps up to 11.9 s, task lag up to 24.5 s) while a dedicated Worker fired 44 times (gaps up to 3.6 s) and reached the Host every time. Disabling the shell's background throttling with Chromium switches removed the failures (5 of 5 live), confirming the cause, but the switches belong to the shell.
2. **One lost request ended the call.** The client keeps one heartbeat in flight; one request that hung for 9.9 s, or one reset by `ECONNRESET`, silenced the call until the Host's 8-second limit.
3. **The Host itself pauses** for 1 to 6 s around transcription and the start of reply playback, in the foreground too. After such a pause Node runs the Host's timers before it reads the sockets that queued meanwhile, so the loss check could end a call whose heartbeats were waiting to be read; a client-side request timeout made this worse by abandoning those queued requests.

The page cannot restore its own window: `focus()` does not un-minimize or un-hide an Electron window. The official shell does restore, show and focus its primary window when the app is launched a second time.

## Decision

**The desktop call heartbeat runs in a dedicated Worker.** The Worker posts `{kind:"heartbeat"}` every second and hands each answer to the call client, which keeps all call logic and still ends the call after the unchanged 8-second loss window. It does not abort a slow request; it keeps sending while earlier requests wait (at most four in flight), so requests queued behind a Host pause still count. Without Worker support the client falls back to the page timer, retrying a reset request once.

**The Host reads queued heartbeats before judging a call after its own pause.** If the per-call 1-second tick fires late by more than a second, the Host skips the loss verdict on that tick; the next tick decides after pending requests were read.

**Notices bring the window back through the shell's single-instance handler.** A new Host route (`POST /api/botharness/desktop-window {action:"reveal"}`, CLI `deepseekbot desktop-window-reveal`) relaunches the Desktop executable the Host runs in, with the running app's `--user-data-dir`, on Windows; the extra launch hands over and exits. The call notice and the general desktop notifications call it on click, after the page's own `focus()`. A clicked or dismissed call notice stays answered until the window is seen again, so call updates while the window is still hidden do not post it again.

## Consequences

- One new Host route with its CLI command and docs; the call contract and the 8-second limit are unchanged.
- The call itself (speech in, replies out) does not depend on the page's main thread, so a minimized call keeps talking even when the page is stalled; the call UI catches up when the window returns.
- Web Audio graphs without a speaker output are driven by an ordinary timer and stall when minimized, so WAV injection through Web Audio is not a valid way to test turns while hidden on the official shell; real-microphone runs are.
- The Host's own 1 to 6 s pauses remain and are tracked separately; this decision does not raise the limit to hide them.
- System sleep still ends the call as `connection-lost`. Quitting and the busy-quit confirmation stay as ADR-0310 and #3829 describe.
