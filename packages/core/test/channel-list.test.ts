import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it } from 'vitest';

import { createCore } from '../src/plugin.js';
import type {
  AssignmentAgentRun,
  AssignmentRequestDelivery,
  BotAgentAdapter,
  OrchestratorAgentRun,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function adapter(onRun: (run: OrchestratorAgentRun) => Promise<void>): BotAgentAdapter {
  return {
    runOrchestrator: onRun,
    async runAssignment(_run: AssignmentAgentRun) {},
    requestAssignment(_run: AssignmentAgentRun): AssignmentRequestDelivery {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

describe('PersonaBot Channel discovery', () => {
  it('lists joined Group and both DM kinds, filters current members, pages, and sends to a selected Channel', async () => {
    const home = createTempRoot('botharness-channel-list-');
    let turns = 0;
    let teamId = '';
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (run.bot.slug !== 'ada') return;
        turns++;
        const first = run.channels.list({ limit: 2 });
        expect(first.channels).toHaveLength(2);
        if (turns === 1) {
          const cursor = first.nextCursor;
          if (cursor === undefined) throw new Error('Expected a second Channel page');
          const second = run.channels.list({ limit: 2, cursor });
          const all = [...first.channels, ...second.channels];
          expect(all.map((channel) => channel.kind).sort()).toEqual([
            'bot-dm',
            'group',
            'human-dm',
          ]);
          expect(all.find((channel) => channel.kind === 'bot-dm')?.members).toEqual([
            { botId: 'ada', displayName: 'Ada', active: true },
            { botId: 'bea', displayName: 'Bea', active: true },
          ]);
          expect(
            run.channels.list({ name: 'TEAM', type: 'group' }).channels.map((c) => c.id),
          ).toEqual([teamId]);
          expect(
            run.channels
              .list({ type: 'group', memberBotIds: ['ada', 'bea'] })
              .channels.map((c) => c.id),
          ).toEqual([teamId]);
          expect(run.channels.list({ channelId: teamId }).channels).toHaveLength(1);
          expect(run.channels.list({ channelId: 'group-private' }).channels).toEqual([]);
          expect(() => run.channels.list({ name: 'Team', cursor })).toThrow('invalid cursor');
          await run.channels.send({
            channelId: teamId,
            body: 'Ada found this Group through channel_list',
            deliveryKey: 'channel-list-send',
          });
        } else {
          expect(first.nextCursor).toBeUndefined();
          expect(first.channels.map((channel) => channel.id)).not.toContain(teamId);
          await expect(
            run.channels.send({ channelId: teamId, body: 'No longer a member' }),
          ).rejects.toThrow('not a member');
        }
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const humanDm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      core.channels.getOrCreateBotDm(OWNER_HUMAN_CONTEXT, 'ada', 'bea', 'Ada · Bea');
      const team = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Team',
        members: ['ada', 'bea'],
      });
      teamId = team.id;
      core.channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Private', members: ['bea'] });
      for (const id of ['request-one', 'request-two']) {
        await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, humanDm.id, {
          id,
          at: '2026-09-25T00:00:00.000Z',
          author: { kind: 'human' },
          body: 'Find the team Channel',
        });
        core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
          channelId: humanDm.id,
          messageId: id,
          body: 'Find the team Channel',
        });
        await core.runtime.whenIdle();
        if (id === 'request-one') {
          expect(core.channels.readMessages(teamId).map((message) => message.body)).toContain(
            'Ada found this Group through channel_list',
          );
          core.channels.removeGroupMember(teamId, 'ada');
        }
      }
      expect(turns).toBe(2);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
