# Desktop whole-window zoom

## Sub-features

- S1 (#2268): one primary macOS window, settings/default/reset, owned font-shortcut handoff, device-local persistence and exact-target CLI.
- S2 (#2269): full focus, composition, recording, extreme-level and compatibility lifecycle matrix.
- S3 (#2270): Windows/Linux native qualification and multiple windows where supported.

## How to get to it (user POV)

In the isolated desktop, enter Bot mode → Bot Settings → General → Window zoom.
Set a default, press ordinary Cmd+= once, and press Cmd+0 to reset to the saved default. The sidebar,
settings modal and content must change together while manual font sizes remain unchanged.
Ordinary product install carries the pinned adapter but does not enable it. Use the explicit
`deepseekbot-zoom-setup enable --home <home> --profile desktop --desktop-app <app>`
command with the isolated Desktop fully closed, then reopen the same Desktop. It accepts only macOS and
app 0.2.1-rc.2, retaining the root `ui-theme` settings namespace and exactly one native theme
module id. A Profile-local package link points to the portable licensed product payload;
there is no task-only theme dependency or installed-app modification. The actual Client boot
release also gates the font-key lease. Disable before uninstall or switching outside the
qualified Desktop/Host/Client tuple. Unknown versions are not qualified by this runtime guard.
Ordinary browsers retain browser-native zoom. Package tests and native activation are
separate checks; verify the actual theme id and source in `__DSH_BOOT__` after restart.

## Driving it with verify-app

Build the linked worktree, then run `scripts/e2e-desktop-zoom-launch.mjs` on macOS. It owns
a temporary Profile, user-data directory and debug port, and stops only that exact process.
This is a launcher and prerequisite probe, not an acceptance pass. Keep private login data
out of published logs. Select only the uniquely identified isolated window for native input.
The task-only QA Bundle writes the current loopback Host origin and a private token-file path to
`cli-access.json` inside the launcher's isolated root. Launch tokens and native worker ports change
on actual restart; use this fresh metadata rather than an old endpoint. Token and metadata files
are 0600 and remain machine-local. The helper uses existing `webServer` / `connection` Providers
and adds no listener or product API.

Use `window-zoom-clients` to obtain an explicit live Client ID. `window-zoom-get` returns its
revision; `window-zoom-set --zoom-level=1 --expected-revision <revision>` and
`window-zoom-reset --expected-revision <revision>` operate on that same owner. Add
`--zoom-default` to change the device default and current window together. No model is needed.
Verify the visible settings value and root CSS factor independently of the CLI result.

Acceptance requires real native screenshots at 83/100/120/144%, main/iframe/webview focus,
one ordinary Cmd+= action with unchanged font tokens and guest-native zoom, a true process
restart, storage refusals, and Human feedback. Record each run against its exact source SHA.

## Dock layout regression

Run `node scripts/e2e-dock-zoom.mjs` for the real pinned Dockview browser fixture. It asserts
content allocation at normal, smaller, larger and extreme zoom levels, retained inputs and
screen-space splitter movement. This is dependency regression coverage, not a DSH acceptance
pass. In the preserved desktop window, compare each visible panel's content rectangle against
its group allocation at the same levels and capture matched whole-window before/after pixels.
Do not accept clipping, a layout reset or replacing live panels as an overlap fix.

Run `node scripts/e2e-workspace-chrome.mjs` for the production macOS corner CSS and
coordinate owner across all 17 levels, 0/4/16px panel gaps, rail on either side, fullscreen
and non-macOS exclusion (204 cases). The native 88×40 viewport-pixel footprint must remain
fixed while only intersecting headers reserve converted local CSS space. Check native pixels
as well: the browser fixture does not render the operating system traffic lights.

## Gotchas

- The native 0.2.1-rc.2 shortcut protocol rejects NumpadAdd/NumpadSubtract/Numpad0.
  Cmd+0 restores the saved device default through the existing native owner. Explicit custom
  assignments or unbinding retain precedence; do not claim numberpad support.
- For reset qualification, save a non-100% default, change the current zoom, then press
  Cmd+0 once from the composer, an owned iframe and a leased webview input. Each must
  produce one state write to the saved default, keep input/focus and native font values,
  and leave the guest native zoom factor unchanged. Restore the original device preference.
- Whole-window native pixels are required: a clipped CDP screenshot can omit native guests.
- Loaded DOM, working input and a visible-document flag do not prove a webview painted.
- Create and resize guests while hidden, restore normally at unchanged geometry, and compare
  fixture rulers, retained input, guest identity, navigation count and zoom action count.
  Reload, guest replacement or forced fullscreen are not fixes. Failure blocks qualification.
- Browser tabs retain browser-native zoom; Windows/Linux are not enabled by S1.

## S2 settings recovery

Reuse the existing isolated Profile with the S1 composition. Open Bot Settings at level 0,
then raise to +8 while it stays open. Navigation must switch to the compact section picker
using local layout width (body CSS pixels), not the unchanged viewport media query. Open the
picker, select Interface, scroll the content, then return to General. The settings card and
close button stay within the native safe area; its body scrolls independently. File inputs
must not introduce a horizontal scrollbar. Scroll General until Reset is fully visible and
click it: UI and fresh targeted CLI must both report the saved default. Repeat at -8.
Check that the underlying composer and persisted panel/theme customization remain intact.

The compact picker reuses the application viewport menu owner because the pinned native
portaled menu multiplies viewport anchor coordinates under root CSS zoom. Test keyboard
Escape/focus return and section selection; do not infer all other anchored dropdowns are
qualified from this picker. Real IME/recording/custom-binding and wider embedded-page,
compatibility and platform matrices remain separate S2/S3 gates.

## Product activation and native Settings identity

Ordinary Bundle install alone does not activate zoom. In the explicit isolated Profile,
run `deepseekbot-zoom-setup enable --home <home> --profile desktop --desktop-app <app>`
with the target Desktop fully closed, then reopen it. Keep the root `ui-theme` namespace and one native theme
module id. Read pre-existing fonts, edit them through native Settings, restart and read back.
Run `disable` before product removal, restart and verify original theme bytes and retained
font preferences. The package command reports configuration only, not runtime acceptance.
Never replace this check with a standalone Node hook test or rename the settings namespace.

The copied Client exposes its zoom lease only when the actual `__DSH_BOOT__.release.version`
is 0.2.1-rc.2. Unknown/missing releases retain the font-key scope and expose no zoom capability.
This runtime guard does not remove an already installed Profile package override or qualify
that copied theme on another Host. Disable the override before switching outside the verified
Desktop/Host/Client tuple; re-enable only after qualifying the new combination.


The Desktop Profile is excluded from DSH CLI management. Native plugin-manager installation
also rejects the copied native theme as `not-bundle` because installation-owned metadata wins.
The opt-in installer therefore uses the explicitly selected app's bundled pnpm while Desktop
is closed, under the native Profile writer lock. Verify refusal while running, then closed-app
enable, native cold boot, closed-app disable and unchanged `ui-theme` values. Do not replace
this qualification with a headless Profile or the failed native installation attempt.


## Native Tooltip placement

At144%, focus the Home name button through Tab/Shift+Tab: its tooltip must be adjacent to
the button and remain within the viewport. Repeat after a zoom action and retain the original
composer draft. `node scripts/check-select-zoom.mjs --output <report.json>` covers the shipped
Tooltip code and CSS through all17 levels, three sides, two alignments and two viewport sizes,
plus pinned bubbles during live zoom changes. `--tooltip-baseline 1` excludes the downstream
adapter and must fail the coordinate regression. Source fixtures are separate from actual
native pixels and never qualify guest painting. The adapter is owned by the qualified zoom
lease and restores its styles/listeners on disposal; ordinary browsers and unknown Desktop
versions do not acquire it.
