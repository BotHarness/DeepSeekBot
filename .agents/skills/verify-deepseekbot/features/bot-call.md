# Bot calls: phones and the Mac or Windows desktop

A paired iPhone or Android phone, or the Mac or Windows desktop Client (`desktop.bot-call`), calls a Bot. The Host's media helper carries WebRTC audio, the Host call owner cuts sentences with its built-in VAD, transcribes them through the Bot's ASR Provider and sends them to the DM, and the Bot's committed voice replies play back in the call. See [ADR-0281](../../../../docs/adr/0281-host-owned-bot-calls.md), [ADR-0284](../../../../docs/adr/0284-android-bot-calls-are-foreground-only.md) (Android, foreground only) and the [CLI contract](../../../../docs/bot-cli.md#bot-calls-and-speech-recognition-asr-providers).

## Sub-features

- `readiness`: the chat header's call button asks the Host first and names a missing ASR or TTS Provider, media helper or unsupported Host. `deepseekbot call-readiness <bot>` returns the same `missing` list.
- `turns`: speech becomes the Human's DM message; coughs and knocks are `noise-discarded`. The Bot replies with `voice: true` and its audio plays in the call, then stays as a voice bar with text after hang-up.
- `long-task`: the Bot first says a short line such as "Let me check", dispatches an Assignment, and speaks the result when it returns.
- `text-only`: after "send me text", replies carry no voice.
- `busy`: while the Orchestrator is on an earlier turn, the phone shows "It's busy. It will hear you in its next turn." and nothing is spoken.
- `microphone`: a refused microphone offers Allow microphone; a blocked one offers Open Settings and the call starts when the app returns with it allowed.
- `lifecycle`: mute, hang up, background and lock on Android, 8 s network loss (`connection-lost`) and device revoke end or pause the call cleanly; committed messages remain. Connect routes are refused with `connect-carrier-required`.
- `background` (#3422, [ADR-0285](../../../../docs/adr/0285-bot-calls-keep-running-in-the-background.md)): locking the iPhone or switching apps keeps the call; the Host shows no `ended` event. The `TobsCall` Live Activity shows the Bot, the call timer, the status and Mute and Hang Up buttons on the Lock Screen and in the Dynamic Island; Hang Up there ends the call as `hangup`. A phone call or another app pausing the audio shows the paused hint and resumes after.
- `audio-route`: the call screen's Audio pull-down (`call-audio`) has a Microphone section (iPhone, the headset by name) and an Output section (iPhone, the connected headset by name, Speaker); the ticks follow the devices actually in use. Headphones default to their own microphone (HFP); picking the iPhone microphone is music mode (A2DP, other apps keep playing). Switching never drops the call; a headset connecting mid-call takes the audio; Speaker and iPhone work while headphones are connected. The phone remembers the microphone chosen for headphones.
- `desktop`: in a Bot DM the chat header shows a phone button (`Call <Bot>`). During a call it becomes the call bar `Call with <Bot>`: status, call time, `Mute`/`Unmute` and `Hang up`. The chat keeps scrolling under it and voice replies appear in the timeline as they come. The browser microphone runs with echo cancellation. A second desktop window or device gets "Another device or window is on a call with this computer." and the first call goes on.
- `records` (#3483): a call that connects leaves a call bubble with its start time in the DM, and one with its length when it ends (desktop timeline and mobile chat, and the Chats preview). The Bot reads both as `voiceCallRecord` system messages in `channel_read`; the first typed message after a call carries a `[Last voice call …]` line with the call's `from`/`to`. `call-simulate` leaves the same two notices.
- `media`: the Host helper offers one Opus audio section with no STUN/TURN, returns 16 kHz PCM frames and plays reply files.

## How to get to it (user POV)

On a Mac or Windows Host, add an ASR and a TTS Provider in Settings › Voice or with `deepseekbot voice-provider-add`, bind both to a Bot (`voice-set`, `voice-asr-set`), and open Local Computer once so the media helper is installed. Pair the rebuilt iOS or Android development app on the same Wi-Fi or Tailscale, open the Bot's DM and tap the phone button in the header.

## Driving it with verify-app

1. Host only, no phone: `deepseekbot call-simulate <bot> --file /abs/question.wav` (or `--script` with a cough between two sentences) against a Host with the latest DeepSeek model. Check `heard`, `replies`, `firstAudioMs` and that the cough appears only as `noise-discarded`.
2. Media helper without Electron: `node scripts/e2e-call-media.mjs` loads the helper's renderer in Chromium, connects a phone page and checks uplink PCM, downlink playback, failed playback and close.
3. Desktop without a Mac or Windows Host: `node scripts/e2e-desktop-call.mjs [--scenario question,long-task|/abs/timeline.json] [--json]` starts Chromium with `--use-file-for-fake-audio-capture`, runs the Client's real call store and browser media against the helper renderer and the real Host call owner, and checks the heard sentence, the discarded cough, the replies heard on the desktop and that a second window is refused. The timeline format is the same as `call-simulate --script`. On macOS, and with `--wav-mic`, the script feeds the WAV through a page-level `getUserMedia` stand-in, because Chromium's fake capture still triggers the system microphone check there. On a real Mac or Windows Host, open the Bot DM in the desktop app and press `Call <Bot>`.
4. iPhone: use a `.dev` development build. Open `deepseekbot-dev://call/<bot>?script=<url-of-timeline.json>` where the timeline is `[{"at": 0, "url": "https://…/question.wav"}]`; the build replaces the microphone with those files, records the downlink and writes a timing report path on the call screen (`call-test-report`). Use `chat-call-button`, `call-mute`, `call-hang-up`, `call-status`, `call-duration` and `call-hint`.
5. Android: the same `.dev` link works on the Windows/Android lane (`adb shell am start -a android.intent.action.VIEW -d "deepseekbot-dev://call/<bot>?script=<url>"`). The report path and the downlink WAV are in the app cache (`adb shell run-as ai.botharness.deepseekbot.dev ls cache`). Also check: deny the microphone once (Allow microphone asks again), deny twice (Open Settings, and the call starts on return once allowed), lock the phone mid-call (call ends as hang-up), and echo on the loudspeaker with a real voice on a physical phone.
6. Background (real iPhone only): with a `script` call running, lock the phone before the next injected sentence; the downlink report still shows `downlink-start` and the DM gets the reply. Check the Lock Screen Live Activity, press Hang Up there, and confirm the Host logs `call-ended` with `hangup`. With Bluetooth headphones, pick the iPhone microphone and confirm music-quality sound and that YouTube or Apple Music keeps playing under the Bot; pick the headset microphone and confirm call quality, then play YouTube and confirm the call shows paused and resumes. Pick Speaker and iPhone and confirm the sound moves there. Start a FaceTime or phone call to the iPhone during a Bot call and confirm the paused hint, then the resume.
7. Capture the call screen in light and dark, at default and largest text, connecting, listening, speaking, busy and ended. Record the first-sentence audio time from `firstAudioMs` or the report.

## Gotchas

- Calls never use Connect; a phone on cellular without Tailscale gets the "same Wi-Fi or Tailscale" explanation.
- V2 is half duplex: speech during the Bot's reply and for 300 ms after it is ignored.
- One call per Host; a second device gets `call-active`.
- Nothing is recorded on the Host. Only the `.dev` test build records the downlink, on the phone.
