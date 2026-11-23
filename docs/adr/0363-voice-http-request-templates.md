---
Status: Accepted
Date: 2026-11-23
---

# ADR-0363: HTTP speech requests use declarative templates

## Context

Voice services vary in endpoint, authentication, request body and result encoding. Treating every service as OpenAI-compatible failed for MiMo (#4729). Adding a vendor branch for every synchronous HTTP variation would repeat transport and safety code. #5012 needs custom requests while retaining the existing Owner boundary and credential store.

## Decision

`VoiceProviders` owns execution and persistence. OpenAI-compatible, Fish Audio, ElevenLabs and MiMo HTTP synthesis, and OpenAI-compatible and MiMo HTTP transcription, use the same template request builder and result extraction. Presets supply built-in templates. `custom` accepts a versioned template in its existing non-secret provider record. Existing `custom` records without a template retain OpenAI-compatible behavior.

A template declares an HTTP(S) URL, POST or GET, authentication placement, fixed non-secret headers, body structure and result extraction. JSON values are expanded as objects before JSON serialization; multipart uses FormData and audio Blobs; SSML uses an element tree whose attributes and text are escaped during serialization. There is no executable expression language, interpolation of serialized JSON, arbitrary XML fragment or JavaScript. URL placeholders are encoded and cannot change its authority. Missing standalone optional values are omitted from objects and multipart fields.

Authentication describes bearer, a named header with a prefix, a named query parameter, or none. The secret is supplied separately from the credential store at execution. Templates reject credential fields and literal authentication headers. A provider's known key cannot be copied into its template. Arbitrary literal metadata cannot be classified as secret automatically: the Owner must keep all keys out of body, URL and header constants.

TTS accepts a bounded audio body, a dot-separated JSON path containing base64 or hex, or a JSON path containing one HTTP(S) audio URL. The download has no credential headers, shares the original deadline/cancellation signal, refuses redirects and is bounded to 10 MB. A dedicated connection dispatcher rejects loopback, link-local and private addresses, including DNS results at connection time; the Owner-configured request endpoint retains its existing rules. ASR accepts a JSON path containing text and retains its 256 KB response and 4,000 character transcript limits. Upstream failure bodies and JSON parse errors are never echoed. Template validation returns field paths and readable errors without issuing a request. Templates are limited to 64 KB of UTF-8 after normalization and 16 nesting levels. Audio references have a cumulative 16 MB rendering budget, checked before encoding or copying.

Only the Host Owner can create, read or change templates through the existing guarded Bridge. The CLI uses that same authority. Provider lists retain their existing member access and expose only a template-presence flag, never template contents. Owners must keep keys out of templates: validation rejects known authentication headers and the configured key, but cannot classify arbitrary literals as secrets. The Web settings form calls the same Owner-only methods: it hides **Custom request** and **Edit request** for members, keeps the key in the existing password field, and validates through `voiceTemplateValidate` before saving.

## Boundary with vendor code

Realtime/WebSocket frames and session lifecycles, signed authentication, asynchronous jobs, catalog discovery and account-side voice imports remain vendor adapters. The template engine performs one request and at most one audio download, without polling, retries, scripts or vendor-specific response logic. MiMo's WAV/MP3 admission and encoded-upload cap remain preset policy before execution. Soniox streaming remains unchanged.

## Consequences

Adding a synchronous provider normally needs only a template and a fixture checked against its official documentation. A new protocol or lifecycle still needs a vendor adapter and its own review. No schema migration is needed; reverting restores the legacy built-ins, while custom-template records require removing or reconfiguring those providers before a rollback because older Hosts ignore the new field.

## Verification sources

Request formats were checked on 2026-11-23. Fixtures establish request and response shape, not account access or live synthesis quality.

| Fixture               | Official source                                                                                                                                                                                                                   | Checked fields                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| OpenAI speech and ASR | [Speech](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create), [transcription](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create) | `/audio/speech` JSON and raw audio; `/audio/transcriptions` multipart and text                                 |
| Fish Audio            | [TTS](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech)                                                                                                                                                   | `/v1/tts`, bearer, model header, text, reference ID and audio                                                  |
| ElevenLabs            | [Official OpenAPI](https://api.elevenlabs.io/openapi.json)                                                                                                                                                                        | `/v1/text-to-speech/{voice_id}`, `xi-api-key`, `model_id`, output format; documentation page returned HTTP 403 |
| Xiaomi MiMo           | [TTS](https://mimo.mi.com/docs/en-US/api/audio/tts-post), [ASR](https://mimo.mi.com/docs/en-US/api/audio/Speech-Recognition)                                                                                                      | Chat messages and audio data; preserves #5010 ASR fixture contract                                             |
| Google Cloud          | [Synthesize](https://cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize), [API keys](https://cloud.google.com/docs/authentication/api-keys-use)                                                               | input, voice, audio configuration, `audioContent`, query key                                                   |
| MiniMax               | [HTTP T2A](https://platform.minimax.io/docs/api-reference/speech-t2a-http)                                                                                                                                                        | voice/audio settings, `output_format: hex`, `data.audio`                                                       |
| Azure Speech          | [REST TTS](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech)                                                                                                                                | SSML, subscription key header, output format header                                                            |
| DashScope             | [Qwen TTS](https://www.alibabacloud.com/help/en/model-studio/qwen-tts-api)                                                                                                                                                        | multimodal generation URL, input text/voice, `output.audio.url`                                                |
