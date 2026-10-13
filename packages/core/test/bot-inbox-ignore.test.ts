import { describe, expect, it } from 'vitest';

import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function adapter(onRun: (run: OrchestratorAgentRun) => Promise<void>): BotAgentAdapter {
  return {
    runOrchestrator: onRun,
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

async function ordinary(core: ReturnType<typeof createCore>, channelId: string, id: string) {
  await core.channels.appendMessage(channelId, {
    id,
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: `ordinary ${id}`,
  });
  core.runtime.admitGroupMessage(channelId, id);
}

describe('explicit Bot Inbox ignore decision', () => {
  it('distinguishes one explicit ignore from a handled no-reply digest, including restart', async () => {
    const home = createTempRoot('botharness-inbox-ignore-');
    let groupId = '';
    let turns = 0;
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        turns += 1;
        expect(run.message).toContain('ordinary one');
        expect(run.message).toContain('ordinary two');
        const first = run.channels.ignore({ channelId: groupId, messageId: 'one' });
        expect(first).toMatchObject({ alreadyIgnored: false, ignoredAt: expect.any(String) });
        expect(run.channels.ignore({ channelId: groupId, messageId: 'one' })).toMatchObject({
          sourceEventId: first.sourceEventId,
          ignoredAt: first.ignoredAt,
          alreadyIgnored: true,
        });
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      groupId = core.channels.createGroup({ name: 'Team', members: ['ada'] }).id;
      core.channels.setGroupWakePolicy(groupId, 'ada', {
        mode: 'digest',
        count: 2,
        intervalSeconds: 3600,
      });
      await ordinary(core, groupId, 'one');
      await ordinary(core, groupId, 'two');
      await core.runtime.whenIdle();
      expect(turns).toBe(1);
      const items = core.attention.list({ botSlug: 'ada' }).items;
      expect(items.find((item) => item.sourceMessageId === 'one')).toMatchObject({
        state: 'ignored',
        ignoredAt: expect.any(String),
        observedAt: expect.any(String),
      });
      expect(items.find((item) => item.sourceMessageId === 'two')?.state).toBe('open');
      expect(core.attention.list({ botSlug: 'ada', state: 'ignored' }).items).toHaveLength(1);
      expect(core.channels.message(groupId, 'one')?.deliveries).toEqual([
        { botSlug: 'ada', state: 'ignored' },
      ]);
      const fact = attachOperationalModule(core.operationalDatabase, 'ignore-test').read(
        (db) =>
          db
            .prepare(`
          SELECT ignored_by_session_id FROM inbox_admissions a
          JOIN source_events e ON e.source_event_id = a.source_event_id
          WHERE e.message_id = 'one'
        `)
            .get() as { ignored_by_session_id: string },
      );
      expect(fact.ignored_by_session_id).toBeTruthy();
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const resumed = createCore({
      dshHome: home,
      agents: adapter(async () => {
        turns += 1;
      }),
    });
    try {
      await resumed.runtime.whenIdle();
      expect(turns).toBe(1);
      expect(resumed.attention.list({ botSlug: 'ada', state: 'ignored' }).items).toHaveLength(1);
      expect(resumed.channels.message(groupId, 'one')?.deliveries?.[0]?.state).toBe('ignored');
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });

  it('requires observation before a silent message can be ignored and keeps another unread', async () => {
    const home = createTempRoot('botharness-inbox-ignore-read-');
    let groupId = '';
    let observedMessageId = '';
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (!run.message.endsWith('Review Group')) return;
        expect(() => run.channels.ignore({ channelId: groupId, messageId: 'one' })).toThrow(
          'observe this message',
        );
        const views = run.channels.read({ channelId: groupId, limit: 1 });
        expect(views).toHaveLength(1);
        observedMessageId = views[0]!.message.id;
        run.channels.ignore({ channelId: groupId, messageId: observedMessageId });
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      groupId = core.channels.createGroup({ name: 'Team', members: ['ada'] }).id;
      core.channels.setGroupWakePolicy(groupId, 'ada', {
        mode: 'silent',
        count: 2,
        intervalSeconds: 3600,
      });
      await ordinary(core, groupId, 'one');
      await ordinary(core, groupId, 'two');
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'review',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Review Group',
      });
      core.runtime.admitDmMessage({ channelId: dm.id, messageId: 'review', body: 'Review Group' });
      await core.runtime.whenIdle();
      const groupItems = core.attention
        .list({ botSlug: 'ada' })
        .items.filter((item) => item.reason === 'group-ordinary');
      expect(groupItems.find((item) => item.sourceMessageId === observedMessageId)?.state).toBe(
        'ignored',
      );
      expect(groupItems.find((item) => item.sourceMessageId !== observedMessageId)?.state).toBe(
        'pending',
      );
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('allows an explicitly read pending Group mention to be ignored', async () => {
    const home = createTempRoot('botharness-inbox-ignore-mention-');
    let groupId = '';
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (!run.message.endsWith('Review Group')) return;
        expect(() => run.channels.ignore({ channelId: groupId, messageId: 'mention' })).toThrow(
          'observe this message',
        );
        const read = run.channels.read({ channelId: groupId, limit: 1 });
        expect(read[0]?.message.id).toBe('mention');
        run.channels.ignore({ channelId: groupId, messageId: 'mention' });
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      groupId = core.channels.createGroup({ name: 'Team', members: ['ada'] }).id;
      await core.channels.appendMessage(groupId, {
        id: 'mention',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada please check',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'review',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Review Group',
      });
      core.runtime.admitDmMessage({ channelId: dm.id, messageId: 'review', body: 'Review Group' });
      await core.runtime.whenIdle();
      expect(core.attention.list({ botSlug: 'ada', state: 'ignored' }).items).toMatchObject([
        { reason: 'group-mention', sourceMessageId: 'mention', observedAt: expect.any(String) },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('keeps an ignored running mention terminal even when its turn then fails', async () => {
    const home = createTempRoot('botharness-inbox-ignore-failed-turn-');
    let groupId = '';
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (!run.message.includes('Please review')) return;
        run.channels.ignore({ channelId: groupId, messageId: 'mention' });
        throw new Error('Failure after explicit ignore');
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      groupId = core.channels.createGroup({ name: 'Team', members: ['ada'] }).id;
      await core.channels.appendMessage(groupId, {
        id: 'mention',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada Please review',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      core.runtime.admitGroupMessage(groupId, 'mention');
      await core.runtime.whenIdle();
      expect(core.attention.list({ botSlug: 'ada', state: 'ignored' }).items).toMatchObject([
        {
          reason: 'group-mention',
          sourceMessageId: 'mention',
          observedAt: expect.any(String),
          handledAt: expect.any(String),
        },
      ]);
      expect(core.attention.list({ botSlug: 'ada', state: 'needs-repair' }).items).toEqual([]);
      expect(core.channels.message(groupId, 'mention')?.deliveries).toEqual([
        { botSlug: 'ada', state: 'ignored' },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
