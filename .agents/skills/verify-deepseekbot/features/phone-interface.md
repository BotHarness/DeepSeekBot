# Phone language and appearance

## Sub-features

- `language-choice`: Follow system, 简体中文 and English update mounted settings, navigation and chat labels immediately; language names remain recognizable after switching.
- `appearance-choice`: Follow system, Light and Dark update app colors, status bar, native menus, sheets and keyboard appearance together. Background preview overrides remain scoped.
- `phone-persistence`: both preferences survive a cold launch and apply across paired Computers and Cloud workspaces on this phone; a failed save displays a retry hint.
- `chat-continuity`: the current route, unsent draft, input identity/caret and held chat history remain in place when either preference changes.

## How to get to it (user POV)

Open Settings → Interface → Language or Appearance. Choose one option from the native picker/menu. Return to the original chat.

## Driving it with verify-app

Reserve native iOS/Android checks through the [shared queue](../../../../docs/agents/device-qa.md). Use a rebuilt SDK58 client containing Expo localization. Drive by visible accessibility labels; stable controls are `settings-language`, `settings-appearance` and Android options `settings-language-system/zh/en`, `settings-appearance-system/light/dark`.

1. Start with no saved interface preferences. Inspect both Follow system choices. Verify Chinese and English system locales and an unsupported locale fallback to English; on Android return from system Settings without relying on an app restart.
2. Open a long owned fixture chat, scroll away from the latest message and type a multiline unsent draft with a caret selection. Open Settings and select 简体中文. Inspect settings, navigation and the returning chat's translated controls, unchanged draft and retained history anchor. Repeat English and Follow system. Do not send the draft.
3. Select Dark while the phone is light, then Light while it is dark; open native menus and keyboard and inspect status/navigation bars. Return to Follow system and change system appearance. Inspect background editor preview isolation.
4. Cold-launch the app and verify saved selections; switch Computer scope and confirm the same preference without changing another phone. Repeat default/intermediate/maximum system text in light and dark on each native platform; scroll to every option and choose it.
5. Retain matched before/after settings captures and chat-continuity evidence. Source tests cover read/write failure and startup races; record native QA and Human QA separately.

## Gotchas

- The native localization dependency/config plugin requires a rebuilt client. Web preview and DOM tests cannot qualify native menus, keyboard, native text scaling or history-anchor behavior.
- Never reload or key the navigator/chat by locale or appearance to implement a switch.
- Preserve shared device ownership. An unavailable native lane remains untested with a runnable path; do not borrow another task's app/Host.
