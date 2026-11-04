# ADR-0285: Bot calls keep running in the background, with a Live Activity and a call or media audio choice

- Status: Accepted (iOS)
- Date: 2026-11-03
- Issue: #3422 (hub #3398; Android #3423 and desktop #3424 follow this record)

## Context

ADR-0281 made iPhone calls foreground only: leaving the app, including locking the screen, closed the peer, and the Host treated that as a hang-up. During a call the screen was kept awake. The Human wants a call to keep going with the phone locked or another app open, to see the call from the Lock Screen and notification area, and to choose whether the call plays as call audio or as media audio. The Human chose a Live Activity over CallKit (2026-11-03): an app that uses CallKit cannot be offered in the China mainland App Store, and the background audio mode alone keeps the call alive.

## Decision

**Background.** The app declares the `audio` background mode (`modules/local-computer-video/app.plugin.js`). The call's play-and-record session is activated once when the call starts and stays active until it ends, so iOS keeps the app, its WebRTC peer and its JavaScript (the call client's heartbeat to the Host) running with the screen locked or the app in the background. The module no longer ends the call when the app leaves the foreground, and it no longer keeps the screen awake. The Host contract does not change: `call-client.ts` and `calls.ts` are untouched, and a phone that really stops sending heartbeats still ends as `connection-lost` after 8 s.

**Status.** While a call is connecting or live, the phone shows a `TobsCall` Live Activity (expo-widgets): the Bot's name, a running call timer, one status line (connecting, listening, hearing you, sending, speaking, muted, paused by another call, reconnecting), and Mute and Hang Up buttons. The buttons are `LiveActivityIntent`s that run in the app's process and reach the call screen, which calls the same call client the on-screen buttons call. Tapping the activity opens the app on the call. The activity is updated only when what it shows changes and ends immediately with the call; a new call first ends any activity left behind. A phone without Live Activities, or with them turned off, runs the call without one.

**Audio.** The call screen has an Audio pull-down laid out like a meeting app's, with two sections; each ticks the device actually in use, read from the audio session:

- **Microphone:** the iPhone, and the headset's microphone while a headset with one is connected (by name).
- **Output:** the iPhone receiver, the connected headphones, Bluetooth or car audio (by name, only while connected), and the speaker.

| Microphone + output           | Mode                                                          | Bluetooth | Other apps' audio |
| ----------------------------- | ------------------------------------------------------------- | --------- | ----------------- |
| headset + headset (default)   | voice chat, Apple voice processing                            | HFP       | paused            |
| iPhone + headphones ("music") | default mode, mix with others, WebRTC software echo canceller | A2DP      | keeps playing     |
| iPhone + receiver or speaker  | voice chat, Apple voice processing                            | —         | paused            |

Music mode exists so a person can keep music playing during a call with headphones: Apple's voice-processing unit keeps output off A2DP and interrupts other audio, so in that one combination the WebRTC AudioEngine module turns it off at runtime and the microphone track switches to WebRTC's software echo canceller and noise suppressor. On the speaker or receiver the call always uses Apple's voice processing, which cancels echo best. Choosing the headset microphone moves the output to the headset; choosing the receiver or speaker moves the microphone to the iPhone. The speaker is an output override, so a connected headset stays listed.

Defaults follow best practice: connected headphones take the call with their own microphone, as FaceTime does; otherwise the speaker and the iPhone microphone. A headset that connects mid-call takes the call, and losing it returns the call to the speaker. Output picks last for the current call. The microphone chosen while on headphones is remembered, so a person who picks the iPhone microphone gets music mode on their next call; an older saved Media Audio choice becomes that preference. The menu explains the two microphones on headphones ("Music keeps playing, better sound" and "Call quality, best for noisy places"). A switch reconfigures the active session without reactivating it, so WebRTC's activation count stays balanced and the session is released once at hang-up.

**Interruptions.** A phone call, Siri or another app taking the audio pauses the call instead of ending it. WebRTC stops and restarts its audio unit around the interruption; the module reports it and the output changes (`onCallAudio`). The call screen shows "Paused by another call or app" and the Live Activity says the call is paused. The Host keeps the call open while heartbeats continue.

## Consequences

A locked phone can carry a whole call, and a call shows on the Lock Screen and in the Dynamic Island. iOS shows its own microphone indicator while the app records in the background. No new Host contract is added, so no CLI command is added; the route and the Live Activity are phone-local presentation. If iOS suspends the app during a long interruption (for example a long phone call answered while the app is in the background), heartbeats stop and the Host ends the call as `connection-lost`; committed messages stay in the chat. Music mode trades Apple's echo cancellation for A2DP and mixing; with headphones there is little speaker sound to echo, and WebRTC's software canceller covers the rest. Android (#3423) keeps its own audio choices and the same "pause, don't end" rule with a foreground-service call notification; desktop (#3424) has no audio choice and keeps the call alive while minimized.
