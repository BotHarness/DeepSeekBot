import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function adapter(): BotAgentAdapter {
  return {
    async runOrchestrator() {},
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

describe('Bot-scoped attention projection', () => {
  it('backfills legacy Assignment reports into canonical Admissions during migration', async () => {
    const home = createTempRoot('botharness-report-backfill-');
    const oldPlan = defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 20),
    );
    const legacy = mountOperationalDatabase({ dshHome: home, schemaPlan: oldPlan });
    try {
      attachOperationalModule(legacy, 'report-backfill-test').transaction((db) => {
        db.prepare(`
          INSERT INTO source_events
            (source_event_id, source_kind, bot_slug, body, created_at,
             handled_at, attempt_state, observed_at)
          VALUES (?, 'assignment-report', 'ada', ?, ?, ?, 'handled', ?)
        `).run('report-pending', 'Still working', '2026-09-26T00:00:00.000Z', null, null);
        db.prepare(`
          INSERT INTO source_events
            (source_event_id, source_kind, bot_slug, body, created_at,
             handled_at, attempt_state, observed_at)
          VALUES (?, 'assignment-report', 'ada', ?, ?, ?, 'handled', ?)
        `).run(
          'report-observed',
          'Finished',
          '2026-09-26T00:01:00.000Z',
          '2026-09-26T00:02:00.000Z',
          '2026-09-26T00:02:00.000Z',
        );
      });
    } finally {
      legacy.close();
    }
    const core = createCore({ dshHome: home, agents: adapter() });
    try {
      expect(core.attention.list({ botSlug: 'ada' }).items).toMatchObject([
        { id: 'report-observed', reason: 'assignment-report', state: 'handled' },
        { id: 'report-pending', reason: 'assignment-report', state: 'pending' },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('reads one canonical admission before and after observation, with stable source navigation across restart', async () => {
    const home = createTempRoot('botharness-attention-query-');
    const core = createCore({ dshHome: home, agents: adapter() });
    let groupId = '';
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada', 'bea'] });
      groupId = group.id;
      core.channels.setGroupWakePolicy(group.id, 'bea', {
        mode: 'mentions',
        count: 5,
        intervalSeconds: 30,
      });
      await core.channels.appendMessage(group.id, {
        id: 'mention-1',
        at: '2026-09-26T00:00:00.000Z',
        author: { kind: 'human' },
        body: '@Ada please inspect this',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      const methods = createBridgeMethods({ ...core });
      expect(methods.botAttention({ slug: 'ada' })).toMatchObject({
        ok: true,
        value: {
          items: [
            {
              botSlug: 'ada',
              reason: 'group-mention',
              state: 'pending',
              sourceChannelId: group.id,
              sourceChannelName: 'Team',
              sourceMessageId: 'mention-1',
              sourceAvailable: true,
              authorKind: 'human',
              summary: '@Ada please inspect this',
            },
          ],
        },
      });
      const testDatabase = attachOperationalModule(core.operationalDatabase, 'attention-test');
      testDatabase.transaction((db) => {
        db.prepare(
          "UPDATE inbox_admissions SET attempt_state = 'running' WHERE bot_slug = 'ada'",
        ).run();
      });
      expect(core.attention.list({ botSlug: 'ada' }).items[0]?.state).toBe('processing');
      testDatabase.transaction((db) => {
        db.prepare(
          "UPDATE inbox_admissions SET observed_at = '2026-09-26T00:00:01.000Z' WHERE bot_slug = 'ada'",
        ).run();
      });
      expect(core.attention.list({ botSlug: 'ada' }).items[0]?.state).toBe('processing');
      testDatabase.transaction((db) => {
        db.prepare(
          "UPDATE inbox_admissions SET attempt_state = 'pending' WHERE bot_slug = 'ada'",
        ).run();
      });
      expect(core.attention.list({ botSlug: 'ada' }).items[0]).toMatchObject({
        state: 'pending',
        observedAt: '2026-09-26T00:00:01.000Z',
      });
      testDatabase.transaction((db) => {
        db.prepare(
          "UPDATE inbox_admissions SET attempt_state = 'pending', observed_at = NULL WHERE bot_slug = 'ada'",
        ).run();
      });
      expect(methods.botAttention({ slug: 'bea' })).toMatchObject({
        ok: true,
        value: {
          items: [{ reason: 'group-ordinary', state: 'pending', sourceMessageId: 'mention-1' }],
        },
      });
      core.runtime.admitGroupMessage(group.id, 'mention-1');
      await core.runtime.whenIdle();
      expect(methods.botAttention({ slug: 'ada', state: 'open' })).toMatchObject({
        ok: true,
        value: { items: [{ state: 'open' }] },
      });
      expect(methods.botAttention({ slug: 'ada', state: 'pending' })).toMatchObject({
        ok: true,
        value: { items: [] },
      });
      expect(methods.botAttention({ slug: 'ada', cursor: 'not-a-source' })).toMatchObject({
        ok: false,
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const resumed = createCore({ dshHome: home, agents: adapter() });
    try {
      expect(resumed.attention.list({ botSlug: 'ada' })).toMatchObject({
        items: [{ state: 'open', sourceChannelId: groupId, sourceAvailable: true }],
      });
      resumed.channels.deleteGroup(groupId);
      expect(resumed.attention.list({ botSlug: 'ada' })).toMatchObject({
        items: [{ sourceAvailable: false }],
      });
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });
  it('pages one Bot by stable Source Event cursor without leaking another Bot', async () => {
    const home = createTempRoot('botharness-attention-page-');
    const core = createCore({ dshHome: home, agents: adapter() });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      for (let index = 0; index < 3; index += 1) {
        await core.channels.appendMessage(group.id, {
          id: 'mention-' + index,
          at: new Date(Date.UTC(2026, 8, 26, 0, 0, index)).toISOString(),
          author: { kind: 'human' },
          body: '@Ada work ' + index,
          mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
        });
      }
      const first = core.attention.list({ botSlug: 'ada', limit: 1 });
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).toBeDefined();
      const second = core.attention.list({
        botSlug: 'ada',
        limit: 1,
        cursor: first.nextCursor!,
      });
      expect(second.items).toHaveLength(1);
      expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
      expect(() => core.attention.list({ botSlug: 'bea', cursor: first.nextCursor! })).toThrow(
        'Bot attention cursor is unavailable',
      );
      expect(core.attention.list({ botSlug: 'ada', state: 'handled' }).items).toEqual([]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
