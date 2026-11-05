import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTempRoot } from './helpers.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan, type SchemaPlan } from '../src/database/schema.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { mountContentPurge } from '../src/purge/owner.js';
import { createAttachmentStore } from '../src/attachments/store.js';
import { requireAssignmentSource, requireSourceEffects } from '../src/purge/fence.js';
import { createStorageCleanup } from '../src/storage/media-cleanup.js';

const owners: OperationalDatabaseOwner[] = [];
afterEach(() => {
  while (owners.length) owners.pop()!.close();
});

async function seeded(schemaPlan: SchemaPlan = BOT_HARNESS_SCHEMA_PLAN, members: string[] = []) {
  const home = createTempRoot('group-disband-');
  const database = mountOperationalDatabase({ dshHome: home, schemaPlan });
  owners.push(database);
  const purge = mountContentPurge({ dshHome: home, database });
  const port = attachOperationalModule(database, 'messaging');
  const attachments = createAttachmentStore({ rootDir: join(home, 'botharness', 'attachments') });
  const channels = createSqliteChannelStore({
    database: port,
    rootDir: join(home, 'botharness', 'channels'),
    databaseOwnerReady: true,
    attachments,
  });
  const storage = createStorageCleanup({
    dshHome: home,
    database,
    attachments,
    channels,
    memoryDirs: () => [],
    memoryReferences: () => [],
  });
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  const group = channels.createGroup({ name: 'Trip', members });
  channels.setGroupAvatar(group.id, 'data:image/png;base64,iVBORw0KGgo=');
  const send = (channelId: string, id: string, body: string) =>
    channels.appendMessage(channelId, {
      id,
      at: '2026-10-01T00:00:00.000Z',
      author: { kind: 'human' },
      body,
      attachments: [],
    });
  await send(group.id, 'plan', 'the secret plan');
  await send(group.id, 'shared', 'also in the DM');
  await send(dm.id, 'dm-only', 'just the DM');
  const source = (messageId: string) =>
    String(
      port.read(
        (db) =>
          db
            .prepare('SELECT source_event_id FROM source_events WHERE message_id = ?')
            .get(messageId)!.source_event_id,
      ),
    );
  port.transaction((db) =>
    db
      .prepare(
        'INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id) VALUES (?, 1000, ?, ?)',
      )
      .run(dm.id, source('shared'), 'shared-in-dm'),
  );
  return { home, database, purge, port, channels, storage, dm, group, source };
}

const body = (core: Awaited<ReturnType<typeof seeded>>, messageId: string) =>
  core.port.read((db) =>
    String(db.prepare('SELECT body FROM source_events WHERE message_id = ?').get(messageId)!.body),
  );

