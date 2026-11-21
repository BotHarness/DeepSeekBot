# Xiaomi MiMo speech synthesis

## Sources

- `packages/client/src/client/voice-settings.tsx`
- `packages/core/src/voice/presets.ts`
- `packages/core/src/voice/mimo.ts`
- `packages/core/src/voice/providers.ts`
- `packages/core/src/bots/cli-voice.ts`

## Terms

- Host
- Settings

## Sub-features

- The Xiaomi MiMo preset supplies the hosted base URL, `mimo-v2.5-tts` and built-in voices including 冰糖 and Mia. Adding it requires an API key.
- Provider health checks and synthesis send the text and voice to MiMo Chat Completions. The Host decodes the returned audio and uses it as the speech clip.
- A missing provider endpoint returns a status and an instruction to check the preset and base URL.

## How to get to it (user POV)

In Bot mode, open **Bot settings → Voice** and choose **Add** under speech synthesis. Choose **Xiaomi MiMo** as the service, select a built-in voice, enter a MiMo API key and choose **Add and test**.

## Driving it with verify-app

1. Launch a task-owned Host with `verify-app launch --name <name>` and run `doctor`.
2. Use `shot` to open **Bot settings → Voice → Add a voice service**. Select **Xiaomi MiMo** and verify that the model and built-in voices are offered.
3. Add the Provider and check the success status in the Provider list. Use `deepseekbot voice-providers` to read back the selected model, voice and `keySet: true`.
4. Use `deepseekbot voice-provider-test <id> --voice 冰糖` to verify that the health check returns nonempty MP3. Use `deepseekbot voice-synthesize --provider <id> --text '你好。' --out <absolute-path>` to verify that the resulting file is playable.

## Gotchas

- On a fresh Host without a model credential, close the **Get started** dialog before selecting **Bot mode**. This check needs no chat model.
- A hosted MiMo key is needed for the full live-provider check. With a task-owned MiMo-compatible fixture, seed the preset using `voice-provider-add xiaomi-mimo --base-url <fixture-url>/v1 --key-stdin`, then trigger **Test** on the Provider row. Record fixture-backed checks and real MiMo checks separately.
- The OpenAI-compatible preset calls `/audio/speech`. Select **Xiaomi MiMo** to use MiMo Chat Completions.
