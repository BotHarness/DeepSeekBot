# Voice and call decisions

How a Bot speaks and hears, and how a Human calls a Bot from a phone or a desktop window, with the camera or screen shared as pictures. How it works lives in [the architecture](../architecture/botharness-architecture.md); terms live in [`GLOSSARY.md`](../../GLOSSARY.md); Channels and the DM are in [Messaging decisions](messaging.md). Each section states the current decision, the reasons a reader cannot get from the code, and what enforces it. History is in Git: this file replaces ADR-0280, 0281, 0283, 0284, 0285, 0286, 0287, 0288, 0289, 0290, 0291, 0299, 0303, 0304, 0305, 0307, 0308, 0310, 0315 and 0317, and each section lists the ADRs it absorbed. The CLI verbs named below are `tobs` commands; older text calls the same binary `deepseekbot`.

Two rules run through every section:

- **A call leaves an ordinary conversation behind.** Speech becomes the Human's DM messages, replies are voice messages, pictures are attachments and call notices are Channel Notices. There is no second store, and committed messages survive any way a call ends. The Host never stores recordings; audio is zeroed after transcription.
- **One Host owner decides what a call is doing.** `createVoiceCalls` (`voice/calls.ts`) owns readiness, open, signal, heartbeat, mute, share, hangup and the event log, behind one route (`POST /api/voice/call`). Clients capture and play; the owner judges. Its limits live in `VOICE_CALL_LIMITS` (`voice/call-contract.ts`).

## 1. Speech Providers live on the Host, and their keys never leave it

<a id="adr-0280"></a>
_Formerly ADR-0280 (Providers) and ADR-0281 (ASR Providers)._

`VoiceProviders` (`voice/providers.ts`) is the one owner of speech services, in two kinds. A **TTS** provider comes from a preset (`custom`, `fish-audio`, `elevenlabs`, `openai`, `local`) that fixes its wire protocol, base URL and defaults. An **ASR** provider comes from `custom`, `openai`, `groq` or `local` over the OpenAI-compatible `/audio/transcriptions` API. Non-secret settings live in the `voice_providers` table, and the key lives only in the DSH credential store under `botharness-core`. No view, bridge response, CLI output or log carries the key, and provider error text is redacted of it. `synthesize` takes at most 4,000 characters and returns at most 10 MB of sniffed audio. `transcribe` takes a 16 kHz WAV and returns cleaned text of at most 4,000 characters. Both have a 30 s timeout, no redirects and coded errors (`provider-unauthorized`, `provider-rate-limited`, `provider-unavailable`, `provider-timeout`, `provider-rejected`, `provider-bad-response`). A PersonaBot has optional `voice` and `asr` bindings; removing a provider clears every binding that uses it.

Why: later slices added providers and streaming on the same interface, so the boundary had to stay small, and keys must stay where the other credentials are.

Enforced by: `voice-providers.test.ts`, `voice-defaults.test.ts`, `voice-soniox-close.test.ts`.

## 2. A Bot speaks by marking a message `voice: true`

<a id="adr-0280-voice"></a>
_Formerly ADR-0280 (voice messages)._

`bot_send_message` takes `voice: true`, declared before `body` so the model decides before writing. The text commits exactly as before; then the Host turns the Markdown into speakable text (code, tables, paths and URLs become short spoken notes), synthesizes it through the Bot's binding and stores the audio as an ordinary attachment on the same message, recording `voice: {state, attachment?, code?, error?}` (`pending`, then `ready` or `failed`). A `channel/voice` notification carries the change, the tool result tells the Bot about a failure, and the text is never withdrawn. Only local Channels get voice; other destinations send the text and report `unsupported-destination`. Clients show the audio as a voice bar above the text, outside the file list.

Why: audio then follows the attachment lifecycle (references, sweep, authorized download, phone relay), and synthesis delays only the send that asked for it.

Enforced by: `voice-messages.test.ts`, `voice-speech.test.ts`.

## 3. A Bot can set up a local speech service, and the Human owns its lifetime

<a id="adr-0283"></a>
_Formerly ADR-0283._

