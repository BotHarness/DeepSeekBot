# Mobile app — Agent Guide

You are working on the Expo app in `apps/mobile` (Expo SDK 58, React Native 0.88, React 19.3, Expo Router, pnpm workspace with the isolated linker). The repository rules in the root `AGENTS.md` still apply. This file adds the mobile-only rules.

## Which skill to use

Load `expo-overview` first for any Expo or EAS task; it routes to the right skill and owns the shared rules (detect the SDK, read docs pinned to that SDK, install with `npx expo install`, upgrade only through `expo-upgrade`).

- Screens and styling: `expo-native-ui`. Native components (`@expo/ui` SwiftUI/Compose views, menus, pickers, sheets): `expo-ui`. Navigation: `expo-router`. Motion, gestures and haptics: `expo-animation` for the APIs, and `animate-expo` (with `review-animations`) for the motion decisions: whether to animate, curve, duration, properties and reduced motion.
- iOS control choice and Liquid Glass (pop-up/pull-down buttons, menus, sheets, toolbars, tab bar, scroll edge effects): `ios-hig`. It maps Apple's HIG onto this app; a decision already in `DESIGN.md` wins, and drift from the HIG is named in the PR.
- Android control choice (menus, exposed dropdowns, dialogs, bottom sheets, app bars, navigation bar), edge-to-edge and predictive back: `android-material`, the Material 3 twin of `ios-hig`. Spec detail (tokens, colour, type, shape, motion): `material-3`.
- Network calls and loading/error states: `expo-data-fetching`. The Host client in `src/host/` is ours: screens read it through `useHostSnapshot()` and never call `fetch` themselves.
- Development builds: `expo-dev-client`. Store builds and submission: `eas-app-stores`. OTA updates: `eas-update`. EAS CI: `eas-workflows`.
- Native modules: `expo-module`. SDK upgrades: `expo-upgrade`.
- Performance (jank, re-renders, lists, bundle size, memory): `react-native-best-practices`. Measure before optimizing, with the loop in [Profiling](#profiling).
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

- **First reserve the shared device lane** through [shared device QA](../../docs/agents/device-qa.md). Do not start a separate Simulator, Metro, Host or build outside the assigned batch. The runner may use `node scripts/e2e-mobile-sim.mjs` only when its Simulator/build/Host lifecycle fits the assigned window; it is not a bypass of the queue.
- On a Mac, verify native UI with Callstack's `agent-device` on the iOS Simulator: open the development build, read its accessibility snapshot, act by ref, and save a screenshot. The commands are in `README.md` ("Drive it on the iOS Simulator").
- Regression flows live in `.maestro/` and run with `pnpm --filter @botharness/mobile e2e:ios`. Target elements by their visible text from the snapshot, not by coordinates.
- Core controls carry a stable `testID` so flows and agents survive copy changes and the zh/en switch: `composer-input`, `composer-send`, `composer-attach`, `settings-button`, `approval-allow-once` / `approval-always-allow` / `approval-deny`, and `conversation-row-<key>` (`bot:<slug>`, `channel:<id>`, `cloud:<channelId>`). A new interactive control that a flow or agent will drive gets a kebab-case `testID` as well as its accessibility label; the label stays the user-facing contract and is never replaced by the `testID`.
- For a read-only health check of the running dev build, run Expo's experimental agent CLI as `npx --yes @expo/agent-cli@1.0.20 <command>` from `apps/mobile` with `EXPO_NO_TELEMETRY=1`. It assumes it owns the worktree's devices and builds, so on the shared Simulator name both targets explicitly: `status` takes `--device <udid>`, and the `runtime:*` commands and `smoke` take `--dev-server-url http://127.0.0.1:<port>` (`smoke` also accepts `--port <port>`). Without them it reports no device and misses Metro outside 8081–8085.
  - `status --device <udid> --json`: whether the installed build is stale (`rebuild-required` / `hash-mismatch`).
  - `runtime:errors --dev-server-url http://127.0.0.1:<port> --json` and the same flags on `runtime:tree`: runtime errors and the interactive nodes on screen, with their `testID`s.
  - `smoke --ios --no-start --no-reload --port <port> --json`: one exit code for "the app is connected and threw nothing". `--no-start` keeps it from starting Metro, a Simulator or Expo Go.
  - Never run `agents:setup`, `new`, `install`, `deploy` or anything with `--eas`: they rewrite `AGENTS.md`/`CLAUDE.md`, change dependencies or spend EAS credits.
- Native devices and QA Hosts are shared by every agent. Read [shared device QA](../../docs/agents/device-qa.md) before builds or device interaction; it routes Mac/iOS and Windows/Android to their own batch queues. Windows emulator/USB phone control and scrcpy evidence use `scripts/android-qa.ps1` from the repo root.
- Screenshots, recordings and release image retention follow [local QA evidence](../../docs/agents/qa-evidence.md): index each platform's actual source/build and results in the main checkout, and retain accepted evidence outside disposable worktrees.
- Cloud sessions have no simulator. They use the web screenshots ("Screenshots without a phone") and reach a Mac through Remote Control for native checks.

## Profiling

**The bar.** In a Release build on a ProMotion iPhone, a DM holds 120 FPS (8.3 ms frames) while a reply streams, while the user scrolls long history, and while both happen at once ([#1845](https://github.com/BotHarness/DeepSeekBot/issues/1845)). No frame may hitch over 16.7 ms. Numbers from a development build or the Simulator are evidence for a change, not proof that the bar is met.

Performance work follows the mandatory [iOS performance tuning and physical-device verification
(AX)](../../docs/agents/ios-performance.md) workflow: validate the workload, capture the relevant
JS/React/native/display layer, attribute the cause, make the smallest change and run matched
physical Release A/B/B/A/A/B measurements. Keep Simulator, physical Release and Human QA results
separate, and preserve failed/invalid samples.

Use `react-native-best-practices` for diagnosis and implementation. RN DevTools/Hermes and
Instruments serve different measurement layers. `scripts/rn-profile.mjs` is diagnostic scaffolding:
its React-hook requirement, fixed-60Hz JS rAF drop estimate and base-duration accumulation are
not native FPS or exact current-update CPU measurements. Development-build improvement ratios
must be revalidated in Release. See the AX workflow for commands, supported-tool checks,
provenance, low-overhead instrumentation and required evidence.

Cover streaming a long reply, scrolling hundreds of messages including tables/code, and both
at once. Include keyboard, draft, anchor and accessibility regressions when affected. Follow
[shared device QA](../../docs/agents/device-qa.md) for resource ownership and
[QA evidence](../../docs/agents/qa-evidence.md) for retained captures.

## Checks

```bash
pnpm --filter @botharness/mobile typecheck
pnpm vitest run apps/mobile
pnpm --filter @botharness/mobile expo:doctor          # expo-doctor; two checks need the Expo API
EXPO_OFFLINE=1 pnpm --filter @botharness/mobile export
```

## Updating skills

The Expo, Callstack, React Native Testing Library and Emil Kowalski animation skills are third-party, locked in `skills-lock.json`. Do not edit them in place; update them with `npx skills update <name>` and review the diff.
