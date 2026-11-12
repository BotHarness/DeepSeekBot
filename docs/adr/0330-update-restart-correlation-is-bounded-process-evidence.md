---
Status: Accepted
Date: 2026-11-13
Issues: [#4057](https://github.com/BotHarness/DeepSeekBot/issues/4057)
---

# Update restart correlation is bounded process evidence

Update runs are application-defined process-local views of the native Plugin Manager operation.
Their command output must not become durable diagnostic data. A new Host cannot infer the previous
process's exit or installation success merely from starting.

## Decision

The application-defined Update Lifecycle diagnostic owner observes changed release Update Run
phases and the existing Release Service's approved restart request. It records only the stable
update ID, validated old/target versions, enumerated phase, timestamp and PID through the existing
DiagnosticEvents recorder. It never receives command output, argv, environment or failure text.
Duplicate phase observations do no additional disk work; the existing four-run retention also
bounds phase deduplication memory.

The same owner atomically replaces one private, schema-versioned correlation marker per Profile
under `$DSH_HOME/botharness/diagnostics/<hashed-profile>/update-correlation.json`. The marker is
at most 4 KiB when read, expires after seven days, and is consumed on the next operational database
startup observation in a different PID. A same-PID observation retains the marker for a later
process replacement, subject to the original expiry. Invalid/expired records are discarded with a fixed diagnostic code; unreadable
records report unavailable evidence. A failed write records `correlation-write-failed` and does not
change install/cancel/restart behavior. A `.tmp` staging file is overwritten on the next write and
is never accepted as evidence. There is no schema migration or business-state recovery from it.

Startup records `startup-observed`, joined to the database startup `mountId`, with the previous
phase and running version. This means startup was observed, not that Core became ready. The
database's own ready/recovery evidence owns that conclusion. Different PIDs establish different
processes; an equal PID remains `same-pid-unknown` because of reuse and same-process Fiber remounts.
Previous process exit always remains unknown. An interrupted install/apply/restart remains unknown,
even when the target version is observed. A directly observed installed/failed/cancelled outcome
remains separately identified as such.

The native restarter retains its existing timers, exit/relaunch ownership and error handling.
An error-monitor listener observes spawn failure without swallowing its native error. The Release
Service still owns pending-release lookup, compatibility, confirmation and restart eligibility;
the marker is never read by those decisions. Plugin-only updates remain outside this release
correlation slice.

Existing diagnostic log listing/export and bug-report packages include the same `release-update`
rows online and offline without a new route, command or store authority. Retention, export limits,
and recorder evidence-loss limits continue to apply. A marker can recover the last observation,
not recreate missing earlier log rows or prove a clean shutdown.

## Verification and performance

Focused tests exercise real diagnostic SQLite writes and update-run transitions with controlled
installer outcomes. Real isolated Host startup and CLI exports separately qualify runtime wiring;
fixture results are never evidence of a real package installation. Added work is confined to
changed release phases: one small synchronous atomic file replacement and one bounded diagnostic
row per transition, plus one bounded marker read at startup. Repeated progress/log chunks do not
write repeated phase summaries. No message, render or model hot path changes.
