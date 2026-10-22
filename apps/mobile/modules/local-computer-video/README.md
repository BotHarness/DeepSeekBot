# Local Computer Android video

This app-local Expo module receives a single video-only WebRTC offer. The Computer owner
authorizes observation and control; this view owns only its ephemeral native peer, decoder
and renderer. Input uses the existing authenticated Host client. No camera, microphone,
DataChannel, clipboard, picture-in-picture, image decoding or public STUN/TURN is configured.

The Android development client must be rebuilt after adding this module. It uses the
existing Expo Modules Gradle plugin and local-module autolinking; no JavaScript package
or config plugin is added. iOS and other unmigrated targets keep their existing surface.

## Dependency provenance

- Maven coordinate: `io.github.webrtc-sdk:android:144.7559.15`.
- [Upstream release](https://github.com/webrtc-sdk/android/releases/tag/v144.7559.15).
- WebRTC source revision: `30d5e63ae91da483e06577b5c35ee91cc5e5c3db`.
- Maven Central AAR SHA-256 published for this version:
  `fc7c8d027eb33860ccbb7847988f7f942d44a92d1f575348bba6c0250cde4071`.
- [Published checksum](https://repo.maven.apache.org/maven2/io/github/webrtc-sdk/android/144.7559.15/android-144.7559.15.aar.sha256).
- BSD license and patent grant are reproduced in `WEBRTC-LICENSE` and `WEBRTC-PATENTS`.
  Copies plus the artifact publisher's `Licenses/WEBRTC.md` at tag `v144.7559.15` are packaged
  under `android/src/main/assets/local-computer-video/`. APK/license inspection belongs to
  build qualification, not a source-only claim.

This version was selected against the published native API. Compilation, decoding,
ABI/page-size compatibility and presentation on the project's SDK 58 / React Native 0.88
development client remain physical-build qualification requirements.

## Lifetimes and limits

Each server-issued media attempt creates a fresh peer. SDP is capped at 96 KiB and contains
exactly one video media section. Native work has a 16-entry bounded executor queue; no media
bytes enter the JavaScript event queue. Signaling waits for local ICE gathering completion
and times out if no video is presented within 20 seconds. There are no supplier ICE servers.

Background, detach and close immediately hide the surface, stop presentation callbacks and
fence queued native work. Resource disposal happens off the UI thread. A replacement cannot
attach an EGL producer to the same SurfaceTexture until its predecessor has released it.
A process-wide single-native-peer permit remains held until disposal completes, so stuck
native cleanup cannot accumulate replacement peers. A three-second cleanup deadline reports
`native-cleanup-timeout`; it never grants new resources over an unfinished teardown. A new
attempt is necessary after background or cleanup timeout; the old offer cannot restore
playback or control, even when JavaScript has not handled the failure yet. A destroyed
SurfaceTexture stays owned by its retiring producer until actual disposal, including a
successful disposal that finishes after the deadline.

## Receiver measurements

Once per second `onPresentation` reports attempt identity, cumulative decoded sink arrivals,
EGL-rendered buffers, TextureView presentation updates, sample duration and the age of the
last update. A TextureView update only advances the presentation count when a new render
sequence exists; repainting the old buffer is not freshness. No bitmap readback occurs.

The native EGL render callback corresponds to buffer swap, and the presentation callback
corresponds to a consumed SurfaceTexture update. Neither claims physical scanout. The QA
runner must cross-check moving frame IDs on the actual phone, or use optical measurement,
for the 15 presented-FPS acceptance. Input-to-visible latency requires the same physical
fixture/clock; API round-trip time is not that measurement.

The shared client uses a five-second presentation deadline independently of control
heartbeats. The Windows helper must produce video at least once per second even when content
is unchanged. Static live text is therefore valid; a dead renderer cannot be kept actionable
by signaling. The client sends cumulative presentation state through the owner heartbeat.

## Source checks and native QA

Only the allocated testing-center window may run these commands:

```text
pnpm exec vitest run packages/computer/test/local-video-client.test.ts --maxWorkers=1
pnpm --filter @botharness/mobile typecheck
```

The testing-center runner uses the existing shared Android build/install workflow and a
batch-owned Host. Fingerprint inputs include this directory's module config, Gradle file,
manifest and Kotlin sources; the AAR version is part of that fingerprint. Verify background,
lock, immediate open/cancel, delayed cleanup/replacement, revocation and old-attempt events,
then measure actual motion and clicks. No successful compilation or unit test substitutes
for those checks or Human feedback.

The module has no configured native automated test runner. The TypeScript consumer tests
do not exercise EGL producer handoff. [Native cleanup regression](NATIVE-QA.md) specifies
the delayed-disposal and late-completion cases for the allocated runner; all remain unrun
until that evidence is recorded.
