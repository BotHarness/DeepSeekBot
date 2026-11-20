# Stopping an Assignment and checking recovery

This guide describes a verified BotHarness workflow on DSH 0.2.0-rc.1. An Assignment is application-defined work in an explicitly owned DSH Session; see [ADR-0045](../../decisions/sessions.md#adr-0045) and the [architecture](../../architecture/botharness-architecture.md) for its authority boundaries.

## Human workflow

1. Authorize a Workspace for the PersonaBot. Ask its Orchestrator to create one Assignment with that Grant and an optional Continuity Key. The default permission snapshot is `workspace-write`.
2. If the Assignment is awaiting a tool approval, leave that approval pending. Ask the Orchestrator to inspect the Assignment and call `stop_assignment` with its Session ID.
3. Wait for the tool to confirm `stopped`. A follow-up instruction asking the Assignment to finish is not a stop operation. The pending approval expires, further requests/reports are refused, and the Continuity Key is released.
4. Refresh the Client. The Bot returns to idle when no other owned Session is active. In Activity Center → Overview, choose Show idle Bots to keep the idle Bot visible; the stopped Assignment is not an active Session card.
5. After restarting the Host, the Directory retains the stopped Session and its original permission snapshot, and Channel history still contains the stop confirmation. Reusing the same Grant and released Continuity Key creates a different Assignment Session.

Stopping does not delete the Session, its history, Grant or permission facts. If DSH refuses the stop, the Assignment remains `stopping` and retains its reservation until an explicit stop retry succeeds; do not report success or create replacement work prematurely. Host lifecycle notices and Assignment-authored reports remain separate facts.

## Verified boundaries

| Boundary               | Evidence                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trusted creation       | Actual Orchestrator `create_assignment`, owned Workspace Grant, `workspace-write` snapshot and Continuity Key                                                      |
| Pending approval       | Actual native Shell call (`pwsh` on Windows; `bash` on applicable hosts) waiting for Human authorization                                                           |
| Stop                   | BotHarness `stop_assignment` has a successful result in native Session records; pending Shell has no successful result; approval becomes expired                   |
| Directory and activity | Stopped Session retains permission facts, releases its key, has no post-stop Report observed, and Bot returns to idle                                              |
| Restart                | Old stopped state, permission snapshot and history survive; new Assignment uses the same Grant/key; successful Report result precedes every matching Channel reply |

[Actual screenshots and public proof records](https://github.com/BotHarness/BotHarness/blob/main/docs/assets/pr/81-assignment-stop-recovery/README.md) describe the run. This acceptance verifies a narrow part of [#81](https://github.com/BotHarness/BotHarness/issues/81); it does not close the entire foundation or prove every crash/permission/concurrency scenario.

## Agent reproduction

Boot an isolated Profile with `scripts/dev-instance.mjs`. Set `BH_E2E_ORIGIN` to its loopback URL, `BH_E2E_HOME` to that home, and `BH_E2E_EVIDENCE` to a private evidence directory. The launcher supplies the authenticated cookie file; credentials stay machine-local.

```bash
node scripts/e2e-assignment-stop-recovery.mjs prepare
node scripts/e2e-assignment-stop-recovery.mjs stop
```

Stop that launcher's exact Host PID, then restart the same isolated home using the same worktree and DSH version before running:

```bash
node scripts/e2e-assignment-stop-recovery.mjs restart
```

`pending` verifies an already prepared pending scene without creating another Bot. `capture` recaptures the last phase without model requests. Public records contain only bounded QA identities, safe tool names and outcome flags; raw Session snapshots, tool arguments/results, machine paths, credentials and login URLs are excluded. The script uses the existing authenticated API Gateway, native Session Query and actual UI; it installs no test Plugin or replacement lifecycle.
