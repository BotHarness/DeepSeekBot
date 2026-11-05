# ADR-0291: iPhone calls share the camera through the same call route

- Status: Accepted (VC6)
- Date: 2026-11-04
- Issue: #3497 (spec #3490, hub #3491; builds on ADR-0286, ADR-0289 and ADR-0290)

## Context

Desktop and Web calls send camera keyframes as `frame` commands (ADR-0289). The iPhone call needs the same: a camera switch, a self-preview, and the same frame-difference settings. It also needs a clear story for the background, where iOS stops the camera but the call goes on.

## Decision

**Native capture, shared picker.** A new `CallCamera` Expo module in `local-computer-video` runs `AVCaptureSession` (720p, portrait, front or back). Twice a second it sends JS a grey thumbnail 64 pixels wide. JS feeds it to the same `keyframes.ts` picker the desktop uses, with the camera settings. Only for a keyframe does JS ask native for the newest frame as a JPEG: at most 1280 pixels on its long edge, quality 0.8, then 0.6 and 0.45, and skipped if it is still over the frame limit. The JPEG goes to the Host as a `frame` command over the existing Host connection. There is no WebRTC video track and no data channel. The spec's `frames` channel is not needed, because the call route already carries frames.

**Call screen.** A camera button joins mute, audio and hang up. While the camera is on, a 3:4 self-preview replaces the Bot's avatar. The preview mirrors the front camera, but the frames sent to the Bot are not mirrored, so text stays readable. It has a switch-camera button, and a count of keyframes sent replaces the "changes in the picture go to the Bot" line. A refused or missing camera keeps the voice call and shows a hint.

**Background.** When the app goes to the background, the camera stops and JS sends `visual off` with `paused: true`. When it returns, the camera restarts with a new picker, so the first frame is sent, and JS sends `visual camera` with `resumed: true`. The Host writes `share-paused` and `share-resumed` call records into the DM, next to `share-stopped` (ADR-0290). Desktop and mobile show them as call record cards. The Bot reads "The camera in call … paused at m:ss because the Human's app went to the background" and "… resumed at m:ss". The Host refuses `paused` or `stopped` unless the source is `off`, refuses `resumed` with `off`, and allows one flag at a time. `call-simulate --share-pause <from>-<to>` does the same from the CLI.

**Test builds.** A `.dev` call script step `{"at": ms, "video": url}` downloads the file and plays it in real time in place of the camera, with the same thumbnails, keyframes and preview. Steps `{"camera": "off"}` and `{"camera": "flip"}` drive the switch. The call report lists `video`, `camera` and `keyframe` marks with sizes and preparation times. This makes the Simulator, which has no camera, a full end-to-end path.

**Models without image input.** Before a sentence goes to the Bot, the Host resolves the Bot's main model route (its model plan, or the Host default) and reads the model's declared input modalities. When they are declared and leave out images, the Host still attaches the grid, so the DM keeps the history for a later model, and adds `unseen: true` to `voiceCall.visual`. The turn note then says a share is on, that the Bot's current model cannot read images so it should not open the grid, and that it should ask the Human to describe what they show. An unknown modality list keeps sending grids. This keeps a call working on a text-only model instead of failing the turn when the image is read.

## Consequences

The phone does one small grey render every 500 ms and encodes only keyframes. The picker parameters live in one place for every client. Android (VC7) can add the same native surface (thumbnails, keyframe JPEG, a preview view, pause and resume) and reuse the JS side unchanged.
