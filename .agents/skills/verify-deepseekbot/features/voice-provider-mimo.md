# Speech catalogs and Xiaomi MiMo

## Sources

- `packages/client/src/client/voice-settings.tsx`
- `packages/client/src/client/features/voice/template-*.ts*`
- `packages/client/src/client/voice-catalog-picker.tsx`
- `packages/core/src/voice/catalog.ts`
- `packages/core/src/voice/presets.ts`
- `packages/core/src/voice/mimo.ts`
- `packages/core/src/voice/*template*.ts`
- `packages/core/src/features/voice/*.ts`
- `packages/core/src/voice/providers.ts`
- `packages/core/src/bots/cli-voice.ts`

## Terms

- Host
- Settings
- Voice Provider
- Speech Model
- TTS Voice
- Speech Catalog

## Sub-features

- The Xiaomi MiMo preset supplies the hosted base URL, `mimo-v2.5-tts` and built-in voices including 冰糖 and Mia. Adding it requires an API key.
- Provider health checks and synthesis send the text and voice to MiMo Chat Completions. The Host decodes the returned audio and uses it as the speech clip.
- A missing provider endpoint returns a status and an instruction to check the preset and base URL.
- Xiaomi MiMo appears in ASR settings and transcribes WAV or MP3 through the Host. The Test action reports whether the Provider could complete a transcription request.
- The service, model and voice fields open searchable pickers with Provider logos. Draft catalog lookup uses the typed API key before **Add and test**.
- Fish Audio supports workspace and public voices. ElevenLabs supports account voices, a public library and compatible models. Xiaomi MiMo lists compatible speech models.
- Selecting an ElevenLabs shared voice opens a confirmation to add it to the account. Cancel leaves the account alone. Confirm selects the returned account voice ID.

- The Host Owner can validate, add, inspect and replace a `custom` HTTP template in **Settings › Voice** (service **Custom request**, starting examples, inline field errors, **Edit request** in the Provider details) and through the CLI. Team members are not offered **Custom request** or **Edit request**. Existing `custom` Providers without templates retain OpenAI-compatible behavior. Templates describe JSON, multipart or structured SSML and bounded audio/text extraction; keys remain in credentials.

## How to get to it (user POV)

In Bot mode, open **Bot settings → Voice** and choose **Add** under speech synthesis. Choose **Xiaomi MiMo** as the service, select a built-in voice, enter a MiMo API key and choose **Add and test**.

## Driving it with verify-app

1. Launch a task-owned Host with `verify-app launch --name <name>` and run `doctor`.
2. Use `shot` to open **Bot settings → Voice → Add a voice service**. Select **Xiaomi MiMo** and verify that the model and built-in voices are offered.
3. Add the Provider and check the success status in the Provider list. Use `deepseekbot voice-providers` to read back the selected model, voice and `keySet: true`.
4. Use `deepseekbot voice-provider-test <id> --voice 冰糖` to verify that the health check returns nonempty MP3. Use `deepseekbot voice-synthesize --provider <id> --text '你好。' --out <absolute-path>` to verify that the resulting file is playable.
5. Under **Speech recognition (ASR)**, add Xiaomi MiMo, choose its model and confirm **Test**. Use `deepseekbot voice-transcribe --provider <asr-id> --file <absolute-wav>` to verify the transcript.
6. Open the ElevenLabs and Fish Audio TTS add forms. Enter a test API key and open the voice picker. Verify the account results, select the **Public voice library** filter, search, and load another page. A Fish Audio public result can be selected directly.
7. In the ElevenLabs picker, select a shared voice. Cancel once and verify that the account is unchanged. Reopen the confirmation, add the voice to the account and verify the selected ID matches the returned account ID. CLI parity uses `voice-catalog` and `voice-catalog-import`.

8. Web form: launch the Host with a task-owned fixture loaded through `NODE_OPTIONS=--import=<absolute-fixture.mjs>` that serves one TTS and one ASR endpoint. Choose **Custom request** under the TTS **Service** picker, fill **Request URL**, pick **Authentication** and **Result** by clicking their current value text (the select shares its accessible name with its field group), enter the API key and choose **Add and test**. The row shows **Works**; the fixture log proves the key arrived only in the configured header/query and never in the body. Repeat for ASR with a multipart body and **Transcript JSON path**. Open **Details → Edit request**, enter an `ftp://` URL and an `Authorization` extra header, and check the inline errors beside both fields; then restore the valid URL, remove the extra header, and save a wrong JSON path and check the row reads *The configured result path was not found.* Use `--keep-overlays` so Select menus stay open between steps.
9. With a task-owned HTTP fixture, save a secret-free template JSON file. Run `voice-template-validate --template-file <absolute-file>`, `voice-provider-add custom --template-file <absolute-file> --key-stdin`, `voice-provider-template <id>` and `voice-provider-test <id>`. Change the file and run `voice-provider-template-set <id> --template-file <absolute-file>`; read back the new URL/method. Check malformed paths produce validation errors and Team members cannot invoke template methods. Test ASR with a multipart template and `voice-transcribe`.

## Gotchas

- On a fresh Host without a model credential, close the **Get started** dialog before selecting **Bot mode**. This check needs no chat model.
- A hosted MiMo key is needed for the full live-provider check. With a task-owned MiMo-compatible fixture, seed the preset using `voice-provider-add xiaomi-mimo --base-url <fixture-url>/v1 --key-stdin`, then trigger **Test** on the Provider row. Record fixture-backed checks and real MiMo checks separately.
- Use a fixture or a designated test ElevenLabs account for the import step. The confirmation writes to that account as soon as it succeeds.
- The OpenAI-compatible preset calls `/audio/speech`. Select **Xiaomi MiMo** to use MiMo Chat Completions.

- Fixture checks do not establish real-upstream acceptance. Pass a real key through `--key-stdin` or the password field, never as a CLI argument.
