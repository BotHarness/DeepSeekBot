# Mobile app — Agent Guide

You are working on the Expo app in `apps/mobile` (Expo SDK 58, React Native 0.88, React 19.3, Expo Router, pnpm workspace with the isolated linker). The repository rules in the root `AGENTS.md` still apply. This file adds the mobile-only rules.

## Which skill to use

Load `expo-overview` first for any Expo or EAS task; it routes to the right skill and owns the shared rules (detect the SDK, read docs pinned to that SDK, install with `npx expo install`, upgrade only through `expo-upgrade`).

- Screens and styling: `expo-native-ui`. Native components (`@expo/ui` SwiftUI/Compose views, menus, pickers, sheets): `expo-ui`. Navigation: `expo-router`. Motion, gestures and haptics: `expo-animation` for the APIs, and `animate-expo` (with `review-animations`) for the motion decisions: whether to animate, curve, duration, properties and reduced motion.
- iOS control choice and Liquid Glass (pop-up/pull-down buttons, menus, sheets, toolbars, tab bar, scroll edge effects): `ios-hig`. It maps Apple's HIG onto this app; a decision already in `DESIGN.md` wins, and drift from the HIG is named in the PR.
- For Expo / React Native iOS development, also load `swiftui-expert-skill`. Apply its relevant guidance to SwiftUI-backed `@expo/ui` views, Swift native modules, state, layout, accessibility and native performance; use `expo-ui` / `expo-module` for the Expo integration and `react-native-best-practices` for React Native behavior. Verify API availability against the project's actual Expo SDK, Xcode and iOS deployment target before adopting upstream examples. Keep the existing CNG, device ownership and performance verification rules.
- Android control choice (menus, exposed dropdowns, dialogs, bottom sheets, app bars, navigation bar), edge-to-edge and predictive back: `android-material`, the Material 3 twin of `ios-hig`. Spec detail (tokens, colour, type, shape, motion): `material-3`.
- Network calls and loading/error states: `expo-data-fetching`. The Host client in `src/host/` is ours: screens read it through `useHostSnapshot()` and never call `fetch` themselves.
- Development builds: `expo-dev-client`. Store builds and submission: `eas-app-stores`. OTA updates: `eas-update`. EAS CI: `eas-workflows`.
- Native modules: `expo-module`. SDK upgrades: `expo-upgrade`.
- Performance (jank, re-renders, lists, bundle size, memory): `react-native-best-practices`. Measure before optimizing under [Profiling](#profiling).
- Component tests: `react-native-testing`. Today the app's tests are Vitest in Node against the Host client (`test/`); adding React Native component tests is a separate decision.

Read docs for SDK 58 (`https://docs.expo.dev/versions/v58.0.0/...`), not `latest`.

## Design rules

Screens follow the shared [UI design standard](../../docs/agents/ui-design.md) and [DESIGN.md](./DESIGN.md): the Host-as-workspace structure, the screen anatomy, and the code rules. No literal colours, type, spacing, radii or edge widths outside `src/ui/design/` (`test/style-guard.test.ts`); text through `src/ui/primitives/text`; new visual elements land in `src/ui/primitives`, `chat` or `shell` before a screen uses them.

**Immediate interaction feedback is required.** For navigation, drawers/sheets, search and async actions, follow [Responsive interactions](./DESIGN.md#responsive-interactions): commit the shell/selection before uncached data or heavy content, retain scoped cached content during refresh, and measure tap-to-feedback separately from data-ready time. Include long-list and streaming regressions when those paths are affected; 120 FPS requires native Release evidence, not a display refresh-rate setting.

**System text and large-text usability are required for every new or changed UI.** Read the [implementation and acceptance contract](./DESIGN.md#system-text-and-large-text-acceptance). Preserve iOS semantic Dynamic Type and Android native scaling; fix layout with wrapping, stacking, scrolling and reachable actions instead of disabling scaling or capping all text. Text/input adapter changes must preserve live drafts and editable-field identity. The PR records default/intermediate/maximum × light/dark native checks for both platforms, matched screenshots, actual interactions and explicit blockers. Do not infer Android or Human acceptance from iOS screenshots or source tests.

## Hard rules

- **Keyboard visibility is required for every text input on iOS and Android.** Follow [Keyboard and text entry](./DESIGN.md#keyboard-and-text-entry) for chat, search, pairing, answers, sheets and forms. Verify a real keyboard, focus changes, multiline growth and reachable submission; a covered caret or required action fails acceptance.

- **Native projects are generated.** `ios/` and `android/` are not committed (CNG). Change native configuration through `app.json` and config plugins, never by editing generated native files.
- **Keep packages on the SDK's versions.** Add Expo and React Native packages with `npx expo install <pkg>`. Where the Expo API is unreachable (cloud sessions block `expo.dev`), take the range from `node_modules/expo/bundledNativeModules.json` and add it with `pnpm --filter @botharness/mobile add <pkg>@<range>`. Never hand-bump `expo`, `react`, `react-native` or `expo-*` versions; that is an `expo-upgrade` task.
- **Use the SDK 58 dependency matrix.** Keep Hermes on the SDK default. SDK upgrades require native rebuilds; do not load this JavaScript into an SDK 57 development client.
- **File writes are explicit.** SDK 58 `File.write()` is asynchronous. The existing synchronous persistence adapters use `File.writeSync()` so their failure handling and callers retain the same contract.
- **A native change needs a new development build.** Adding a package with native code, a config plugin, or an `app.json` native field change means the installed dev build is stale; say so in the PR. JavaScript-only changes reload through Metro.
- **No secrets in the bundle.** Anything in `EXPO_PUBLIC_*` variables or `app.json` ships inside the app. Tokens live only in `expo-secure-store` and are never logged.
- **HTTPS for ordinary requests.** LAN uses only the restricted native `LanChannel` carrier for pinned-key Noise frames; it never sends ordinary HTTP or device credentials in plaintext. Keep general cleartext disabled. Tailscale uses HTTPS and Connect retains its encrypted carrier. See `docs/architecture/lan-phone-v1.md` at the repo root.
- **Long lists virtualize.** Use `FlatList`/`SectionList` (or FlashList if measured), never `ScrollView` over `.map()`.
- **Web is a preview target, not a product.** The web export exists for screenshots in cloud sessions (see `README.md`); do not add web-only code paths to make it work.

## Native UI verification

Reserve [shared device QA](../../docs/agents/device-qa.md) before starting a Simulator, Metro, a build or a Host. Follow [mobile app verification](../../docs/agents/device-qa.md#mobile-app-verification-and-read-only-diagnostics) for native drives, regression flows, read-only diagnostics and cloud sessions. Keep [local QA evidence](../../docs/agents/qa-evidence.md).

Core controls carry a stable `testID` so flows and agents survive copy changes and the zh/en switch: `composer-input`, `composer-send`, `composer-attach`, `settings-button`, `approval-allow-once` / `approval-always-allow` / `approval-deny`, and `conversation-row-<key>` (`bot:<slug>`, `channel:<id>`, `cloud:<channelId>`). A new interactive control that a flow or agent will drive gets a kebab-case `testID` as well as its accessibility label; the label stays the user-facing contract and is never replaced by the `testID`.

## Profiling

Use [iOS performance tuning and physical-device verification](../../docs/agents/ios-performance.md#mobile-performance-workload-and-acceptance) for the ProMotion Release target, matched workloads and evidence boundaries.

## Checks

See [mobile check commands](../../docs/agents/device-qa.md#mobile-check-commands).

## Updating skills

Expo, Callstack, React Native Testing Library, Emil Kowalski animation and AvdLee SwiftUI skills are [vendored third-party skills](../../docs/agents/vendored-skills.md). Update them with `npx skills update <name>` and review the diff.
