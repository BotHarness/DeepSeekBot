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

describe('interrupted Human DM notice', () => {
  it('tells the next turn from another Channel that the unanswered DM request stays in its DM', async () => {
    const home = createTempRoot('botharness-interrupted-dm-');
    const turns: Array<{ channel: string | undefined; message: string }> = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        turns.push({ channel: run.inboundChannelId, message: run.message });
        if (run.message.includes('history of bridges') && turns.length === 1)
          throw new Error('Host stopped');
        await run.channels.send({ body: 'ok' });
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'human-dm-interrupted',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Write the history of bridges',
      });
      const admission = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'human-dm-interrupted',
        body: 'Write the history of bridges',
      });
      if (!admission.admitted) throw new Error(admission.reason);
      await expect(admission.settled).rejects.toThrow('Host stopped');

      const mention = async (id: string): Promise<void> => {
        await core.channels.appendMessageOnce(group.id, {
          id,
          at: '2026-09-25T00:01:00.000Z',
          author: { kind: 'human' },
          body: '@Ada reply here',
          mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
        });
        core.runtime.admitGroupMessage(group.id, id);
        await core.runtime.whenIdle();
      };
      await mention('human-group-1');
      await mention('human-group-2');

      expect(turns.map((turn) => turn.channel)).toEqual([dm.id, group.id, group.id]);
      expect(turns[0]!.message).not.toContain('[Host: your earlier turn for Human DM');
      expect(turns[1]!.message).toContain(
        `[Host: your earlier turn for Human DM ${dm.id}, message human-dm-interrupted, ended without a reply. It stays in that DM for the Human to retry; do not answer it in another Channel.]`,
      );
      expect(turns[0]!.message).toContain(
        `Channel: ${dm.id}\nMessage ID: human-dm-interrupted\nWrite the history of bridges`,
      );
      expect(turns[1]!.message).toContain('[Bot Inbox: direct Group mention from Human]');
      expect(turns[2]!.message).not.toContain('[Host: your earlier turn for Human DM');

      await core.channels.appendMessage(dm.id, {
        id: 'human-dm-next',
        at: '2026-09-25T00:02:00.000Z',
        author: { kind: 'human' },
        body: 'Still there?',
      });
      const next = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'human-dm-next',
        body: 'Still there?',
      });
      if (!next.admitted) throw new Error(next.reason);
      await next.settled;
      expect(turns[3]!.message).not.toContain('[Host: your earlier turn for Human DM');
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('reruns only the Human DM that a Host stop interrupted before any side effect', async () => {
    const home = createTempRoot('botharness-interrupted-dm-rerun-');
    const first = createCore({
      dshHome: home,
      agents: adapter(async () => {
        throw new Error('Model failed');
      }),
    });
    first.registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = first.channels.getOrCreateDm('ada', 'Ada')!;
    for (const id of ['human-interrupted', 'human-failed', 'human-effect']) {
      await first.channels.appendMessage(dm.id, {
        id,
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Request ' + id,
      });
      const admission = first.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: id,
        body: 'Request ' + id,
      });
      if (!admission.admitted) throw new Error(admission.reason);
      await expect(admission.settled).rejects.toThrow('Model failed');
    }
    attachOperationalModule(first.operationalDatabase, 'interrupted-dm-test').transaction(
      (db) => {
        for (const table of ['source_events', 'inbox_admissions']) {
          db.prepare(
            `UPDATE ${table} SET attempt_state = 'running' WHERE source_event_id IN (
               SELECT source_event_id FROM source_events WHERE message_id IN ('human-interrupted', 'human-effect'))`,
          ).run();
          db.prepare(
            `UPDATE ${table} SET side_effect_started_at = '2026-09-25T00:00:01.000Z' WHERE source_event_id IN (
               SELECT source_event_id FROM source_events WHERE message_id = 'human-effect')`,
          ).run();
        }
      },
      ['source-event', 'bot-inbox'],
    );
    await first.runtime.close();
    first.operationalDatabase.close();

    const turns: string[] = [];
    const second = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        turns.push(run.message);
        await run.channels.send({ body: 'answered' });
      }),
    });
    try {
      await second.runtime.whenIdle();
      expect(turns).toHaveLength(1);
      expect(turns[0]).toMatch(/^\[Human DM\]\nSource Event ID: [^\n]+\n/);
      expect(turns[0]).toContain(
        `Channel: ${dm.id}\nMessage ID: human-interrupted\nRequest human-interrupted`,
      );
      const states = attachOperationalModule(
        second.operationalDatabase,
        'interrupted-dm-test',
      ).read((db) =>
        db
          .prepare(
            `SELECT e.message_id, a.attempt_state FROM inbox_admissions a
                 JOIN source_events e USING(source_event_id) ORDER BY e.message_id`,
          )
          .all(),
      );
      expect(states).toEqual([
        { message_id: 'human-effect', attempt_state: 'needs-repair' },
        { message_id: 'human-failed', attempt_state: 'retryable' },
        { message_id: 'human-interrupted', attempt_state: 'handled' },
      ]);
    } finally {
      await second.runtime.close();
      second.operationalDatabase.close();
    }
  });
});
