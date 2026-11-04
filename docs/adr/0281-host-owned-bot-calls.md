# ADR-0281: Host-owned Bot calls with built-in VAD and ASR Providers

- Status: Accepted (minimal call path)
- Date: 2026-11-03
- Issue: #3400 (spec #3397, hub #3398)

## Context

The voice spec lets a Human call a Bot from the phone: speech becomes the Human's DM messages and the Bot's voice replies play in the call. ADR-0280 added TTS Providers and voice messages. A call needs speech recognition, a way to cut speech into sentences, a media path from the phone to the Host, and one place that decides what a call is doing. Later slices change the Host side (streaming, barge-in) and the clients (Android, desktop), so the call state must sit behind one small seam. The Human decided that recordings are never stored and that coughs and short noise must not interrupt the Human.

## Decision

**ASR Providers.** `VoiceProviders` gains a second kind, `asr`, with presets `custom`, `openai` and `groq` over the OpenAI-compatible `/audio/transcriptions` API. ASR providers share the table, credential handling, health check and coded errors of TTS providers; ids are `asr-<hex>`. A PersonaBot gains an optional `asr: {providerId, language?}` binding. `transcribe()` takes a 16 kHz WAV and returns cleaned text capped at 4,000 characters.

**Host call owner.** `createVoiceCalls` (`packages/core/src/voice/calls.ts`) owns every call: readiness, open, signal, heartbeat, mute, hangup and the event log. It is the main test seam: tests feed PCM and fake ASR/TTS and assert events. One call runs per Host; the same device replaces its call, another device is refused with `call-active`. A call ends on hangup, 8 s without a heartbeat, 20 s without connecting, media failure, or the Bot being paused or removed. Ended calls stay readable for 60 s.

**Built-in VAD.** `createVad` (`vad.ts`) runs on the Host over 16 kHz PCM. A frame is active above an adaptive noise floor and voiced when its autocorrelation shows pitch between 70 and 400 Hz. A sentence needs 160 ms of voiced audio and 300 ms in total, ends after 700 ms of silence, and is cut at 30 s. Coughs, knocks and clicks have energy without sustained pitch and are reported as `noise-discarded`, never sent.

**Turns.** Each sentence is transcribed in order and sent to the Bot's DM as the Human's message with `voiceCall: {callId}`. The DM prompt then adds the `voice-call-hint` part: answer with `voice: true`, keep it short, stop voice when asked for text, and say a short line before slow work. When a voice reply becomes ready, the owner plays it in the call; V2 is half duplex, so uplink is ignored while the Bot speaks and for 300 ms after. When the Bot's Orchestrator is still on an earlier turn, the call reports `busy` and the phone shows a hint; speech is still sent and heard on the next turn. The WAV and PCM of each sentence are zeroed after transcription; nothing is written to disk.

**Media.** The Host's Electron media helper offers one sendrecv Opus audio section with no STUN or TURN, returns 100 ms frames of 16 kHz PCM, and plays reply audio into the call. iOS answers with the native WebRTC module, voice-chat audio session and echo cancellation. Signaling uses `POST /api/voice/call` on the paired LAN Noise channel and the Tailscale device gateway; Connect is refused with `connect-carrier-required` because relays do not carry live audio. Revoking a device ends its call. A `synthetic` media kind lets `deepseekbot call-simulate` inject PCM without a phone.

**Clients.** The iOS chat header shows a call button when the native module is present. It asks the Host for readiness first and explains a missing ASR or TTS Provider or media helper. The call screen shows the state, call time, mute, hang up and the busy hint. Test builds of the `.dev` app replace the microphone with injected WAV files on a script timeline and record the downlink with event timestamps.

**Desktop clients (#3403).** The Mac and Windows desktop Client, and any Web window, call through the same owner over `POST /api/voice/call` as the Host owner. Each window sends its own `client` id, so a second window is refused with `call-active` like a second device, and `readiness.callElsewhere` says so before dialing. The window captures the microphone with browser WebRTC (echo cancellation, noise suppression and gain control on), answers the helper's offer and plays the downlink. The call button and the call bar (status, call time, mute, hang up, busy hint) sit in the chat header, so the conversation stays readable and voice replies appear in it during the call. The call lives in the window, not in one chat view, so switching chats does not end it. `scripts/e2e-desktop-call.mjs` drives it in Chromium with fake audio capture files and the same timeline format as `call-simulate --script`.

## Update (2026-11-03, #3401): speaking while the reply streams

After the VAD ends a sentence, the owner plays a short acknowledgement ("嗯", or "Mm-hm" for non-Chinese ASR) synthesized once per call with the Bot's voice; it never involves the model. Bot replies are spoken sentence by sentence through `speakableSentences` and one playback queue: from a `voice: true` draft as it streams (the speculative consumer in the ADR-0054 update), or after the commit when `voice` came after `body`. `speak()` is called by voice-message attachment at commit; it reuses matching draft clips, speaks the rest and returns the joined clips (`joinAudio`: MP3 and Ogg chain, WAV of one format merges) as the attachment, so the archive matches the call. Abandoned or rewritten drafts emit `reply-stopped`; events `ack`, `reply-text`, per-sentence `playing`/`played`, `committed` and `reply-done` give the timings `call-simulate` reports.

## Update (2026-11-04, #3483): calls leave records in the DM

A call that connects writes two system messages into the Bot DM through the Channel store: `voiceCallRecord` with `state: "started"` (call id, Bot, connect time) when media connects, and `state: "ended"` (start and end times, length, end reason, sentences heard, the start notice's id) when it ends. The end notice waits for sentences already being sent, so the DM reads start, the call's messages, then end. A call that never connects writes nothing; a failed write is logged as `call-record-failed` and never ends the call. Notices are system-authored, validated by `isChannelVoiceCallRecord`, never mirrored to IM and never wake the Bot. Their body is searchable English for the model; clients render them as call bubbles in the Human's language. On the first typed Human DM message after a call, the turn prompt names that call and how to read it with `channel_read` `from`/`to`, so the Bot knows it just talked with the Human and can find what was said.

## Consequences

Calls reuse DM messages, voice messages and attachments, so a call leaves an ordinary conversation behind and committed messages survive a dropped call. The Host needs the media helper on Mac or Windows; Linux Hosts report `media-unsupported`. The call supervisor copies the video supervisor's process ownership; merging the two is a later refactor. Streaming ASR/TTS, barge-in, Android and desktop clients build on the same owner and contract.
