# ADR-0299: Android calls share the camera through the same call route

- Status: Accepted (VC7)
- Date: 2026-11-07
- Issue: #3498 (spec #3490, hub #3491; builds on ADR-0286, ADR-0289 and ADR-0291)

## Context

The iPhone call camera (ADR-0291) is a native `CallCamera` module that hands JS grey
thumbnails, runs the shared `keyframes.ts` picker, and returns a JPEG only when a frame
should go to the Host. Keyframes travel as `frame` commands over the existing
`/api/voice/call` route; there is no video track, no `frames` data channel and no phone
screen-sharing surface. The iPhone preview mirrors the front camera while the JPEGs sent to
the Bot stay unmirrored.

Android joined calls with audio only (ADR-0284). Its `LocalComputerVideo` receiver is the
Computer viewer: it decodes a stream the Host sends to the phone. It is not phone screen
sharing and does not send the phone's screen anywhere. The call camera is the missing piece,
not a new media transport.

## Decision

**Native capture, shared picker.** A `CallCamera` Expo module in the Android half of
`local-computer-video` runs CameraX 1.6.0. `ImageAnalysis` requests 1280×720, keeps only the
latest YUV frame, rotates buffers to portrait, and copies at most one frame every 90 ms. Twice
a second it sends JS a 64-pixel-wide grey thumbnail of the Y plane. JS runs the same picker as
iPhone and asks for a keyframe JPEG only when it picks one. The JPEG is at most 1280 pixels on
its long edge, tries quality 80, 60 and 45, and is refused when it is still over the Host's
frame limit. It goes to the Host as a `frame` command over the existing call route. No WebRTC
video track, data channel or new Host contract is added.

**Call screen.** Android uses the same camera button, 3:4 self-preview, switch-camera button
and keyframe counter as iPhone. The preview uses CameraX `PreviewView`, which mirrors the front
camera; the JPEGs are not mirrored, so text stays readable. A refused or missing camera keeps
the voice call and shows the existing hint.

**Lifecycle.** A module-owned lifecycle pauses the capture when the app goes to the
background, and JS sends `visual off` with `paused: true`; returning restarts it with a fresh
picker and JS sends `visual camera` with `resumed: true`. Android calls are still foreground
only (ADR-0284), so end-to-end pause and resume records become observable only when #3423 keeps
a call alive in the background. The camera path is already in place for that slice. A system
camera-permission dialog pauses the activity; while it is open, `LocalComputerVideoModule`
does not treat that one pause as leaving the call. A real background still ends the call.

**Test builds.** A `.dev` script step `{"at": ms, "video": url}` downloads a file and plays it in
real time with `MediaMetadataRetriever`, through the same thumbnails, keyframes and preview.
`{"camera": "off"}` and `{"camera": "flip"}` drive the switch, and the call report records
keyframe sizes and preparation times. This gives the Android emulator a camera-free end-to-end
path.

**No phone screen sharing.** The iPhone has no phone screen-sharing surface in this
Milestone, so Android does not invent one. Desktop screen sharing and the Local Computer
viewer remain their own surfaces (ADR-0290).

## Consequences

CameraX owns capture and the preview on the phone; JS never receives pixels for rendering. The
picker, frame limit and Host call route stay identical across desktop, iPhone and Android. The
capture stack is the same CameraX line expo-camera already resolves. A development client must
be rebuilt, Android needs the `CAMERA` runtime permission, and physical-camera behavior plus
the #3423 background records remain native acceptance gates rather than source claims.
