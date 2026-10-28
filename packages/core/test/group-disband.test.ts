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
import { requireAssignmentSource, requireSourceEffects } from '../src/purge/fence.js';

const owners: OperationalDatabaseOwner[] = [];
afterEach(() => {
  while (owners.length) owners.pop()!.close();
});

async function seeded() {
  const home = createTempRoot('group-disband-');
  const database = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  owners.push(database);
  const purge = mountContentPurge({ dshHome: home, database });
  const port = attachOperationalModule(database, 'messaging');
  const channels = createSqliteChannelStore({
    database: port,
    rootDir: join(home, 'botharness', 'channels'),
    databaseOwnerReady: true,
    attachments: createAttachmentStore({ rootDir: join(home, 'botharness', 'attachments') }),
  });
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  const group = channels.createGroup({ name: 'Trip', members: [] });
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
  return { purge, port, channels, dm, group, source };
}

const body = (core: Awaited<ReturnType<typeof seeded>>, messageId: string) =>
  core.port.read((db) =>
    String(db.prepare('SELECT body FROM source_events WHERE message_id = ?').get(messageId)!.body),
  );

describe('Group Disband (ADR-0273)', () => {
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
    expect(core.purge.disband(core.group.id)).toEqual({ messages: 0 });
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
