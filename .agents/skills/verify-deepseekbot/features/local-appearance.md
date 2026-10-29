# DeepSeekBot device-local appearance (T1)

## Sub-features

- Theme cards (Follow system / Light / Dark) with mini previews; palette cards apply one preset to both modes; a Primary override is still saved separately for each mode.
- DeepSeekBot roots, workspace, owned modal and menu palettes are scoped; native DSH mode and preferences are unchanged.
- Web browser/site persistence; Desktop application persistence without Host keys. Same-site tabs share storage; other browser profiles and Desktop are independent.
- Explicit Client-targeted `appearance-clients`, `appearance-get`, `appearance-set`; same owner, revision conflicts and coded storage/delivery failures.

## How to get to it (user POV)

Enter Bot mode, choose the visible control rail's **Bot settings**, then **Appearance**. Pick a **Theme** card, a **Colors** card, and each **Primary color** swatch. Exit Bot mode and compare native DSH. Return and reopen the settings.

## Driving it with verify-app

Launch and doctor one task-owned instance as in the parent skill. Run:

```bash
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-local-appearance.mjs
```

The journey uses a private browser profile, handles English/Chinese startup prompts, changes the visible theme and palette controls, checks computed modal/menu scheme, reloads, uses the actual CLI executable to read/write the selected Client, checks another isolated browser context remains unchanged, verifies revision/stale-target refusals, then exits/re-enters and changes the system preference. It saves screenshots, ARIA, local canonical configuration, native style/mode and page errors in a unique attempt directory. It does not call a model.

For native macOS, use a task-owned official Desktop process with separate `DSH_HOME`, `--user-data-dir`, renderer debug port and main inspector. Confirm these paths through the main process before input. Open the visible control rail's Bot settings; record `dsh-app://app/`, the independent key and computed modal/menu scheme. Use the native Host's login token only through local environment/file input for the same CLI operations. Flush task-owned storage, restart the same app user directory and reread. Restart into a second isolated linked Host Profile using that same app user directory and reread again; record this as a different-Host restart, not an interactive connection-switch UI test. Keep original and replacement Profile data task-local. Never operate another task's Desktop window.

Canonical storage is `botharness:appearance:v1`; CLI success is an accepted local snapshot, not Host persistence. Check native DSH theme before and after, and inspect console/errors. On storage failure the UI must report failure and retain the accepted configuration. Source tests cover unavailable/malformed storage, unknown future fields, Client leases and disposal; report runtime branches separately.

## Gotchas

- A native hidden sidebar retains another **Bot settings** button. Scope it to `.bh-workspace-rail` or use visible-role locators.
- Native menus expose `menuitem`, not `menuitemradio`. Theme text and button share a name; target the button role.
- Reload assigns a new Client id. Old delivery leases may remain briefly in discovery, but writes never fall back or broadcast. Re-read discovery and select the correct target explicitly.
- A delivered CLI timeout can have an unknown outcome. Read the target before retrying; do not automatically replay a write.
- The baseline `verify-app shot` may miss a Chinese preview dialog; preserve failure evidence and use the journey's language override and bilingual prompt handling.
- Wallpaper, opacity/blur, other presets and per-panel colors belong to later slices. Human QA remains a separate gate.
