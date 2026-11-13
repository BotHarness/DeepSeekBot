import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it } from 'vitest';

import { botDmChannelId } from '../src/channels/channel.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type {
  AssignmentAgentRun,
  AssignmentRequestDelivery,
  BotAgentAdapter,
  OrchestratorAgentRun,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const AT = '2026-10-12T00:00:00.000Z';

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

type Core = ReturnType<typeof createCore>;

function traces(core: Core, channelId: string) {
  return core.channels
    .readMessages(channelId)
    .reverse()
    .filter((item) => item.botChannelPost !== undefined);
}

function traceAdmissions(core: Core): unknown[] {
  return attachOperationalModule(core.operationalDatabase, 'dm-trace-test').read((db) =>
    db
      .prepare(`
        SELECT a.bot_slug FROM source_events e
        JOIN inbox_admissions a ON a.source_event_id = e.source_event_id
        WHERE json_type(e.payload_json, '$.botChannelPost') IS NOT NULL
      `)
      .all(),
  );
}

describe('Bot DM traces of posts made elsewhere', () => {
  it('shows a Group reply in the Bot DM as a linked notice', async () => {
    let groupId = '';
    const runs: string[] = [];
    const core = createCore({
      dshHome: createTempRoot('botharness-dm-trace-group-'),
      agents: adapter(async (run) => {
        runs.push(`${run.bot.slug}:${run.inboundChannelId}`);
        if (run.inboundChannelId === groupId)
          await run.channels.send({
            channelId: groupId,
            body: '已整理好需求清单，\n请大家看一下第一版的范围和排期是否合适，有问题直接在这里说。',
          });
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Crew',
        members: ['ada'],
      });
      groupId = group.id;
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      const unreadBefore = core.humanAttention.status(OWNER_HUMAN_CONTEXT).unreadCount;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
        id: 'ask',
        at: AT,
        author: { kind: 'human' },
        body: '@Ada 整理一下需求',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      core.runtime.admitGroupMessage(group.id, 'ask');
      await core.runtime.whenIdle();

      const reply = core.channels.latestMessage(group.id)!;
      expect(reply.author).toEqual({ kind: 'bot', slug: 'ada' });
      const [trace, ...rest] = traces(core, dm.id);
      expect(rest).toEqual([]);
      expect(trace).toMatchObject({
        author: { kind: 'bot', slug: 'ada' },
        body: '',
        botChannelPost: { channelId: group.id, messageId: reply.id },
      });
      expect(trace?.botChannelPostPreview).toBe(
        '已整理好需求清单， 请大家看一下第一版的范围和排期是否合适，有问题直接在这里说。',
      );
      expect(trace?.humanReceipts).toBeUndefined();
      expect(traces(core, group.id)).toEqual([]);
      expect(traceAdmissions(core)).toEqual([]);
      expect(runs).toEqual([`ada:${group.id}`]);
      expect(core.attention.list({ botSlug: 'ada', state: 'pending' }).items).toEqual([]);
      expect(core.humanAttention.status(OWNER_HUMAN_CONTEXT).unreadCount).toBe(unreadBefore + 1);
      expect(core.channels.latestMessage(dm.id)).toBeUndefined();
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('traces a Bot DM reply in the replying Bot DM, without doubling the sender notice', async () => {
    const core = createCore({
      dshHome: createTempRoot('botharness-dm-trace-bot-dm-'),
      agents: adapter(async (run) => {
        if (run.bot.slug === 'ada' && run.inboundChannelId === 'dm-ada')
          await run.channels.sendToBot({ botSlug: 'bea', body: '请核对', deliveryKey: 'k1' });
        if (run.bot.slug === 'bea')
          await run.channels.send({ body: '状态已核对', deliveryKey: 'bea-reply' });
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const ada = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      const bea = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bea', 'Bea')!;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, ada.id, {
        id: 'ask',
        at: AT,
        author: { kind: 'human' },
        body: '请问问 Bea',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: ada.id,
        messageId: 'ask',
        body: '请问问 Bea',
      });
      await core.runtime.whenIdle();

      const botDm = botDmChannelId('ada', 'bea');
      expect(
        core.channels.readMessages(ada.id).filter((item) => item.botDmAction !== undefined),
      ).toHaveLength(1);
      expect(traces(core, ada.id)).toEqual([]);
      const beaReply = core.channels.latestMessage(botDm)!;
      expect(beaReply.author).toEqual({ kind: 'bot', slug: 'bea' });
      expect(traces(core, bea.id)).toMatchObject([
        {
          botChannelPost: { channelId: botDm, messageId: beaReply.id },
          botChannelPostPreview: '状态已核对',
        },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('writes no trace for a reply in the Bot Human DM itself', async () => {
    const core = createCore({
      dshHome: createTempRoot('botharness-dm-trace-own-'),
      agents: adapter(async (run) => {
        await run.channels.send({ body: '好的', deliveryKey: 'own' });
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id: 'ask',
        at: AT,
        author: { kind: 'human' },
        body: '你好',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm.id,
        messageId: 'ask',
        body: '你好',
      });
      await core.runtime.whenIdle();
      expect(core.channels.latestMessage(dm.id)?.body).toBe('好的');
      expect(traces(core, dm.id)).toEqual([]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
