import type { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { LOCAL_HUMAN_ID } from '../src/channels/channel.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { createChannelStore } from '../src/channels/store.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseModulePort,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import type { ExternalSource } from '../src/messaging/inbound.js';
import type { MessagingGrant } from '../src/messaging/outbound.js';
import { relatedReport } from '../src/messaging/report.js';
import { resolveRetainedQuote } from '../src/messaging/retained-context.js';
import { createHumanAttentionQuery } from '../src/runtime/human-attention.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

function fixture() {
  const home = createTempRoot('human-inbox-bounded-');
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const database = attachOperationalModule(owner, 'human-inbox-bounded');
  const statements: string[] = [];
  const recordedDb = (db: DatabaseSync) =>
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
    }) as DatabaseSync;
  const recorded: OperationalDatabaseModulePort = {
    module: database.module,
    read: (query) => database.read((db) => query(recordedDb(db))),
    transaction: (command, topics) => database.transaction(command, topics),
  };
  const channels = createSqliteChannelStore({
    database: recorded,
    rootDir: join(home, 'channels'),
  });
  const attention = createHumanAttentionQuery(
    recorded,
    () => [],
    () => [],
  );
  const plan = (sql: string) =>
    database.read((db) =>
      db
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all()
        .map((row) => String((row as { detail: string }).detail)),
    );
  return { database, recorded, channels, attention, statements, plan };
}