describe('Group Disband (ADR-0274)', () => {
  const addReply = async (core: Awaited<ReturnType<typeof seeded>>) => {
    const parent = core.source('plan');
    await core.channels.appendMessage(core.group.id, {
      id: 'reply',
      at: '2026-10-01T00:00:01.000Z',
      author: { kind: 'bot', slug: 'ada' },
      body: 'A reply to the plan',
      botCausation: { rootSourceEventId: parent, parentSourceEventId: parent, hop: 1 },
    });
  };

  it('purges a reply after its causal parent without allowing content resurrection', async () => {
    const core = await seeded(BOT_HARNESS_SCHEMA_PLAN, ['ada']);
    await addReply(core);
    core.channels.deleteGroup(core.group.id);
    for (const message of ['plan', 'reply']) {
      const ids = [core.source(message)];
      const preview = core.purge.preview(core.group.id, ids);
      expect(core.purge.confirm(core.group.id, ids, preview.token)).toEqual({ accepted: 1 });
      expect(body(core, message)).toBe('');
    }
    expect(core.database.mode).toBe('ready');
    expect(() =>
      core.port.transaction((db) =>
        db
          .prepare('UPDATE source_events SET body = ? WHERE source_event_id = ?')
          .run('resurrected', core.source('reply')),
      ),
    ).toThrow();
    expect(body(core, 'dm-only')).toBe('just the DM');
  });

  it('migrates and replays an already accepted causal purge after recovery', async () => {
    const oldPlan = defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation <= 126),
    );
    const core = await seeded(oldPlan, ['ada']);
    await addReply(core);
    core.channels.deleteGroup(core.group.id);
    const parent = [core.source('plan')];
    core.purge.confirm(core.group.id, parent, core.purge.preview(core.group.id, parent).token);
    const child = [core.source('reply')];
    const token = core.purge.preview(core.group.id, child).token;
    expect(() => core.purge.confirm(core.group.id, child, token)).toThrow();
    expect(core.database.mode).toBe('recovery');
    core.database.close();

    const reopened = mountOperationalDatabase({
      dshHome: core.home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    owners.push(reopened);
    const purge = mountContentPurge({ dshHome: core.home, database: reopened });
    expect(reopened.mode).toBe('ready');
    const port = attachOperationalModule(reopened, 'messaging');
    for (const id of ['plan', 'reply'])
      expect(
        port.read(
          (db) => db.prepare('SELECT body FROM source_events WHERE message_id = ?').get(id)?.body,
        ),
      ).toBe('');
    expect(purge.checkpoint().facts).toHaveLength(2);
    expect(
      port.read(
        (db) =>
          db.prepare('SELECT body FROM source_events WHERE message_id = ?').get('dm-only')?.body,
      ),
    ).toBe('just the DM');
  });

  it('deletes the group content no other Channel shares and keeps only its identity', async () => {
    const core = await seeded();
    core.channels.deleteGroup(core.group.id);

    expect(core.purge.disband(core.group.id)).toEqual({ messages: 1 });

    expect(body(core, 'plan')).toBe('');
    expect(body(core, 'shared')).toBe('also in the DM');
    expect(body(core, 'dm-only')).toBe('just the DM');
    const record = core.port.read((db) =>
      JSON.parse(
        String(
          db
            .prepare('SELECT record_json FROM channel_records WHERE channel_id = ?')
            .get(core.group.id)!.record_json,
        ),
      ),
    );
    expect(record).toEqual({
      id: core.group.id,
      type: 'group',
      name: '',
      members: [],
      deletedAt: expect.any(String),
      createdAt: core.group.createdAt,
      updatedAt: expect.any(String),
    });
    expect(core.purge.history()).toEqual([]);
    expect(core.storage.usage().chats.map((chat) => chat.channelId)).toEqual([core.dm.id]);
    expect(core.purge.disband(core.group.id)).toEqual({ messages: 0 });
  });

  it('treats a shared message as only the DM message once the group is disbanded', async () => {
    const core = await seeded();
    core.channels.deleteGroup(core.group.id);
    core.purge.disband(core.group.id);
    core.port.transaction((db) =>
      db.prepare("UPDATE inbox_admissions SET attempt_state = 'handled'").run(),
    );

    const preview = core.purge.textPreview({
      before: '2026-10-02T00:00:00.000Z',
      channelIds: [core.dm.id],
    });

    expect(preview).toMatchObject({
      messages: 2,
      kept: [],
      chats: [{ channelId: core.dm.id, messages: 2 }],
    });
  });

  it('keeps a group in Ended Channel history until its content is deleted', async () => {
    const core = await seeded();
    core.channels.deleteGroup(core.group.id);
    expect(core.purge.history()).toMatchObject([{ id: core.group.id, name: 'Trip' }]);
    core.purge.disband(core.group.id);
    expect(core.purge.history()).toEqual([]);
  });

  it('refuses a group that is still active', async () => {
    const core = await seeded();
    expect(() => core.purge.disband(core.group.id)).toThrow();
    expect(body(core, 'plan')).toBe('the secret plan');
  });

  it('lets an Assignment from the disbanded group keep running from its own brief', async () => {
    const core = await seeded();
    const plan = core.source('plan');
    const dmOnly = core.source('dm-only');
    core.channels.deleteGroup(core.group.id);
    core.purge.disband(core.group.id);

    core.port.read((db) => {
      expect(() => requireSourceEffects(db, plan, 'ada')).toThrow('purged');
      expect(() => requireAssignmentSource(db, plan, 'ada')).not.toThrow();
    });
    core.port.transaction((db) =>
      db
        .prepare(
          "INSERT INTO messaging_purge_facts VALUES (?, ?, 'dm-only', '2026-10-02T00:00:00.000Z', '{}')",
        )
        .run(dmOnly, core.dm.id),
    );
    core.port.read((db) =>
      expect(() => requireAssignmentSource(db, dmOnly, 'ada')).toThrow('purged'),
    );
  });
});
