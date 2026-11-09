# ADR-0311: Desktop calls survive a lost heartbeat, and notices restore the window through a relaunch

- Status: Accepted (Windows, DSH Desktop 0.2.2-rc.1)
- Date: 2026-11-10
- Issue: #3833 (follows #3424, PR #3810; amends ADR-0310)

## Context

ADR-0310 kept the desktop call in the renderer and relied on Chromium's background exemptions. Windows acceptance of #3424 on DSH Desktop 0.2.2-rc.1 found minimized and tray-hidden calls ending as `connection-lost` (after about 15 to 53 s), and a call notification that switched the page to the right Bot DM but left the window hidden, sometimes posting the notice again.

A controlled Windows A/B with the same injected WAVs (70 s minimized, two questions) separated three causes:

1. **One lost request ended the call.** The call client keeps one heartbeat in flight. In the failing run one heartbeat request hung for 9.9 s; in a real-microphone run one was reset (`ECONNRESET` between the Electron proxy and the Host). Nothing replaced it before the Host's 8-second limit.
2. **Background throttling** lowered the hidden heartbeat cadence (36 to 59 per 70 s instead of about 62). Disabling it with Chromium switches kept 5 of 5 calls live; the official shell lost 1 of 3.
3. **The Host itself pauses** for 1 to 6 s around transcription and the start of reply playback, in the foreground too, measured by a probe that bypasses Electron.

The page cannot restore its own window: `focus()` does not un-minimize or un-hide an Electron window. BotHarness cannot change the DSH shell (no background-throttling switch, no restore API), so the fix must use what the official shell already offers.

## Decision

**A heartbeat request that hangs or is reset is retried at once.** The desktop transport gives each heartbeat request 3 seconds and retries it once after a network error or timeout; other call commands are not retried. A heartbeat is idempotent, so a late duplicate only refreshes the Host's timestamp. The Host's 8-second limit is unchanged.

**Notices bring the window back through the shell's own single-instance handler.** The official shell restores, shows and focuses its primary window when the app is launched a second time. The Host runs inside the Desktop executable, so on Windows a new Host route (`POST /api/botharness/desktop-window {action:"reveal"}`, CLI `deepseekbot desktop-window-reveal`) relaunches that executable with the running app's `--user-data-dir`; the extra launch hands over to the running instance and exits. The call notice and the general desktop notifications call it on click, after the page's own `focus()`. Other platforms keep `focus()`.

**A clicked or dismissed call notice stays answered until the window is seen again**, so a call update while the window is still hidden does not post it a second time.

## Consequences

- One new Host route with its CLI command and docs; no Host call-contract change.
- Measured on the official 0.2.2-rc.1 shell with this change: see #3833 for the acceptance table (minimized, tray-hidden, 6+ minutes hidden, notification click, tray icon, full cover, real microphone).
- Background throttling stays on (the shell owns it), so hidden heartbeats are less frequent than in the foreground; the retry is what keeps a single slow or dropped request from ending the call.
- The Host's 1 to 6 s pauses still eat into the 8 s margin and are tracked separately; this decision does not raise the limit to hide them.
- The relaunch shows nothing when the app is already focused; a rate limit of 1.5 s keeps repeated clicks from starting several helpers.
- System sleep still ends the call as `connection-lost`. Quitting and the busy-quit confirmation stay as ADR-0310 and #3829 describe.