describe('Human inbox history bounds', () => {
  it('marks only Bot replies to the Human and Human mentions for the replies list', async () => {
    const { database, channels, attention } = fixture();
    const group = channels.createGroup({ name: 'Launch', members: ['ada', 'bea'] });
    const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 0, minute)).toISOString();
    await channels.appendMessage(group.id, {
      id: 'human-plan',
      at: at(1),
      author: { kind: 'human' },
      body: 'Review.',
    });
    await channels.appendMessage(group.id, {
      id: 'ada-reply',
      at: at(2),
      author: { kind: 'bot', slug: 'ada' },
      body: 'Reviewed.',
      replyTo: 'human-plan',
    });
    await channels.appendMessage(group.id, {
      id: 'bea-reply',
      at: at(3),
      author: { kind: 'bot', slug: 'bea' },
      body: 'Agreed with Ada.',
      replyTo: 'ada-reply',
    });
    await channels.appendMessage(group.id, {
      id: 'bea-mention',
      at: at(4),
      author: { kind: 'bot', slug: 'bea' },
      body: '@Human over to you.',
      humanMentions: [{ humanId: LOCAL_HUMAN_ID, label: 'Human', start: 0, end: 6 }],
      botCausation: { rootSourceEventId: 'root', parentSourceEventId: 'root', hop: 1 },
    });
    await channels.appendMessage(group.id, {
      id: 'ada-plain',
      at: at(5),
      author: { kind: 'bot', slug: 'ada' },
      body: 'Working.',
    });
    const flags = () =>
      Object.fromEntries(
        database.read((db) =>
          (
            db
              .prepare(
                'SELECT message_id, for_human FROM channel_placements WHERE channel_id = ? ORDER BY revision',
              )
              .all(group.id) as Array<{ message_id: string; for_human: number }>
          ).map((row) => [row.message_id, row.for_human]),
        ),
      );
    expect(flags()).toMatchObject({
      'human-plan': 0,
      'ada-reply': 1,
      'bea-reply': 0,
      'bea-mention': 1,
      'ada-plain': 0,
    });
    expect(
      attention
        .list({ category: 'replies', limit: 20 })
        .items.map((item) => item.messageId)
        .sort(),
    ).toEqual(['ada-reply', 'bea-mention']);
    database.transaction((db) =>
      db
        .prepare(
          "UPDATE source_events SET payload_json = json_set(payload_json, '$.replyTo', 'human-plan') WHERE channel_id = ? AND message_id = 'ada-plain'",
        )
        .run(group.id),
    );
    expect(flags()).toMatchObject({ 'ada-plain': 1 });
    database.transaction((db) =>
      db
        .prepare(
          "UPDATE source_events SET payload_json = json_remove(payload_json, '$.humanMentions') WHERE channel_id = ? AND message_id = 'bea-mention'",
        )
        .run(group.id),
    );
    expect(flags()).toMatchObject({ 'bea-mention': 0 });
  });

  it('never scans message, placement or outbound history for inbox, activity and IM lookups', () => {
    const { recorded, channels, attention, statements, plan } = fixture();
    attention.list({ category: 'replies', limit: 20 });
    attention.list({ category: 'replies', limit: 20, unreadOnly: true });
    attention.list({ category: 'unread', limit: 20 });
    channels.humanMessageCounts!('2026-11-03T16:00:00.000Z', '2026-11-04T16:00:00.000Z');
    const grant = {
      botSlug: 'ada',
      accountRef: 'account',
      fingerprint: 'fingerprint',
      providerId: 'weixin',
      receiveScope: { conversationId: 'conversation' },
    } as unknown as MessagingGrant;
    recorded.read((db) =>
      relatedReport(db, grant, { conversationId: 'conversation', parentId: 'external-1' } as never),
    );
    recorded.read((db) =>
      resolveRetainedQuote(
        db,
        grant,
        {
          platform: 'weixin',
          body: '',
          event: {
            botId: 'account',
            fingerprint: 'fingerprint',
            conversation: { kind: 'dm', id: 'conversation' },
            quote: { serverMessageId: 'external-2' },
          },
        } as unknown as ExternalSource,
        () => undefined,
        true,
      ),
    );
    const details = [
      ...statements,
      "SELECT COUNT(*) AS count FROM messaging_outbox_attempts a JOIN messaging_outbox o ON o.id = a.intent_id JOIN messaging_grants g ON g.id = o.grant_id WHERE g.binding_id = ? AND a.started_at > ? AND json_type(o.body, '$.sourceEventId') IS NULL",
    ].flatMap(plan);
    expect(
      details.filter((detail) =>
        /^SCAN (e|p|a|source_events|channel_placements|messaging_outbox|messaging_outbox_attempts)\b/.test(
          detail,
        ),
      ),
    ).toEqual([]);
    for (const index of [
      'channel_placements_for_human',
      'source_events_created',
      'messaging_outbox_receipt',
      'source_events_external_message',
      'messaging_outbox_attempts_started',
    ])
      expect(details.some((detail) => detail.includes(index))).toBe(true);
    expect(details).toContainEqual(
      expect.stringMatching(/^SEARCH p USING .*channel_id=\? AND revision>\?/),
    );
  });

  it('counts only the requested local day from the time index', async () => {
    const { channels } = fixture();
    const group = channels.createGroup({ name: 'Launch', members: ['ada'] });
    const from = '2026-11-03T16:00:00.000Z';
    const to = '2026-11-04T16:00:00.000Z';
    for (const [id, at] of [
      ['before', '2026-11-03T15:59:59.999Z'],
      ['first', from],
      ['offset', '2026-11-04T09:00:00+08:00'],
      ['last', '2026-11-04T15:59:59.999Z'],
      ['after', to],
    ] as const)
      await channels.appendMessage(group.id, {
        id,
        at,
        author: { kind: 'bot', slug: 'ada' },
        body: id,
      });
    expect(channels.humanMessageCounts!(from, to)).toEqual([
      { channelId: group.id, author: { kind: 'bot', slug: 'ada' }, count: 3 },
    ]);
  });

  it('marks legacy imported replies that precede their Human target', async () => {
    const home = createTempRoot('human-inbox-legacy-');
    const rootDir = join(home, 'channels');
    const legacy = createChannelStore({ rootDir });
    const group = legacy.createGroup({ name: 'Legacy', members: ['ada'] });
    await legacy.appendMessage(group.id, {
      id: 'human-plan',
      at: '2026-11-01T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'Review.',
    });
    await legacy.appendMessage(group.id, {
      id: 'ada-reply',
      at: '2026-11-01T00:01:00.000Z',
      author: { kind: 'bot', slug: 'ada' },
      body: 'Reviewed.',
      replyTo: 'human-plan',
    });
    const file = join(rootDir, group.id, 'messages.ndjson');
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    writeFileSync(file, [...lines].reverse().join('\n') + '\n');
    const owner = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const database = attachOperationalModule(owner, 'human-inbox-legacy');
    createSqliteChannelStore({ database, rootDir });
    expect(
      database.read((db) =>
        db
          .prepare(
            'SELECT message_id, for_human FROM channel_placements WHERE channel_id = ? ORDER BY revision',
          )
          .all(group.id),
      ),
    ).toEqual([
      { message_id: 'ada-reply', for_human: 1 },
      { message_id: 'human-plan', for_human: 0 },
    ]);
  });
});
