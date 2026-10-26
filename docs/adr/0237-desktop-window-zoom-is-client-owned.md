# Desktop whole-window zoom is Client-owned

- Status: Accepted direction; controlled S1 implementation, native qualification pending
- Date: 2026-10-19
- Tracking: [#2245](https://github.com/BotHarness/DeepSeekBot/issues/2245), [S1 #2268](https://github.com/BotHarness/DeepSeekBot/issues/2268)

The application-defined WindowZoom owner keeps device-local defaults and the current primary
window level in one versioned document on the stable `dsh-app://app` origin. Settings, shortcut
commands and directly targeted CLI requests consume that owner. Integer levels -8 through 8 map
to `1.2 ** level`. Changing the default also applies it to the current window; an ordinary step
changes only the current level. Reset uses the saved default. Failed persistence refuses the
operation before presentation; a presentation failure after commit is reported separately.
Malformed storage is retained rather than silently overwritten.

The qualified S1 shell has one primary product window. Its persistent identity is `primary`,
independent of the ephemeral delivery Client ID or Host process/port. This does not promise
multiple-window identity or cross-device synchronization. A later shell exposing multiple
product windows needs a new qualified identity contract before this owner can serve it.

## Native boundaries and downstream composition

Root CSS zoom scales the Client document and embedded surfaces. It does not change native
BrowserWindow zoom, guest-native page zoom or the user's manual font settings. The supported
shortcut Registry remains the single input router, including native forwarding from frames and
webviews. Do not add a competing global DOM listener or synthesize input from an observer.

Bot-mode Dockview overlays and splitters must convert viewport measurements back to local
CSS layout units using the effective CSS zoom. The repository pins a local pnpm patch for
Dockview 8.4.1's ESM and CommonJS package entry points; the Client bundles that patched code.
It adjusts overlay geometry and splitter deltas without changing panel ownership, persistence,
minimum constraints or DOM parentage. No DSH source or installed shell is changed. The patch
must be requalified when Dockview is upgraded; restoring the unpatched package reintroduces
panel overlap whenever root CSS zoom differs from one.

The macOS native traffic-light footprint remains 88×40 viewport pixels independently of
Client zoom. The workspace chrome owner converts its measured intersection with each group
back to local header padding, updates on zoom/layout/fullscreen changes, and places a rail
under that native footprint. Fullscreen and non-macOS shells reserve no corner. This is
presentation geometry, not a new layout preference or a native-shell modification.

The pinned DSH theme owns fixed Cmd+=/Cmd+- font commands. The downstream compatibility
generator copies the exact MIT-licensed npm theme artifact, preserves its license, validates
its version and hashes, and changes only its font-shortcut Fiber ownership and portable ESM
schema import. The generated package replaces the theme through native Profile composition;
it is not an additional theme Provider and does not modify an installed ASAR. A lease removes
only that owned font Fiber while WindowZoom is mounted. Disposal removes application commands
before restoring the original font scope. Other theme behavior and manual font controls remain.

The product build includes the generated theme under `deepseekbot/desktop-theme`, retaining
its native package identity, styles, locales, types and MIT license. Its only Host import is
rewritten to the product's bundled ESM schema module through a relative path. No local machine
path or postinstall script is required. Both Bundle patches leave the original `ui-theme`
Loader row, settings namespace and Profile Patch ownership unchanged. The explicit product
command `deepseekbot-zoom-setup enable --home <home> --profile desktop --desktop-app <app>`
requires the target Desktop to be closed. It uses that app's bundled pnpm with scripts disabled
and holds the native `package.json.lock` writer lock while adding one Profile-local link.
It checks the running process list before and after package changes, refuses a running target
Host, and never stops another application's process. Keep Desktop closed for the complete
transaction. Native plugin management remains the ordinary Bundle installation path: its
installation-first Bundle lookup rejects this same-name plain-library override, and the DSH
CLI refuses the managed Desktop Profile. Those observed refusals are preserved; the downstream
offline installer is explicit additional opt-in, not an automatic product install hook.
The Windows candidate uses the same explicit offline transaction and lease. It reads the
selected executable's `FileVersion` (which retains the RC suffix), locates its bundled pnpm
under `resources/runtime/primary-runtime/dependencies`, and queries Windows processes with
CIM before and after the transaction. Any process of the selected executable prevents setup;
the installer never stops it. Windows junctions must resolve to the product-owned theme,
and a macOS-only payload is refused. Writer-lock cleanup compares file identity and leaves
another writer's replacement intact. Windows native qualification remains a separate gate in
[#2270](https://github.com/BotHarness/DeepSeekBot/issues/2270); candidate activation is not a
claim that its full matrix has passed.
It refuses Linux, an app release other than 0.2.1-rc.2, other theme overrides,
unqualified artifacts and the obsolete grouped composition. Restart the Host/Desktop after
setup; configuration success is not a runtime qualification claim. This opt-in is additional
to ordinary product installation. Disable it before uninstalling the product; disable removes
only its declared dependency and any exact owned symlink left by pnpm, retaining native font
preferences and the original theme row. A relative Profile link follows product upgrades,
which still require requalification. Removing the Bundle alone does not remove the installed
Profile override; the explicit disable command restores native package resolution.
Build generation refuses unknown source versions or hashes before writing output.

The marker is an application-defined capability, not a public DSH API or an automatic probe of
the running executable's version. macOS 0.2.1-rc.2 Desktop with the matching Host/Client release
is the qualified combination. The composed Host release is a selection guard, not an
independent executable-version attestation; remote Hosts and other shell versions need their
own qualification. An SDK version alone is insufficient.
The qualified macOS reset command defaults to Cmd+0 and restores the saved device default,
which may differ from 100%. Existing explicit assignments or unbinding keep native precedence.
The current native protocol rejects numberpad codes. In
[#2318](https://github.com/BotHarness/DeepSeekBot/issues/2318), the Human confirmed default reset
as the delivery scope and retained numberpad support as an explicit pinned-version limitation.
Neither a Client-only key substitution nor a competing input router is introduced.

The Windows candidate requires the real shell's `win32` marker, the exact boot release and a
platform-matching `windows` lease before mounting. The native Shortcut Service identifies its
platform as `windows`, independently of the shell marker. Its defaults use `primary` with
Equal, Shift+Equal, Minus and Digit0, producing Ctrl shortcuts and resetting to the saved
default. Explicit assignments and unbinding retain the native precedence. No Windows corner
reservation or alternate input listener is introduced. Numberpad codes remain outside the
pinned native protocol; disclose that limitation instead of inventing another route.

## CLI and lifecycle

The authenticated existing API Gateway route relays requests to an explicit live Client. It
stores only ephemeral leases and one pending delivery per Client, never zoom preferences.
Mutation requests carry the revision observed by the caller. Expired, offline, busy and stale
requests fail with codes. No window is implicitly selected. Delivery timeouts/cancellation can
have an unknown write outcome; callers re-read rather than automatically replaying mutations.
The Client's normal reconnection renews the delivery channel only.

Visibility changes reapply the latest saved level without saving another revision. This is
state reconciliation, not proof of native guest painting. The original guest must recover on
ordinary foreground restoration at unchanged window geometry, retaining input and navigation
identity. Reloading, recreating guests, periodically toggling CSS or forcing fullscreen is not
an accepted production remedy. Failure blocks qualification of that desktop combination.

## Alternatives and validation

Browser-native zoom is retained in ordinary Web Clients. Rebinding upstream font commands,
patching the installed executable, maintaining a Host-side settings copy, and a second keyboard
router would introduce ownership or compatibility conflicts and are excluded.

Source tests cover state/refusal and cleanup, with real pinned shortcut normalization. Live
CLI read/set/default/reset has reached the isolated desktop owner. Source tests and loaded
shells do not qualify native input, visual restoration, true process restart, extreme layouts,
Human QA or Windows/Linux. Those remain explicit issue/PR gates until measured.

The copied Client exposes its zoom lease only when the actual `__DSH_BOOT__.release.version`
is 0.2.1-rc.2. Unknown/missing releases retain the font-key scope and expose no zoom capability.
This runtime guard does not remove an already installed Profile package override or qualify
that copied theme on another Host. Disable the override before switching outside the verified
Desktop/Host/Client tuple; re-enable only after qualifying the new combination.

## 2026-10-24 admission correction (#2713)

The exact Desktop release checks above are superseded. Optional setup and the Client lease now check adapter protocol 1, platform, ownership and generated file integrity; the runtime release string is diagnostic information only. The theme converter still rejects unknown source bytes/import shapes because its transformation targets specific code, but identical code in a differently labelled release is admissible. Native interaction qualification remains separate from installation admission. This follows [ADR-0087’s current admission policy](0087-dsh-compatibility-is-a-semver-range-with-a-verified-floor.md).

## Default Bundle activation (#2775)

This supersedes the opt-in activation instructions above. Both product Bundle patches insert the product-carried theme as the final Loader row with the existing `ui-theme` id. Cordis EntryGroup selects the last row for an id; only one theme Fiber starts. Later Profile/Home patches still target that id, preserving native appearance and font preferences. After removing the product Bundle and restarting Desktop, the original upstream row becomes effective again. Hot replacement is not qualified. The copied theme retains its native module identity, license and hash-qualified shortcut lease. No installed shell, Profile dependency or postinstall hook is changed.

The packaged Tobs entry also carries the portable schema module required by its theme; relative paths resolve within each product package. The compatibility lease is still native macOS/Windows only. Ordinary Web retains native browser zoom, and Linux remains outside this implementation. Existing manually enabled Profile links can remain during upgrade, but must still be removed using the old disable command before removing their target product. Fresh installs need no such link. Native platform/input qualification is separate from the default composition and is recorded in #2775.

## Default Bundle activation withdrawn (#2788)

The default activation above is withdrawn. A Bundle cannot rename a native row, so the inserted `ui-theme` row coexisted with the upstream row. The Loader started the last row, while DSH 0.2.1-rc.3 native Settings resolved the first row when it checked a Profile write. Every appearance, font size and font family write was rejected as overridden, and the theme Client silently restored the stored preference. Both product Bundle patches again leave the original `ui-theme` row as the only row with that id. Zoom compatibility returns to the explicit Profile-local link from `deepseekbot-zoom-setup enable`; the product still carries the generated theme and its portable schema module for that command. Default activation may return only through a composition that keeps one `ui-theme` row and passes a native Settings write.