The kit is one Python script (`botharness_voice.py`, embedded in `voice/local-kit.ts`) on sherpa-onnx 1.x: SenseVoice for speech to text and Kokoro for text to speech, CPU only, on macOS and Windows. It serves `/v1/audio/speech` and `/v1/audio/transcriptions` on `127.0.0.1:8790` and refuses other interfaces unless `BOTHARNESS_VOICE_KEY` is set. The always-registered skill `setting-up-local-voice` guides the Bot; each install step is an ordinary approved shell call, and `tobs voice-local-kit --dir <absolute folder>` writes the script offline. Tob's scoped CLI can read providers and add only keyless ones (`local`, `custom`); keyed providers stay in Settings. When a loopback provider does not answer, every surface says the local service is not running and how to start it.

Why: the Human prefers local-first and free, but the Host must not host, supervise or keep a service alive, and keys must never pass through a Bot. sherpa-onnx 2 is excluded because it drops the espeak fallback and Kokoro then skips unknown English words.

Enforced by: `voice-local-service.test.ts`, `cli-voice.test.ts`.

## 4. One call per Host, cut into sentences on the Host, written into the DM

<a id="adr-0281"></a>
_Formerly ADR-0281._

One call runs per Host: the same device or window replaces its call, and another is refused with `call-active` (`readiness.callElsewhere` says so before dialing). A call ends on hangup, 20 s without connecting, loss (§6), media failure, or the Bot being paused or removed; ended calls stay readable for 60 s. The Host's built-in VAD (`voice/vad.ts`) runs over 16 kHz PCM: a frame is voiced when it is above an adaptive noise floor and its autocorrelation shows pitch between 70 and 400 Hz. A sentence starts after 160 ms of voiced audio, is kept only with at least 300 ms voiced, ends after 700 ms of silence and is cut at 30 s. Coughs, knocks and clicks are reported as `noise-discarded`, never sent. Each sentence is transcribed in order and sent to the Bot's DM as the Human's message with `voiceCall: {callId}`, and the editable `voice-call-hint` asks for short `voice: true` replies. While the Orchestrator is still on an earlier turn the call reports `busy`, and the speech is heard on the next turn. A call that connects writes `voiceCallRecord` notices (`started`, then `ended` with length, reason and sentences heard) through the Channel store; they are Channel Notices that never mirror to IM and never wake the Bot, and the first typed DM message after a call tells the Bot how to read it. Signaling runs on the paired LAN Noise channel and the Tailscale device gateway; Connect relays are refused with `connect-carrier-required` because they do not carry live audio. The Host's Electron media helper offers one Opus audio section with no STUN or TURN; Linux Hosts report `media-unsupported`. A `synthetic` media kind lets `tobs call-simulate` drive a call from WAV scripts.

Why: one seam keeps later work (streaming, barge-in, new clients) on the Host side, and makes the owner the test seam: tests feed PCM and fake providers and assert events. Coughs and short noise must not interrupt the Human, so the VAD needs pitch, not just energy.

Enforced by: `voice-calls-recognition-and-playback.test.ts`, `voice-calls-owner-lifecycle.test.ts`, `voice-calls-streamed-replies.test.ts`, `voice-calls-dm-records.test.ts`, `voice-vad.test.ts`, `voice-call-record.test.ts`, `voice-call-session.test.ts`, `cli-call.test.ts`.

## 5. The Human can cut in, and the Host never speaks on the Bot's behalf

<a id="adr-0317"></a>
_Formerly ADR-0281 (barge-in update) and ADR-0317._

A `voice: true` reply is spoken sentence by sentence while its draft streams (a speculative draft consumer); an abandoned or rewritten draft stops, and the committed message claims the clips that played as its voice attachment, synthesizing only the sentences still missing. Calls are full duplex. While the Bot speaks, uplink keeps flowing through the VAD. A barge-in is **suspected** after 200 ms of voiced speech (the media peer ducks the Bot to gain 0.3) and **confirmed** after 500 ms, or sooner when the transcript holds at least two words that are not fillers (嗯, 啊, 呃, 那个, um, uh …; counted with `Intl.Segmenter`). Confirmation stops playback, drops queued sentences and stops the reply with reason `interrupted`; the next sentence then ends only after 1.2 s of silence. Speech that ends as noise, or a fillers-only transcript, restores the volume and reaches no DM. An echo guard needs 14 dB more level for 200 ms plus 300 ms after each clip starts and 300 ms after it ends, but only before a sentence has started. An interrupted reply archives only what the Human heard; the text stays whole as the committed Channel fact. The Host synthesizes nothing on its own: every sound a call plays is a reply the Bot wrote with `voice: true`.

