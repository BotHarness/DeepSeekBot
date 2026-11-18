---
name: verify-outbox
description: Model-check the external Outbox (one provider call per request key, and an unsent state that really means unsent) with TLA+. Use when a change touches send, claim, settle, revoke or restart recovery in packages/core/src/messaging/outbound.ts, the messaging_outbox or messaging_outbox_attempts schema, or verification/outbox/.
---

# Verify the Outbox

`verification/outbox/Outbox.tla` models how one request key moves through the external Outbox ([IM provider decisions § 9](../../../docs/decisions/im-providers.md#adr-0039)). TLC checks every order of steps for two request keys, two concurrent `send()` calls and up to two Host restarts.

It checks two rules on every reachable state:

- **AtMostOnce**: one request key reaches the provider at most once. If this breaks, the user sees a duplicate message in their chat.
- **UnsentMeansUnsent**: an intent marked not sent (pending, cancelled or revoked) really was never sent. If this breaks, the Human is told nothing went out and sends it again.

## When to run it

Run it when a diff touches any line listed under Coverage, or changes the order of the claim transaction and the provider call in `send()`.

```bash
node scripts/verify-tla.mjs outbox
```

The command downloads TLC 1.7.4 once and checks its pinned sha256. It needs Java 11 or newer on `PATH` (or `JAVA=/path/to/java`). `TLA2TOOLS=/path/to/tla2tools.jar` skips the download. It checks every `.cfg` beside the spec in about 4 s:

- `Outbox.cfg` and `OutboxChart.cfg` are the real code. Every invariant must hold.
- Each `OutboxBroken*.cfg` turns one or more guards off. Its `\* expect:` line names the rule that must break. If one of these passes, the model can no longer see that guard, and the model is wrong.

## Reading a failure

A real config that breaks a rule prints TLC's trace. Read each state's `state`, `sends`, `holds`, `claimed` and `posted`, and name the step that changed them (Begin, Claim, Post, Settle, Revoke, Restart). For the shortest path in plain words, and a chart of it, use the `/statechart` skill on a copy of the spec. The labels it needs are already in `Outbox.map.mjs`.

Then decide what the failure is:

- **A real bug**: the code now lets that order of steps happen. Report the steps as a story in the code's words, such as "the Host restarts after the provider call, and recovery puts the intent back to pending". Do not weaken the rule.
- **A modeling error**: the model allows a step that the code does not, or misses a guard that the code has. Fix the model and cite the code line for the guard on its condition (`\* outbound.ts:NNNN`).

## Changing the model

When a change to the Outbox is intended:

1. Update the matching action in `Outbox.tla` and its `outbound.ts` line comments.
2. Run the command above.
3. If the change adds a guard, add an `OutboxBroken*.cfg` that turns it off and expects the rule it protects to break.
4. Regenerate the chart in `docs/decisions/im-providers.md` § 9 with `/statechart` `from-spec` on a scratch copy of `Outbox.tla` with `OutboxChart.cfg` as its config, and paste the new `chart.mmd`.

## Coverage

Last confirmed against commit `75f01f347`.

| Model step | Code |
| --- | --- |
| Begin | `packages/core/src/messaging/outbound.ts:3193` inserts the intent; `:3207` returns an existing one |
| Claim, ClaimRefused | `outbound.ts:3237-3260` (state check `:3246`, attempt row `:3255`); `packages/core/src/database/schema-plan.ts:1107` (`intent_id` primary key) |
| Post | `outbound.ts:3315`, after the claim commits |
| Settle | `outbound.ts:935-962` (`settle`: only pending or in-flight changes) |
| Revoke | `outbound.ts:505-521` (`revokePendingIntents`) |
| Restart | `outbound.ts:967-988` (recovery) |

When any of these lines changes after that commit, read the diff against the model before you trust a pass. Move the commit forward only after you have confirmed that the model still describes the code.

## Not covered

- Payload hash conflicts: `request-conflict` is tested in `outbox-idempotency.property.test.ts`.
- Grant revision fences, provider timeouts as wall-clock time, file replies, mirrors and backup restore.
- Two Hosts sharing one database.
- Liveness: the model does not check that every intent eventually settles.
