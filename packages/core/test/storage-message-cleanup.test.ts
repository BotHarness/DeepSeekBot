import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTempRoot } from './helpers.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { mountContentPurge } from '../src/purge/owner.js';
import { createAttachmentStore } from '../src/attachments/store.js';

const owners: OperationalDatabaseOwner[] = [];
afterEach(() => {
  while (owners.length) owners.pop()!.close();
});

const NOW = Date.parse('2026-10-20T00:00:00.000Z');

async function seeded(now = () => new Date(NOW)) {
  const home = createTempRoot('message-cleanup-');
  const database = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  owners.push(database);
  const purge = mountContentPurge({ dshHome: home, database, now });
  const port = attachOperationalModule(database, 'messaging');
  const channels = createSqliteChannelStore({
    database: port,
    rootDir: join(home, 'botharness', 'channels'),
    databaseOwnerReady: true,
    attachments: createAttachmentStore({ rootDir: join(home, 'botharness', 'attachments') }),
  });
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  const group = channels.createGroup({ name: 'Trip', members: [] });
  const send = (channelId: string, id: string, at: string, body: string) =>
    channels.appendMessage(channelId, { id, at, author: { kind: 'human' }, body, attachments: [] });
  await send(dm.id, 'dm-old', '2026-01-02T00:00:00.000Z', 'january plans in the DM');
  await send(dm.id, 'dm-busy', '2026-01-03T00:00:00.000Z', 'a Bot is still answering this');
  await send(dm.id, 'dm-new', '2026-10-19T00:00:00.000Z', 'yesterday in the DM');
  await send(group.id, 'group-old', '2026-02-01T00:00:00.000Z', 'february in the group');
  const source = (messageId: string) =>
    String(
      port.read(
        (db) =>
          db
            .prepare('SELECT source_event_id FROM source_events WHERE message_id = ?')
            .get(messageId)!.source_event_id,
      ),
    );
  port.transaction((db) => {
    db.prepare("UPDATE inbox_admissions SET attempt_state = 'handled'").run();
    db.prepare(
      "UPDATE inbox_admissions SET attempt_state = 'running' WHERE source_event_id = ?",
    ).run(source('dm-busy'));
  });
  return { home, database, purge, channels, dm, group };
}

const bodies = (core: Awaited<ReturnType<typeof seeded>>, channelId: string) =>
  core.channels.readMessages(channelId).map((message) => message.body);

describe('time-based message cleanup through Content Purge', () => {
  it('previews and deletes old messages in live chats, keeping recent ones and Bot work', async () => {
    const core = await seeded();
    const preview = core.purge.textPreview({ before: '2026-07-01T00:00:00.000Z' });
    expect(preview).toMatchObject({
      scope: { before: '2026-07-01T00:00:00.000Z', channelIds: [] },
      messages: 2,
      files: 0,
      more: false,
      kept: [{ reason: 'bot-working', messages: 1 }],
    });
    expect(preview.chats).toEqual(
      expect.arrayContaining([
        { channelId: core.dm.id, name: core.dm.name, messages: 1 },
        { channelId: core.group.id, name: 'Trip', messages: 1 },
      ]),
    );
    expect(preview.bytes).toBeGreaterThan(0);
    expect(core.purge.checkpoint().facts).toEqual([]);

    const result = core.purge.textConfirm({ before: preview.scope.before }, preview.token);
    expect(result).toMatchObject({ messages: 2 });
    expect(result.freedBytes).toBeGreaterThanOrEqual(0);
    expect(bodies(core, core.dm.id)).toEqual([
      'yesterday in the DM',
      'a Bot is still answering this',
      '',
    ]);
    expect(bodies(core, core.group.id)).toEqual(['']);
    expect(
      attachOperationalModule(core.database, 'messaging').read((db) =>
        db.prepare('SELECT DISTINCT attempt_state FROM inbox_admissions').all(),
      ),
    ).toEqual(expect.not.arrayContaining([{ attempt_state: 'needs-repair' }]));
    expect(core.purge.checkpoint().facts).toHaveLength(2);
    expect(() => core.purge.textConfirm({ before: preview.scope.before }, preview.token)).toThrow(
      'Scope changed',
    );
    expect(core.purge.textPreview({ before: preview.scope.before })).toMatchObject({
      messages: 0,
    });
  });

  it('limits the scope to chosen chats and clamps a future cutoff to now', async () => {
    const core = await seeded();
    const preview = core.purge.textPreview({
      before: '2099-01-01T00:00:00.000Z',
      channelIds: [core.group.id],
    });
    expect(preview.scope).toEqual({
      before: new Date(NOW).toISOString(),
      channelIds: [core.group.id],
    });
    expect(preview).toMatchObject({ messages: 1, kept: [] });
    core.purge.textConfirm(preview.scope, preview.token);
    expect(bodies(core, core.group.id)).toEqual(['']);
    expect(bodies(core, core.dm.id)).toContain('january plans in the DM');
  });

  it('refuses a preview after a new old message appears or the token expires', async () => {
    let time = NOW;
    const core = await seeded(() => new Date(time));
    const preview = core.purge.textPreview({ before: '2026-07-01T00:00:00.000Z' });
    await core.channels.appendMessage(core.group.id, {
      id: 'imported',
      at: '2026-03-01T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'imported later',
      attachments: [],
    });
    expect(() => core.purge.textConfirm(preview.scope, preview.token)).toThrow('Scope changed');
    const fresh = core.purge.textPreview(preview.scope);
    time += 10 * 60_000 + 1;
    expect(() => core.purge.textConfirm(fresh.scope, fresh.token)).toThrow('expired');
    expect(core.purge.checkpoint().facts).toEqual([]);
  });
});
