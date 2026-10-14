# PersonaBot creation and restart persistence

A Human creates a PersonaBot bound to a native Workspace. The Bot gets a DM Channel and a Git Memory Repository, and both survive a Host restart along with the DM history.

## Sub-features

- `workspace` registers a native DSH Workspace that BotHarness lists in its options.
- `create` creates the PersonaBot with a role and Workspace grant.
- `memory` initializes the Bot's Git Memory with an accepted HEAD.
- `restart` keeps the Bot, its DM and the Human message after a Host restart.
- `memory-location` stores a blank Bot's Memory in `<chosen folder>/<bot id>` when the Human picks an existing folder under Advanced settings.
- `memory-move` moves an existing Bot's Memory to `<chosen folder>/<bot id>`, or back to the default, from the Memory Repository row of Workspace Grants; the next DM runs in a new main session there.

## How to get to it (user POV)

- In Bot mode, choose `Create Bot` in the welcome letter, then fill in the form.

## Driving it with verify-app

The scripted journey owns its Host: it launches a fresh instance on a free port, drives the same `/api` calls the Client makes, restarts the Host and stops it.

- **Run.** `pnpm build`, then `node scripts/e2e-personabot-create.mjs --with-dm`. It prints JSON with `"result":"pass"` and `workspaceCreated`, `personaBotCreated`, `persistedAfterRestart`, `gitMemoryReady` and `dmHistoryAfterRestart` all `true`. CI runs this journey on every pull request that changes code.
- **UI.** The rest of the creation form is not mapped yet; the scripted journey proves the API path only.
- **Memory location.** Make an empty folder on the Host, then `shot <label> --bot-mode --click "New" --click "Create Bot" --fill "Name=Ada" --click "Advanced settings" --fill "Memory location=<folder>" --click "Create" --wait-text "Hi, I'm Ada"`. Proof: `<folder>/<bot id>` is a Git repository, and `rpc botharness/get '{"slug":"<bot id>"}'` reports that path as `memoryDir`. A folder that does not exist shows the inline refusal instead.
- **Memory move.** Send one DM first so the Bot has a main session. Make an empty folder on the Host, then `shot <label> --bot-mode --click-text Ada --click "Workspace Grants · Ada · 0 workspaces" --click-text "Memory Repository" --fill "New Memory location=<folder>" --click "Move Memory" --wait-text "<folder>/<bot id>"`. Proof: `git -C <folder>/<bot id> rev-parse HEAD` matches the HEAD before the move, the old folder is gone, `rpc botharness/get` reports the new `memoryDir`, and after the next DM `rpc botharness/botSessionIds '{}'` lists a second session whose `cwd` (in `<DSH_HOME>/storages/session_projcache/sessions/<id>.json`) is the new folder. `deepseekbot memory-move <bot id> --default-location` moves it back. The turn may fail for lack of model credit; the move is still provable.

## Gotchas

- The journey needs no model credential.
- `--locale zh` does not switch the Client language on a fresh Profile; read accessible names from the English UI.
- It uses its own temporary `DSH_HOME`, so it never touches a `verify-app` instance.
