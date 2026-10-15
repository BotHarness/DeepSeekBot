---
Status: Accepted
Date: 2026-10-14
Issues: [#1643](https://github.com/BotHarness/DeepSeekBot/issues/1643), [#1589](https://github.com/BotHarness/DeepSeekBot/issues/1589)
---

# The mobile design system maps the Web roles onto native components

> The three-tab interaction baseline below is superseded by [ADR-0211](0211-the-mobile-app-has-two-tabs-with-settings-and-hosts-in-the-header.md). The rest stands.

The mobile app (`apps/mobile`, Expo SDK 57) grew screen by screen with a hand-written slate palette, a JavaScript tab bar, painted header backgrounds and drawn tab icons. None of it matched the Web design system of ADR-0194, and nothing kept the next screen from inventing another value.

The owner asked for a design system that works on iOS and Android, uses native components where they exist, and takes the Web Client's mobile layout as its interaction baseline. They also want Telegram-style personalisation: an accent of their choice and a chat wallpaper.

## Decision

- **One token source.** The mobile tokens in `apps/mobile/src/ui/design/` use the Web role names.
  - **Colours** are generated from the DSH theme (`@deepseek-ai/dsh-client-ui-theme`) that the Web roles resolve to. `scripts/generate-palette.mjs` resolves each `--dsw-alias-*` role for light and dark into `palette.generated.ts`.
  - **Scales.** Spacing, radius and focus width equal the Web constants.
  - **Checks.** `test/design-tokens.test.ts` fails when the generated palette is stale, when a Web colour role is missing, or when a scale drifts.
- **Platform type and touch sizes.** The `meta`, `body` and `title` roles keep their Web names, but their sizes follow each platform rather than the Web's desktop density:
  - iOS uses Footnote 13, Body 17 and Headline 17 semibold.
  - Android uses Material 3 bodySmall 12, bodyMedium 14 and titleMedium 16.
  - Fonts are the system fonts and honour the system text-size setting.
  - Touch targets are 44pt on iOS and 48dp on Android.
- **Runtime themes.** `useDesignTheme()` resolves the palette from the system scheme and the Human's `Appearance`. In this slice the Appearance can override the scheme and set a custom accent, with `onAccent` picked for contrast. Accent presets, a chat wallpaper (applied to the conversation background only) and an Android "follow system" Material You option are later additions to `Appearance`. The default stays the DSH brand accent.
- **Styling.** Screens use `StyleSheet.create` with the theme's tokens. There is no styling library: ADR-0028 rules out Tailwind (NativeWind, Uniwind), and the Web's StyleX does not reach native. If theme switching ever costs visible re-renders, Unistyles 3 keeps the same `StyleSheet` API.
- **Native components own the chrome:**

  | Need                                        | Native component                                                                                                 |
  | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
  | Tab bar                                     | `NativeTabs` from `expo-router/unstable-native-tabs` (`expo-router/native-tabs` from SDK 58)                     |
  | Headers                                     | Native-stack headers with large titles and `headerSearchBarOptions`, left unpainted so the system material shows |
  | Decisions (Tool approvals, Human questions) | `formSheet` with detents                                                                                         |
  | Menus                                       | Native menus                                                                                                     |
  | Switches                                    | RN `Switch`                                                                                                      |
  | Icons                                       | `expo-symbols`: SF Symbols on iOS, Material Symbols on Android                                                   |

  BotHarness only builds the content components the Web `ds/` already defines, such as settings rows, pill buttons, notes and empty states, under the same content rules.

- **Interaction baseline.** _Superseded by [ADR-0211](0211-the-mobile-app-has-two-tabs-with-settings-and-hosts-in-the-header.md): the app has Chats and Activity tabs, with search at the top of Chats and Settings and Host switching in the header._ The Web Client's mobile shell (`packages/client/src/client/mobile-bot-panel.tsx`) sets the flow:
  - Three tabs: Conversations, Inbox and Settings.
  - A conversation is pushed above the tabs, which hides the tab bar, with back, title and settings in its header.

## Considered Options

- **Uniwind or NativeWind (Tailwind v4 classes).** pingdotgg/t3code takes this route, generating its mobile themes from the same palette file as its Tailwind web app. It is a good fit when both clients use Tailwind. Here it would make two authoring styles over one set of roles, and ADR-0028 rules out Tailwind.
- **react-strict-dom (StyleX on native).** It would share authoring with the Web, but it is still experimental and does not compose with Expo's native tabs, sheets or `@expo/ui`.
- **Hand-tuned mobile colours.** This is the current state. It drifts from the Web and gives no way to check.
- **Material You by default on Android.** It was rejected so the brand stays consistent across Web and phone, and it remains an opt-in Appearance choice.

## Consequences

- New mobile UI reads `useDesignTheme()`. The legacy `src/ui/theme.ts` palette is migrated screen by screen and then deleted.
- A DSH theme upgrade changes the mobile palette only through `pnpm --filter @botharness/mobile generate:palette`, and the test makes a forgotten regeneration fail.
- Moving to native tabs, native headers and form sheets touches the app's layouts. It follows the in-flight mobile slices rather than racing them.
