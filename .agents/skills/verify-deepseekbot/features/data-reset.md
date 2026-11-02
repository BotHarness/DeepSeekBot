# Clear all BotHarness data

## Sub-features

- Settings → Data & privacy → **Clear all BotHarness data** opens a preview of every folder that is deleted (with size and file count) and everything kept: DSH credentials, Memory folders a Human chose, exported files.
- The danger button stays disabled until the second confirmation checkbox is ticked.
- Confirming stops BotHarness writing, records `$DSH_HOME/botharness-reset.json`, restarts the Host and removes the folders while the old process exits. A Host that cannot restart itself finishes at its next start.
- CLI parity: `deepseekbot data-reset-preview` and `data-reset-confirm --confirmation-stdin --confirm`.

## How to get to it (user POV)

Enter Bot mode, open Bot settings, choose **Data & privacy**, then **Clear…** on the last row.

## Driving it with verify-app

1. Launch a disposable Host with `verify-app launch --name <name>` and run `doctor`. Never use a shared or real Host: the confirm step deletes its data.
2. Seed state: create a Bot (`deepseekbot create` or the UI) and note `$DSH_HOME/botharness/bots/<slug>`.
3. `shot reset-preview --bot-mode --click "Bot settings" --click "Data & privacy" --click "Clear…"`. The dialog lists `$DSH_HOME/botharness` under **Will be deleted** and `$DSH_HOME/.credentials.yaml` under **Will be kept**; **Clear and restart** is disabled.
4. Tick **I understand this permanently deletes everything above**, then **Clear and restart**. The dialog says the Host is restarting.
5. Canonical proof: after the relaunch, `$DSH_HOME/botharness-reset.json` is gone, `deepseekbot list` returns only the fresh default Bot, the old Bot folder is gone and `$DSH_HOME/.credentials.yaml` is unchanged.
6. Repeat with the CLI: `deepseekbot data-reset-preview`, then pipe `{"token":"<preview.token>"}` to `data-reset-confirm --confirmation-stdin --confirm`.

## Gotchas

- The `verify-app` launcher only restarts through DSH's `appExit`; when the Host reports `restartable: false` the result is `restart-required` and the folders are removed at the next `launch` on the same `DSH_HOME`.
- `~/.botharness` (the computer driver) is shared by every DSH profile of the OS user; an isolated Host still lists and removes it, so run this journey only where that is acceptable.
- A token is valid for ten minutes and only for the previewed scope; a new Bot or moved Memory folder refuses with `data-reset-preview-stale`.
