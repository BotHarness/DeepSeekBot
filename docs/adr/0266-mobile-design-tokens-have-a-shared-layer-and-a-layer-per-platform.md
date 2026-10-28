---
Status: Accepted
Date: 2026-10-27
Issues: [#3002](https://github.com/BotHarness/DeepSeekBot/issues/3002), [#3004](https://github.com/BotHarness/DeepSeekBot/issues/3004)
Supersedes: the "one token source" bullet of [ADR-0201](0201-the-mobile-design-system-maps-web-roles-onto-native-components.md)
---

# Mobile design tokens have a shared layer and a layer per platform

ADR-0201 gave the mobile app one TypeScript token source for both platforms, generated from the Web palette, with only type size and touch size varying by platform. The app now uses native components with their default look (`DESIGN.md` → Native first). Those components already carry a token system of their own: Material 3 colour roles, type styles and shapes on Android, and semantic colours, Dynamic Type and materials on iOS. One shared source made screens restate those values by hand. It also gave an agent no single place to read a platform's chrome tokens, so screens drifted.

## Decision

Tokens come in three layers:

- **Shared** (`src/ui/design/tokens.ts`, `palette.generated.ts`):
  - Brand accent, status colours, spacing, focus width.
  - Colours used only for content: chat bubbles, Host colours, charts, wallpaper.
  - Still generated from the DSH theme the Web paints with. The design token test ties only this layer to the Web.
- **Android** (`src/ui/design/material-tokens.ts`):
  - The Expo UI `Host` seed colour is the brand accent. Material 3 colour roles come from `useMaterialRoles()` (`useMaterialColors` with the theme's scheme and seed). Type uses the Material style names (`materialType`).
  - Shape, elevation, motion scheme and state layers stay with the Compose defaults that `Host` provides.
  - Hand-copied Material numbers are deleted as each consumer migrates to the native component.
- **iOS** (`src/ui/design/system-tokens.ts`):
  - Semantic system colours (`systemColors`: label levels, backgrounds, separator, fill) and Dynamic Type styles (`systemType`). The accent is the system tint.
  - Hex values remain only where the app computes colours (accent mixing, contrast) and for content surfaces.

Platform-specific UI files (`*.android.tsx`, `*.ios.tsx`) contain no colour literals. They take colours from the platform layer, or from the shared layer for brand and content.

## Considered Options

- **Keep one source.** Simple, but every native component restates platform values, and the hand copies drift from Material and Apple.
- **Style Dictionary with W3C DTCG files.** It can emit Swift and Compose Kotlin. But nothing native reads tokens at build time today, and Style Dictionary's support for the DTCG 2025.10 format is still in progress. Revisit if a native module needs build-time tokens.
- **Material You dynamic colour by default.** Still rejected, as in ADR-0201. It stays an opt-in Appearance choice.

## Consequences

- New native UI reads chrome colours from `useMaterialRoles()` or `systemColors`, not from `theme.color`. Existing screens move as their components migrate (#3002).
- Local Compose modules that build their own colour scheme move to Expo UI's extension pattern, so they inherit the `Host` theme.
- `test/platform-tokens.test.ts` fails when a platform file hard-codes a colour.
- Research and sources: `docs/research/2026-10-27-native-design-tokens-and-minus-one-screen.md`.
