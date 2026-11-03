# Lark parent-voice tracer — #1023 audio slice

## Scope

The audio slice of [#1023](https://github.com/BotHarness/DeepSeekBot/issues/1023), after the video slice ([#1950](https://github.com/BotHarness/DeepSeekBot/pull/1950)). A native text request that mentions the receiving App and replies to a native Lark `audio` message carries that parent's exact voice descriptor. Direct native audio messages (without a quoting request) and speech recognition remain outside this slice.

Provider: [dsh-im#35](https://github.com/DoodleBears/dsh-im/pull/35), source `bb0c7956896f5f5845950a0707837cd7938a11b3`, 425 runtime files with SHA-256 `b1df502e022b25e474a691b8c99517f7f6a7222b308c7f3fe2aff23232540751`.

## Implemented path

Provider `sourceVoiceAudio` opt-in → one `audio/unknown` attachment `voice.opus` bound to the parent message and `voice: { transcript: 'unavailable', itemId, durationMs? }` → Core accepts it only as the exact quoted parent (`isLarkVoice`) and with `source-voice-audio-checked` → Channel projection exposes an `audio` item and the platform duration → explicit **Prepare playback** → existing `prepareAudio` owner reads the original under current source authority and decodes Ogg Opus to 24 kHz mono WAV in a bounded worker (`opus-decoder`, 1 MiB input, 12 MiB PCM, 10 s) → browser playback. The original stays downloadable; other containers are refused with `audio-codec-unsupported`.

## Native qualification — 2026-11-03 JST

Isolated Host on DSH `0.2.1-rc.3`, model DeepSeek V4.1 Flash, app `BotHarness Lark QA1`, group "BotHarness QA1 Test" (test account and Bot only). A 4.9 s synthetic Opus voice was sent as a native `audio` message through the Bot API; a real Human reply in the Lark web client quoted it and mentioned the Bot through the native @ picker.

- Intake: the Channel message carried one `audio` item `voice.opus` and `voice: { transcript: 'unavailable', durationMs: 4916 }`. No attachment file existed on the Host before preparation, and the Web Client sent no attachment request before **Prepare playback**.
- Playback: after preparation Chromium played the WAV (`duration` 4.907 s, time advanced 1.3 s in 1.5 s, seek to 3.5 s, no media error) in light and dark.
- CLI: `channel-media-download` returned the original byte-identical to the sent file (`156874cb…`, 43,237 bytes); with `--representation playback` it returned `audio/wav` (235,580 bytes).
- The Bot replied once in Lark and said no transcript was available.

The run found one defect, now fixed: the Client parser accepted bridged voice only from QQ, so the Lark bubble showed text without the audio card.

Not exercised: a voice recorded by a Human in a Lark client (the browser tool cannot record audio), the installed product and the mobile app.
