import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createAttachmentStore } from '../src/attachments/store.js';
import type { ChannelMessage } from '../src/channels/channel.js';
import { createSqliteChannelStore, pruneChannelChanges } from '../src/channels/sqlite-store.js';
import type { ChannelChangesPage, ChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { suspendRestoredExecution } from '../src/runtime/profile-restore.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const human = (id: string, body = id): ChannelMessage => ({
  id,
  at: new Date().toISOString(),
  author: { kind: 'human' },
  body,
});

function fixture() {
  const root = createTempRoot('channel-changes-');
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const database = attachOperationalModule(owner, 'channels');
  const attachments = createAttachmentStore({ rootDir: join(root, 'attachments') });
  const open = (now?: () => Date): ChannelStore =>
    createSqliteChannelStore({
      database,
      rootDir: join(root, 'channels'),
      attachments,
      ...(now === undefined ? {} : { now }),
    });
  const channels = open();
  const group = channels.createGroup({ name: 'Change log', members: ['ada'] });
  const other = channels.createGroup({ name: 'Elsewhere', members: ['ada'] });
  const changes = (id: string, since: number, epoch?: string, limit?: number) =>
    channels.humanChanges!(id, {
      since,
      ...(epoch === undefined ? {} : { epoch }),
      ...(limit === undefined ? {} : { limit }),
    })!;
  const cursor = (id = group.id) => {
    const start = changes(id, 0);
    expect(start.reset).toBe(true);
    let at = { epoch: start.epoch, seq: start.seq };
    return {
      read(limit?: number): ChannelChangesPage {
        const page = changes(id, at.seq, at.epoch, limit);
        expect(page.reset).toBeUndefined();
        at = { epoch: page.epoch, seq: page.seq };
        return page;
      },
      get position() {
        return at;
      },
    };
  };
  const sourceOf = (channelId: string, messageId: string) =>
    database.read(
      (db) =>
        (
          db
            .prepare(
              'SELECT source_event_id FROM channel_placements WHERE channel_id = ? AND message_id = ?',
            )
            .get(channelId, messageId) as { source_event_id: string }
        ).source_event_id,
    );
  return { root, owner, database, channels, group, other, changes, cursor, sourceOf, open };
}

