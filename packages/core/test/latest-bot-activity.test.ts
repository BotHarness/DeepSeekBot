import type { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createAttachmentStore } from '../src/attachments/store.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseModulePort,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

function fixture() {
  const root = createTempRoot();
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const database = attachOperationalModule(owner, 'channels');
  const statements: string[] = [];
  const recorded: OperationalDatabaseModulePort = {
    module: database.module,
    read: (query) =>
      database.read((db) =>
        query(
          new Proxy(db, {
            get(target, key) {
              if (key === 'prepare')
                return (sql: string) => {
                  statements.push(sql);
                  return target.prepare(sql);
                };
              const value = Reflect.get(target, key) as unknown;
              return typeof value === 'function' ? value.bind(target) : value;
            },
          }) as DatabaseSync,
        ),
      ),
    transaction: (command, topics) => database.transaction(command, topics),
  };
  const channels = createSqliteChannelStore({
    database: recorded,
    rootDir: join(root, 'channels'),
    attachments: createAttachmentStore({ rootDir: join(root, 'attachments') }),
  });
  const seed = (
    channelId: string,
    id: string,
    at: string,
    payload: Record<string, unknown>,
    botSlug: string | null,
  ) =>
    database.transaction((db) => {
      const revision =
        (
          db
            .prepare(
              'SELECT coalesce(max(revision), 0) AS revision FROM channel_placements WHERE channel_id = ?',
            )
            .get(channelId) as { revision: number }
        ).revision + 1;
      db.prepare(`INSERT INTO source_events
        (source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at, payload_json)
        VALUES (?, 'bot-message', ?, ?, ?, 'body', ?, ?)`).run(
        `${channelId}-${id}`,
        botSlug,
        channelId,
        id,
        at,
        JSON.stringify({ id, at, ...payload }),
      );
      db.prepare(`INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
        VALUES (?, ?, ?, ?)`).run(channelId, revision, `${channelId}-${id}`, id);
    });
  return { channels, database, statements, seed };
}

const bot = (slug: string) => ({ author: { kind: 'bot', slug } });

describe('latest Bot activity', () => {
  it('reports each Bot’s newest visible message without scanning history', () => {
    const { channels, database, statements, seed } = fixture();
    const dm = channels.getOrCreateDm('ada', 'Ada')!;
    const group = channels.createGroup({ name: 'Group', members: ['ada', 'bea'] });
    const gone = channels.createGroup({ name: 'Gone', members: ['bea'] });
    seed(dm.id, 'ada-old', '2026-11-01T00:00:01.000Z', bot('ada'), 'ada');
    seed(dm.id, 'ada-dm', '2026-11-01T00:00:05.000Z', bot('ada'), 'ada');
    seed(
      dm.id,
      'ada-notice',
      '2026-11-01T00:00:09.000Z',
      { ...bot('ada'), botCreateAction: { botSlug: 'cid', displayName: 'Cid' } },
      'ada',
    );
    seed(group.id, 'bea-hidden', '2026-11-01T00:00:08.000Z', bot('bea'), 'bea');
    seed(group.id, 'bea-visible', '2026-11-01T00:00:03.000Z', bot('bea'), 'bea');
    seed(gone.id, 'bea-deleted', '2026-11-01T00:00:10.000Z', bot('bea'), 'bea');
    seed(group.id, 'human', '2026-11-01T00:00:11.000Z', { author: { kind: 'human' } }, null);
    seed(dm.id, 'human-dm', '2026-11-01T00:00:12.000Z', { author: { kind: 'human' } }, 'ada');
    database.transaction((db) => {
      db.prepare(
        'UPDATE channel_human_members SET visible_from_revision = 2 WHERE channel_id = ?',
      ).run(group.id);
      db.prepare(
        "UPDATE channel_records SET record_json = json_set(record_json, '$.deletedAt', ?) WHERE channel_id = ?",
      ).run('2026-11-01T00:01:00.000Z', gone.id);
    });
    statements.length = 0;
    expect(Object.fromEntries(channels.latestBotActivity!())).toEqual({
      ada: Date.parse('2026-11-01T00:00:05.000Z'),
      bea: Date.parse('2026-11-01T00:00:03.000Z'),
    });
    const plan = database.read((db) =>
      statements.flatMap((sql) =>
        db
          .prepare(`EXPLAIN QUERY PLAN ${sql}`)
          .all()
          .map((row) => String((row as { detail: string }).detail)),
      ),
    );
    expect(
      plan.filter((detail) => /^SCAN (e|p|source_events|channel_placements)\b/.test(detail)),
    ).toEqual([]);
  });
});
