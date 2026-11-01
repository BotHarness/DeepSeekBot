import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createAttachmentStore } from '../src/attachments/store.js';
import { isChannelMessage, type ChannelMessage } from '../src/channels/channel.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { pageChannelTimeline, type ChannelTimelineRequest } from '../src/channels/timeline.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseModulePort,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const timestamp = '2026-11-01T00:00:00.000Z';
const message = (id: string, fields: Partial<ChannelMessage> = {}): ChannelMessage => ({
  id,
  at: timestamp,
  author: { kind: 'bot', slug: 'ada' },
  body: id,
  ...fields,
});

function fixture() {
  const root = createTempRoot();
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const database = attachOperationalModule(owner, 'channels');
  const files = createAttachmentStore({ rootDir: join(root, 'attachments') });
  const metrics = { reads: 0, rows: 0 };
  const observed: OperationalDatabaseModulePort = {
    module: database.module,
    read(query) {
      const result = database.read(query);
      metrics.reads++;
      metrics.rows += Array.isArray(result) ? result.length : Number(result !== undefined);
      return result;
    },
    transaction: (command, topics) => database.transaction(command, topics),
  };
  const channels = createSqliteChannelStore({
    database: observed,
    rootDir: join(root, 'channels'),
    attachments: files,
  });
  const channel = channels.createGroup({ name: 'Bounded timeline', members: ['ada'] });
  let revision = 0;
  const seed = (...entries: ChannelMessage[]) => {
    database.transaction((db) => {
      const event = db.prepare(`
        INSERT INTO source_events
          (source_event_id, source_kind, channel_id, message_id, body, created_at, payload_json)
        VALUES (?, 'bot-message', ?, ?, ?, ?, ?)
      `);
      const placement = db.prepare(`
        INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
        VALUES (?, ?, ?, ?)
      `);
      for (const entry of entries) {
        expect(isChannelMessage(entry)).toBe(true);
        const { body, ...envelope } = entry;
        event.run(
          entry.id + '-source',
          channel.id,
          entry.id,
          body,
          entry.at,
          JSON.stringify(envelope),
        );
        placement.run(channel.id, ++revision, entry.id + '-source', entry.id);
      }
    });
  };
  const projectedHistory = () => {
    const result: ChannelMessage[] = [];
    let before: string | undefined;
    for (;;) {
      const batch = channels.readMessages(channel.id, {
        limit: 200,
        ...(before === undefined ? {} : { before }),
      });
      result.unshift(...batch.toReversed());
      if (batch.length < 200) return result;
      before = batch.at(-1)?.id;
    }
  };
  return { channels, channel, database, metrics, seed, projectedHistory, files };
}

