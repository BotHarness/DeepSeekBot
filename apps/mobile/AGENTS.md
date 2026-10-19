# Mobile app — Agent Guide

You are working on the Expo app in `apps/mobile` (Expo SDK 58, React Native 0.88, React 19.3, Expo Router, pnpm workspace with the isolated linker). The repository rules in the root `AGENTS.md` still apply. This file adds the mobile-only rules.

## Which skill to use

Load `expo-overview` first for any Expo or EAS task; it routes to the right skill and owns the shared rules (detect the SDK, read docs pinned to that SDK, install with `npx expo install`, upgrade only through `expo-upgrade`).

- Screens and styling: `expo-native-ui`. Native components (`@expo/ui` SwiftUI/Compose views, menus, pickers, sheets): `expo-ui`. Navigation: `expo-router`. Motion, gestures and haptics: `expo-animation`.
- iOS control choice and Liquid Glass (pop-up/pull-down buttons, menus, sheets, toolbars, tab bar, scroll edge effects): `ios-hig`. It maps Apple's HIG onto this app; a decision already in `DESIGN.md` wins, and drift from the HIG is named in the PR.
- Android control choice (menus, exposed dropdowns, dialogs, bottom sheets, app bars, navigation bar), edge-to-edge and predictive back: `android-material`, the Material 3 twin of `ios-hig`. Spec detail (tokens, colour, type, shape, motion): `material-3`.
- Network calls and loading/error states: `expo-data-fetching`. The Host client in `src/host/` is ours: screens read it through `useHostSnapshot()` and never call `fetch` themselves.
- Development builds: `expo-dev-client`. Store builds and submission: `eas-app-stores`. OTA updates: `eas-update`. EAS CI: `eas-workflows`.
- Native modules: `expo-module`. SDK upgrades: `expo-upgrade`.
- Performance (jank, re-renders, lists, bundle size, memory): `react-native-best-practices`. Measure before optimizing, with the loop in [Profiling](#profiling).
- Component tests: `react-native-testing`. Today the app's tests are Vitest in Node against the Host client (`test/`); adding React Native component tests is a separate decision.

Read docs for SDK 58 (`https://docs.expo.dev/versions/v58.0.0/...`), not `latest`.

## Design rules

Screens follow [DESIGN.md](./DESIGN.md): the Host-as-workspace structure, the screen anatomy, and the code rules. No literal colours, type, spacing, radii or edge widths outside `src/ui/design/` (`test/style-guard.test.ts`); text through `src/ui/primitives/text`; new visual elements land in `src/ui/primitives`, `chat` or `shell` before a screen uses them.

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
- **HTTPS only.** iOS App Transport Security and Android cleartext rules block plain `http://` on device; the Host is reached over Tailscale HTTPS.
- **Long lists virtualize.** Use `FlatList`/`SectionList` (or FlashList if measured), never `ScrollView` over `.map()`.
- **Web is a preview target, not a product.** The web export exists for screenshots in cloud sessions (see `README.md`); do not add web-only code paths to make it work.

## Native UI verification

- **First reserve the shared device lane** through [shared device QA](../../docs/agents/device-qa.md). Do not start a separate Simulator, Metro, Host or build outside the assigned batch. The runner may use `node scripts/e2e-mobile-sim.mjs` only when its Simulator/build/Host lifecycle fits the assigned window; it is not a bypass of the queue.
- On a Mac, verify native UI with Callstack's `agent-device` on the iOS Simulator: open the development build, read its accessibility snapshot, act by ref, and save a screenshot. The commands are in `README.md` ("Drive it on the iOS Simulator").
- Regression flows live in `.maestro/` and run with `pnpm --filter @botharness/mobile e2e:ios`. Target elements by their visible text from the snapshot, not by coordinates.
- For a read-only health check of the running dev build, run Expo's experimental agent CLI as `npx --yes @expo/agent-cli@1.0.20 <command>` from `apps/mobile` with `EXPO_NO_TELEMETRY=1`. It assumes it owns the worktree's devices and builds, so on the shared Simulator always pass `--device <udid>` and `--dev-server-url http://127.0.0.1:<port>` (or `--port <port>`); without them it reports no device and misses Metro outside 8081–8085.
  - `status --device <udid> --json`: whether the installed build is stale (`rebuild-required` / `hash-mismatch`).
  - `runtime:errors --json` and `runtime:tree --json`: runtime errors and the interactive nodes on screen. Few views have `testID`s; use accessibility labels.
  - `smoke --ios --no-start --no-reload --port <port> --json`: one exit code for "the app is connected and threw nothing". `--no-start` keeps it from starting Metro, a Simulator or Expo Go.
  - Never run `agents:setup`, `new`, `install`, `deploy` or anything with `--eas`: they rewrite `AGENTS.md`/`CLAUDE.md`, change dependencies or spend EAS credits.
- Native devices and QA Hosts are shared by every agent. Read [shared device QA](../../docs/agents/device-qa.md) before builds or device interaction; it routes Mac/iOS and Windows/Android to their own batch queues. Windows emulator/USB phone control and scrcpy evidence use `scripts/android-qa.ps1` from the repo root.
- Cloud sessions have no simulator. They use the web screenshots ("Screenshots without a phone") and reach a Mac through Remote Control for native checks.

## Profiling

**The bar.** In a Release build on a ProMotion iPhone, a DM holds 120 FPS (8.3 ms frames) while a reply streams, while the user scrolls long history, and while both happen at once ([#1845](https://github.com/BotHarness/DeepSeekBot/issues/1845)). No frame may hitch over 16.7 ms. Numbers from a development build or the Simulator are evidence for a change, not proof that the bar is met.

Performance work is measured, not guessed. Before you change code for speed (jank, re-renders, a slow list, a long stream), profile the scenario, then profile it again after the change. The PR records both sets of numbers. `scripts/rn-profile.mjs` lets an agent read the profile itself, the way the Chrome DevTools MCP does for the web: no one clicks in DevTools.

- **Where it runs.** On a Mac, with the development build in the iOS Simulator and Metro. It talks to the app through Metro's inspector (CDP). Cloud sessions reach a Mac through Remote Control. The project shares one Simulator: send the run to the Simulator queue ([shared device QA](../../docs/agents/device-qa.md)) instead of booting your own.
- **Run it.** Run it from the repository root, so `ws` and `source-map` resolve from the workspace:

  ```bash
  pnpm --filter @botharness/mobile start --port 8085
  xcrun simctl terminate <udid> ai.botharness.deepseekbot.dev
  xcrun simctl openurl <udid> "exp+deepseekbot://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8085"
  node apps/mobile/scripts/rn-profile.mjs --metro 8085 --out /tmp/run --max 900 --quiet 3 --top 40 --run "<command that drives the scenario and exits when it is over>"
  ```

  The script starts recording and then runs `--run`. It stops once that command has exited and React has made no commit for `--quiet` seconds, or after `--max` seconds.

- **Read `summary.json`.** It holds:
  - `react`: commits per second over the streaming window, components rendered per commit, and render and mount counts for each component, from a hook on `__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot`.
  - `cpu`: JS busy time, GC time, and the top functions by self and total time, from the Hermes sampling profiler mapped through Metro's source map.
  - `frames`: JS FPS, dropped frames, the longest frame and frames over 50 ms, from a `requestAnimationFrame` loop.

  `profile.cpuprofile` is also saved for a human to open as a flame chart in DevTools.

- **Compare like with like.**
  - Feed both versions the same input. For streaming, replay one recorded reply from a local OpenAI-compatible mock model at a fixed chunk size and interval, not two live model calls.
  - Alternate the runs (A, B, B, A) and run each version at least three times.
  - Compare against the PR's merge base when the installed dev build cannot run the current base branch.
  - Keep other builds off the Mac while you measure.
- **Read the numbers with care.**
  - A development build adds React's development-mode cost (`console.createTask` is often the top function), so absolute times are inflated. The ratio between before and after carries over.
  - `cpu.instrumentationMs` is the script's own cost and should stay near 0.
- **Gotchas.**
  - Expo's inspector proxy drops any debugger socket whose `Origin` is not exactly `http://127.0.0.1:<port>`. Node's built-in `WebSocket` cannot set it, so the script uses `ws`.
  - Hermes rejects `Profiler.enable`, `Tracing.*` and `HeapProfiler.*`, but `Profiler.start` and `Profiler.stop` work.
  - `Page.reload` replays the URL the app was launched with. To restart cleanly, relaunch with `simctl terminate` and the dev-client URL.
- **Release builds and the UI thread.** `rn-profile.mjs` needs Metro, so it can't attach to a Release build and only sees the JS thread. For the bar above:
  - Measure JS cost with production JS (`expo start --no-dev --minify`) on the dev build, and say it ran on a Debug native binary.
  - Measure the UI thread and render server on a Release build on a real ProMotion iPhone with `xcrun xctrace record --template "Animation Hitches"`. Report the hitch time ratio (ms of hitches per second), hitches over 8.3 ms and 16.7 ms, and the frame rate reached.
  - The iOS Simulator doesn't emulate ProMotion and runs on the Mac's CPU and GPU. Use it only for before/after comparisons, never for a 120 FPS claim.
  - The `requestAnimationFrame` FPS in `summary.json` is capped by the display link, so it can't show more than 60 FPS unless the app opts in to higher frame rates.
- **Scenarios.** Cover streaming a long reply, fling-scrolling a DM with several hundred history messages that include tables and code blocks, and scrolling while a reply streams.

## Checks

```bash
pnpm --filter @botharness/mobile typecheck
pnpm vitest run apps/mobile
pnpm --filter @botharness/mobile expo:doctor          # expo-doctor; two checks need the Expo API
EXPO_OFFLINE=1 pnpm --filter @botharness/mobile export
```

## Updating skills

The Expo, Callstack and React Native Testing Library skills are third-party, locked in `skills-lock.json`. Do not edit them in place; update them with `npx skills update <name>` and review the diff.
