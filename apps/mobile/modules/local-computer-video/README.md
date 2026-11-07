# Local Computer native video

This app-local Expo module receives a single video-only WebRTC offer. The Computer owner
authorizes observation and control; this view owns only its ephemeral native peer, decoder
and renderer. Input uses the existing authenticated Host client. No camera, microphone,
DataChannel, clipboard, picture-in-picture, image decoding or public STUN/TURN is configured.
The Computer viewer is receive-only: the phone does not send its camera or screen; Bot calls
use the separate camera path below.

## Bot calls (iOS)

The same module also answers a Bot call (#3400). `callStart(attemptId, offer, testAudio)` takes one
audio-only offer from the Host call owner and answers with a microphone track on a separate peer
connection factory. The audio session is play-and-record in voice-chat mode on the loudspeaker, and
the track requests echo cancellation, noise suppression and gain control, so the Bot's reply is not
heard back as the Human's speech. `callMute` disables the track, `callStop` closes the peer and
releases the audio session. No audio is stored.

The call keeps running with the screen locked or the app in the background (#3422): the module's
config plugin declares the `audio` background mode, and the session stays active from `callStart`
to `callStop`. `callStart` also takes the microphone (`headset` or `iphone`) to use when headphones
take the call. `callAudio(attemptId, output, microphone)` switches a live call's output (`receiver`,
`speaker` or `external`) and microphone (`iphone` or `headset`) by reconfiguring the active session,
and `callAudioState` reads the route: the output and microphone in use, the ones on offer with the
connected device's name, and whether music mode is on. Headphones with the iPhone microphone is
music mode: A2DP output, other apps keep playing, Apple's voice processing off (the peer factory
uses the AudioEngine device module) and WebRTC software echo cancellation on the track. `onCallAudio` reports interruptions by another call,
Siri or app, and every route change with that same route, such as headphones being unplugged; neither ends the call. See ADR-0285. With `testAudio` (only `.dev` development builds pass it), a capture
post-processing hook replaces the microphone with WAV files queued by `callInject`, and a renderer
on the remote track records the downlink to a WAV in the caches folder and reports
`downlink-start`/`downlink-end` timestamps through `onCallTap`. iOS needs a rebuilt development
client for these functions; the JavaScript side hides the call button when they are missing.

## Bot calls (Android)

Android has the same four functions and two events (#3405, ADR-0284). `CallAttempt.kt` builds its own
`PeerConnectionFactory` with a `JavaAudioDeviceModule`, so a call never shares native resources with the
video peer. The microphone uses the voice-communication source with the platform echo canceller and noise
suppressor where available, and the track requests WebRTC's communication processing. The call takes
transient audio focus, `MODE_IN_COMMUNICATION`, and routes to a connected headset or else the loudspeaker;
all of it is restored on close. The window keeps the screen on during a call, and leaving the foreground or
locking the phone ends it with `closed`/`background`. With `testAudio`, an `AudioBufferCallback` overwrites
each recorded buffer with WAV files queued by `callInject` (silence when empty), and an `AudioTrackSink` on
the remote track records the downlink to a WAV in the cache folder with `downlink-start`/`downlink-end`. The
module manifest declares `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`. A rebuilt development client is needed.

Android also runs the call camera (#3498, ADR-0299). `CallCameraModule` exposes the same
`callCameraStart`, `callCameraKeyframe`, `callCameraStop`, `onCallCameraThumb` and
`onCallCameraState` contract as iPhone, plus the `CallCamera` self-preview view. CameraX captures
1280×720, keeps only the latest rotated YUV frame, and sends JS a 64 px grey thumbnail twice a
second; JS runs the shared picker and asks for a JPEG only for a keyframe, at most 1280 px on the
long edge with quality 80, 60 and 45. Front and back cameras restart the same session, `PreviewView`
mirrors the front preview, and the JPEGs stay unmirrored. A module-owned lifecycle pauses capture
in the background with `paused` and restarts it with `resumed`; JS turns that into the existing
`visual` changes. Android calls are foreground only until #3423, so the paused/resumed DM records
need that slice to be observable end to end. A camera-permission dialog pauses the activity, so the
call owner ignores that one pause while the permission request is open; a real background still
ends the call. In `.dev` builds a test-video path reads a file with `MediaMetadataRetriever` at its
own pace and drives the same thumbnails, keyframes and preview on an emulator. The module manifest
declares `CAMERA`. Rebuild the Android development client.

The Android development client must be rebuilt after adding this module. It uses the
existing Expo Modules Gradle plugin and local-module autolinking; no JavaScript package
or config plugin is added. The iOS receiver also requires a rebuilt native client.

## Dependency provenance

- Maven coordinate: `io.github.webrtc-sdk:android:144.7559.15`.
- AndroidX CameraX `1.6.0` (Apache 2.0), the same line `expo-camera` resolves, for the call camera.
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

## Release JNI retention

The pinned AAR ships no consumer ProGuard rules. This module supplies rules for its native
methods and annotated Java callbacks, including JNI Zero initialization. R8 otherwise removes
`org.jni_zero.JniInit` and the native library aborts while opening the first video peer.
The rules keep JNI names and descriptor classes while allowing unrelated Java code to shrink.
They are module-owned consumer rules and apply to generated CNG projects without manual edits.
Changing them requires rebuilding the Android client. Qualify with a minified Release APK,
inspect its merged R8 rules/seeds and open real video on the phone; Debug cannot prove this fix.

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

## iOS receiver

The Apple module uses WebRTC-SDK 144.7559.15 from the same publisher. Its vendor podspec pins the release ZIP SHA-256 `a17a6688e208255b70381926110526593ba626e033cf88c9ed4a7b618f98eb8a` (66,580,761 bytes), and the local CNG plugin registers that podspec. `apple.podspecPath` limits module autolinking to LocalComputerVideo so the vendor is not linked twice. WebRTC license and patents are bundled as resources.

A serial queue has a 16-work budget. The native peer permit is released only after `close()` returns. The Metal view retains the latest decoded frame and one in-flight GPU command; drawable presentation, render completion and received frames are distinct counters. Background/detach clears the surface and fences current-attempt callbacks before asynchronous retirement. The Computer viewer requests no camera or microphone; only Bot calls (below) use the microphone. iOS 16.4 is the app minimum, including the Foundation WebSocket LAN carrier. Actual iPhone playback, lifecycle and click tests are required; Android evidence cannot qualify this receiver.

The iOS Simulator SDK lacks drawable presentation receipts. It can render diagnostic frames but never reports them as presented or enables remote control; its presentation timeout is expected. Qualify the complete control path on a physical iPhone.
