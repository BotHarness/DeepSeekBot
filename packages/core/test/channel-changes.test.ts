import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createAttachmentStore } from '../src/attachments/store.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { suspendRestoredExecution } from '../src/runtime/profile-restore.js';
import { createTempRoot } from './helpers.js';

const owners: OperationalDatabaseOwner[] = [];
afterEach(() => {
  while (owners.length) owners.pop()!.close();
});

async function scene() {
  const home = createTempRoot('channel-changes-');
  const database = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  owners.push(database);
  const port = attachOperationalModule(database, 'messaging');
  const channels = createSqliteChannelStore({
    database: port,
    rootDir: join(home, 'botharness', 'channels'),
    databaseOwnerReady: true,
    attachments: createAttachmentStore({ rootDir: join(home, 'botharness', 'attachments') }),
  });
  const group = channels.createGroup({ name: 'Changes QA', members: [] });
  const post = async (id: string, extra: Record<string, unknown> = {}) =>
    channels.appendMessage(group.id, {
      id,
      at: new Date(Date.UTC(2026, 10, 5, 0, 0, Number(id.replace(/\D/gu, '') || 0))).toISOString(),
      author: { kind: 'human' },
      body: `body ${id}`,
      ...extra,
    });
  await post('m1');
  await post('m2', { replyTo: 'm1' });
  await post('m3');
  const since = () => channels.changeCursor!();
  const changes = (from: { epoch: string; seq: number }) =>
    channels.readHumanChanges!(group.id, { sinceSeq: from.seq, epoch: from.epoch })!;
  const sourceOf = (messageId: string) =>
    String(
      (
        port.read((db) =>
          db
            .prepare(
              'SELECT source_event_id FROM channel_placements WHERE channel_id = ? AND message_id = ?',
            )
            .get(group.id, messageId),
        ) as { source_event_id: string }
      ).source_event_id,
    );
  return { database, port, channels, group, post, since, changes, sourceOf };
}

const ids = (entries: readonly { message: { id: string } }[]) =>
  entries.map((entry) => entry.message.id).sort();

