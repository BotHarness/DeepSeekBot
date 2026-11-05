# ADR-0283: Bot-deployed local speech service

- Status: Accepted (V6 tracer bullet of voice)
- Date: 2026-11-03
- Issue: #3404 (spec #3397, hub #3398)

## Context

ADR-0280 lets a Bot speak through any OpenAI-compatible TTS endpoint, but finding, installing and running one is left to the Human. The spec wants a Bot to set up a free, offline speech service on the Human's own Mac or Windows computer and register it, while the Host never hosts or keeps that service alive. Keys must never pass through a Bot. The Human prefers local-first.

## Decision

**One script, two models, CPU only.** The kit is a single Python script (`botharness_voice.py`, embedded in `packages/core/src/voice/local-kit.ts`) on sherpa-onnx 1.x with numpy: SenseVoice int8 for speech to text and Kokoro v1.1 (Chinese and English) for text to speech. It serves `/v1/audio/speech` (WAV) and `/v1/audio/transcriptions` on `127.0.0.1:8790`, refuses other interfaces unless `BOTHARNESS_VOICE_KEY` is set, and has `download`, `start`, `status`, `stop`, `serve` and `selftest` commands that each print one JSON line. sherpa-onnx wheels cover macOS (x64, arm64) and Windows (x64, arm64), so no Docker, GPU, compiler or account is needed. sherpa-onnx 2 is excluded because it drops the espeak fallback and Kokoro then skips unknown English words.

**The Bot follows a skill.** The runtime skill `setting-up-local-voice` (always registered, model- and user-invocable) gives the steps for both systems, the measured sizes and timings, and the start and stop commands to hand over. Each install step is an ordinary approved shell call. `deepseekbot voice-local-kit --dir <absolute folder>` writes the script offline, in any shell including a Bot's scoped one.

**Registration through the scoped CLI.** Tob's scoped CLI gains `voice-providers`, `voice-provider-test` (reads) and `voice-provider-add`, `voice-provider-remove`, `voice-set`, `voice-asr-set` (writes with the usual approval card; the two bindings are scoped to the Bot and refuse Tob itself). The scoped `voice-provider-add` accepts only keyless presets (`local`, `custom`, TTS or `--kind asr`) and has no key option; keyed providers stay in Settings. New `local` TTS and ASR presets point at the kit's default address with Kokoro and SenseVoice defaults, so one service gives a Bot both a voice and the hearing that calls (ADR-0281) need.

**Readable failure when it is off.** When a provider on a loopback address does not answer, `VoiceProviders` reports `provider-unavailable` with "The local speech service at … is not running" and how to start it. The same text reaches voice messages, `voice-provider-test` and transcriptions.

## Consequences

The Human owns the service's lifetime; after a reboot it is off until started, and every surface says so. The Host gains no process supervision, port, store or dependency. Speech recognition for Bot calls runs on the same service through the `local` ASR preset.
