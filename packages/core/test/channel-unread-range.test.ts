import type { SQLInputValue } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createHumanAttentionQuery } from '../src/runtime/human-attention.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

describe('Channel unread revision ranges', () => {
  it('seeks the unread range instead of scanning retained placements, including when all read', async () => {
    const dshHome = createTempRoot('channel-unread-range-');
    const owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome,
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      }),
    );
    const database = attachOperationalModule(owner, 'channel-unread-range');
    const channels = createSqliteChannelStore({ database, rootDir: dshHome });
    const channel = channels.getOrCreateDm('ada', 'Ada')!;
    database.transaction((connection) => {
      const event = connection.prepare(`INSERT INTO source_events
        (source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at, payload_json)
        VALUES (?, 'bot-message', 'ada', ?, ?, 'Retained history', '2026-11-02T00:00:00Z', ?)`);
      const placement = connection.prepare('INSERT INTO channel_placements VALUES (?, ?, ?, ?)');
      for (let revision = 1; revision <= 2000; revision++) {
        const id = `history-${revision}`;
        event.run(
          id,
          channel.id,
          id,
          JSON.stringify({
            id,
            at: '2026-11-02T00:00:00Z',
            author: { kind: 'bot', slug: 'ada' },
            body: 'Retained history',
          }),
        );
        placement.run(channel.id, revision, id, id);
      }
    });
    const plans: string[] = [];
    const observed = {
      ...database,
      read<Result>(callback: Parameters<typeof database.read<Result>>[0]): Result {
        return database.read((connection) =>
          callback(
            new Proxy(connection, {
              get(target, property) {
                if (property === 'prepare')
                  return (sql: string) => {
                    const statement = target.prepare(sql);
                    return new Proxy(statement, {
                      get(prepared, method) {
                        if (method === 'all')
                          return (...parameters: SQLInputValue[]) => {
                            plans.push(
                              ...target
                                .prepare('EXPLAIN QUERY PLAN ' + sql)
                                .all(...parameters)
                                .map((row) => String(row.detail)),
                            );
                            return prepared.all(...parameters);
                          };
                        const value = Reflect.get(prepared, method);
                        return typeof value === 'function' ? value.bind(prepared) : value;
                      },
                    });
                  };
                const value = Reflect.get(target, property);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            }),
          ),
        );
      },
    };
    const query = createHumanAttentionQuery(observed);
    expect(await channels.markRead(channel.id, 'history-1999')).toMatchObject({
      revision: 1999,
    });
    expect(query.unreadByChannel()).toEqual([{ channelId: channel.id, unreadCount: 1 }]);
    expect(plans.some((detail) => /SEARCH p .*channel_id=\? AND revision>\?/.test(detail))).toBe(
      true,
    );
    expect(plans.filter((detail) => /^SCAN p\b/.test(detail))).toEqual([]);
    plans.length = 0;
    await channels.markRead(channel.id, 'history-2000');
    expect(query.unreadByChannel()).toEqual([]);
    expect(plans.some((detail) => /SEARCH p .*channel_id=\? AND revision>\?/.test(detail))).toBe(
      true,
    );
    expect(plans.filter((detail) => /^SCAN p\b/.test(detail))).toEqual([]);
  });

  it('intersects read and membership floors and excludes departed or deleted Channels', async () => {
    const dshHome = createTempRoot('channel-unread-visibility-');
    const owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome,
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      }),
    );
    const database = attachOperationalModule(owner, 'channel-unread-visibility');
    const channels = createSqliteChannelStore({ database, rootDir: dshHome });
    const group = channels.createGroup({ name: 'Team', members: ['ada'] });
    for (let revision = 1; revision <= 5; revision++)
      await channels.appendMessage(group.id, {
        id: `message-${revision}`,
        at: '2026-11-02T00:00:00Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Update',
      });
    const query = createHumanAttentionQuery(database);
    const membership = (floor: number, leftAt: string | null) =>
      database.transaction((connection) =>
        connection
          .prepare(
            'UPDATE channel_human_members SET visible_from_revision = ?, left_at = ? WHERE channel_id = ?',
          )
          .run(floor, leftAt, group.id),
      );
    membership(4, null);
    expect(query.unreadByChannel()).toEqual([{ channelId: group.id, unreadCount: 2 }]);
    await channels.markRead(group.id, 'message-4');
    expect(query.unreadByChannel()).toEqual([{ channelId: group.id, unreadCount: 1 }]);
    membership(4, '2026-11-02T00:01:00Z');
    expect(query.unreadByChannel()).toEqual([]);
    membership(6, null);
    expect(query.unreadByChannel()).toEqual([]);
    membership(5, null);
    expect(query.unreadByChannel()).toEqual([{ channelId: group.id, unreadCount: 1 }]);
    channels.deleteGroup(group.id);
    expect(query.unreadByChannel()).toEqual([]);
  });
  it('does not count Channel notices beside eligible unread messages', async () => {
    const dshHome = createTempRoot('channel-unread-notice-');
    const owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome,
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      }),
    );
    const database = attachOperationalModule(owner, 'channel-unread-notice');
    const channels = createSqliteChannelStore({ database, rootDir: dshHome });
    const group = channels.createGroup({ name: 'Team', members: ['ada'] });
    const dm = channels.getOrCreateDm('ada', 'Ada')!;
    await channels.appendMessage(dm.id, {
      id: 'bot-channel-post-notice',
      at: '2026-11-02T00:00:00Z',
      author: { kind: 'bot', slug: 'ada' },
      body: '',
      botChannelPost: { channelId: group.id, messageId: 'posted-in-team' },
    });
    await channels.appendMessage(dm.id, {
      id: 'bot-message',
      at: '2026-11-02T00:00:01Z',
      author: { kind: 'bot', slug: 'ada' },
      body: 'Eligible reply',
    });
    const query = createHumanAttentionQuery(database);
    expect(query.unreadByChannel()).toEqual([{ channelId: dm.id, unreadCount: 1 }]);
    await channels.markRead(dm.id, 'bot-message');
    expect(query.unreadByChannel()).toEqual([]);
  });
});
