# ADR-0289: Desktop and Web calls share the camera through the call route

- Status: Accepted (VC2)
- Date: 2026-11-04
- Issue: #3495 (spec #3490, hub #3491; builds on ADR-0286 and ADR-0288)

## Context

ADR-0286 gave the Host keyframe grids and a `frame` command, and `call-simulate --video` proved them. The Mac, Windows and Web clients still had no way to turn a camera on during a call.

## Decision

**Same route, no video track.** The call bar gets a camera button. Turning it on sends `visual camera` (with the current save setting), opens the camera with `getUserMedia` (ideal 1280x720 at 15 fps, no audio), and samples it twice a second on a canvas. Each sample is drawn to a 64-pixel-wide grayscale thumbnail and fed to the shared `keyframes.ts` picker with the camera settings. A keyframe is drawn at most 1280 pixels on its long edge, encoded as JPEG at quality 0.8 (0.6 and 0.45 if it is larger than the frame limit, skipped if it is still too large) and sent as a `frame` command with its score and the number of samples skipped since the last one. The WebRTC audio session is unchanged.

**What the Human sees.** While the camera is on, a small mirrored self-preview opens under the call bar. Its border flashes when a keyframe goes to the Bot, and a counter shows how many have gone. The preview holds the "Save frames to the chat" switch, which sends `visual` with `save: false` (ADR-0288). If the camera is refused or missing, the voice call continues and the same panel explains how to allow it. Hanging up or the call ending stops the camera.

**Tested with a fake camera.** `scripts/e2e-desktop-call.mjs --scenario camera` runs Chromium with a generated colour-card video as its camera, turns the camera on, speaks one sentence and checks that keyframes reach the Host and that the sentence carries the camera grid.

## Consequences

Keyframe picking costs one small canvas draw every 500 ms, and encoding happens only for keyframes. The preview and the picker read the same `MediaStream`. Screen sharing (VC3) reuses this path with `getDisplayMedia` and the screen settings.
