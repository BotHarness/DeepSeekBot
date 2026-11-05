# ADR-0293: Changes to placed messages are logged by database triggers

- Status: Accepted
- Date: 2026-11-05
- Issue: #3510 (hub #3505)

## Context

A client that caches a conversation tail must learn what changed while it was closed: new messages, edits of the body or payload (voice, cleanup, bridged names), purges, delivery states, reactions, read positions, names and previews built from other messages. The inventory on #3510 found 54 such paths; many have no live notification, and the ones that do are not replayed on reconnect. Adding a notification to each call site would miss the next new write path.

## Decision

The Host keeps one global, monotonic change log, `channel_changes(seq, channel_id, message_id, kind)`, and an epoch row. SQLite triggers on every table that feeds the message projection append rows inside the same transaction as the write: placements (insert, delete), `source_events` (body or payload, ignoring the unrendered `$.feedback` and `$.external.contextReads`), `inbox_admissions` (rendered state), reactions, attachment bindings, request assignments, read positions, Channel records (ignoring `updatedAt`), nicknames, members and the Human's default name. Triggers also fan out to messages whose rendering depends on another message: replies (`$.replyTo`), Bot-post notices (`$.botChannelPost`) and grant requests. Code adds rows only for what the database cannot see: an edited original file, and a restored profile, which rotates the epoch. A test fails when a projection table has no trigger.

`channelChanges` returns the current projection of the changed messages, purged ones as tombstones, removed ids, Channel-level and read flags, and the next cursor, paged by change rows. A different epoch, a cursor above the head or below the pruned floor returns `reset`. Rows older than 30 days are deleted at Host startup, and the floor rises to the newest deleted row.

## Consequences

Any write path, including future ones, is reflected without a call-site change, and a reconnecting client asks only for what changed. Writes to these tables do slightly more work; the fan-out queries use two new expression indexes. A trigger can record a change that does not alter the rendering (for example the WeChat mirror flag); the client then refetches one message. Live frames still drive open conversations; the phone switching its open path to the cursor is the next slice (#3511).
