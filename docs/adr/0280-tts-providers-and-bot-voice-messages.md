# ADR-0280: TTS Providers and Bot voice messages

- Status: Accepted (first tracer bullet of voice messages)
- Date: 2026-11-03
- Issue: #3399 (spec #3397, hub #3398)

## Context

Bots answer in text only. The voice-message spec asks a Bot to optionally speak a reply on desktop and iOS, through a speech service the Human chooses: a hosted one (Fish Audio, ElevenLabs, OpenAI) or any OpenAI-compatible endpoint such as a local Kokoro. Later slices (#3400 and #3404) add more providers, streaming and Human voice input on the same interface, so the provider boundary has to be small and keep keys inside the Host. The Human decided that the Host never stores Human recordings.

## Decision

**TTS Provider owner.** `VoiceProviders` (`packages/core/src/voice/providers.ts`) is the one owner of speech services. A provider is created from a preset (`custom`, `fish-audio`, `elevenlabs`, `openai`) that fixes its wire protocol (`openai`, `fish`, `elevenlabs`), base URL and defaults. Its non-secret settings live in the operational `voice_providers` table; its key lives only in the DSH credential store under `botharness-core`. No view, bridge response, CLI output or log carries the key, and provider error text is redacted of it. `synthesize({providerId, voiceId, text})` returns audio bytes and a sniffed MIME type, with a 30 s timeout, a 10 MB cap, no redirects and coded errors (`provider-unauthorized`, `provider-rate-limited`, `provider-unavailable`, `provider-timeout`, `provider-rejected`, `provider-bad-response`). `test()` is the health check. New providers and streaming extend the wire switch; callers do not change.

**Bot binding.** A PersonaBot record gains an optional `voice: {providerId, voiceId?}`. Removing a provider clears every binding that uses it.

**Voice messages.** `bot_send_message` takes `voice: true`, declared before `body` so the model decides before writing. The text commits exactly as before. Then, inside the same tool call, the Host turns the Markdown into speakable text (code blocks, tables, paths and URLs become short spoken notes), synthesizes it through the Bot's binding and stores the audio as an ordinary channel attachment on the same message, with `voice: {state, attachment?, code?, error?}` recorded on the message (`pending`, then `ready` or `failed`). A `channel/voice` live notification carries the change to clients. The tool result returns the outcome so the Bot learns about a failure; the text is never withdrawn. Only local Channels get voice; other destinations send the text and report `unsupported-destination`.

**Clients.** Desktop and iOS show the voice attachment as a voice bar above the text and leave it out of the file list; a pending voice says so, a failed one shows the readable error. iOS plays it with `expo-audio` from the app cache.

## Consequences

Audio follows the existing attachment lifecycle (references, sweep, authorized download, phone relay) instead of a second store. Synthesis adds the provider's latency to the tool call that asked for voice and nothing to other sends. Keys never leave the Host. `expo-audio` is a native module, so iOS needs a new development build. Streaming playback, more providers and Human voice input are left to #3400 and #3404 on the same `VoiceProviders` interface.
