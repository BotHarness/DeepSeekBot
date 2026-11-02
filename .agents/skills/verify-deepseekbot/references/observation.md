# Observe a verification failure

Keep the first failure before retrying. Run `node scripts/verify-app.mjs observe --name <n>`
while the failing page is still open. It saves a timestamped JSON file beside the screenshots:
Host health, the latest browser-reported Client attempt, earlier failed attempt IDs and the
bounded diagnostic report. Exit 0 means a healthy Host and an observed ready shell; exit 1
means Host health or Client failure; exit 2 means incomplete Client evidence (unobserved,
starting, stale, closed or unavailable). None proves the feature works.

The command reuses the authenticated local Client diagnostic reader. It does not open a page,
change product state, copy the login URL or read raw Host logs. A closed headless `shot` may
leave a closed or stale attempt; keep a collaborative browser page open to observe a live
attempt. Reports and screenshots are local evidence: review and redact before publishing.

## Place the failure

| Question | Read | What the result establishes |
| --- | --- | --- |
| Is this task's Host healthy? | `node scripts/verify-app.mjs doctor --name <n>` | Recorded PID/worktree/version and authenticated API, not UI readiness |
| Did the Client boot or crash? | `node scripts/verify-app.mjs observe --name <n>` plus the current browser console/DOM | Browser-reported lifecycle and first failure; inspect the actual page separately |
| Did the user action render? | Feature's screenshot, ARIA tree and console; preserve failed steps | Visible result and UI errors, not persistence |
| Did the action commit? | Feature's canonical read through `rpc` or the CLI | Timeline entry, stored Bot, Memory HEAD or other owning state |
| Is the Bot blocked or still working? | `deepseekbot bot-activity <bot>` / `bot-attention <bot>` / `bot-sessions <bot>` | Bounded current activity and pending work; page through cursors where returned |
| Did the model call the tool? | `deepseekbot bot-trace <bot> --turns 1` | Actual calls, refusals and outcomes; separate model choice from runtime failure |
| Does the same tool fail without the model? | `deepseekbot bot-tool`, `browser-tool` or `computer-tool` | Direct tool path with normal permissions; run only the task-authorized action |
| What happened in Browser/Computer? | `deepseekbot browser-observation <bot>` / `computer-diagnostics` / `computer-logs --bot <bot> --limit 100` | Bounded runtime state and process evidence, not a second durable authority |

The [CLI reference](../../../../docs/bot-cli.md) owns command arguments and authentication.
Read the task's private launcher file without echoing its token; use the CLI's token file or
environment support. The [Client startup guide](../../../../docs/dev/guides/client-startup-diagnostics.md)
and [browser qualification loop](../../../../docs/agents/ax-browser.md) handle startup and
browser-control failures. A preview-tool timeout belongs to the control path until actual
product evidence places it elsewhere.

## Finish with bounded claims

For each changed sub-feature record the commit, entry point, environment, preconditions,
action, visible result, canonical read and evidence paths. Use **pass**, **fail** or **untested**
with the reason. A missing credential, unavailable device or provider quota is an unmet
precondition. A successful direct/API path does not qualify the model/UI path. Keep CI,
local runtime, native device, Human QA and deployment results separate.

The shell observer recognizes either the native Bot-mode navigation entry or a visible
`.bh-root.bh-main`. The Window Companion's `.bh-root` alone does not qualify. Before #1947,
entering desktop Bot mode removed the navigation entry and falsely recorded `shell-lost`;
the repaired observer keeps that ordinary transition ready and still records actual loss.
