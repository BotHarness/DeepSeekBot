# ADR-0290: Desktop and Web calls share a screen or window

- Status: Accepted (VC3)
- Date: 2026-11-04
- Issue: #3496 (spec #3490, hub #3491; builds on ADR-0286, ADR-0288 and ADR-0289)

## Context

ADR-0289 let Mac, Windows and Web calls send camera keyframes. The spec also asks for screen and window sharing with its own frame-difference settings, a visible "sharing" state, and a voice-only fallback that the DM records when the system ends a share.

## Decision

**One capture path, two sources.** `createBrowserCallCamera` takes `source: 'screen'` and then opens `getDisplayMedia` (no audio, about 5 fps) instead of `getUserMedia`. The browser's own picker chooses a whole screen or one window, so there is no in-app picker. It uses the screen settings of `keyframes.ts` (128-pixel thumbnails, a low threshold and 400 ms of stillness), so scrolling text is sent only once it settles.

**Capture first, then switch.** Turning on a source opens the capture before posting `visual`, so the browser still sees the click when it shows the picker. Only after the Host accepts does the Client stop the old source and start sampling with a new picker, so the first frame after a switch is always sent. If the Human cancels the picker, nothing changes and no error is shown.

**What the Human sees.** The call bar has a screen button next to the camera button. The preview panel shows the shared picture unmirrored and reads "Sharing: <window name>" from the track label, with the same keyframe flash, count and save switch.

**Stopped by the system.** When the shared window closes or the Human uses the browser's stop button, the track ends. The Client returns to voice only, shows "Screen sharing stopped. The call is voice only now." with a Close button, and sends `visual off` with `stopped: true`. The Host accepts `stopped` only with `off`, and writes a `share-stopped` call record (source and time into the call) into the DM after the start record. The Bot reads it as "Screen sharing in call … stopped at m:ss without the Human turning it off; the call went on with voice only." Desktop and mobile show it as a call record card. A camera that disconnects takes the same path with `camera-stopped`.

**Tested with a fake screen.** `scripts/e2e-desktop-call.mjs --scenario screen` generates a 24-second recording of three still "windows" and serves it as the display capture. A still page gives exactly one keyframe and each window switch gives one more. The sentence carries a 2x2 grid of the three windows, and a dispatched track end falls back to voice only on both sides.

## Consequences

Screen sharing costs the same as the camera: one small canvas draw per sample, and encoding only for keyframes. There is no Electron-specific picker because the desktop Client runs in the browser engine, which owns the picker. Native iOS and Android sharing are VC6 and VC7.
