# PersonaBot Output Committed

An application-defined, Host-only Cordis Event for observing a PersonaBot's committed public text. It is distinct from DSH Session events, transient model deltas, Activity notifications, Channel SSE and external provider delivery. Product boundaries are defined by [ADR-0049](../../decisions/release.md#adr-0049) and the [living architecture](../../architecture/botharness-architecture.md).

## Subscribe

Import the `PersonaBotOutputCommitted` type from `@botharness/core` and register a Fiber-owned listener:

```ts
ctx.on(
  'botharness/personabot/output-committed',
  (output) => {
    if (output.botId !== selectedBot || output.channelId !== selectedChannel) return;
    consumePublicText(output.messageId, output.content.body);
  },
  { global: true },
);
```

Use `messageId` as the consumer idempotency key. The normal Cordis disposer or Consumer Fiber disposal removes the listener. The Host producer stops with its Plugin. Registration does not deliver history. Query the canonical Channel for durable messages when necessary.

## Version 1 payload

| Field                                               | Meaning                                                         |
| --------------------------------------------------- | --------------------------------------------------------------- |
| version                                             | 1                                                               |
| botId / sessionId                                   | PersonaBot identity and trusted sending Session ownership       |
| channelId / messageId / channelRevision             | Successfully committed message references and Channel revision  |
| at                                                  | Host-authored message timestamp; not an Event replay cursor     |
| content.body / content.format                       | Committed public text, with markdown or text format             |
| correlation.sourceEventId                           | Triggering Source Event, when supplied by the trusted send path |
| correlation.replyToMessageId                        | Explicit same-Channel reply target, when present                |
| correlation.rootSourceEventId / parentSourceEventId | Existing Bot-to-Bot causal references, when present             |

The payload and nested records are frozen allowlists. They do not contain an entire ChannelMessage, quoted reply content, attachment filesystem paths, tool arguments/results, approval cards, private prompts, credentials or model reasoning. File contents are not broadcast; use owning authorized capabilities for detail. Public body text is already allowed to appear in the selected Channel; this is not a separate authorization for private operational data.

## Commit and failure semantics

The canonical writer accepts transient Host-only `ChannelMessageOrigin` metadata from the trusted Runtime and invokes `onCommitted` after a successful write. Origin is not persisted and does not enter Channel SSE or replay queries. The producer verifies the Session belongs to the author. Human/system messages and writes without trusted origin do not become PersonaBot outputs. Existing Orchestrator Channel sends and public Workspace Grant request text supply origin. Host-generated control/diagnostic cards are separate notices, not PersonaBot speech.

A successful append-once path notifies once. Existing/conflicting retries, failed/rolled-back writes, model deltas and restart reconstruction never notify. There is no cross-process exactly-once promise or replay log. A replacement Messaging writer must retain this post-commit callback and origin contract.

Pinned Cordis 4.0.4's `emit` does not isolate throwing callbacks. The producer resolves the same live listeners with the public EventsService `dispatch('emit', ...)` and invokes each independently. Synchronous failures and rejected promises produce only the stable diagnostic `personabot-output-consumer-failed`; other listeners continue and the Channel result cannot roll back. Returned promises are not awaited; synchronous consumers must still keep work short. No listeners is valid.

## Verified path

See [#125](https://github.com/BotHarness/BotHarness/issues/125). Tests cover SQLite rollback, retry identity, immutable privacy allowlists, live SSE exclusion, disposal, restart and trusted Runtime sends. `scripts/e2e-output-committed.mjs` uses the neutral consumers in `scripts/fixtures/output-committed-consumers.mjs` to verify real model sends, failing listeners, disposal and Host restart. QA consumers are absent from the product Profile. TTS, Live2D and other renderers remain independent work.
