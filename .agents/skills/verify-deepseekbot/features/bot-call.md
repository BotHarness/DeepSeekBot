# Bot calls: Mac or Windows Host to iPhone

A paired iPhone calls a Bot. The Host's media helper carries WebRTC audio, the Host call owner cuts sentences with its built-in VAD, transcribes them through the Bot's ASR Provider and sends them to the DM, and the Bot's committed voice replies play back in the call. See [ADR-0281](../../../../docs/adr/0281-host-owned-bot-calls.md) and the [CLI contract](../../../../docs/bot-cli.md#bot-calls-and-speech-recognition-asr-providers).

## Sub-features

- `readiness`: the chat header's call button asks the Host first and names a missing ASR or TTS Provider, media helper or unsupported Host. `deepseekbot call-readiness <bot>` returns the same `missing` list.
- `turns`: speech becomes the Human's DM message; coughs and knocks are `noise-discarded`. The Bot replies with `voice: true` and its audio plays in the call, then stays as a voice bar with text after hang-up.
- `long-task`: the Bot first says a short line such as "Let me check", dispatches an Assignment, and speaks the result when it returns.
- `text-only`: after "send me text", replies carry no voice.
- `busy`: while the Orchestrator is on an earlier turn, the phone shows "It's busy. It will hear you in its next turn." and nothing is spoken.
- `lifecycle`: mute, hang up, 8 s network loss (`connection-lost`) and device revoke end or pause the call cleanly; committed messages remain. Connect routes are refused with `connect-carrier-required`.
- `background` (#3422, [ADR-0283](../../../../docs/adr/0283-bot-calls-keep-running-in-the-background.md)): locking the iPhone or switching apps keeps the call; the Host shows no `ended` event. The `TobsCall` Live Activity shows the Bot, the call timer, the status and Mute and Hang Up buttons on the Lock Screen and in the Dynamic Island; Hang Up there ends the call as `hangup`. A phone call or another app pausing the audio shows the paused hint and resumes after.
- `audio-route`: the call screen's Audio pull-down (`call-audio`) switches Speaker, iPhone (receiver) and Media Audio without dropping the call, and the phone remembers the choice.
- `media`: the Host helper offers one Opus audio section with no STUN/TURN, returns 16 kHz PCM frames and plays reply files.

## How to get to it (user POV)

On a Mac or Windows Host, add an ASR and a TTS Provider in Settings › Voice or with `deepseekbot voice-provider-add`, bind both to a Bot (`voice-set`, `voice-asr-set`), and open Local Computer once so the media helper is installed. Pair the rebuilt iOS development app on the same Wi-Fi or Tailscale, open the Bot's DM and tap the phone button in the header.

## Driving it with verify-app

1. Host only, no phone: `deepseekbot call-simulate <bot> --file /abs/question.wav` (or `--script` with a cough between two sentences) against a Host with the latest DeepSeek model. Check `heard`, `replies`, `firstAudioMs` and that the cough appears only as `noise-discarded`.
2. Media helper without Electron: `node scripts/e2e-call-media.mjs` loads the helper's renderer in Chromium, connects a phone page and checks uplink PCM, downlink playback, failed playback and close.
3. iPhone: use a `.dev` development build. Open `deepseekbot-dev://call/<bot>?script=<url-of-timeline.json>` where the timeline is `[{"at": 0, "url": "https://…/question.wav"}]`; the build replaces the microphone with those files, records the downlink and writes a timing report path on the call screen (`call-test-report`). Use `chat-call-button`, `call-mute`, `call-hang-up`, `call-status`, `call-duration` and `call-hint`.
4. Background (real iPhone only): with a `script` call running, lock the phone before the next injected sentence; the downlink report still shows `downlink-start` and the DM gets the reply. Check the Lock Screen Live Activity, press Hang Up there, and confirm the Host logs `call-ended` with `hangup`. Switch Audio to Media Audio and confirm the volume buttons move the media volume and Bluetooth headphones play over A2DP. Start a FaceTime or phone call to the iPhone during a Bot call and confirm the paused hint, then the resume.
5. Capture the call screen in light and dark, at default and largest text, connecting, listening, speaking, busy and ended. Record the first-sentence audio time from `firstAudioMs` or the report.

## Gotchas

- Calls never use Connect; a phone on cellular without Tailscale gets the "same Wi-Fi or Tailscale" explanation.
- V2 is half duplex: speech during the Bot's reply and for 300 ms after it is ignored.
- One call per Host; a second device gets `call-active`.
- Nothing is recorded on the Host. Only the `.dev` test build records the downlink, on the phone.
