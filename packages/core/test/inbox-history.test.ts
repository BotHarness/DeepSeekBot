import { describe, expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createTempRoot } from './helpers.js';
import { createInboxHistoryQuery } from '../src/runtime/inbox-history.js';

async function fixture(
  check: (
    core: ReturnType<typeof createCore>,
    append: (input: {
      id: string;
      bot?: string;
      body?: string;
      at?: string;
      kind?: string;
      reason?: string;
      channel?: string;
      payload?: object;
      state?: string;
    }) => void,
  ) => void | Promise<void>,
) {
  const core = createCore({ dshHome: createTempRoot('inbox-history-') });
  expect(core.operationalDatabase.mode, JSON.stringify(core.operationalDatabase.recovery)).toBe(
    'ready',
  );
  const database = attachOperationalModule(core.operationalDatabase, 'messaging');
  const append = (
    input: Parameters<Parameters<typeof fixture>[0]>[1] extends (input: infer T) => void
      ? T
      : never,
  ) => {
    database.transaction((db) => {
      db.prepare(`INSERT INTO source_events
        (source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        input.id,
        input.kind ?? 'human-message',
        input.bot ?? 'ada',
        input.channel ?? 'dm-ada',
        input.id,
        input.body ?? '',
        input.at ?? '2026-10-09T00:00:00.000Z',
        JSON.stringify(input.payload ?? { author: { kind: 'human' } }),
      );
      db.prepare(`INSERT INTO inbox_admissions (source_event_id, bot_slug, reason, attempt_state)
        VALUES (?, ?, ?, ?)`).run(
        input.id,
        input.bot ?? 'ada',
        input.reason ?? 'human-dm',
        input.state ?? 'handled',
      );
    });
  };
  try {
    await check(core, append);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

describe('own-Bot Inbox history', () => {
  it('removes purged tokens from FTS storage instead of leaving recoverable delete keys', async () => {
    await fixture((core, append) => {
      append({ id: 'secret', body: 'xqz' });
      const database = attachOperationalModule(core.operationalDatabase, 'messaging');
      const indexContainsSecret = () =>
        database.read((db) =>
          db
            .prepare('SELECT block FROM inbox_history_fts_data')
            .all()
            .some(
              (row) =>
                row.block instanceof Uint8Array &&
                Buffer.from(row.block).includes(Buffer.from('xqz')),
            ),
        );
      expect(indexContainsSecret()).toBe(true);
      database.transaction((db) => {
        db.prepare(
          "INSERT INTO messaging_purge_facts VALUES ('secret', 'dm-ada', 'secret', ?, '{}')",
        ).run('2026-10-10T00:00:00.000Z');
        db.prepare(
          "UPDATE source_events SET body = '', payload_json = '{}' WHERE source_event_id = 'secret'",
        ).run();
      });
      expect(indexContainsSecret()).toBe(false);
    });
  });

  it('removes derived cause content when that cause is purged, including after rebuild', async () => {
    await fixture((core, append) => {
      append({ id: 'cause', body: 'private original' });
      append({
        id: 'record',
        kind: 'self-record',
        reason: 'memory-commit',
        payload: {
          causeSourceEventId: 'cause',
          memoryCommit: { subject: 'Nova secret summary', files: [{ path: 'secret.md' }] },
        },
      });
      expect(core.inboxHistory.list('ada', { query: 'secret' }).items).toHaveLength(1);
      const database = attachOperationalModule(core.operationalDatabase, 'messaging');
      database.transaction((db) => {
        db.prepare(
          "INSERT INTO messaging_purge_facts VALUES ('cause', 'dm-ada', 'cause', ?, '{}')",
        ).run('2026-10-10T00:00:00.000Z');
        db.prepare(
          "UPDATE source_events SET body = '', payload_json = '{}' WHERE source_event_id = 'cause'",
        ).run();
      });
      expect(core.inboxHistory.list('ada').items).toEqual([]);
      core.inboxHistory.rebuild();
      expect(core.inboxHistory.list('ada', { query: 'secret' }).items).toEqual([]);
      expect(
        database.read((db) =>
          db
            .prepare("SELECT rowid FROM inbox_history_fts WHERE inbox_history_fts MATCH 'secret'")
            .all(),
        ),
      ).toEqual([]);
    });
  });

  it('expires ranked cursors rather than silently changing their order', async () => {
    await fixture((core, append) => {
      append({ id: 'a', body: 'Nova launch' });
      append({ id: 'b', body: 'Nova launch' });
      let timestamp = 0;
      const query = createInboxHistoryQuery(
        attachOperationalModule(core.operationalDatabase, 'messaging'),
        core.channels,
        () => new Date(timestamp),
      );
      const first = query.list('ada', { query: 'Nova', limit: 1 });
      timestamp = 600_000;
      expect(() => query.list('ada', { query: 'Nova', cursor: first.nextCursor! })).toThrow(
        'expired',
      );
    });
  });

  it('finds handled messages and empty-body records in English, Chinese and paths, without changing attention', async () => {
    await fixture((core, append) => {
      append({ id: 'message', body: '星期五发布 Nova launch checklist', state: 'pending' });
      append({ id: 'private', bot: 'bea', body: 'Nova private secret 星期五发布' });
      append({
        id: 'commit',
        kind: 'self-record',
        reason: 'memory-commit',
        payload: {
          causeSourceEventId: 'message',
          memoryCommit: {
            botSlug: 'ada',
            sha: 'a'.repeat(40),
            subject: 'Remember 星期五发布 launch',
            authorName: 'Ana',
            files: [{ path: 'plans/checklist.md' }],
          },
        },
      });
      append({
        id: 'action',
        kind: 'self-record',
        reason: 'bot-action',
        payload: {
          causeSourceEventId: 'message',
          botDmAction: { channelId: 'dm-ada-bea', messageId: 'target', recipientBotSlug: 'bea' },
        },
      });
      const db = attachOperationalModule(core.operationalDatabase, 'messaging');
      const before = db.read((database) =>
        database.prepare('SELECT * FROM inbox_admissions ORDER BY source_event_id').all(),
      );
      expect(
        core.inboxHistory
          .list('ada', { query: '星期五' })
          .items.map((row) => row.sourceEventId)
          .sort(),
      ).toEqual(['commit', 'message']);
      expect(
        core.inboxHistory.list('ada', { query: 'checklist.md', kind: 'memory-commit' }).items,
      ).toMatchObject([
        { sourceEventId: 'commit', state: 'handled', causeSourceEventId: 'message' },
      ]);
      expect(
        core.inboxHistory.list('ada', { query: '发送了私聊', kind: 'bot-action' }).items,
      ).toMatchObject([{ sourceEventId: 'action', state: 'handled' }]);
      expect(
        core.inboxHistory
          .list('ada', { query: 'launch' })
          .items.map((row) => row.sourceEventId)
          .sort(),
      ).toEqual(['commit', 'message']);
      expect(
        core.inboxHistory.list('ada', { kind: 'dm' }).items.map((row) => row.sourceEventId),
      ).toEqual(['message']);
      expect(core.inboxHistory.list('ada', { causeSourceEventId: 'message' }).items).toHaveLength(
        2,
      );
      expect(
        db.read((database) =>
          database.prepare('SELECT * FROM inbox_admissions ORDER BY source_event_id').all(),
        ),
      ).toEqual(before);
    });
  });

  it('pages tied timestamps deterministically and excludes later/backdated inserts from the same list', async () => {
    await fixture((core, append) => {
      for (const id of ['a', 'b', 'c', 'd']) append({ id, body: id });
      const first = core.inboxHistory.list('ada', { limit: 2 });
      expect(first.items.map((row) => row.sourceEventId)).toEqual(['d', 'c']);
      append({ id: 'new', at: '2026-10-10T00:00:00.000Z' });
      append({ id: 'backdated', at: '2026-10-08T00:00:00.000Z' });
      const second = core.inboxHistory.list('ada', { limit: 2, cursor: first.nextCursor! });
      expect(second.items.map((row) => row.sourceEventId)).toEqual(['b', 'a']);
      expect(second.nextCursor).toBeUndefined();
      expect(() => core.inboxHistory.list('bea', { cursor: first.nextCursor! })).toThrow(
        'does not match',
      );
      expect(() =>
        core.inboxHistory.list('ada', { cursor: first.nextCursor!, kind: 'schedule' }),
      ).toThrow('does not match');
    });
  });

  it('freezes FTS relevance order while inserts change the corpus', async () => {
    await fixture((core, append) => {
      append({ id: 'short', body: 'Nova Nova Nova' });
      append({ id: 'medium', body: 'Nova owns the launch checklist' });
      append({ id: 'long', body: 'Nova ' + 'unrelated text '.repeat(60) });
      const expected = core.inboxHistory
        .list('ada', { query: 'Nova' })
        .items.map((row) => row.sourceEventId);
      expect(expected[0]).toBe('short');
      const first = core.inboxHistory.list('ada', { query: 'Nova', limit: 1 });
      append({
        id: 'new-best',
        body: 'Nova Nova Nova Nova Nova Nova',
        at: '2026-10-10T00:00:00.000Z',
      });
      for (let i = 0; i < 20; i++) append({ id: 'noise-' + i, body: 'Very long '.repeat(100) });
      const second = core.inboxHistory.list('ada', {
        query: 'Nova',
        limit: 1,
        cursor: first.nextCursor!,
      });
      const third = core.inboxHistory.list('ada', {
        query: 'Nova',
        limit: 1,
        cursor: second.nextCursor!,
      });
      expect(
        [...first.items, ...second.items, ...third.items].map((row) => row.sourceEventId),
      ).toEqual(expected);
      expect(third.nextCursor).toBeUndefined();
      expect(() =>
        core.inboxHistory.list('bea', { query: 'Nova', cursor: first.nextCursor! }),
      ).toThrow();
      core.inboxHistory.clear();
      expect(() =>
        core.inboxHistory.list('ada', { query: 'Nova', cursor: first.nextCursor! }),
      ).toThrow('expired');
    });
  });

  it('removes updated, retracted and purged terms from the index and existing search cursors', async () => {
    await fixture((core, append) => {
      append({ id: 'a', body: 'Nova secret original' });
      append({ id: 'b', body: 'Nova secret original' });
      append({ id: 'c', body: 'Nova secret original' });
      const first = core.inboxHistory.list('ada', { query: 'secret', limit: 1 });
      const database = attachOperationalModule(core.operationalDatabase, 'messaging');
      database.transaction((db) => {
        db.prepare(
          "UPDATE source_events SET body = 'replacement text' WHERE source_event_id = 'a'",
        ).run();
        db.prepare("DELETE FROM inbox_admissions WHERE source_event_id = 'b'").run();
        db.prepare("DELETE FROM source_events WHERE source_event_id = 'b'").run();
        db.prepare("INSERT INTO messaging_purge_facts VALUES ('c', 'dm-ada', 'c', ?, '{}')").run(
          '2026-10-10T00:00:00.000Z',
        );
        db.prepare(
          "UPDATE source_events SET body = '', payload_json = '{}' WHERE source_event_id = 'c'",
        ).run();
      });
      expect(core.inboxHistory.list('ada', { query: 'secret' }).items).toEqual([]);
      expect(
        core.inboxHistory.list('ada', { query: 'secret', cursor: first.nextCursor! }).items,
      ).toEqual([]);
      expect(
        database.read((db) =>
          db
            .prepare("SELECT rowid FROM inbox_history_fts WHERE inbox_history_fts MATCH 'secret'")
            .all(),
        ),
      ).toEqual([]);
      expect(core.inboxHistory.list('ada', { query: 'replacement' }).items).toMatchObject([
        { sourceEventId: 'a' },
      ]);
      core.inboxHistory.rebuild();
      expect(core.inboxHistory.list('ada', { query: 'secret' }).items).toEqual([]);
    });
  });

  it('indexes and unindexes changes in the same transaction, including rollback', async () => {
    await fixture((core, append) => {
      append({ id: 'visible', body: 'launch original' });
      const database = attachOperationalModule(core.operationalDatabase, 'messaging');
      expect(() =>
        database.transaction((db) => {
          db.prepare(
            "UPDATE source_events SET body = 'rolled back marker' WHERE source_event_id = 'visible'",
          ).run();
          expect(
            db
              .prepare("SELECT rowid FROM inbox_history_fts WHERE inbox_history_fts MATCH 'marker'")
              .all(),
          ).toHaveLength(1);
          throw new Error('rollback');
        }),
      ).toThrow(
        expect.objectContaining({ cause: expect.objectContaining({ message: 'rollback' }) }),
      );
      expect(core.inboxHistory.list('ada', { query: 'marker' }).items).toEqual([]);
      expect(core.inboxHistory.list('ada', { query: 'original' }).items).toHaveLength(1);
    });
  });

  it('bounds fields/pages and filters kind, Channel and inclusive time', async () => {
    await fixture((core, append) => {
      for (let i = 0; i < 55; i++) append({ id: 'event-' + i, body: '记忆发布计划 '.repeat(100) });
      append({
        id: 'schedule',
        channel: 'other',
        kind: 'schedule',
        reason: 'schedule',
        at: '2026-10-10T00:00:00.000Z',
      });
      const page = core.inboxHistory.list('ada', { limit: 50 });
      expect(page.items).toHaveLength(50);
      expect(page.nextCursor).toBeDefined();
      expect(page.items.every((row) => Array.from(row.snippet).length <= 300)).toBe(true);
      expect(
        core.inboxHistory.list('ada', {
          channelId: 'other',
          kind: 'schedule',
          since: '2026-10-10T00:00:00.000Z',
          until: '2026-10-10T00:00:00.000Z',
        }).items,
      ).toMatchObject([{ sourceEventId: 'schedule' }]);
      expect(() => core.inboxHistory.list('ada', { limit: 51 })).toThrow();
      expect(() => core.inboxHistory.list('ada', { query: '发布' })).toThrow('trigram');
      expect(() => core.inboxHistory.list('ada', { cursor: 'bad' })).toThrow('invalid cursor');
      expect(() => core.inboxHistory.list('ada', { since: 'bad' })).toThrow();
    });
  });

  it('backfills generation 76 and searches the same canonical history after restart', async () => {
    const home = createTempRoot('history-upgrade-');
    const prior = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((row) => row.generation <= 76),
      ),
    });
    attachOperationalModule(prior, 'messaging').transaction((db) => {
      db.prepare(`INSERT INTO source_events (source_event_id, source_kind, bot_slug, body, created_at)
        VALUES ('legacy', 'human-message', 'ada', '星期五发布 launch', '2026-10-09T00:00:00.000Z')`).run();
      db.prepare(
        "INSERT INTO inbox_admissions (source_event_id, bot_slug, reason, attempt_state) VALUES ('legacy', 'ada', 'human-dm', 'handled')",
      ).run();
    });
    prior.close();
    for (let i = 0; i < 2; i++) {
      const core = createCore({ dshHome: home });
      try {
        expect(core.operationalDatabase.generation).toBe(78);
        expect(core.inboxHistory.list('ada', { query: '星期五' }).items).toMatchObject([
          { sourceEventId: 'legacy', state: 'handled' },
        ]);
      } finally {
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    }
  });
});
