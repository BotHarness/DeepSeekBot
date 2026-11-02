import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createAttachmentStore } from '../src/attachments/store.js';
import { isChannelMessage, type ChannelMessage } from '../src/channels/channel.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseModulePort,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const timestamp = '2026-11-01T00:00:00.000Z';

function message(id: string, fields: Partial<ChannelMessage> = {}): ChannelMessage {
  return { id, at: timestamp, author: { kind: 'bot', slug: 'ada' }, body: id, ...fields };
}

function fixture() {
  const root = createTempRoot();
  const files = createAttachmentStore({ rootDir: join(root, 'attachments') });
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const database = attachOperationalModule(owner, 'channels');
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
  const channel = channels.createGroup({ name: 'Latest preview', members: ['ada'] });
  let revision = 0;
  const seed = (...messages: ChannelMessage[]) => {
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
      for (const entry of messages) {
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
  const assertLatest = (id: string) => {
    expect(channels.latestMessage(channel.id)).toEqual(channels.message(channel.id, id));
  };
  return { channels, channel, database, metrics, seed, assertLatest, files };
}

describe('SQLite latest Channel preview', () => {
  it('bounds per-message hydration independently of ordinary history length', () => {
    const f = fixture();
    for (const count of [1, 120, 1000]) {
      f.seed(...Array.from({ length: count }, (_, index) => message(`batch-${count}-${index}`)));
      f.metrics.reads = 0;
      f.metrics.rows = 0;
      expect(f.channels.latestMessage(f.channel.id)?.id).toBe(`batch-${count}-${count - 1}`);
      expect(f.metrics.reads).toBeLessThanOrEqual(6);
      expect(f.metrics.rows).toBeLessThanOrEqual(6);
    }
  });

  it('keeps empty, missing and invalid Channels empty', () => {
    const f = fixture();
    expect(f.channels.latestMessage(f.channel.id)).toBeUndefined();
    expect(f.channels.latestMessage('dm-missing')).toBeUndefined();
    expect(f.channels.latestMessage('../invalid')).toBeUndefined();
  });

  it('skips every notice kind, including an all-notice Channel', () => {
    const f = fixture();
    const notices = [
      message('dm-action', {
        botDmAction: { channelId: 'dm-bea', messageId: 'post', recipientBotSlug: 'bea' },
      }),
      message('create-action', { botCreateAction: { botSlug: 'bea', displayName: 'Bea' } }),
      message('post-notice', { botChannelPost: { channelId: 'dm-bea', messageId: 'post' } }),
      message('memory-notice', {
        author: { kind: 'system' },
        memoryCommit: {
          botSlug: 'ada',
          sha: 'a'.repeat(40),
          subject: 'Memory',
          authorName: 'Ada',
          authoredAt: timestamp,
          files: [],
          moreFiles: 0,
        },
      }),
      message('approval-notice', {
        author: { kind: 'system' },
        toolAutoApproval: {
          botSlug: 'ada',
          sessionId: 'session',
          callId: 'call',
          toolName: 'shell',
          input: '',
          template: 'default',
          outcome: 'allowed',
          reason: 'rule',
        },
      }),
      message('pause-notice', {
        author: { kind: 'system' },
        toolAutoApprovalPause: {
          botSlug: 'ada',
          sessionId: 'session',
          template: 'default',
          state: 'paused',
        },
      }),
    ];
    f.seed(...notices);
    expect(f.channels.latestMessage(f.channel.id)).toBeUndefined();
    f.seed(message('ordinary'));
    for (const [index, notice] of notices.entries()) {
      f.seed({ ...notice, id: `suffix-${index}` });
      f.assertLatest('ordinary');
    }
  });

  it.each(['null', '{"botCreateAction":null}', '{"author":{"kind":"future"}}'])(
    'preserves the future-message fallback for payload %s',
    (payload) => {
      const f = fixture();
      f.seed(message('ordinary'), message('future'));
      f.database.transaction((db) =>
        db
          .prepare('UPDATE source_events SET payload_json = ? WHERE message_id = ?')
          .run(payload, 'future'),
      );
      f.assertLatest('future');
      expect(f.channels.latestMessage(f.channel.id)).toMatchObject({
        id: 'future',
        author: { kind: 'system' },
        body: 'This message was written by a newer version and cannot be shown.',
      });
    },
  );

  it('projects old, missing and future-version reply targets identically', () => {
    const f = fixture();
    f.seed(message('target', { body: '  ' + '字🙂 '.repeat(160) + '\n' }));
    f.seed(...Array.from({ length: 300 }, (_, index) => message(`history-${index}`)));
    f.seed(message('reply', { replyTo: 'target' }));
    f.assertLatest('reply');
    expect(f.channels.latestMessage(f.channel.id)?.replyToPreview?.body).toBe(
      Array.from('字🙂 '.repeat(160).trim()).slice(0, 140).join('') + '...',
    );
    f.seed(message('missing-reply', { replyTo: 'absent' }));
    f.assertLatest('missing-reply');
    expect(f.channels.latestMessage(f.channel.id)?.replyToPreview).toBeNull();
    f.database.transaction((db) =>
      db
        .prepare('UPDATE source_events SET payload_json = ? WHERE message_id = ?')
        .run('null', 'target'),
    );
    f.seed(message('future-target-reply', { replyTo: 'target' }));
    f.assertLatest('future-target-reply');
  });

  it('preserves resolved grants across out-of-order placements and malformed history', () => {
    const f = fixture();
    f.seed(message('unresolved', { grantRequest: true }));
    f.assertLatest('unresolved');
    expect(f.channels.latestMessage(f.channel.id)?.grantRequestResolved).toBe(false);
    f.seed(message('malformed'));
    f.database.transaction((db) =>
      db
        .prepare('UPDATE source_events SET payload_json = ? WHERE message_id = ?')
        .run('{"author":{"kind":"future"}}', 'malformed'),
    );
    f.seed(
      message('resolution', {
        author: { kind: 'human' },
        replyTo: 'request',
        grantRequestResolution: { requestMessageId: 'request', grantId: 'grant' },
      }),
    );
    f.seed(message('request', { grantRequest: true }));
    f.assertLatest('request');
    expect(f.channels.latestMessage(f.channel.id)?.grantRequestResolved).toBe(true);
  });

  it('keeps the latest receipt, delivery and reaction projection', async () => {
    const f = fixture();
    f.seed(message('old'), message('latest'));
    f.database.transaction((db) => {
      db.prepare(
        `INSERT INTO inbox_admissions (source_event_id, bot_slug, reason) VALUES (?, ?, 'group-ordinary')`,
      ).run('latest-source', 'ada');
      db.prepare(
        `INSERT INTO channel_reactions (channel_id, message_id, actor_kind, actor_id, emoji, reacted_at) VALUES (?, ?, 'human', 'local-human', '👍', ?)`,
      ).run(f.channel.id, 'latest', timestamp);
    });
    f.assertLatest('latest');
    expect(f.channels.latestMessage(f.channel.id)).toMatchObject({
      deliveries: [{ botSlug: 'ada', state: 'pending' }],
      reactions: [{ emoji: '👍' }],
      humanReceipts: [{ humanId: 'local-human', state: 'unread' }],
    });
    await f.channels.markRead(f.channel.id, 'latest');
    f.assertLatest('latest');
    expect(f.channels.latestMessage(f.channel.id)?.humanReceipts?.[0]?.state).toBe('read');
  });

  it('preserves migrated attachment identities without changing retained envelopes', async () => {
    const f = fixture();
    const ref = await f.files.upload({
      data: (async function* () {
        yield Buffer.from('report');
      })(),
      name: 'report.txt',
    });
    const legacy = {
      hash: 'sha256:' + 'a'.repeat(64),
      name: 'report.txt',
      mime: 'text/plain',
      size: 6,
    };
    f.seed(message('legacy', { attachments: [legacy] }));
    f.database.transaction((db) =>
      db
        .prepare(`
      INSERT INTO attachment_file_bindings
        (source_event_id, attachment_index, file_id, original_json, target_json, state)
      VALUES (?, 0, ?, ?, ?, 'ready')
    `)
        .run('legacy-source', ref.fileId!, JSON.stringify(legacy), JSON.stringify(ref)),
    );
    const retained = () =>
      f.database.read((db) =>
        db.prepare('SELECT payload_json FROM source_events WHERE message_id = ?').get('legacy'),
      );
    const before = retained();
    f.assertLatest('legacy');
    expect(f.channels.latestMessage(f.channel.id)?.attachments).toEqual([ref]);
    expect(retained()).toEqual(before);
  });

  it('keeps external bridge and DM-mirror body projection', () => {
    const f = fixture();
    f.seed(message('external', { body: '' }));
    const external = {
      id: 'external',
      at: timestamp,
      platform: 'weixin',
      accountName: 'QA',
      conversationName: 'DM',
      dmMirrorChannelId: f.channel.id,
      event: {
        actor: { id: 'sender', name: 'Sender' },
        conversation: { kind: 'dm', id: 'conversation' },
        messageId: 'native-message',
        mentions: [],
        reply: {},
        attachments: [{ name: 'report.txt' }],
      },
    };
    f.database.transaction((db) =>
      db
        .prepare('UPDATE source_events SET payload_json = ? WHERE message_id = ?')
        .run(JSON.stringify({ external }), 'external'),
    );
    f.assertLatest('external');
    expect(f.channels.latestMessage(f.channel.id)).toMatchObject({
      id: 'external',
      body: 'report.txt',
      author: { kind: 'bridged', source: 'Sender' },
    });
  });
});
