# Selected-Client settings from the CLI and Tob

## Sources

- `packages/client/src/client/{client-settings-control,preference-settings-control,layout-settings-control,shortcut-settings-control}.ts`
- `packages/core/src/bots/cli-client-settings.ts`
- `packages/core/src/appearance/control.ts`

## Terms

- Tob
- Layout mode
- Channel workspace
- Settings

## Sub-features

- `client-preferences-get/set`: reads theme (written only by `appearance-set`), writes the Device Notification Preference per Client and the Host-scoped locale. Enabling notifications never opens the permission prompt and reports pending or denied consent.
- `client-shortcuts-get/set`: stable action ids, effective bindings, set/disable/reset one action, conflict owner, reserved keys.
- `client-layout-get/set`: global Simple/Advanced layout and Subpanel heights, rail, gap, members panel, and one Channel workspace (move, resize, hide/show) or its split tree (nested move, resize, replace, reset) through the mounted Bot mode layout.
- Tob reads without a card; every `-set` waits for the Human's approval card in the Tob DM.

## How to get to it (user POV)

Open Tobs in two browsers and enter Bot mode in both. Run `deepseekbot appearance-clients`, pick one id, read it with a `-get` command, then pipe a patch into the matching `-set` with that revision. The selected browser changes at once; the other does not. Or ask Tob in its DM to change a setting on a named Client and approve its card.

## Driving it with verify-app

Launch and doctor one task-owned Host as in the parent skill, then:

```bash
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-client-settings.mjs
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-client-settings-tob.mjs
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-client-settings-tob.mjs --natural
```

The first journey opens two isolated browser Clients, refuses a theme patch (pointing to `appearance-set`), changes theme through `appearance-set`, a shortcut (then presses it) and layout on one, checks refusals (revision, conflict owner, reserved key, unknown Channel, notification consent), reloads and reads every domain back under the new Client id, checks the old and a missing id refuse, and confirms the second Client is unchanged. It saves light and dark screenshots of each state. The Tob journey starts a typed `tob-cli` request (or, with `--natural`, a real model request) for a shortcut change, clicks **Allow once** on the real card, reads back and presses the new key. `--natural` needs a model credential.

## Gotchas

- A reload or restart gives the Client a new id. The old id may briefly answer `appearance-client-unavailable` before it expires to `appearance-client-stale`.
- The relay holds one request per Client. Polling the same Client while Tob writes makes Tob's write fail with `appearance-client-busy`; wait for the Tob turn to settle before reading.
- Layout is only registered in Bot mode; outside it the command returns `client-settings-unavailable`.
- Headless browsers report notification permission `denied` or `default`; the journey accepts either refusal. Granted-permission enabling is covered by owner tests.
- macOS Desktop restart and physical keyboards are not driven by these journeys.