describe('global change log for placed messages', () => {
  it('reports nothing when nothing changed, so reopening sends no message bodies', async () => {
    const { since, changes } = await scene();
    const result = changes(since());
    if (result.reset) throw new Error('unexpected reset');
    expect(result).toMatchObject({ upserts: [], removed: [], tombstones: [], hasMore: false });
  });

  it('reports a newly placed message without flagging the Channel itself', async () => {
    const { since, changes, post } = await scene();
    const cursor = since();
    await post('m4');
    const result = changes(cursor);
    if (result.reset) throw new Error('unexpected reset');
    expect(ids(result.upserts)).toEqual(['m4']);
    expect(result.channelChanged).toBe(false);
  });

  it('reports a reaction toggled on an older message (#51)', async () => {
    const { since, changes, channels, group } = await scene();
    const cursor = since();
    channels.setHumanReaction!(group.id, 'm1', '👍', true);
    const result = changes(cursor);
    if (result.reset) throw new Error('unexpected reset');
    expect(ids(result.upserts)).toEqual(['m1']);
    expect(result.upserts[0]!.message.reactions?.[0]).toMatchObject({ emoji: '👍' });
  });

  it('reports a body rewrite, its replies (#44) and nothing for unrendered payload stamps (#9, #10)', async () => {
    const { since, changes, port, sourceOf } = await scene();
    const cursor = since();
    port.transaction(
      (db) =>
        db
          .prepare(
            "UPDATE source_events SET payload_json = json_set(payload_json, '$.feedback', json('{\"x\":1}')) WHERE source_event_id = ?",
          )
          .run(sourceOf('m1')),
      ['messaging'],
    );
    const stamps = changes(cursor);
    expect(stamps.reset ? ['reset'] : ids(stamps.upserts)).toEqual([]);
    port.transaction(
      (db) =>
        db
          .prepare(
            "UPDATE source_events SET body = 'edited', payload_json = json_set(payload_json, '$.body', 'edited') WHERE source_event_id = ?",
          )
          .run(sourceOf('m1')),
      ['messaging'],
    );
    const result = changes(cursor);
    if (result.reset) throw new Error('unexpected reset');
    expect(ids(result.upserts)).toEqual(['m1', 'm2']);
  });

  it('turns a purged message into a tombstone and refreshes its replies (#3)', async () => {
    const { since, changes, port, sourceOf } = await scene();
    const cursor = since();
    port.transaction(
      (db) =>
        db
          .prepare(
            "UPDATE source_events SET body = '', payload_json = json_set(json_set(payload_json, '$.body', ''), '$.contentPurge', json('{\"actor\":\"local-human\"}')) WHERE source_event_id = ?",
          )
          .run(sourceOf('m1')),
      ['messaging'],
    );
    const result = changes(cursor);
    if (result.reset) throw new Error('unexpected reset');
    expect(result.tombstones).toEqual(['m1']);
    expect(ids(result.upserts)).toEqual(['m2']);
  });

  it('reports delivery state changes of every placement of a source (#14-#39)', async () => {
    const { since, changes, port, sourceOf } = await scene();
    port.transaction(
      (db) =>
        db
          .prepare(
            "INSERT INTO inbox_admissions (source_event_id, bot_slug, reason) VALUES (?, 'ada', 'group-mention')",
          )
          .run(sourceOf('m3')),
      ['messaging'],
    );
    const cursor = since();
    port.transaction(
      (db) =>
        db
          .prepare(
            "UPDATE inbox_admissions SET attempt_state = 'running' WHERE source_event_id = ?",
          )
          .run(sourceOf('m3')),
      ['messaging'],
    );
    port.transaction(
      (db) =>
        db
          .prepare('UPDATE inbox_admissions SET last_error = ? WHERE source_event_id = ?')
          .run('not rendered', sourceOf('m3')),
      ['messaging'],
    );
    const result = changes(cursor);
    if (result.reset) throw new Error('unexpected reset');
    expect(ids(result.upserts)).toEqual(['m3']);
  });

  it('flags read, nickname and default-name changes as Channel-level (#40-#42)', async () => {
    const { since, changes, channels, group } = await scene();
    let cursor = since();
    await channels.markRead(group.id, 'm3');
    let result = changes(cursor);
    if (result.reset) throw new Error('unexpected reset');
    expect(result).toMatchObject({ readChanged: true, channelChanged: false, upserts: [] });
    cursor = since();
    channels.setHumanNickname(group.id, 'Vee');
    result = changes(cursor);
    if (result.reset) throw new Error('unexpected reset');
    expect(result.channelChanged).toBe(true);
    cursor = since();
    channels.setHumanDefaultName('Vain');
    result = changes(cursor);
    if (result.reset) throw new Error('unexpected reset');
    expect(result.channelChanged).toBe(true);
  });

  it('records an edited original for every message that holds the file (#46, #47)', async () => {
    const { since, changes, channels, port, sourceOf } = await scene();
    const fileId = 'file:6a1f3c2e-1b2c-4d3e-8f40-123456789abc';
    port.transaction(
      (db) =>
        db
          .prepare(
            "UPDATE source_events SET payload_json = json_set(payload_json, '$.attachments', json(?)) WHERE source_event_id = ?",
          )
          .run(
            JSON.stringify([{ fileId, name: 'a.txt', mime: 'text/plain', size: 1 }]),
            sourceOf('m3'),
          ),
      ['messaging'],
    );
    const cursor = since();
    expect(channels.recordAttachmentChange!(fileId)).toBe(1);
    expect(channels.recordAttachmentChange!('file:00000000-0000-4000-8000-000000000000')).toBe(0);
    const result = changes(cursor);
    if (result.reset) throw new Error('unexpected reset');
    expect(ids(result.upserts)).toEqual(['m3']);
  });

  it('pages a long run of changes with a cursor', async () => {
    const { since, changes, channels, group, post } = await scene();
    const cursor = since();
    for (let index = 10; index < 20; index += 1) await post(`m${index}`);
    const first = channels.readHumanChanges!(group.id, { sinceSeq: cursor.seq, limit: 4 })!;
    if (first.reset) throw new Error('unexpected reset');
    expect(first.hasMore).toBe(true);
    expect(first.upserts).toHaveLength(4);
    let next = first.cursor;
    const seen = new Set(ids(first.upserts));
    for (let page = 0; page < 10; page += 1) {
      const more = changes(next);
      if (more.reset) throw new Error('unexpected reset');
      ids(more.upserts).forEach((id) => seen.add(id));
      next = more.cursor;
      if (!more.hasMore) break;
    }
    expect(seen.size).toBe(10);
  });

  it('asks for a reset after a new epoch, an unknown cursor or a cursor from another epoch (#53)', async () => {
    const { since, changes, channels, group } = await scene();
    const cursor = since();
    expect(channels.readHumanChanges!(group.id, { sinceSeq: cursor.seq + 50 })!.reset).toBe(true);
    expect(changes({ ...cursor, epoch: 'other' }).reset).toBe(true);
    const rotated = channels.rotateChangeEpoch!();
    expect(rotated.epoch).not.toBe(cursor.epoch);
    expect(changes(cursor).reset).toBe(true);
    expect(changes(rotated).reset).toBeUndefined();
  });

  it('starts a new epoch when a profile is restored, so every device refetches (#39, #53)', async () => {
    const { since, changes, database } = await scene();
    const cursor = since();
    suspendRestoredExecution(database);
    expect(since().epoch).not.toBe(cursor.epoch);
    expect(changes(cursor).reset).toBe(true);
  });
});

it('guards every table that feeds the message projection with a change trigger', async () => {
  const { port } = await scene();
  const triggered = new Set(
    (
      port.read((db) =>
        db
          .prepare(
            "SELECT tbl_name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'channel_change_%'",
          )
          .all(),
      ) as { tbl_name: string }[]
    ).map((row) => row.tbl_name),
  );
  for (const table of [
    'channel_placements',
    'source_events',
    'inbox_admissions',
    'channel_reactions',
    'attachment_file_bindings',
    'request_assignments',
    'channel_read_positions',
    'channel_records',
    'channel_human_nicknames',
    'channel_human_members',
    'local_human_names',
  ])
    expect(triggered, table).toContain(table);
});
