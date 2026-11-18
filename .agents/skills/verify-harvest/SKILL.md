---
name: verify-harvest
description: Model-check the Bot Inbox harvest (no replay after a side effect, handled only after seen, every pending Admission eventually claimed) with TLA+. Use when a change touches #scheduleHarvest, #checkHarvestReadiness, #claimHarvest, #markAdmissionsSideEffect, #settleHarvestHandled, #settleHarvestFailure or the startup recovery of inbox_admissions in packages/core/src/runtime/bot-runtime.ts, or verification/harvest/.
---

# Verify the Bot Inbox harvest

`verification/harvest/Harvest.tla` models how one Bot's Inbox Admissions move through turn-time harvest ([ADR-0077](../../../docs/adr/0077-turn-time-harvest-consumes-the-ready-attention-set.md)). TLC checks every order of admissions, claims, turns that reach DSH, successes, failures and Host restarts, for three Admissions and up to two restarts.

It checks three rules:

- **NoReplayAfterSideEffect**: an Admission reaches DSH in at most one turn. If this breaks, the Bot answers the same message twice and repeats its tool calls.
- **HandledOnlyAfterSeen**: an Admission is handled only after a turn showed it to the Bot. If this breaks, a message the Bot never saw is marked handled.
- **PendingIsHarvested** (a liveness property, checked under weak fairness): every pending Admission is eventually claimed, including one that arrives while a harvest is running. If this breaks, a mention waits unanswered until something else wakes the Bot.

## When to run it

Run it when a diff touches a function named in the description or a line under Coverage, or changes when the harvest's `finally` runs.

```bash
node scripts/verify-tla.mjs harvest
```

The command downloads TLC 1.7.4 once and checks its pinned sha256. It needs Java 11 or newer on `PATH` (or `JAVA=/path/to/java`). `TLA2TOOLS=/path/to/tla2tools.jar` skips the download. It checks every `.cfg` beside the spec in a few seconds:

- `Harvest.cfg` and `HarvestChart.cfg` are the real code. Every rule must hold.
- Each `HarvestBroken*.cfg` turns one guard off. Its `\* expect:` line names the rule that must break. If one of these passes, the model can no longer see that guard.

## Reading a failure

For an invariant, TLC prints the states that lead to the bad one. For PendingIsHarvested, it prints a loop in which an Admission stays pending forever. Read `adm`, `effect`, `exposures`, `harvest` and `inTurn` in each state, and name the step that changed them (Admit, Claim, Empty, Cross, Succeed, Fail, Restart). For the shortest path in plain words, and a chart of it, use the `/statechart` skill on a copy of the spec. The labels it needs are already in `Harvest.map.mjs`. `/statechart` charts invariants only, so drop the `PROPERTIES` line from the copy's config.

Then decide what the failure is:

- **A real bug**: the code now allows that order. Report the steps as a story in the code's words, such as "an Admission arrives while the harvest runs, and the harvest's finally does not check readiness". Do not weaken the rule.
- **A modeling error**: the model allows a step that the code does not, or misses a guard that the code has. Fix the model and cite the code line on the condition (`\* bot-runtime.ts:NNNN`).

## Changing the model

When a change to the harvest is intended:

1. Update the matching action and its line comments.
2. Run the command above.
3. If the change adds a guard, add a `HarvestBroken*.cfg` that turns it off and expects the rule it protects to break.
4. Regenerate the chart at the end of ADR-0077 (or its topic decision doc, once TB9 folds it in) with `/statechart` `from-spec` on a scratch copy of `Harvest.tla`, using `HarvestChart.cfg` as its config.

## Coverage

Last confirmed against commit `10eefc6b7`. Line numbers are in `packages/core/src/runtime/bot-runtime.ts`.

| Model step | Code |
| --- | --- |
| Admit | `#admitChannelMessage` → `#checkHarvestReadiness` (2866, 3865-3882) |
| Schedule (inside Admit and AfterTurn) | `#scheduleHarvest` 3850-3862 (`#pendingHarvests` 3854) |
| Claim, Empty | `#runHarvestTurn` 3964-3998; `#claimHarvest` 4167-4222 |
| Cross | `#markAdmissionsSideEffect` 4530-4550 |
| Succeed | `#settleHarvestHandled` 4552-4569 |
| Fail | `#settleHarvestFailure` 4571-4590 |
| AfterTurn | the `finally` of `#scheduleHarvest` 3857-3860 |
| Restart | `#recoverInterruptedAttempts` 8100-8108; `#recoverPendingChannelAdmissions` 3638, 3098 |

When any of these changes after that commit, read the diff against the model before you trust a pass. Move the commit forward only after you have confirmed that the model still describes the code.

## Not covered

- The per-Channel cap (100) and the turn-wide text budget: the model claims every eligible Admission at once, so the oldest-slice rotation is not checked.
- Digests, schedules, Assignment Reports and external IM sources: the model only covers immediate Admissions.
- Steering into a running turn, and explicit `channel_read` consumption.
- Several Bots: the model covers one Bot's serial queue.
- Retryable Admissions are not re-harvested on their own. The model shows that this is designed, not lost, but it does not check when a later harvest picks them up.
