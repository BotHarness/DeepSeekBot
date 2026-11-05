# ADR-0284: Android Bot calls are foreground only

- Status: Accepted (Android call path)
- Date: 2026-11-03
- Issue: #3405 (spec #3397, hub #3398; builds on ADR-0281)

## Context

ADR-0281 put every Bot call behind the Host call owner and let the iPhone answer with the native WebRTC module. The spec's platform revision adds Android: the same DM call button, the same signaling, Host owner and Providers, and a file audio source for test builds. The spec leaves one choice open for Android: when the app goes to the background or the phone locks, either end the call clearly or keep it running under the platform's rules. Keeping it means a foreground service of type `microphone` with an ongoing notification (Android 14 requires the type and only allows starting it while the app is visible), `FOREGROUND_SERVICE_MICROPHONE` in the manifest, Play policy declarations, and a lock-screen surface for mute and hang up. iOS (V2) ends the call when the app leaves the foreground.

## Decision

**Foreground only.** An Android call ends when the activity leaves the foreground, which includes locking the phone and switching apps. The native module closes the peer, releases the microphone and the audio route, and reports `closed` with code `background`; the call client turns that into an ordinary hang-up, so the Host ends the call and committed messages stay in the DM. The screen stays on during a call (`FLAG_KEEP_SCREEN_ON`), so a call does not end because the display timed out. A new call needs a new tap. No foreground service, notification or extra permission is added.

**Same module, separate peer.** The Android half of `LocalComputerVideo` gains `callStart`, `callMute`, `callInject` and `callStop` with the iOS signatures and events (`onCallState`, `onCallTap`). A call owns its own `PeerConnectionFactory` with a `JavaAudioDeviceModule`, so it never shares native resources with the Computer video peer. The offer must be one audio section and nothing else, and the answer waits for ICE gathering the same way as iOS (1.5 s settle after the first candidate, 8 s limit, no STUN or TURN).

**Echo cancellation.** The microphone records through the voice-communication source, with the platform echo canceller and noise suppressor where the phone has them, and the track requests WebRTC's communication processing (echo cancellation, noise suppression, gain control, high-pass), resolved to platform or software per component. The call takes transient audio focus, sets `MODE_IN_COMMUNICATION` and routes to a wired, USB or Bluetooth headset when one is connected, otherwise the loudspeaker. Everything is restored when the call ends.

**Test audio.** In `.dev` development builds the module replaces each recorded buffer with WAV files queued by `callInject` before WebRTC reads it, and records the downlink from the remote track to a WAV in the cache folder with `downlink-start` and `downlink-end` timestamps. The V2 scenario timeline (`deepseekbot-dev://call/<bot>?script=…`) drives both platforms unchanged. Release builds never pass the test flag.

**Microphone refusal.** The call screen distinguishes a refusal the system can ask again ("Allow microphone" asks in place) from a blocked permission ("Open Settings"), and starts the call when the app returns from Settings with the microphone allowed.

## Consequences

Android and iOS behave the same when the app leaves the foreground, and the Host needs no change. A Human who locks the phone mid-call has to call again; that is the cost of not adding a foreground service. Keeping calls alive in the background, on either platform, is a later decision that would add the service, its notification and lock-screen controls together. Echo on a real loudspeaker still has to be measured on physical phones, because the platform canceller differs between devices.
