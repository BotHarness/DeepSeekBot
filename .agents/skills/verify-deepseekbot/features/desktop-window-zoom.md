# Desktop whole-window zoom

## Sub-features

- S1 (#2268): one primary macOS window, settings/default/reset, owned font-shortcut handoff, device-local persistence and exact-target CLI.
- S2 (#2269): full focus, composition, recording, extreme-level and compatibility lifecycle matrix.
- S3 (#2270): Windows/Linux native qualification and multiple windows where supported.

## How to get to it (user POV)

In the isolated desktop, enter Bot mode → Bot Settings → General → Window zoom.
Set a default, press ordinary Cmd+= once, and press Cmd+0 to reset to the saved default. The sidebar,
settings modal and content must change together while manual font sizes remain unchanged.
New product Bundles activate the carried theme without a separate setup command. The same
`ui-theme` identity preserves native appearance and font settings. Legacy manually enabled
Profiles must remove their old link with `deepseekbot-zoom-setup disable` before uninstalling
its target product. Restart Desktop after changing Bundle composition. Admission uses the
adapter protocol, platform and payload integrity, not an exact release label. Native platform
qualification remains separate. Ordinary Web keeps browser-native zoom.

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
- Browser tabs retain browser-native zoom; Linux remains disabled. Windows qualification is S3.

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

## Windows candidate and native lifecycle (#2270)

Use Node from `.node-version` and the official Windows Desktop FileVersion `0.2.1-rc.2`.
Its numeric ProductVersion omits the prerelease suffix and cannot qualify the executable.
Keep the official executable and ASAR intact. All actions below reuse one explicit root:

```powershell
node scripts/e2e-desktop-zoom-windows.mjs start --root <private-root> --app "<app>/DeepSeek Harness.exe"
node scripts/e2e-desktop-zoom-windows.mjs stop --root <private-root> --app "<app>/DeepSeek Harness.exe"
node scripts/e2e-desktop-zoom-windows.mjs prepare --root <private-root> --app "<app>/DeepSeek Harness.exe" --artifacts <immutable-candidate-directory>
node scripts/e2e-desktop-zoom-windows.mjs enable --root <private-root> --app "<app>/DeepSeek Harness.exe"
node scripts/e2e-desktop-zoom-windows.mjs start --root <private-root> --app "<app>/DeepSeek Harness.exe"
node scripts/e2e-desktop-zoom-windows.mjs status --root <private-root> --app "<app>/DeepSeek Harness.exe"
```

The first start lets the native initializer create the Profile. `prepare` verifies candidate
hashes, installs with the selected app's bundled pnpm and scripts disabled, and adds only the
task QA Bundle for fresh private CLI access metadata. Installation and activation remain
separate. Use the candidate package's own `dist/desktop-zoom-setup.mjs` for formal lifecycle
acceptance. `disable` uses the same explicit root/app flags and runs only after `stop`.
Native shutdown outcome is checked, never retried blindly. A root marker, exact executable,
user-data argument, PID and loopback listener ownership protect other instances. A new boot
rediscovers `DevToolsActivePort`; old CLI access metadata is not an endpoint authority.
The root and its evidence survive shutdown. Keep credentials under the private root's user
ACL on Windows; POSIX mode bits alone do not prove Windows privacy.

Baseline before enable: no zoom target, unchanged fonts and no compatibility marker. After
enable: the real shell marker is `win32`, Shortcut Service platform is `windows`, boot release
is exact, and the lease reports `windows`. Other releases/platforms, platform-mismatched
leases, macOS-only payloads, foreign theme links and running Desktop package transactions
must refuse. Do not fake either platform value. Check native theme identity and font settings.

Save default 120%, set current 144%, retain a real draft and selection, then press Ctrl+0
once. Record handler invocation and storage-write counts separately; an idempotent second
handler can hide behind one write. Repeat Equal, Shift+Equal, Minus and Digit0 from main,
owned same/cross-origin iframe and the real leased Browser webview. Verify IME, recording,
custom binding, explicit conflicts and unbinding through the native input owner. Probe numberpad
codes through the real protocol and disclose refusals. Do not replace native input qualification
with DOM dispatch or a second listener. If a Windows input tool produces an empty physical
`KeyboardEvent.code`, record that tool limitation and obtain real-keyboard proof.

At 83/100/120/144% and 23/430%, check Panel allocations, splitters, anchored controls, wallpaper,
Escape and focus return. Preserve native Windows menus, caption buttons, window drag and
double-click maximize. Windows reserves no macOS 88×40 corner. Record actual DPI; 100/125/150/200%
and cross-monitor moves require their own native results, with unavailable cases untested.

For the independent guest-painting gate, keep RGB rulers, editable input, guest identity and
navigation count. Create/resize while minimized, wait about eight seconds, then restore
normally at unchanged geometry. Inspect whole-window native pixels. DOM visibility, CDP-only
screenshots, refresh, replacement guests, resize jitter and forced fullscreen do not qualify it.
A failure blocks support for that Windows tuple.

Finally use the same root/user-data for a true process exit/cold boot, re-enumerate the CLI
Client and verify current/default zoom, draft, layout, fonts and wallpaper. Exercise candidate
install/enable/disable/upgrade/rollback/removal while closed. Record source SHA, artifact hashes,
Windows build, DPI, focus, counts, native pixels, pass/fail/untested and Human feedback. Windows
results never close the Linux scope of #2270.


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

## Default packaged activation (#2775)

Install the ordinary candidate Bundle and restart native Desktop without running zoom-setup. Check exactly one ui-theme Fiber, preserved appearance and custom font sizes, one change per shortcut, saved default/reset, and unchanged Web behavior. Remove the candidate Bundle and confirm upstream theme restoration. Separately verify an existing manually enabled Profile; retain its old link until explicit cleanup before uninstall. Record Windows/macOS independently; source tests do not qualify native input.