describe('Channel change log', () => {
  it('hands a new client the current position, then reports only what changed after it', async () => {
    const { channels, group, cursor } = fixture();
    await channels.appendMessage(group.id, human('before'));
    const log = cursor();
    expect(log.read()).toMatchObject({ upserts: [], removed: [], channel: false, more: false });
    await channels.appendMessage(group.id, human('after', 'hello'));
    const page = log.read();
    expect(page.upserts.map((message) => [message.id, message.body])).toEqual([['after', 'hello']]);
    expect(page.upserts[0]?.channelRevision).toBe(channels.revision(group.id));
    expect(log.read().upserts).toEqual([]);
  });

  it('reports reaction add and remove on the reacted message', async () => {
    const { channels, group, cursor } = fixture();
    await channels.appendMessage(group.id, human('m-1'));
    const log = cursor();
    channels.setHumanReaction!(group.id, 'm-1', '👍', true);
    expect(log.read().upserts).toMatchObject([
      { id: 'm-1', reactions: [{ emoji: '👍', actors: [{ kind: 'human' }] }] },
    ]);
    channels.setHumanReaction!(group.id, 'm-1', '👍', false);
    const removed = log.read().upserts;
    expect(removed.map((message) => message.id)).toEqual(['m-1']);
    expect(removed[0]?.reactions ?? []).toEqual([]);
  });

  it('marks read positions, nicknames and channel metadata as channel-level changes', async () => {
    const { channels, group, other, cursor } = fixture();
    await channels.appendMessage(group.id, human('m-1'));
    const log = cursor();
    const elsewhere = cursor(other.id);
    await channels.markRead(group.id, 'm-1');
    expect(log.read()).toMatchObject({ upserts: [], channel: true });
    channels.setHumanNickname(group.id, 'Lead');
    expect(log.read()).toMatchObject({ upserts: [], channel: true });
    channels.rename(group.id, 'Renamed');
    expect(log.read()).toMatchObject({ channel: true });
    expect(elsewhere.read()).toMatchObject({ upserts: [], channel: false });
    channels.setHumanDefaultName('Vain');
    expect(log.read()).toMatchObject({ channel: true });
    expect(elsewhere.read()).toMatchObject({ channel: true });
  });

  it('reports content rewrites such as voice results and purge tombstones', async () => {
    const { channels, database, group, cursor, sourceOf } = fixture();
    await channels.appendMessage(group.id, human('m-1', 'secret'));
    const log = cursor();
    const source = sourceOf(group.id, 'm-1');
    database.transaction((db) =>
      db.prepare("UPDATE source_events SET body = '' WHERE source_event_id = ?").run(source),
    );
    expect(log.read().upserts.map((message) => [message.id, message.body])).toEqual([['m-1', '']]);
    database.transaction((db) =>
      db
        .prepare('UPDATE source_events SET created_at = created_at WHERE source_event_id = ?')
        .run(source),
    );
    expect(log.read().upserts).toEqual([]);
  });

  it('reports delivery state changes from any admission write', async () => {
    const { channels, database, group, cursor, sourceOf } = fixture();
    await channels.appendMessage(group.id, human('m-1'));
    const source = sourceOf(group.id, 'm-1');
    const log = cursor();
    database.transaction((db) =>
      db
        .prepare(
          "INSERT INTO inbox_admissions (source_event_id, bot_slug, reason) VALUES (?, 'bob', 'group-mention')",
        )
        .run(source),
    );
    expect(log.read().upserts.map((message) => message.id)).toEqual(['m-1']);
    database.transaction((db) =>
      db
        .prepare(
          "UPDATE inbox_admissions SET attempt_state = 'needs-repair' WHERE source_event_id = ?",
        )
        .run(source),
    );
    expect(log.read().upserts.map((message) => message.id)).toEqual(['m-1']);
    database.transaction((db) =>
      db.prepare('DELETE FROM inbox_admissions WHERE source_event_id = ?').run(source),
    );
    expect(log.read().upserts.map((message) => message.id)).toEqual(['m-1']);
  });

  it('fans one source change out to every channel that places it', async () => {
    const { channels, database, group, other, cursor, sourceOf } = fixture();
    await channels.appendMessage(group.id, human('m-1'));
    const source = sourceOf(group.id, 'm-1');
    database.transaction((db) =>
      db
        .prepare(
          "INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id) VALUES (?, 1, ?, 'mirror-1')",
        )
        .run(other.id, source),
    );
    const here = cursor();
    const there = cursor(other.id);
    database.transaction((db) =>
      db.prepare("UPDATE source_events SET body = 'edited' WHERE source_event_id = ?").run(source),
    );
    expect(here.read().upserts.map((message) => [message.id, message.body])).toEqual([
      ['m-1', 'edited'],
    ]);
    expect(there.read().upserts.map((message) => [message.id, message.body])).toEqual([
      ['mirror-1', 'edited'],
    ]);
  });

  it('reports a message whose placement is gone as removed', async () => {
    const { channels, database, group, cursor } = fixture();
    await channels.appendMessage(group.id, human('m-1'));
    await channels.appendMessage(group.id, human('m-2'));
    const log = cursor();
    database.transaction((db) =>
      db
        .prepare("DELETE FROM channel_placements WHERE channel_id = ? AND message_id = 'm-1'")
        .run(group.id),
    );
    expect(log.read()).toMatchObject({ upserts: [], removed: ['m-1'] });
  });

  it('pages a long burst without skipping a change', async () => {
    const { channels, group, cursor } = fixture();
    const log = cursor();
    for (let index = 0; index < 7; index++)
      await channels.appendMessage(group.id, human(`m-${index}`));
    const seen: string[] = [];
    for (;;) {
      const page = log.read(3);
      seen.push(...page.upserts.map((message) => message.id));
      if (!page.more) break;
    }
    expect([...new Set(seen)]).toEqual(Array.from({ length: 7 }, (_, index) => `m-${index}`));
    expect(log.read().upserts).toEqual([]);
  });

  it('asks the client to resync on a foreign epoch, a future position or a pruned position', async () => {
    const { channels, group, changes, cursor, open } = fixture();
    await channels.appendMessage(group.id, human('m-1'));
    const log = cursor();
    const { epoch, seq } = log.position;
    expect(changes(group.id, seq, 'other-epoch')).toMatchObject({ reset: true, epoch, seq });
    expect(changes(group.id, seq + 5, epoch)).toMatchObject({ reset: true, seq });
    expect(changes(group.id, seq, epoch).reset).toBeUndefined();
    open(() => new Date(Date.now() + 31 * 86_400_000));
    expect(changes(group.id, seq - 1, epoch)).toMatchObject({ reset: true, seq });
    expect(changes(group.id, seq, epoch)).toMatchObject({ upserts: [], channel: false });
    await channels.appendMessage(group.id, human('m-2'));
    expect(changes(group.id, seq, epoch).upserts.map((message) => message.id)).toEqual(['m-2']);
  });

  it('starts a new epoch after a profile restore so old cursors resync', async () => {
    const { owner, channels, group, changes, cursor } = fixture();
    const log = cursor();
    suspendRestoredExecution(owner);
    await channels.appendMessage(group.id, human('m-1'));
    const { epoch, seq } = log.position;
    const page = changes(group.id, seq, epoch);
    expect(page.reset).toBe(true);
    expect(page.epoch).not.toBe(epoch);
  });

  it('keeps recent changes when pruning', async () => {
    const { channels, database, group, cursor } = fixture();
    const log = cursor();
    await channels.appendMessage(group.id, human('m-1'));
    pruneChannelChanges(database, new Date());
    expect(log.read().upserts.map((message) => message.id)).toEqual(['m-1']);
  });

  it('refuses channels the human cannot read', () => {
    const { channels } = fixture();
    expect(channels.humanChanges!('missing-channel', { since: 0 })).toBeUndefined();
  });

  it('records every table the client message projection reads', () => {
    const { database } = fixture();
    const watched = database.read(
      (db) =>
        db
          .prepare(
            "SELECT tbl_name AS name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'channel_changes_%' GROUP BY tbl_name ORDER BY tbl_name",
          )
          .all() as Array<{ name: string }>,
    );
    expect(watched.map((row) => row.name)).toEqual([
      'attachment_file_bindings',
      'channel_human_nicknames',
      'channel_placements',
      'channel_reactions',
      'channel_read_positions',
      'channel_records',
      'inbox_admissions',
      'local_human_names',
      'request_assignments',
      'source_events',
    ]);
  });
});