Why: a short automatic "嗯" after each sentence sounded like the Bot answering on its own, also when it was busy or the VAD let noise through. Thresholds were tuned on synthetic fixtures assuming the client's echo canceller keeps converged echo about 35 dB below speech, then checked on an iPhone on loudspeaker.

Enforced by: `voice-calls-barge-in.test.ts` (barge-in, filler dismissal, echo guard).

## 6. A call is alive while its heartbeat or its WebRTC connection is

<a id="adr-0315"></a>
_Formerly ADR-0315 and ADR-0281 (heartbeat)._

Clients send a heartbeat every second in the foreground and every 3 s in the background. When the newest heartbeat is older than 8 s, the Host asks the media helper how long ago the selected ICE pair received any packet, and ends the call as `connection-lost` only if that is also older than 8 s or the helper does not answer. If the owner's own 1 s tick fires more than a second late, the Host skips the verdict on that tick, because Node runs timers before it reads sockets that queued during a pause. The desktop transport retries a reset heartbeat once and never aborts it. The owner, not an individual encrypted socket, owns an established call: a phone can resume its control requests on another admitted channel, and closing the old socket is not a hangup. Revoking a device still ends its call.

Why: measured on Windows, a minimized page's JavaScript stalls for up to 12 s while WebRTC keeps sending on its own threads, so a heartbeat alone ended live calls. A closed window, crashed renderer, quit app and system sleep stop both signals, so they still end within seconds.

Enforced by: `voice-calls-owner-lifecycle.test.ts`, `call-gateway-deadline.test.ts`, `voice-call-client.test.ts`, `voice-call-stats.test.ts`.

## 7. Phone calls keep running in the background, with a lock-screen surface

<a id="adr-0285"></a><a id="adr-0305"></a><a id="adr-0284"></a>
_Formerly ADR-0285, ADR-0305 and ADR-0284 (its foreground-only rule is superseded; the call path, echo cancellation, test audio and microphone refusal stand)._

