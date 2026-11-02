# Bot folders in the DSH Session list

## Sub-features

- `folders` adds one DeepSeekBot product section, with Bot/persona subgroups containing explicitly owned Orchestrator and Assignment root Sessions across different cwd values.
- `collapse` independently folds the product section and Bot subgroups and preserves both choices in Client preferences. Headers reuse the Channel sidebar PanelHeader.
- `icon` uses the existing user-configured Bot icon in place of the outer section's chevron. Each Bot subgroup uses its own PersonaBot avatar instead of a chevron, reading the same live roster and avatar renderer as the existing Session owner mark.
- `open` opens the exact native Session through UiWorkspace.
- `coexistence` keeps native Workspace membership and ordinary Sessions intact; Bot visibility settings still apply.

## How to get to it (user POV)

Send a DM to a Bot and have it create an Assignment in a granted project. Exit Bot mode with the logo. The native Session tree contains a DeepSeekBot section, then one subgroup per Bot/persona. Expand both levels and choose a Session.

## Driving it with verify-app

Use a task-owned isolated instance that passes doctor. A model is needed to create real execution through the DM path; existing owned history is sufficient to inspect grouping.

- Send a real DM with shot and verify the committed Bot reply through channelMessages.
- Register an isolated project through workspace/create, grant it through grantCreate, and ask the Bot in its DM to create an Assignment there. Read sessions to confirm two root roles and different cwdReference values.
- Run shot with --bot-mode, --click "Exit Bot mode" and --wait Plugins. Inspect the folder and save the screenshot. Choose a Session and confirm its native header opens for the same id.
- Fold a Bot subgroup, then the DeepSeekBot section. Refresh and unfold the section: the Bot subgroup stays folded. Unfold it and repeat after a Host restart with the same isolated home.
- Open Settings, then Bot settings, and change Bot icon. Confirm the outer DeepSeekBot header follows the selected mark, survives reload and still folds when clicked. Restore the previous icon after the check.
- Confirm each Bot subgroup has its own avatar, with no disclosure chevron. Clicking the avatar or header still folds the subgroup. An avatar update follows the live roster without a second settings store.
- Read botSessionIds for explicit group membership. Check the native Workspace snapshot before and after: display grouping does not attach or detach Sessions.
- Run BH_E2E_INSTANCE=.humanlayer/verify/your-name/instance.json node scripts/e2e-bot-session-folders.mjs against the prepared instance. It checks the two roles, groups the visible roots, opens the Assignment and saves light/dark screenshots, collapse and canonical cwd evidence. BH_E2E_RESTART=1 also restarts only that recorded task-owned Host and checks the same browser's saved collapse state.

## Gotchas

Pinned RC2 exposes no additive group Slot. The application adapter mounts an owned portal host inside the native tree using role=tree and data-row-key, and masks duplicate rows only while the replacement is mounted. Search remains native. Treat these DOM attributes as a pinned compatibility boundary: verify it against the running shell after a DSH update. Unsupported markup must leave the original list visible.

The first tracer covers grouping, folding and native navigation; it does not yet reuse native per-row menus inside the added folder rows. Native search remains an independent entry point. Do not call the entire Issue complete before Human feedback and the remaining interaction matrix.

A Go quota error does not prove missing credentials. Change only the task's test Bot to an already configured usable model and verify a new real reply. Preserve failed browser-startup attempts before retrying.

Completed Assignments may already be natively archived by the Orchestrator. Explicitly unarchive the test Session through sessionArchiveSet before expecting it in the default native view. An archived fixture is not evidence that grouping dropped an active Session.
