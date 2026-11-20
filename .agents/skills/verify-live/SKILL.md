---
name: verify-live
description: Model-check live Channel delivery (only committed messages, none twice, none skipped) with TLA+. Use when a change touches subscribeChannel, followChannel or publishCommitted in packages/core/src/channels/live.ts, an onPlaced call site, the ChannelJournal follow options in packages/client/src/client/live-snapshots.ts, or verification/live/.
---

# Verify live Channel delivery

`verification/live/Live.tla` models how committed Channel messages reach one following client ([messaging decisions § 3](../../../docs/decisions/messaging.md#adr-0054)). TLC checks every order of writes that commit or roll back, publishes in any order, opens, dropped streams and received entries, for three messages and two opens.

It checks three rules on every reachable state:

- **NoDuplicate**: the client never shows a message twice. If this breaks, a message appears twice in the timeline.
- **OnlyCommitted**: the client shows only messages that committed. If this breaks, a client acts on a message that never existed.
- **NoGap**: the client shows the committed messages in revision order, from the start, with none skipped. If this breaks, a message is missing or out of place until the page is reloaded.

## When to run it

Run it when a diff touches a line listed under Coverage, adds an `await` or moves `onPlaced` relative to its transaction, or changes how the client treats an entry that does not follow its cursor.

```bash
node scripts/verify-tla.mjs live
```

The command downloads TLC 1.7.4 once and checks its pinned sha256. It needs Java 11 or newer on `PATH` (or `JAVA=/path/to/java`). `TLA2TOOLS=/path/to/tla2tools.jar` skips the download. It checks every `.cfg` beside the spec in a few seconds:

- `Live.cfg` and `LiveChart.cfg` are the real code. Every invariant must hold.
- Each `LiveBroken*.cfg` turns one or more guards off. Its `\* expect:` line names the rule that must break. If one of these passes, the model can no longer see that guard.

Turning off only the subscriber's `delivered` check, or only the client's cursor check, still passes: either one stops a duplicate. `LiveBrokenDedup.cfg` turns both off.

## Reading a failure

TLC prints the states that lead to the bad one. Read `committed`, `unpublished`, `delivered`, `wire`, `view` and `last` in each state, and name the step that changed them (Begin, Commit, Rollback, Publish, PublishUncommitted, Open, Close, Receive). For the shortest path in plain words, and a chart of it, use the `/statechart` skill on a copy of the spec. The labels it needs are already in `Live.map.mjs`.

Then decide what the failure is:

- **A real bug**: the code now allows that order. Report the steps as a story in the code's words, such as "the client opens the Channel after the commit and before its publish, and the publish shows the message again". Do not weaken the rule.
- **A modeling error**: the model allows a step that the code does not, or misses a guard that the code has. Fix the model and cite the code line on the condition (`\* live.ts:NNNN`).

## Changing the model

When a change to live delivery is intended:

1. Update the matching action and its line comments.
2. Run the command above.
3. If the change adds a guard, add a `LiveBroken*.cfg` that turns it off and expects the rule it protects to break.
4. Regenerate the chart in `docs/decisions/messaging.md` § 3 with `/statechart` `from-spec` on a scratch copy of `Live.tla`, using `LiveChart.cfg` as its config, and paste the new `chart.mmd`.

## Coverage

Last confirmed against commit `0e01f0760`.

| Model step              | Code                                                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Begin, Commit, Rollback | the placement transactions that return a `ChannelMessageCommit`                                                                                                                                                                                                                        |
| Publish                 | `publishCommitted` `packages/core/src/channels/live.ts:1063`, from `onPlaced` (`packages/core/src/plugin.ts:1025`, `:1084`); callers `packages/core/src/messaging/outbound.ts:715` and `packages/core/src/messaging/inbound.ts:510, 1050, 1199, 1551, 3194` (`:1046` awaits before it) |
| Push (inside Publish)   | `subscriber.push` `live.ts:771` (`delivered` check), `:787`                                                                                                                                                                                                                            |
| Open                    | `followChannel` `live.ts:914-929`; `subscribeChannel` `live.ts:755`, `:876`                                                                                                                                                                                                            |
| Receive                 | `acceptEntry` in `@deepseek-ai/dsh-api-gateway` `lib/types/client/journal-stream.js`; `follows` in `packages/client/src/client/live-snapshots.ts:193`                                                                                                                                  |

When any of these changes after that commit, read the diff against the model before you trust a pass. Move the commit forward only after you have confirmed that the model still describes the code.

## Not covered

- The SSE fallback route, which resumes after `Last-Event-ID` and replays `messagesAfter`: the model only opens at the head, as `followChannel` does.
- Drafts, notifications (admissions, reactions, reads, voice), the roster and visibility checks.
- Page limits: an open or a repair reads every committed message through its revision.
- Several clients, several Channels, and a Host restart.
- Liveness: the model does not check that every committed message eventually shows.