**iPhone.** The app declares the `audio` background mode and keeps one play-and-record session active from start to end, so the peer and the JavaScript heartbeat keep running when the phone locks. A `TobsCall` Live Activity shows the Bot, a timer, one status line and Mute and Hang Up, updated one change at a time. The Audio pull-down chooses microphone and output; with headphones and the iPhone microphone the call runs in "music" mode (mixing, A2DP, WebRTC's software echo canceller), otherwise Apple's voice processing. Another call, Siri or an app taking the audio pauses the call instead of ending it, and the module retries taking audio back every 3 s. Muting uses the voice-processing mute mode, so the Bot's voice keeps its level.

**Android.** A `microphone` plus `mediaPlayback` foreground service (`CallService`) holds the call with a partial wake lock and a Wi-Fi lock, and owns a Headless JS task, tied to a per-call token, so timers keep running. A `CallStyle` ongoing notification fed from the same `callNotice` state as the iPhone activity offers Hang up, Mute and Open. With "Display over other apps" allowed, the service draws a call bubble while no activity is started. The call retains its own Host connection independently of "Keep connected". Losing audio focus or a phone call pauses the call. If Android refuses the service, leaving the app ends the call with code `background`. The microphone records through the voice-communication source with WebRTC's communication processing, and the call screen separates a refusal that can be asked again from a blocked permission.

Why: the Human wants a call to survive a locked phone and another app, and to control it from outside the app. CallKit is not used because an app that uses it cannot be offered in the China mainland App Store; Android's `phoneCall` service type needs the app to be a dialer. A phone that really stops heartbeats still ends as `connection-lost`.

Enforced by: `apps/mobile/test/call-background.test.ts`, `call-background-task.test.ts`, `call-notice-android.test.ts`, `call-bubble.test.ts`, `call-media-native.test.ts`, `voice-call-carrier.test.ts`, and the Android module's `CallNoticeTest.kt` and `CallVoiceVolumeTest.kt`.

## 8. Desktop calls live in the window and keep running when it is hidden

<a id="adr-0310"></a>
_Formerly ADR-0281 (desktop clients), ADR-0310 and ADR-0315 (window reveal)._

The Mac, Windows and Web Client call through the same owner. Each window sends its own `client` id, captures the microphone with browser WebRTC (echo cancellation, noise suppression, gain control) and plays the downlink. The call bar sits in the chat header and the call lives in the window, so switching chats does not end it. Hidden windows rely on Chromium's exemptions for a page with a live peer and playing audio, plus §6. When a live call's window is hidden, the Client posts one silent notification, "On a call with `<Bot>`", that brings the window back to the Bot's DM. Because a page cannot un-minimize an Electron window, the click goes through `POST /api/botharness/desktop-window {action:"reveal"}` (`tobs desktop-window-reveal`), which relaunches the Desktop executable so the shell's single-instance handler restores it. Reloading hangs up with a `keepalive` request.

Why: BotHarness cannot change the DSH shell, so the call must work with its background throttling and without a Dock or tray API. Quitting ends a call as `host-stopped` rather than `hangup`, and a busy-quit dialog that stays open past 8 s loses the call; both need shell support and are tracked as follow-ups.

Enforced by: `packages/client/test/desktop-call.test.tsx`, `desktop-window-reveal.test.ts`, `scripts/e2e-desktop-call.mjs`.

## 9. Camera and screen sharing send keyframe grids, not video

<a id="adr-0286"></a><a id="adr-0289"></a><a id="adr-0290"></a><a id="adr-0291"></a><a id="adr-0299"></a><a id="adr-0303"></a><a id="adr-0308"></a>
_Formerly ADR-0286, ADR-0289, ADR-0290, ADR-0291, ADR-0299, ADR-0303 and ADR-0308._

A call stays one Opus audio section. A client turns sharing on with `{kind: 'visual', source: 'camera' | 'screen' | 'off'}` and sends each keyframe as a base64 JPEG `frame` command on the same route: at most 512 KB, in a request of at most 768 KB, at most 1280 px on the long edge, quality 0.8 then 0.6 and 0.45, skipped if still too large. One source is shared at a time. Desktop and Web capture with `getUserMedia` or `getDisplayMedia` (the browser's picker chooses the screen or window); the iPhone and Android use a native `CallCamera` module (AVCaptureSession, CameraX) that hands JS grey thumbnails and encodes a JPEG only for a keyframe. Previews mirror the front camera; the frames sent are not mirrored. A system-ended share returns the call to voice only and writes a `share-stopped` notice; a phone going to the background sends `paused`, and returning sends `resumed`, as `share-paused` and `share-resumed` notices. Sharing always saves frames; privacy relies on deleting the attachments. There is no phone screen sharing.

The Host keeps a 768 px copy of each keyframe and composes grids at most 1536 px on the long edge. One keyframe is sent alone; two to nine tile in ⌈n/3⌉ balanced rows of at most three, longer rows first, a shorter row centred (`layout` such as `3+2`), numbered row by row. Each row has a label strip above it with the cell number and its time, so no picture pixel is covered. The grid is an ordinary attachment on the Human's message, recorded in `voiceCall.visual` `{source, frames, layout, fromMs, toMs}`. When the Bot's model declares input modalities without images, the grid is still attached, marked `unseen: true`, and the turn tells the Bot to ask the Human to describe it.

Why: real-time video is heavy to carry and the model does not read video frame by frame, while separate images lose their order. Square grids left black cells and shrank tiles until small text was unreadable.

Enforced by: `call-grid.property.test.ts` (every count from one to nine, and validators accept only the matching layout), `call-visual-camera-and-screen.test.ts`, `call-visual-channel-messages.test.ts`, `call-visual-frame-harvest.test.ts`, `call-visual-grid-imaging.test.ts`, `call-visual-keyframes.test.ts`, `call-visual-typed-text.test.ts`, `call-grid-rows-migration.test.ts`, `call-visual-migration.test.ts`, `packages/client/test/desktop-call.test.tsx`, `apps/mobile/test/call-camera.test.ts`, `call-camera-android.test.ts`, `call-camera-share.test.ts`.

## 10. Keyframes are picked on the client by perceptual hash

<a id="adr-0307"></a>
_Formerly ADR-0307 and ADR-0286 (picker)._

`keyframes.ts` holds the one picker every client and `call-simulate` share. The caller samples at 2 fps and shrinks each sample to a grey thumbnail (64 px wide for the camera, 128 px for a screen). The score against the last keyframe is the Hamming distance of a 63-bit perceptual hash. On a screen, when the hash has not moved, an 8×8 block check sends a keyframe for a local change (typing, a highlight, a toast) once the picture holds still. The first sample after a switch is always sent.

| Source | Threshold | Stillness | Settle | Max wait | Detail (threshold / stillness) |
| ------ | --------- | --------- | ------ | -------- | ------------------------------ |
| camera | 0.12      | 0.04      | 0 ms   | 1.5 s    | none                           |
| screen | 0.10      | 0.04      | 400 ms | 2 s      | 0.015 / 0.004                  |

Why: no single pixel-difference threshold passed every case: a typed line changes 0.13% of a thumbnail while a slow pan changes 2–3%. A perceptual hash ignores pans, noise and exposure drift but flips 15–50% of its bits on a cut, scroll, page or window switch, and the block check catches the one-line edit the hash cannot see. The thresholds sit in the middle of the ranges that passed all six generated cases live.

Enforced by: `scripts/test/call-keyframe-eval.test.mjs`, `node scripts/call-keyframe-eval.mjs` (the six cases and the `--compare` sweep).

## 11. Every keyframe lands on the call's timeline, and the Bot can zoom into a tile

<a id="adr-0304"></a><a id="adr-0288"></a><a id="adr-0287"></a>
_Formerly ADR-0304, ADR-0288 (frame records; its "Don't save frames" switch and record list are removed) and ADR-0287._

`voice/harvest.ts` plans; the call owner composes and writes. Only the newest nine waiting keyframes ride with the next sentence; older ones are written oldest first as **frame records** of up to nine (Channel Notices with a grid attachment and a `voiceCallRecord` of state `frames`). While the Human is silent, nine waiting keyframes become a record at once; while they speak, the oldest nine are written only when eighteen wait. At a sentence end, older keyframes are written before the sentence is sent, so the DM is in time order. A dropped sentence (fillers, nothing heard, failed send) returns its keyframes to the front of the queue for the next sentence. A share that stops, switches or hangs up writes what waits instead of discarding it. At most 32 keyframes wait; past that the oldest are dropped and reported in a `frames-dropped` event. A sentence without a new keyframe points `sameAs` the last picture. Times count from call connect: `voiceCall.visual.fromMs/toMs` is the picture range and `voiceCall.speechFromMs/speechToMs` when the Human spoke. A record's message time is the end of its picture range, so `channel_read` with `call` and `from_ms/to_ms` finds it by what it shows. A message typed during the call goes through the same cut and carries `voiceCall.atMs`. The owner keeps the originals of the newest 64 tiles in memory, never on disk, and releases a call's originals when it ends. `call_frame` (`tobs call-frame <message-id> <cell>`) returns one original by cell number, or `released: true` when it is gone.

Why: picking frames by score and listing records on the next sentence lost frames for good when the Human walked and talked with the camera, and gave the Bot no time range to look things up by.

Enforced by: `call-harvest.property.test.ts` (any sequence of keyframes, speech, sentences, dropped sentences and stops writes, sends, keeps or counts every keyframe exactly once, in batches of at most nine, in arrival order, and a sentence ends with the newest nine), `call-harvest.test.ts`, `call-text.test.ts`, `channel-call-read.test.ts`, `channel-call-picture-window.test.ts`, `cli-call-timeline.test.ts`.
