# Selected-Client control decisions

Why the CLI and Tob change one selected Client's own settings the way they do. How it works lives in [the architecture](../architecture/botharness-architecture.md); terms live in [`GLOSSARY.md`](../../GLOSSARY.md). Each section states the current decision, the reasons a reader cannot get from the code, and what enforces it.

## 1. One relay, one registry, three settings domains

_Issues [#4831](https://github.com/BotHarness/DeepSeekBot/issues/4831), [#4832](https://github.com/BotHarness/DeepSeekBot/issues/4832), [#4833](https://github.com/BotHarness/DeepSeekBot/issues/4833). Builds on [ADR-0236](desktop-ui.md#adr-0236), [ADR-0253](connections.md#adr-0253) and [ADR-0314](tob.md#adr-0314)._

Theme, notifications, layout and shortcuts are owned by the Client that shows them, in that Client's own storage. A Host write cannot say which Client changed, and copying these values to the Host would create a second owner. So every command reaches one explicitly selected Client through the existing Client control relay (`/api/botharness/appearance-control`), and the Client's existing owner performs the change.

- **Discover and bind.** `appearance-clients` lists the registered Clients (`id`, `platform`). The caller picks one `--client-id`; there is no default, broadcast, inferred target or offline queue. A reload or restart registers a new id, so a caller reads the list again and never reuses an old id. A missing id is `appearance-client-stale`; a Client that is registered but not polling is `appearance-client-unavailable`.
- **One relay field.** The relay carries `settings: { domain, patch? }` next to its existing appearance, wallpaper, notification, Host look and connection fields, with the same exclusivity, eight-second cap and one-pending-request rule. A settings request must carry the caller's absolute `expiresAt`; a write must carry `expectedRevision`. Refusals keep the Client's message (at most 300 characters), so a conflict can name its owner.
- **One registry on the Client.** `clientSettings` maps `preferences`, `layout` and `shortcuts` to the owner adapters that are mounted right now. An adapter that is not mounted (for example, layout outside Bot mode) is `client-settings-unavailable`. Each adapter computes a content revision, rereads its owner before a write, refuses a different revision with `client-settings-revision-conflict`, and checks the deadline again immediately before it persists. Success returns the fresh read.
- **Six commands.** `client-<domain>-get` reads; `client-<domain>-set --expected-revision <r> --patch-stdin` writes. Reads are on the Tob broker read list; every `-set` waits for the Human's approval card. A lost or timed-out write reply is `client-settings-outcome-unknown`: read the same Client before retrying.

Why: the relay already gives one exact, authenticated, short-lived delivery per Client and is used by appearance, wallpaper, notifications, Host looks and connections. A second transport, or three per-feature relay fields, would repeat its targeting, deadline and refusal rules. Splitting get and set keeps Tob's reads free of cards without teaching the broker about flags.

Enforced by: `client-settings-relay.test.ts` (targeting, revision and deadline refusals, message passthrough, CLI shape, broker read list), `preference-settings-control.test.ts` (registry and end-to-end relay).

## 2. Preferences: notifications are per Client; locale is per Host; theme stays with appearance-set

_Issue [#4831](https://github.com/BotHarness/DeepSeekBot/issues/4831)._

The `preferences` domain reads three values through their existing owners and writes two of them:

- `theme` (`system`, `light`, `dark`) is read from `Appearance`, stored in that Client's `botharness:appearance:v1`, so a caller sees every preference in one read. It is not written here: `appearance-set` with `{"preference"}` already writes it through the same owner and revision, and two commands for one value would split the approval and refusal paths. The read says `writeWith: "appearance-set"`, and a `theme` key in the patch refuses `client-settings-invalid-input` with a message naming `appearance-set`.
- `notifications.enabled` through `DesktopNotificationPrefs`, stored in that Client's `botharness.desktopNotifications`. The command never opens the browser or OS permission prompt: consent belongs to the Human at that device. Turning alerts on with permission `default` refuses `notification-permission-pending`; with `denied` it refuses `notification-permission-denied`; without the API it refuses `notification-unsupported`. Nothing is stored in those cases, and the read shows `permission` and whether alerts are `active`.
- `locale` through the DSH `LocaleRuntime` of the selected Client. DSH stores an explicit language choice in the Host's settings so it follows the Human to every browser on that Host. The read therefore marks it `scope: "host"`: changing it from one Client changes every Client of that Host. It is offered here because the Client's runtime is the only owner that validates the language list and applies it at once.

Remaining Client-local preferences without a selected-Client command are recorded in `scripts/cli-ui-inventory.json` under `client-preferences`: composer footer, DM action and trace display, file opening and activity indicator.

Enforced by: `preference-settings-control.test.ts`.

## 3. Layout: the mounted Bot mode layout is the only writer

_Issue [#4832](https://github.com/BotHarness/DeepSeekBot/issues/4832)._

The `layout` domain is registered by the Bot-mode `ChannelDock` while it is mounted, and applies a patch through the same setters its own controls use: the Layout mode (Simple or Advanced) and the Side column, the rail order and hidden controls, and one Channel's workspace (`open`, `direction`, `ratio`). It then saves through its existing save path, so storage, migration and backups behave exactly as for a UI change. Ranges are the ones the Bot mode layout already clamps to (Channel ratio 0.2–0.8, Subpanel column width 0.2–0.6), so a reload never rewrites the value and changes the revision. Editing a Channel that is not active does not switch to it; other Channels and parked panel positions are left alone. A Channel must be known to the conversation store or the Bot mode layout (`layout-channel-unknown`).

Layout mode stays a device-local choice owned by the Client layout owner, as [onboarding](onboarding.md) describes. This command does not add a second owner or a Host copy: the relay only delivers the Human-approved patch to that one Client, whose owner applies it the same way as Bot Settings → Appearance, so switching keeps each mode's own arrangement. This amends onboarding's earlier "no Host route or CLI command" for Layout mode to this selected-Client path only.

Why: localStorage edits behind a mounted Bot mode layout would be overwritten by its next save and would not show until reload. Outside Bot mode there is no Bot mode layout to apply the change, so the command refuses instead of writing storage. Split trees, the members panel, gap and per-panel heights have no patch shape yet and stay in `scripts/cli-ui-inventory.json` under `client-layout`.

Enforced by: `layout-settings-control.test.ts` (patch rules, revision, unknown Channel, legacy layout migration and reload), `simple-side-column.test.tsx` (writes through the mounted Bot mode layout without switching the active Channel, and a Layout mode switch keeps the saved Advanced arrangement exactly as the UI toggle does).

## 4. Shortcuts: set, disable or reset one action, never take another's key

_Issue [#4833](https://github.com/BotHarness/DeepSeekBot/issues/4833)._

The `shortcuts` domain uses the existing `ShortcutBindings` owner. A patch names exactly one stable action id and either sets a binding, disables it (`null`, persisted as `null` under `botharness.shortcuts`) or resets it to the default. The owner rereads storage first, so a change from another tab is a revision conflict rather than a lost write. A binding held by another action refuses `shortcut-conflict` and names that action; the CLI never moves or clears the other binding. Reserved editing and system keys refuse `shortcut-reserved`. After persisting, the owner rereads storage and refuses `client-settings-storage-unavailable` if the write did not stick. A disabled quick switcher does not fall back to the legacy Cmd/Ctrl+K. IME composition and editable-field rules are unchanged because matching still goes through the same owner.

Why: taking a key from another action would silently break a binding the Human chose. Stored `null` keeps "disabled" distinct from "default" across reloads.

Enforced by: `shortcut-settings-control.test.ts`, `shortcut-bindings.property.test.ts` (no sequence of writes leaves two actions on one binding, and reload gives the same map).

## Verification boundaries

`scripts/e2e-client-settings.mjs` runs all three domains on a real Host with two browser Clients, reload read-back and stale/missing targets; `scripts/e2e-client-settings-tob.mjs` runs a Tob DM write through the approval card, model-free or with `--natural` through a live model. macOS Desktop restart and physical-keyboard checks are separate evidence and are not claimed by these scripts.
