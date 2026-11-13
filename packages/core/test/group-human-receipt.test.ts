import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import {
  BOT_HARNESS_SCHEMA_PLAN,
  LOCAL_HUMAN_RECEIPTS_MIGRATION,
} from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';

describe('local Human Group receipts', () => {
  it('migrates an existing shared position to the local Human without changing its revision', () => {
    const home = createTempRoot('botharness-human-receipt-upgrade-');

    const beforeHumanReceipts = BOT_HARNESS_SCHEMA_PLAN.migrations.indexOf(
      LOCAL_HUMAN_RECEIPTS_MIGRATION,
    );
    const prior = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.slice(0, beforeHumanReceipts),
      ),
    });
    try {
      attachOperationalModule(prior, 'receipt-upgrade-seed').transaction((db) => {
        db.prepare('INSERT INTO channel_records (channel_id, record_json) VALUES (?, ?)').run(
          'group-before-upgrade',
          JSON.stringify({
            id: 'group-before-upgrade',
            type: 'group',
            name: 'Before upgrade',
            members: ['ada'],
            createdAt: '2026-09-26T00:00:00.000Z',
            updatedAt: '2026-09-26T00:00:00.000Z',
          }),
        );
        db.prepare(
          'INSERT INTO channel_read_positions (channel_id, message_id, revision, read_at) VALUES (?, ?, ?, ?)',
        ).run('group-before-upgrade', 'old-message', 7, '2026-09-26T00:01:00.000Z');
      });
    } finally {
      prior.close();
    }
    const upgraded = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    try {
      expect(upgraded.mode).toBe('ready');
      const facts = attachOperationalModule(upgraded, 'receipt-upgrade-check').read((db) => ({
        member: db
          .prepare(
            'SELECT human_id, visible_from_revision FROM channel_human_members WHERE channel_id = ?',
          )
          .get('group-before-upgrade'),
        position: db
          .prepare(
            'SELECT human_id, message_id, revision FROM channel_read_positions WHERE channel_id = ?',
          )
          .get('group-before-upgrade'),
      }));
      expect(facts.member).toMatchObject({ human_id: 'local-human', visible_from_revision: 1 });
      expect(facts.position).toMatchObject({
        human_id: 'local-human',
        message_id: 'old-message',
        revision: 7,
      });
    } finally {
      upgraded.close();
    }
  });

  it('projects one named Human recipient for Bot messages and keeps sender messages out', async () => {
    const home = createTempRoot('botharness-human-receipt-');
    const core = createCore({ dshHome: home });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Team',
        members: ['ada'],
      });
      const first = await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
        id: 'bot-first',
        at: '2026-09-27T00:00:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Please review',
      });
      expect(first?.channelRevision).toBe(1);
      expect(first?.humanReceipts).toEqual([
        { humanId: 'local-human', displayName: 'Human', state: 'unread' },
      ]);
      expect(core.channels.queryMessages(group.id).messages[0]?.humanReceipts).toEqual(
        first?.humanReceipts,
      );
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
        id: 'human-reply',
        at: '2026-09-27T00:01:00.000Z',
        author: { kind: 'human' },
        body: 'I will',
      });
      expect(core.channels.message(group.id, 'human-reply')?.humanReceipts).toBeUndefined();
      await core.channels.markRead(OWNER_HUMAN_CONTEXT, group.id, 'human-reply');
      expect(core.channels.message(group.id, 'bot-first')?.humanReceipts).toEqual([
        { humanId: 'local-human', displayName: 'Human', state: 'read' },
      ]);
      const facts = attachOperationalModule(core.operationalDatabase, 'human-receipt-test').read(
        (db) => ({
          member: db
            .prepare(
              'SELECT human_id, visible_from_revision FROM channel_human_members WHERE channel_id = ?',
            )
            .get(group.id),
          position: db
            .prepare('SELECT human_id, revision FROM channel_read_positions WHERE channel_id = ?')
            .get(group.id),
        }),
      );
      expect(facts.member).toMatchObject({ human_id: 'local-human', visible_from_revision: 1 });
      expect(facts.position).toMatchObject({ human_id: 'local-human', revision: 2 });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const reopened = createCore({ dshHome: home });
    try {
      const group = reopened.channels.list().find((item) => item.type === 'group')!;
      expect(reopened.channels.message(group.id, 'bot-first')?.humanReceipts?.[0]?.state).toBe(
        'read',
      );
    } finally {
      await reopened.runtime.close();
      reopened.operationalDatabase.close();
    }
  });
});
