# Workspace request: approve read/write and continue the original file task

## Sub-features

- Behavior ID: `desktop.grants.request-write-continue`.
- Web request-card approval and online CLI share the Owner-only Host command.
- New directory and explicitly upgraded legacy Grant become persistently writable.
- A real model continues the original task: Orchestrator native write plus one Assignment native write in its selected Grant.
- Duplicate approval does not create another Grant or continuation. Permission/resolution rollback and stale refusals have production-owner regression coverage.

## How to get to it (user POV)

Bot mode → Channels → the dedicated QA PersonaBot DM → **Messages** in the control rail if Home is still open → its workspace request card → **Allow folder read/write** → navigate the Host directory browser to the synthetic folder → **Authorize workspace**. The card resolves and the original task continues without another Human message. Inspect the two generated files and the Bot's committed completion reply.

For CLI, read the request id from `inbox --category action --bot <id>`, the registered target from `workspace-options`, then run `grant-request-approve <id> --channel <channel> --request <message> --workspace <workspace> --confirm`. The result must include a writable Grant and the canonical request resolution. `bot-tool <id> request_workspace_grant --args-stdin` with a reason and explicit `channel_id` exercises the same request code without the model.

## Driving it with verify-app

Use an isolated, task-owned Host with the current pinned DSH and an available model. The script creates its own temporary directory and synthetic Bot, checks a real model DM, asks for the file task, drives the Web folder confirmation, then reads native files, Grant state, trace and Assignment facts.

```bash
pnpm build
node scripts/verify-app.mjs launch --name ax2080-write
node scripts/verify-app.mjs doctor --name ax2080-write
node scripts/e2e-workspace-request-write.mjs --name ax2080-write
node scripts/e2e-workspace-request-write.mjs --name ax2080-write --legacy
```

The runner saves screenshots, ARIA, console, Client diagnostics, canonical request/Grant state, file bytes and traces under its named verification directory. It prints only the result and evidence location. A failed attempt stays intact. `--resume-report <private-report.json>` resumes a pending synthetic request after a browser-control fix. When the report already contains a committed Grant, it skips approval and only verifies existing files, trace and duplicate-decision readback; it never replays native execution. `--expect-read-only --instance <baseline-instance.json>` records the original failure on a separately launched base checkout.

### Phone: choose the folder from the Host

`node scripts/e2e-mobile-folder-browse-web.mjs` drives the same request card in the Expo Web export of the phone app (behavior `desktop.grants.request-write-continue`). A real model asks for a folder, the phone proxy answers DSH `directoryPicker/list` with `directory-picker/unavailable` as a Windows/macOS system-chooser Host does, and the sheet must still list Host folders through `botharness/folderBrowse`: subfolders only, no files, no hidden folders, plus Home and `/` (drives on Windows) under **Other places**. The sheet names the folder it will grant (**Will authorize: <path>**); choosing **Authorize this folder** then **Allow read/write** must leave a writable Grant on exactly that path. The CLI twin is `deepseekbot folder-browse [<path>]`. This is layout and flow evidence, not native-device evidence.

## Gotchas

- The current desktop uses `.bh-workspace-rail`; older `.bh-mode-sidebar` journeys time out despite a rendered Bot mode. Read the real ARIA/console before attributing that to permissions.
- Windows loopback Hosts normally use the OS directory chooser. A headless browser needs the supported DSH browse composition. This task qualified a loopback-only Host with an exact reserved `.invalid` trusted authority; no public listener or shared Profile was changed. Preserve any native chooser wait as a precondition failure.
- The temporary folder name sorts before bulk `.tmp*` directories so DSH’s bounded directory listing can show it. Directory navigation uses exact visible names, since `Temp` also matches `SquirrelTemp`.
- A stale machine-local AX model selection can be absent from the pinned catalog. Keep that failed launch; select a supported model for only this launch with `BOTHARNESS_AX_MODEL`, then prove a real reply.
- Do not grant the Host Profile directory or its ancestors. This journey uses an isolated synthetic temporary folder and does not resolve broad-Grant exposure of operational data.
- A Grant-linked message alone is insufficient. The native files and current durable write permission must agree.
- Apart from the phone folder-browse slice above, this journey does not qualify mobile, every native Provider, arbitrary Shell isolation, same-Orchestrator non-blocking waits or the full restart recovery matrix. Those remain separate slices.
- After a failed drive run `verify-app observe`, retain its first screenshot/ARIA/console and inspect the [observation guide](../references/observation.md).