describe('SQLite bounded timeline hydration', () => {
  it('checks message existence without hydrating growing histories', () => {
    const current = fixture();
    for (const count of [50, 240, 2000]) {
      current.seed(
        ...Array.from({ length: count }, (_, index) => message(`exists-${count}-${index}`)),
      );
      current.metrics.reads = 0;
      current.metrics.rows = 0;
      expect(current.channels.hasMessage(current.channel.id, `exists-${count}-0`)).toBe(true);
      expect(current.channels.hasMessage(current.channel.id, `exists-${count}-${count - 1}`)).toBe(
        true,
      );
      expect(current.channels.hasMessage(current.channel.id, 'absent')).toBe(false);
      expect(current.channels.hasMessage('group-absent', `exists-${count}-0`)).toBe(false);
      expect(current.metrics.reads).toBeLessThanOrEqual(4);
      expect(current.metrics.rows).toBeLessThanOrEqual(2);
    }
  });

  it('keeps existence tied to placement even for fallback and shared source messages', () => {
    const current = fixture();
    current.seed(message('shared'));
    const other = current.channels.createGroup({ name: 'Other', members: ['ada'] });
    current.database.transaction((db) => {
      db.prepare('UPDATE source_events SET payload_json = ? WHERE message_id = ?').run(
        'null',
        'shared',
      );
      db.prepare(`
        INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
        VALUES (?, 1, 'shared-source', 'shared')
      `).run(other.id);
      db.prepare(`
        INSERT INTO source_events
          (source_event_id, source_kind, channel_id, message_id, body, created_at, payload_json)
        VALUES ('unplaced-source', 'bot-message', ?, 'unplaced', 'body', ?, 'null')
      `).run(current.channel.id, timestamp);
    });
    expect(current.channels.hasMessage(current.channel.id, 'shared')).toBe(true);
    expect(current.channels.hasMessage(other.id, 'shared')).toBe(true);
    expect(current.channels.hasMessage(current.channel.id, 'unplaced')).toBe(false);
    expect(current.channels.hasMessage(other.id, 'unplaced')).toBe(false);
    expect(current.channels.hasMessage('../invalid', 'shared')).toBe(false);
    expect(current.channels.hasMessage(current.channel.id, '')).toBe(false);
  });

  it('bounds latest and around hydration as ordinary history grows', () => {
    const current = fixture();
    for (const count of [50, 240, 2000]) {
      current.seed(
        ...Array.from({ length: count }, (_, index) => message(`batch-${count}-${index}`)),
      );
      for (const request of [
        { limit: 50 },
        { direction: 'around', around: 'batch-50-25', olderLimit: 20, newerLimit: 20 },
      ] satisfies ChannelTimelineRequest[]) {
        current.metrics.reads = 0;
        current.metrics.rows = 0;
        const page = current.channels.readHumanTimeline(current.channel.id, request);
        expect(page?.entries).toHaveLength(request.direction === 'around' ? 41 : 50);
        expect(current.metrics.reads).toBeLessThanOrEqual(65);
        expect(current.metrics.rows).toBeLessThanOrEqual(180);
      }
    }
  });

  it('matches full-history pagination for ordering, notices, fallbacks and cursor boundaries', () => {
    const current = fixture();
    current.seed(
      ...Array.from({ length: 260 }, (_, index) =>
        message(`entry-${index}`, {
          at: new Date(Date.parse(timestamp) - (index % 7) * 1000).toISOString(),
          ...(index % 13 === 0 ? { botCreateAction: { botSlug: 'bea', displayName: 'Bea' } } : {}),
          ...(index % 17 === 0 ? { replyTo: 'entry-1' } : {}),
        }),
      ),
    );
    current.database.transaction((db) => {
      db.prepare('UPDATE source_events SET payload_json = ? WHERE message_id = ?').run(
        'null',
        'entry-27',
      );
      db.prepare('UPDATE source_events SET created_at = ? WHERE message_id = ?').run(
        '2025-01-01T00:00:00.000Z',
        'entry-101',
      );
    });
    const all = current.projectedHistory();
    const anchor = pageChannelTimeline(current.channel.id, all, {
      direction: 'around',
      around: 'entry-101',
      olderLimit: 0,
      newerLimit: 0,
    })!;
    const requests: ChannelTimelineRequest[] = [
      {},
      { limit: 0 },
      { limit: 201 },
      { limit: -10 },
      { limit: 2.5 },
      { direction: 'around', around: 'entry-0', olderLimit: 200, newerLimit: 1 },
      { direction: 'around', around: 'entry-259', olderLimit: 2, newerLimit: 200 },
      { direction: 'around', around: 'entry-27', olderLimit: 0, newerLimit: 0 },
      { direction: 'around', around: 'entry-101', olderLimit: 201, newerLimit: 201 },
      { direction: 'around', around: 'entry-101', olderLimit: 2.5, newerLimit: 2.5 },
      { direction: 'older', cursor: anchor.olderCursor!, limit: 2.5 },
      { direction: 'newer', cursor: anchor.newerCursor!, limit: 2.5 },
      { direction: 'around', around: 'missing' },
      { direction: 'older', cursor: 'invalid' },
      { direction: 'newer', cursor: 'x'.repeat(2049) },
      {
        direction: 'older',
        cursor: Buffer.from(
          JSON.stringify({ v: 1, channelId: 'dm-other', id: 'entry-101', at: all[101]!.at }),
        ).toString('base64url'),
      },
      {
        direction: 'newer',
        cursor: Buffer.from(
          JSON.stringify({ v: 1, channelId: current.channel.id, id: 'entry-101', at: timestamp }),
        ).toString('base64url'),
      },
    ];
    for (const request of requests) {
      const expected = pageChannelTimeline(current.channel.id, all, request);
      expect(current.channels.readTimeline(current.channel.id, request)).toEqual(expected);
      expect(current.channels.readHumanTimeline(current.channel.id, request)).toEqual(expected);
    }
    const collected: ChannelMessage[] = [];
    let page = current.channels.readTimeline(current.channel.id)!;
    for (;;) {
      collected.unshift(...page.entries);
      if (!page.hasOlder) break;
      page = current.channels.readTimeline(current.channel.id, {
        direction: 'older',
        cursor: page.olderCursor!,
      })!;
    }
    expect(collected).toEqual(all);
  });

  it('keeps off-page dependencies inside the Human visibility boundary', () => {
    const current = fixture();
    current.seed(
      message('hidden-target', { body: 'Never reveal this earlier body' }),
      message('hidden-resolution', {
        author: { kind: 'human' },
        replyTo: 'visible-grant',
        grantRequestResolution: { requestMessageId: 'visible-grant', grantId: 'hidden-grant' },
      }),
      message('before-3'),
      message('before-4'),
      message('before-5'),
      message('visible-reply', { replyTo: 'hidden-target' }),
      message('visible-grant', { grantRequest: true }),
      message('resolved-grant', { grantRequest: true }),
      ...Array.from({ length: 250 }, (_, index) => message(`middle-${index}`)),
      message('visible-resolution', {
        author: { kind: 'human' },
        replyTo: 'resolved-grant',
        grantRequestResolution: { requestMessageId: 'resolved-grant', grantId: 'visible-grant' },
      }),
    );
    current.database.transaction((db) =>
      db
        .prepare('UPDATE channel_human_members SET visible_from_revision = 6 WHERE channel_id = ?')
        .run(current.channel.id),
    );
    const request = {
      direction: 'around',
      around: 'visible-reply',
      olderLimit: 0,
      newerLimit: 2,
    } as const;
    const page = current.channels.readHumanTimeline(current.channel.id, request)!;
    expect(page.hasOlder).toBe(false);
    expect(page.hasNewer).toBe(true);
    expect(page.entries[0]?.replyToPreview).toBeNull();
    expect(page.entries[1]?.grantRequestResolved).toBe(false);
    expect(page.entries[2]?.grantRequestResolved).toBe(true);
    const plain = current.channels.readTimeline(current.channel.id, request)!;
    expect(plain.entries[0]?.replyToPreview?.body).toBe('Never reveal this earlier body');
    expect(plain.entries[1]?.grantRequestResolved).toBe(true);
    const hidden = current.channels.readTimeline(current.channel.id, {
      direction: 'around',
      around: 'hidden-target',
    })!;
    expect(
      current.channels.readHumanTimeline(current.channel.id, {
        direction: 'newer',
        cursor: hidden.olderCursor!,
      }),
    ).toBeUndefined();
    expect(
      current.channels.readHumanTimeline(current.channel.id, {
        direction: 'around',
        around: 'hidden-target',
      }),
    ).toBeUndefined();
    current.database.transaction((db) =>
      db.prepare('DELETE FROM channel_human_members WHERE channel_id = ?').run(current.channel.id),
    );
    expect(current.channels.readHumanTimeline(current.channel.id)).toBeUndefined();
  });

  it('keeps cursor positions stable across sparse revisions and later appends', () => {
    const current = fixture();
    current.seed(...Array.from({ length: 75 }, (_, index) => message(`sparse-${index}`)));
    current.database.transaction((db) =>
      db
        .prepare('UPDATE channel_placements SET revision = revision * 1000 WHERE channel_id = ?')
        .run(current.channel.id),
    );
    const initial = current.channels.readTimeline(current.channel.id)!;
    const before = current.projectedHistory();
    const older = { direction: 'older', cursor: initial.olderCursor! } as const;
    expect(current.channels.readTimeline(current.channel.id, older)).toEqual(
      pageChannelTimeline(current.channel.id, before, older),
    );
    current.database.transaction((db) =>
      db
        .prepare('UPDATE channel_placements SET revision = revision / 1000 WHERE channel_id = ?')
        .run(current.channel.id),
    );
    current.seed(message('appended'));
    const after = current.projectedHistory();
    for (const request of [
      older,
      { direction: 'newer', cursor: initial.newerCursor! },
    ] satisfies ChannelTimelineRequest[])
      expect(current.channels.readTimeline(current.channel.id, request)).toEqual(
        pageChannelTimeline(current.channel.id, after, request),
      );
    expect(
      current.channels
        .readTimeline(current.channel.id, { direction: 'newer', cursor: initial.newerCursor! })
        ?.entries.map((entry) => entry.id),
    ).toEqual(['appended']);
  });

  it('bounds reaction reads and preserves page metadata, legacy files and old reply targets', async () => {
    const current = fixture();
    const file = await current.files.upload({
      data: (async function* () {
        yield Buffer.from('report');
      })(),
      name: 'report.txt',
    });
    const legacy = {
      hash: 'sha256:' + 'b'.repeat(64),
      name: 'report.txt',
      mime: 'text/plain',
      size: 6,
    };
    current.seed(
      message('old-target', { body: '字🙂 '.repeat(160), attachments: [legacy] }),
      ...Array.from({ length: 250 }, (_, index) => message(`old-${index}`)),
      message('with-file', { attachments: [legacy], replyTo: 'old-target' }),
      message('post', {
        botChannelPost: { channelId: current.channel.id, messageId: 'old-target' },
      }),
    );
    current.database.transaction((db) => {
      db.prepare(`INSERT INTO attachment_file_bindings
        (source_event_id, attachment_index, file_id, original_json, target_json, state)
        VALUES (?, 0, ?, ?, ?, 'ready')`).run(
        'with-file-source',
        file.fileId!,
        JSON.stringify(legacy),
        JSON.stringify(file),
      );
      db.prepare(
        "INSERT INTO inbox_admissions (source_event_id, bot_slug, reason) VALUES (?, 'ada', 'group-ordinary')",
      ).run('with-file-source');
      const reaction = db.prepare(`INSERT INTO channel_reactions
        (channel_id, message_id, actor_kind, actor_id, emoji, reacted_at)
        VALUES (?, ?, 'human', ?, '👍', ?)`);
      reaction.run(current.channel.id, 'with-file', 'local-human', timestamp);
      for (let index = 0; index < 500; index++)
        reaction.run(current.channel.id, 'old-target', `past-actor-${index}`, timestamp);
    });
    const retained = () =>
      current.database.read((db) =>
        db.prepare('SELECT payload_json FROM source_events WHERE message_id = ?').get('with-file'),
      );
    const envelope = retained();
    const expected = pageChannelTimeline(current.channel.id, current.projectedHistory(), {
      limit: 2,
    });
    current.metrics.reads = 0;
    current.metrics.rows = 0;
    const page = current.channels.readHumanTimeline(current.channel.id, { limit: 2 })!;
    expect(page).toEqual(expected);
    expect(current.metrics.reads).toBeLessThanOrEqual(15);
    expect(current.metrics.rows).toBeLessThanOrEqual(25);
    expect(page.entries[0]).toMatchObject({
      attachments: [file],
      deliveries: [{ botSlug: 'ada', state: 'pending' }],
      reactions: [{ emoji: '👍' }],
      humanReceipts: [{ state: 'unread' }],
    });
    expect(page.entries[0]?.replyToPreview?.body).toContain('...');
    expect(retained()).toEqual(envelope);
    await current.channels.markRead(current.channel.id, 'with-file');
    expect(
      current.channels.readHumanTimeline(current.channel.id, { limit: 2 })?.entries[0]
        ?.humanReceipts?.[0]?.state,
    ).toBe('read');
  });

  it('refuses NaN window sizes instead of loading all history', () => {
    const current = fixture();
    current.seed(message('one'));
    expect(
      current.channels.readTimeline(current.channel.id, { limit: Number.NaN }),
    ).toBeUndefined();
    expect(
      current.channels.readTimeline(current.channel.id, {
        direction: 'around',
        around: 'one',
        olderLimit: Number.NaN,
      }),
    ).toBeUndefined();
  });

  it('keeps empty windows and exhausted directional cursors identical', () => {
    const current = fixture();
    expect(current.channels.readTimeline(current.channel.id)).toEqual(
      pageChannelTimeline(current.channel.id, []),
    );
    expect(current.channels.readHumanTimeline('dm-missing')).toBeUndefined();
    expect(current.channels.readTimeline('../invalid')).toEqual(
      pageChannelTimeline('../invalid', []),
    );
    current.seed(message('single'));
    const page = current.channels.readTimeline(current.channel.id)!;
    const all = current.projectedHistory();
    for (const direction of ['older', 'newer'] as const) {
      const request = { direction, cursor: page.olderCursor! };
      expect(current.channels.readTimeline(current.channel.id, request)).toEqual(
        pageChannelTimeline(current.channel.id, all, request),
      );
    }
  });
});
