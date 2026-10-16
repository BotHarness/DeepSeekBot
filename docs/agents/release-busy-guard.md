# Safe release requests — #1932 first slice

The existing authenticated `releaseInstall` / `releaseRestart` bridge methods remain the
application-defined release Service entrance. Web Settings and the `deepseekbot` CLI use the
same owner; confirmation is not permission to interrupt work.

## Activity and refusal

- The pinned DSH `0.2.0-rc.2` Agent Registry lists all live Agents, including non-PersonaBot
  Agents. A running Agent or nonempty next-turn/next-step Inbox is busy.
- Public `idle` status can hide native maintenance such as compaction. Each otherwise-idle
  Agent must synchronously admit a no-op through native `runMaintenance`; existing maintenance
  refuses admission. The no-op touches no Session data and settles at the next microtask.
  Preflight always yields before the next check, including a cached installed version. This
  short native gate is not held for the download or shutdown lifetime.
- The DSH Job Registry lists unowned Jobs when called without an owner. The guard also reads
  each live Agent's Jobs; running or stopping Jobs block the request. Terminal Jobs do not.
- Missing activity services, unexpected statuses or probe exceptions fail closed with
  `activity-unavailable`. No task names, Session IDs, paths or probe errors cross the release API.
- `busy` and `activity-unavailable` are normal failed release results. The CLI exits nonzero
  with `release-busy` / `release-activity-unavailable`; Web preserves the reason, offers explicit
  retry, and suppresses manual install/restart fallback instructions for these refusals.
- Async Profile preflight is followed by a fresh synchronous check immediately before dispatch.
  The process restarter checks again after its 300 ms delay, before registering relaunch hooks
  or invoking `appExit`. Refusal releases its latch, leaves the installed update pending, and
  requires another explicit request. It never waits for idle and retries automatically.
- Release install and restart cannot overlap through this Service. Existing same-request
  installation coalescing is retained. Activity checks and locks are process-local, not persisted.
- Bounded `release-change` developer logs record explicit-request initiation, operation, refusal
  phase/reason and elapsed milliseconds through the existing Host logger. They contain no task
  identifiers, messages, paths or probe exception text, and are not telemetry or durable authority.

This slice is **not** a universal maintenance/drain protocol: it does not freeze new Agent/Job
admission during package download or asynchronous Host teardown, inspect arbitrary OS processes,
control another Host, or intercept manual Plugin Manager/terminal/Desktop actions. The pinned
Plugin Manager stages updates of an already-installed Bundle as `restart-required`; this guard
does not add hot activation. Work that starts after admission and before a future restart must
be checked again at that restart. No upgrade, data-migration or installed-pair qualification is
claimed by source tests. #1931 and the rest of #1932 acceptance remain open.

## Verification path

1. Follow shared-device QA ownership before starting or changing a Host. Use a disposable
   installed Profile and an exact qualified package pair for an actual upgrade, never a shared
   working Profile. Do not install a package or trigger a real restart without that QA window.
2. While a real Agent turn, approval wait, queued input or background Job is active, request
   installation and restart via Web and the CLI with `--confirm`. Expect `busy`, unchanged
   running version and no interrupted task. Record authentication and exact source/package IDs.
3. Restore idle state. An explicit retry may proceed; the earlier refused request must not.
   Exercise work arriving during preflight and restart delay, plus unavailable activity services.
4. Capture matched Settings before/after in light and dark themes, Chinese and English. Busy
   and unknown state show wait/repair/retry guidance, not `Ctrl+C`, manual update commands or
   auto-reload. Retain pending-version guidance after a refused restart.
5. Keep unit/service tests, authenticated HTTP CLI integration, live DSH, installed-pair E2E,
   screenshots and Human QA separate in the PR. No telemetry, OTA, schedule, store distribution,
   paid build or automatic restart is part of this slice.
