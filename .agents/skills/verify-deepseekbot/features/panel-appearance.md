# Functional Panel appearance (T3–T4)

## Sub-features

- Top-level Panel Header context menu opens a named Appearance modal; no extra visible menu button.
- Each Header/Body field independently overrides the current mode global value, or returns to Follow global.
- Stable `dock:<functional-id>` identity survives content changes, close/reopen and restart. Reset this panel only clears that target in the current mode.
- Target discovery and writes use the same Client-local owner as UI, with explicit Client/revision and coded unavailable/duplicate refusals.

## How to get to it (user POV)

In desktop Bot mode, right-click the Messages or Activity Center Header → Appearance settings. The modal names the Panel and current light/dark mode. Adjust color, opacity and blur; use each Follow global button to remove just that override. Reset this panel removes only the current target and mode. Ordinary Header close/drag and content context menus retain their own actions. Nested Memory, Sessions, Browser and Computer Headers use the same menu. Memory file preview, commit detail and working changes share the Memory details target; child fields inherit global settings directly.

## Driving it with verify-app

Build, launch and doctor an isolated Host. Run `BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-panel-appearance.mjs`. It drives real Messages and Activity Center Headers, edits through UI/CLI, verifies composed styles, per-property inheritance, independent modes, close/reopen, reload and target reset. `--baseline` captures the T2 entry point without the new menu action. Review screenshots and saved canonical state; the test uses no model call.

For task-owned macOS, follow [local appearance](local-appearance.md), open both functional Header menus, edit and read values through the targeted CLI, flush storage, restart the same application directory and compare the complete local appearance document.

## Gotchas

- Open Messages from its Control Rail button when it is closed; selecting a Channel does not force that functional Panel open. Scope row input to the visible workspace, since native sidebar controls may also remain mounted.

- The target is a functional Panel, not its current Bot, Channel, file or Dock render instance. Closing it does not delete its saved appearance.
- The Dock content paint container is distinct from the React content mount. Styles target the active Dock tab's group, without inheritable per-panel material variables.
- Unknown/unregistered targets refuse writes; they are never substituted with another Panel. Saved data is retained for a returning registration.
- Native DSH, content menus and modal opacity remain separate. Human QA and unrun native branches are separate from source tests.

## Nested journey and independent Plugin

For T4, add the test-only Bundle `scripts/fixtures/appearance-panel` to the isolated Profile using a local dependency and its `dsh.profile.bundles` entry, then relaunch that Profile. Never add this fixture to the product Bundle. Run `BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-nested-appearance.mjs`; `--baseline` captures the prior T3 nested entry point. The journey creates synthetic Memory content in its task-owned Bot repository and uses real Git commits, not simulated detail data.

Verify green Messages with a globally colored child, child Header-only menu/modal, three Memory detail views, parent reset preserving children, Bot switch/reload, independent contribution content and unregister/re-register. Browser uses a real local fixture page through its Provider and embedded viewer. Computer Header/body and its current runtime status must be recorded separately from a live desktop pixel check. Native Desktop follows the task-owned launch/restart contract in local appearance; never operate another task's app.

Browser/Computer poll while open: reload waits for the actual restored panel rather than network idleness. A perpetual poll is not a persistence failure. Keep failed attempts and their observation/doctor output.
