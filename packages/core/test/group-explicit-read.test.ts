import { describe, expect, it, vi } from 'vitest';

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
    body: 'ordinary ' + id,
  });
  core.runtime.admitGroupMessage(channelId, id);
}

async function ask(core: ReturnType<typeof createCore>, botSlug: string, id: string) {
  const dm = core.channels.getOrCreateDm(botSlug, botSlug)!;
  await core.channels.appendMessage(dm.id, {
    id,
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: 'Inspect Group',
  });
  core.runtime.admitDmMessage({ channelId: dm.id, messageId: id, body: 'Inspect Group' });
  await core.runtime.whenIdle();
}

describe('explicit Channel read handles returned Bot Inbox admissions on success', () => {
  it('marks only returned messages from read and leaves other silent messages pending', async () => {
    const home = createTempRoot('botharness-explicit-read-');
    let groupId = '';
    let returnedId = '';
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (!run.message.endsWith('Inspect Group')) return;
        const views = run.channels.read({ channelId: groupId, limit: 1 });
        expect(views).toHaveLength(1);
        returnedId = views[0]!.message.id;
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      groupId = group.id;
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'silent',
        count: 2,
        intervalSeconds: 3600,
      });
      await ordinary(core, group.id, 'one');
      await ordinary(core, group.id, 'two');
      const changed = vi.spyOn(core.channels, 'admissionChanged');
      changed.mockClear();
      await ask(core, 'ada', 'ask-read');
      expect(changed).toHaveBeenCalledWith(group.id, returnedId);

      expect(core.channels.message(group.id, returnedId)?.deliveries).toEqual([
        { botSlug: 'ada', state: 'handled' },
      ]);
      expect(
        core.channels.message(group.id, returnedId === 'one' ? 'two' : 'one')?.deliveries,
      ).toEqual([{ botSlug: 'ada', state: 'pending' }]);
      const facts = attachOperationalModule(core.operationalDatabase, 'explicit-read-test').read(
        (db) =>
          db
            .prepare(
              "SELECT e.message_id, a.observed_at FROM inbox_admissions a JOIN source_events e ON e.source_event_id = a.source_event_id WHERE a.reason = 'group-ordinary' ORDER BY e.message_id",
            )
            .all(),
      ) as Array<{ message_id: string; observed_at: string | null }>;
      expect(facts).toHaveLength(2);
      expect(facts.find((row) => row.message_id === returnedId)?.observed_at).toEqual(
        expect.any(String),
      );
      expect(facts.find((row) => row.message_id !== returnedId)?.observed_at).toBeNull();
      expect(
        core.attention
          .list({ botSlug: 'ada', state: 'open' })
          .items.filter((item) => item.reason === 'group-ordinary'),
      ).toHaveLength(1);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('joined query observes only the reader admission, and restart does not redeliver it', async () => {
    const home = createTempRoot('botharness-explicit-query-');
    let groupId = '';
    const before = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (run.bot.slug !== 'ada' || !run.message.endsWith('Inspect Group')) return;
        const found = run.channels.query({ scope: 'joined', text: 'ordinary one', limit: 1 });
        expect(found.messages.map((view) => view.message.id)).toEqual(['one']);
      }),
    });
    try {
      before.registry.create({ slug: 'ada', displayName: 'Ada' });
      before.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = before.channels.createGroup({ name: 'Team', members: ['ada', 'bea'] });
      groupId = group.id;
      for (const botSlug of ['ada', 'bea'])
        before.channels.setGroupWakePolicy(group.id, botSlug, {
          mode: 'digest',
          count: 2,
          intervalSeconds: 3600,
        });
      await ordinary(before, group.id, 'one');
      await ask(before, 'ada', 'ask-query');
      expect(
        before.attention
          .list({ botSlug: 'ada' })
          .items.find((item) => item.reason === 'group-ordinary')?.state,
      ).toBe('open');
      expect(
        before.attention
          .list({ botSlug: 'bea' })
          .items.find((item) => item.reason === 'group-ordinary')?.state,
      ).toBe('deferred');
    } finally {
      await before.runtime.close();
      before.operationalDatabase.close();
    }

    const runs: Array<{ bot: string; message: string }> = [];
    const resumed = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push({ bot: run.bot.slug, message: run.message });
      }),
    });
    try {
      await ordinary(resumed, groupId, 'two');
      await resumed.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      expect(runs[0]?.bot).toBe('bea');
      expect(runs[0]?.message).toContain('ordinary one');
      expect(runs[0]?.message).toContain('ordinary two');
      expect(
        resumed.attention
          .list({ botSlug: 'ada' })
          .items.filter((item) => item.reason === 'group-ordinary')
          .map((item) => item.state),
      ).toEqual(['deferred', 'open']);
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });
});
