# ADR-0305: Android Bot calls keep running in the background

- Status: Accepted (V9, V13)
- Date: 2026-11-09
- Issue: #3423 and #3469 (spec #3397, hub #3398; supersedes the foreground-only decision of ADR-0284)

## Context

ADR-0284 ended an Android call whenever the activity left the foreground, so locking the phone or switching apps hung up. The iPhone keeps a call running in the background with a Live Activity (V8, #3422). The spec's revision makes Android match: keep the call when the screen turns off or the Human opens another app, show it in the notification shade with hang up and mute, and, where the Human allows it, keep the in-app call bubble (V12, #3468) floating over other apps.

Android lets an app record and play in the background only from a foreground service of the right type, started while the app is visible. A `phoneCall` service needs the app to be the default dialer or a Telecom `ConnectionService`, which a Bot call is not.

## Decision

**A call retains its own Host connection.** After microphone permission is granted and before opening the call, the mobile connection lifetime owner retains that Host connection independently of the notification “Keep connected” preference. Ending or disposing the call releases its retention; the usual foreground and notification policy then applies. Other Hosts are unaffected. Removal or refusal of a connection takes precedence over a retained call and cannot be undone by a stale release.

**A `microphone` + `mediaPlayback` foreground service holds the call.** `CallService` in the `LocalComputerVideo` module starts when the call first shows its notification, which is while the Human is on the call screen. It holds a partial wake lock and a low-latency Wi-Fi lock for the call's lifetime and stops when the call ends. The `CallAttempt` peer, Host signaling and Providers are unchanged. While the service holds the call, leaving the app no longer closes the peer. If Android refuses the service (or stops it while the app is away), the old rule applies: leaving the app ends the call with code `background`. The screen no longer stays on during a call.

**The notification is Android's Live Activity.** It is a `Notification.CallStyle.forOngoingCall` notification (a plain ongoing notification before Android 12) with the Bot's name, the live status, a chronometer from the moment the call connected, Hang up and Mute/Unmute, and a tap that brings the app back to the call screen. It cannot be swiped away. JavaScript feeds it through the same `CallActivityNative` interface as the iPhone Live Activity, so the words and the state come from one place (`callNotice` in `call-activity.ts`), and its actions arrive as the same `hang-up` / `mute` actions, plus `open`. On Android 13 and later the app asks for notifications once the call is up; a refusal keeps the call running and adds a hint with **Open Settings** on the call screen.

**Interruptions pause, not end.** Losing audio focus to another app, or the audio mode moving to a phone call or its ringtone, mutes the uplink and pauses the Bot's playback without closing the peer. The notification, the bubble and the call screen show **Paused**. Both clear when focus comes back, the phone call ends, or the Human returns to the app and focus can be taken back. In media mode the call holds no audio focus, so only a phone call interrupts it.

**The bubble over other apps belongs to the service.** With "Display over other apps" (`SYSTEM_ALERT_WINDOW`) allowed, the service adds a `TYPE_APPLICATION_OVERLAY` window when no activity of the app is started: Bot initial, state ring, call time and muted badge, drawn from the same notification state in the app's resolved theme colours, draggable and snapped to the nearer side within the system bars. Tapping it brings the app forward to the same call (no new dial). It is removed when any activity starts, so it never shows together with the in-app React Native bubble, and when the call ends. A permission dialog only pauses the activity, so it does not bring up the bubble. The call screen explains the permission with **Turn on** (the system's overlay settings page) and **Not now**; without it, the notification is the only surface outside the app. The bubble is a plain Android `View`, not Compose, because the module has no Compose toolchain; it uses the Bot's initial instead of its avatar, whose image needs the Host's authenticated fetch.

## Consequences

Returning to the foreground preserves a connected Host while it has call retention. The usual resume recovery replaces possibly suspended carriers, which would also terminate their calls through Host gateway cleanup. The resume path therefore skips that replacement only for an already-connected retained Host; idle Hosts and unreachable/reconnecting Hosts keep their existing recovery behavior. Releasing retention restores ordinary resume recovery. Explicit refusal, unpairing and actual transport failures remain authoritative (#3815).

The service also owns a React Native Headless JS task, independent of the notification Keep connected service. React Native pauses ordinary JavaScript timers when the activity pauses without an active Headless task; a CPU wake lock alone does not keep the call's heartbeat running. Each call service lifetime carries a unique token. JavaScript holds that task only while the token is current; service failure or destruction clears it and finishes the native task. A late task cannot keep a stopped or replacement call alive. The Host heartbeat deadline is unchanged. This change requires a rebuilt Android client.

- Android and iPhone now behave the same when the app leaves the foreground. Camera keyframes still pause in the background and resume on return (ADR-0299), and those records become observable on Android.
- Store builds need Play's foreground-service declarations for `microphone` and `mediaPlayback`, and the "Display over other apps" use is limited to the call bubble.
- Swiping the app away from Recents stops the service with the task, and the Host ends the call on its missed heartbeat.
- Audio and lock-screen behaviour (Doze, Bluetooth A2DP in media mode, interruption by a real phone call) differs between phone makers and must be accepted on physical phones.
