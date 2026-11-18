---
name: verify-enrollment
description: Model-check Host Relationship enrollment (one grant per Client key, no grant after cancellation or after the deadline, a lost-reply grant is eventually revoked) with TLA+. Use when a change touches packages/core/src/devices/relationship-enrollments.ts, the relationship branch of redeem in pairing.ts, enrollment or cancel-enrollment in relationships.ts and relationship-control.ts, or verification/enrollment/.
---

# Verify relationship enrollment

`verification/enrollment/Enrollment.tla` models how a source Host enrolls Client keys on a target Host over one Host Relationship ([ADR-0339](../../../docs/decisions/connections.md#adr-0339)). TLC checks every order of enrollment start, late offer requests, redemptions, lost replies, confirmations, deadlines, explicit cancellations, cleanup, record reclamation and a target restart, for two keys with up to two live offers each.

It checks four rules:

- **OneGrantPerKey**: one Client key gets at most one device grant. If this breaks, revoking the grant the Client knows leaves another one active.
- **NoGrantAfterCancel**: after a cancellation for a key, the key has no active grant. If this breaks, a cancelled Client keeps access to the Host.
- **NoGrantAfterDeadline**: no grant is issued after the key's deadline. If this breaks, an intent the source already gave up on gains a device nobody will confirm.
- **LostGrantRevoked** (a liveness property, under weak fairness): a grant whose reply never reached the Client is eventually revoked. If this breaks, an unknown device grant stays active.

## When to run it

Run it when a diff touches a line listed under Coverage, or changes which transaction checks or writes `relationship_client_enrollments`.

```bash
node scripts/verify-tla.mjs enrollment
```

The command downloads TLC 1.7.4 once and checks its pinned sha256. It needs Java 11 or newer on `PATH` (or `JAVA=/path/to/java`). `TLA2TOOLS=/path/to/tla2tools.jar` skips the download. It checks every `.cfg` beside the spec in about 10 s:

- `Enrollment.cfg` and `EnrollmentChart.cfg` are the real code. Every rule must hold.
- Each `EnrollmentBroken*.cfg` turns one guard off. Its `\* expect:` line names the rule that must break. If one of these passes, the model can no longer see that guard.

## Reading a failure

For an invariant, TLC prints the states that lead to the bad one. For LostGrantRevoked, it prints a loop in which a grant stays active. Read `out`, `in`, `phase`, `offers`, `active`, `reply` and `cancelled` in each state, and name the step that changed them (BeginOutgoing, Offer, Redeem, Receive, Lose, Confirm, Tick, DueCleanup, QueueCleanup, Cleanup, Reclaim, Restart). For the shortest path in plain words, and a chart of it, use the `/statechart` skill on a copy of the spec. The labels it needs are already in `Enrollment.map.mjs`. `/statechart` charts invariants only, so drop the `PROPERTIES` line from the copy's config.

Then decide what the failure is:

- **A real bug**: the code now allows that order. Report the steps as a story in the code's words, such as "the cancellation reaches the target before the offer request, and the late offer request creates the intent". Do not weaken the rule.
- **A modeling error**: the model allows a step that the code does not, or misses a guard that the code has. Fix the model and cite the code line on the condition (`\* relationship-enrollments.ts:NNN`).

## Changing the model

When a change to enrollment is intended:

1. Update the matching action and its line comments.
2. Run the command above.
3. If the change adds a guard, add an `EnrollmentBroken*.cfg` that turns it off and expects the rule it protects to break.
4. Regenerate the chart at the end of ADR-0339 (or its topic decision doc, once TB9 folds it in) with `/statechart` `from-spec` on a scratch copy of `Enrollment.tla`, using `EnrollmentChart.cfg` as its config.

## Coverage

Last confirmed against commit `0e01f0760`. Paths are under `packages/core/src/devices/`.

| Model step    | Code                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| BeginOutgoing | `relationship-enrollments.ts` `beginOutgoing` 140-173                                                                                      |
| Offer         | `relationships.ts` `enrollment` 352-377; `relationship-enrollments.ts` `beginIncoming` 175-189                                             |
| Redeem        | `pairing.ts` `redeem` 453-574 (offer consumed 462, transaction 507-555, intent check 526)                                                  |
| Confirm       | `relationship-enrollments.ts` `commit` 191-205; `relationship-control.ts` `commitEnrollment` 496-521                                       |
| DueCleanup    | `relationship-enrollments.ts` `dueCleanup` 254-278                                                                                         |
| QueueCleanup  | `relationship-enrollments.ts` `queueCleanup` 207-221; `relationship-control.ts` 519, 840, and `cancelEnrollment` 495                       |
| Cleanup       | `relationship-control.ts` `cleanupEnrollment` 408-455, `cancel-enrollment` 608-616; `relationship-enrollments.ts` `cancelIncoming` 223-252 |
| Reclaim       | `relationship-enrollments.ts` 84-97                                                                                                        |
| Restart       | the in-memory `offers` map in `pairing.ts`                                                                                                 |

When any of these changes after that commit, read the diff against the model before you trust a pass. Move the commit forward only after you have confirmed that the model still describes the code.

## Not covered

- Account trust, discovery, qualification and relationship disconnect: the relationship stays active.
- The offer's own expiry, which is later than the intent's deadline, and the 1,024-record limit.
- The cleanup retry limit of eight: the model lets cleanup succeed eventually, which the explicit CLI retry stands in for.
- A lost cleanup acknowledgement, which retries the same idempotent cancellation.
- The Client's private storage, Web Locks, Forget and Remove.
- Automatic enrollment refusing a new key while another is unconfirmed or cleaning up.
