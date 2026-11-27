# Voice services on the phone

An Owner's phone manages the Host's TTS and ASR Voice Providers in **Settings → Voice**, with the same bridge methods as the Web voice settings: `voiceProviders`, `voiceProviderAdd`, `voiceProviderTest`, `voiceProviderRemove`, `voiceDefaultSet`, `voiceCatalog`, `voiceCatalogImport`, `voiceTemplateValidate`, `voiceProviderTemplate` and `voiceProviderTemplateSet`.

## Sources

- `apps/mobile/app/settings/voice.tsx`
- `apps/mobile/src/ui/voice/*.tsx`
- `apps/mobile/src/ui/voice/voice-sample.ts`
- `packages/host-client/src/voice-providers.ts`
- `packages/host-client/src/shared/voice-options.ts`
- `packages/host-client/src/shared/voice-template-*.ts`
- `packages/host-client/src/voice-templates.ts`

## Terms

- Settings
- Host
- Voice Provider
- Speech Model
- TTS Voice
- Speech Catalog

## Sub-features

- `list`: Voice shows a Text to speech and a Speech to text section. Each Voice Provider row has its brand icon, preset name or health, and opens Test / Remove. Empty sections say what adding a service enables.
- `add`: **Add speech service** or **Add speech recognition** opens a dismissible sheet. The service row opens a preset list with brand icons. Name, endpoint URL (custom presets), API key, model and voice follow. **Add and test** saves and runs the health check on the new row.
- `catalog`: with an API key typed, the model or voice row opens a searchable catalog: Available (account voices or compatible models) and, where the service has one, Public library, with Load more. An ElevenLabs shared voice asks before adding it to the account.
- `sample`: rows with an https sample show a play button. One sample plays at a time; choosing a voice, switching the filter or search, going back, closing the sheet or leaving the screen stops it. A failed sample shows "Couldn't play the sample."
- `template`: the preset list ends with **Custom request**. It shows **Start from** (blank or the Web examples), method, request URL, authentication with header or query name, API key, extra headers, body kind and template, result kind (TTS) and JSON path. **Save and test** checks JSON locally, validates with `voiceTemplateValidate`, and adds with `voiceProviderAdd({preset:'custom'})`; refusals show under their field.
- `template-edit`: a service with a request template has **Edit request** in its actions. The sheet loads `voiceProviderTemplate` and saves with `voiceProviderTemplateSet`, then tests the service.
- `defaults`: Default service rows for TTS and ASR and a Default voice row (built-in voices or a custom ID) call `voiceDefaultSet`.
- `owner`: the Settings row is hidden on a member's phone. A `remote-access/denied` refusal shows the Owner-only notice.
- `cli`: `deepseekbot voice-providers`, `voice-provider-add`, `voice-provider-test`, `voice-provider-remove`, `voice-default-set`, `voice-catalog`, `voice-catalog-import`, `voice-template-validate`, `voice-provider-template` and `voice-provider-template-set` read and change the same Host state.

## How to get to it (user POV)

- In the app, open Settings and tap **Voice** under the model section.

## Driving it with verify-app

1. Launch a task-owned Host with `verify-app launch --name <name>`; for catalog checks start it with a process-local provider fixture (`NODE_OPTIONS=--import <fixture.mjs>`) that answers `api.fish.audio` `/model` and `/v1/tts`.
2. Pair a Simulator through the loopback route (see shared device QA) and open Settings → Voice with the device tools.
3. Add a Fish Audio service with a placeholder key, open the voice picker, check account voices, switch to Public library, search and Load more. Read back with `deepseekbot voice-providers`.
4. Tap a sample button and assert the button's selected state; tap another and assert only one is selected; go back and assert none plays.
5. Add a Custom request service from the Google Cloud TTS example with a placeholder key; open its actions, **Edit request**, change the URL and save. Read back with `deepseekbot voice-provider-template <id>`. At Android's maximum font size, check that both the edit heading and service name are visible and that Save and test can be reached with the keyboard open.
6. Set the default service and voice, and read back `defaults` with `deepseekbot voice-providers`.
7. On Android, search the Public library, dismiss the keyboard, clear the query and immediately swipe up in the results. The refreshed list must scroll, and the picker Back button must return to the form. Check that dragging the sheet handle still dismisses the sheet.

## Gotchas

- Never let a sample play through the Mac speakers: mute the Mac output during the check or assert state only. Fixture sample links point at missing files, so they exercise the failure notice.
- PR screenshots use fixture voice names, never real public voices.
- Android is verified on an Android emulator only; iOS screenshots do not stand in for it.
