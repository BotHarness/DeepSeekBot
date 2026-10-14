# PersonaBot creation and restart persistence

A Human creates a PersonaBot bound to a native Workspace. The Bot gets a DM Channel and a Git Memory Repository, and both survive a Host restart along with the DM history.

## Sub-features

- `workspace` registers a native DSH Workspace that BotHarness lists in its options.
- `create` creates the PersonaBot with a role and Workspace grant.
- `memory` initializes the Bot's Git Memory with an accepted HEAD.
- `restart` keeps the Bot, its DM and the Human message after a Host restart.

## How to get to it (user POV)

- In Bot mode, choose `Create Bot` in the welcome letter, then fill in the form.

## Driving it with verify-app

The scripted journey owns its Host: it launches a fresh instance on a free port, drives the same `/api` calls the Client makes, restarts the Host and stops it.

- **Run.** `pnpm build`, then `node scripts/e2e-personabot-create.mjs --with-dm`. It prints JSON with `"result":"pass"` and `workspaceCreated`, `personaBotCreated`, `persistedAfterRestart`, `gitMemoryReady` and `dmHistoryAfterRestart` all `true`. CI runs this journey on every pull request that changes code.
- **UI.** The creation form is not mapped yet; this journey proves the API path only.

## Gotchas

- The journey needs no model credential.
- It uses its own temporary `DSH_HOME`, so it never touches a `verify-app` instance.
