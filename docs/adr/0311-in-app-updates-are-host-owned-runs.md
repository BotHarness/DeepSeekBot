# ADR-0311: In-app updates are Host-owned runs that every surface shares

- Status: Accepted
- Date: 2026-11-09
- Builds on: ADR-0216 (product versions), the Release Service (#1980, #2173) and plugin updates

## Context

Tobs can update itself (`deepseekbot`) and the other `@botharness/*` plugins in place, through the native DSH Plugin Manager. Three surfaces offer the button: the update reminder dialog (which also shows the changelog), **Bot settings → About** and **Bot settings → Plugins**; Tob can also run `release-install`. Each surface called `releaseInstall` or `pluginInstall`, showed "Updating…" until the call returned, and on failure showed the last 2,000 characters of pnpm output. A slow registry looked like a hang, the Human could not see which command was running or what it printed, and could not stop it.

DSH's own Plugins page does better. The Plugin Manager (DSH 0.2.2) takes a `requestId` on `installBundle`, streams every pnpm run as `plugin-manager/install-log` chunks (command line, stdout and stderr, exit code) and its phases as `plugin-manager/install-state` (`installing` per registry attempt, `cancelling`, `applying`), all named by that id. `cancelInstall(requestId)` stops pnpm and restores `package.json` and the lockfile, or answers `too-late` once the bundle is being applied.

## Decision

**One Host module owns update runs.** `createUpdateRuns` (`packages/core/src/release/update-runs.ts`) is shared by the Release Service and the plugin update service. Every install is one run with a request id: the services pass that id to `installBundle`, and the Host's `plugin-manager/install-log` and `install-state` listeners fold the matching events into the run. A run records its target, phase (`checking`, `installing`, `cancelling`, `applying`, `installed`, `failed`, `cancelled`), the current registry attempt, each command with a bounded output tail (32,000 characters per command, 24 commands, ANSI codes removed) and its exit code, and the outcome. One run is active at a time across Tobs and its plugins; a repeated request for the same release joins the running one, anything else is refused as before. The last four runs are kept in memory only; the install answer and the Plugin Manager's own log file stay the durable evidence.

**The run owns cancellation.** Before pnpm starts, cancelling marks the run and the service returns `cancelled` before its first effect. While pnpm runs, the module calls `cancelInstall`; between registry fallbacks the mark stops the next attempt. `too-late` and a DSH without `cancelInstall` are reported, not hidden. A cancelled install is a new failure reason, `cancelled`, which surfaces treat as "nothing changed" rather than as an error.

**Clients follow the run by polling the existing bridge.** `releaseInstall` and `pluginInstall` accept an optional `requestId`; `updateRun` reads a run (by id, else the active or latest one) and `updateCancel` stops it. The Client's `UpdateRunsController` is created once per Client and shared by the three surfaces: it generates the id, starts the install, polls `updateRun` every 600 ms until the install answers, and reads once more for the final output. When a surface mounts it picks up a run started elsewhere (another tab, Tob, the CLI). `UpdateRunPanel` is the one view: steps, status, the commands with output and exit codes, the failure reason and log path, and **Stop**.

Polling was chosen over a new live stream: an install lasts seconds to minutes, the run is small, the existing bridge already authenticates both the Web Client and the CLI, and an old Host without `updateRun` still answers the install, which the Client then shows without a log.

## Consequences

- The CLI gets `update-status` and `update-cancel` against the same module (CLI parity); `release-install` and `plugin-install` from the CLI or Tob are visible in the panel while they run.
- Phones are unaffected; they do not offer in-app updates.
- On DSH versions before 0.2.2 the Plugin Manager ignores the request id: the panel shows the steps and the outcome without commands, and Stop answers "unsupported" once pnpm is running.
- The in-memory run is lost when the Host restarts, which an applied release does on purpose; the Client then reloads into the new version.
