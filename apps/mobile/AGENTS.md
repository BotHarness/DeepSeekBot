# Mobile app — Agent Guide

You are working on the Expo app in `apps/mobile` (Expo SDK 57, React Native 0.86, React 19.2, Expo Router, pnpm workspace with the isolated linker). The repository rules in the root `AGENTS.md` still apply. This file adds the mobile-only rules.

## Which skill to use

Load `expo-overview` first for any Expo or EAS task; it routes to the right skill and owns the shared rules (detect the SDK, read docs pinned to that SDK, install with `npx expo install`, upgrade only through `expo-upgrade`).

- Screens and styling: `expo-native-ui`. Navigation: `expo-router`.
- Network calls and loading/error states: `expo-data-fetching`. The Host client in `src/host/` is ours: screens read it through `useHostSnapshot()` and never call `fetch` themselves.
- Development builds: `expo-dev-client`. Store builds and submission: `eas-app-stores`. OTA updates: `eas-update`. EAS CI: `eas-workflows`.
- Native modules: `expo-module`. SDK upgrades: `expo-upgrade`.
- Performance (jank, re-renders, lists, bundle size, memory): `react-native-best-practices`. Measure before optimizing.
- Component tests: `react-native-testing`. Today the app's tests are Vitest in Node against the Host client (`test/`); adding React Native component tests is a separate decision.

Read docs for SDK 57 (`https://docs.expo.dev/versions/v57.0.0/...`), not `latest`.

## Design rules

Screens follow [DESIGN.md](./DESIGN.md): the Host-as-workspace structure, the screen anatomy, and the code rules. No literal colours, type, spacing, radii or edge widths outside `src/ui/design/` (`test/style-guard.test.ts`); text through `src/ui/primitives/text`; new visual elements land in `src/ui/primitives`, `chat` or `shell` before a screen uses them.

## Hard rules

- **Native projects are generated.** `ios/` and `android/` are not committed (CNG). Change native configuration through `app.json` and config plugins, never by editing generated native files.
- **Keep packages on the SDK's versions.** Add Expo and React Native packages with `npx expo install <pkg>`. Where the Expo API is unreachable (cloud sessions block `expo.dev`), take the range from `node_modules/expo/bundledNativeModules.json` and add it with `pnpm --filter @botharness/mobile add <pkg>@<range>`. Never hand-bump `expo`, `react`, `react-native` or `expo-*` versions; that is an `expo-upgrade` task.
- **Do not use `expo@57.0.8` or older.** Those releases have the Hermes V1 memory regression.
- **A native change needs a new development build.** Adding a package with native code, a config plugin, or an `app.json` native field change means the installed dev build is stale; say so in the PR. JavaScript-only changes reload through Metro.
- **No secrets in the bundle.** Anything in `EXPO_PUBLIC_*` variables or `app.json` ships inside the app. Tokens live only in `expo-secure-store` and are never logged.
- **HTTPS only.** iOS App Transport Security and Android cleartext rules block plain `http://` on device; the Host is reached over Tailscale HTTPS.
- **Long lists virtualize.** Use `FlatList`/`SectionList` (or FlashList if measured), never `ScrollView` over `.map()`.
- **Web is a preview target, not a product.** The web export exists for screenshots in cloud sessions (see `README.md`); do not add web-only code paths to make it work.

## Native UI verification

- On a Mac, start with `node scripts/e2e-mobile-sim.mjs`: one command makes its own Simulator and Metro port, builds the app, pairs with two isolated Hosts and opens notifications sent with `xcrun simctl push`; read the screenshots it keeps.
- On a Mac, verify native UI with Callstack's `agent-device` on the iOS Simulator: open the development build, read its accessibility snapshot, act by ref, and save a screenshot. The commands are in `README.md` ("Drive it on the iOS Simulator").
- Regression flows live in `.maestro/` and run with `pnpm --filter @botharness/mobile e2e:ios`. Target elements by their visible text from the snapshot, not by coordinates.
- Cloud sessions have no simulator. They use the web screenshots ("Screenshots without a phone") and reach a Mac through Remote Control for native checks.

## Checks

```bash
pnpm --filter @botharness/mobile typecheck
pnpm vitest run apps/mobile
pnpm --filter @botharness/mobile expo:doctor          # expo-doctor; two checks need the Expo API
EXPO_OFFLINE=1 pnpm --filter @botharness/mobile export
```

## Updating skills

The Expo, Callstack and React Native Testing Library skills are third-party, locked in `skills-lock.json`. Do not edit them in place; update them with `npx skills update <name>` and review the diff.
