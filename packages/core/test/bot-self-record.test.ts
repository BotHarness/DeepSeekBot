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

const AT = '2026-10-09T00:00:00.000Z';

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

function noticesIn(core: Core, channelId: string) {
  return core.channels.readMessages(channelId).filter((item) => item.botDmAction !== undefined);
}

function selfRecords(core: Core) {
  return attachOperationalModule(core.operationalDatabase, 'self-record-test').read((db) =>
    db
      .prepare(`
        SELECT e.source_kind, e.channel_id, e.message_id, a.bot_slug, a.reason, a.attempt_state
          FROM source_events e
          LEFT JOIN inbox_admissions a ON a.source_event_id = e.source_event_id
         WHERE json_type(e.payload_json, '$.botDmAction') IS NOT NULL
         ORDER BY e.created_at, e.message_id, a.bot_slug
      `)
      .all(),
  );
}

async function mentionAda(core: Core, groupId: string): Promise<void> {
  await core.channels.appendMessage(groupId, {
    id: 'ask-ada',
    at: AT,
    author: { kind: 'human' },
    body: '@Ada 请问问 Bea',
    mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
  });
  core.runtime.admitGroupMessage(groupId, 'ask-ada');
  await core.runtime.whenIdle();
}

describe('Bot Self-Records for bot_send_message', () => {
  it('places a Group-caused notice in that Group and records it for the sender only', async () => {
    const runs: string[] = [];
    let groupId = '';
    const core = createCore({
      dshHome: createTempRoot('botharness-self-record-group-'),
      agents: adapter(async (run) => {
        runs.push(`${run.bot.slug}:${run.inboundChannelId}`);
        if (run.bot.slug === 'ada' && run.inboundChannelId === groupId)
          await run.channels.sendToBot({ botSlug: 'bea', body: '请核对', deliveryKey: 'k1' });
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup({ name: 'Crew', members: ['ada', 'bea'] });
      groupId = group.id;
      core.channels.getOrCreateDm('ada', 'Ada');
      const unreadBefore = core.humanAttention.status().unreadCount;
      await mentionAda(core, group.id);

      const botDm = botDmChannelId('ada', 'bea');
      const [notice] = noticesIn(core, group.id);
      expect(notice).toMatchObject({
        author: { kind: 'bot', slug: 'ada' },
        body: '',
        botDmAction: { channelId: botDm, recipientBotSlug: 'bea' },
      });
      expect(notice?.humanReceipts).toBeUndefined();
      expect(noticesIn(core, 'dm-ada')).toEqual([]);
      expect(selfRecords(core)).toEqual([
        {
          source_kind: 'self-record',
          channel_id: group.id,
          message_id: notice!.id,
          bot_slug: 'ada',
          reason: 'bot-action',
          attempt_state: 'handled',
        },
      ]);
      expect(runs).toEqual([`ada:${group.id}`, `bea:${botDm}`]);
      expect(core.attention.list({ botSlug: 'ada', state: 'pending' }).items).toEqual([]);
      expect(core.humanAttention.status().unreadCount).toBe(unreadBefore);
      expect(
        core.humanAttention
          .list({ category: 'unread' })
          .items.some((item) => JSON.stringify(item).includes(notice!.id)),
      ).toBe(false);
      expect(core.channels.latestMessage(group.id)?.id).toBe('ask-ada');
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps a Human-DM-caused notice in that DM', async () => {
    const core = createCore({
      dshHome: createTempRoot('botharness-self-record-dm-'),
      agents: adapter(async (run) => {
        if (run.bot.slug === 'ada' && run.inboundChannelId === 'dm-ada')
          await run.channels.sendToBot({ botSlug: 'bea', body: '请核对', deliveryKey: 'k1' });
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'ask',
        at: AT,
        author: { kind: 'human' },
        body: '请问问 Bea',
      });
      core.runtime.admitDmMessage({ channelId: dm.id, messageId: 'ask', body: '请问问 Bea' });
      await core.runtime.whenIdle();
      expect(noticesIn(core, dm.id)).toHaveLength(1);
      expect(core.channels.latestMessage(dm.id)?.id).toBe('ask');
      expect(core.humanAttention.status().unreadCount).toBe(0);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('places a chained notice in the Bot DM that caused it', async () => {
    const core = createCore({
      dshHome: createTempRoot('botharness-self-record-chain-'),
      agents: adapter(async (run) => {
        if (run.bot.slug === 'ada' && run.inboundChannelId === 'dm-ada')
          await run.channels.sendToBot({ botSlug: 'bea', body: '请找 Cy', deliveryKey: 'a1' });
        if (run.bot.slug === 'bea' && run.inboundChannelId === botDmChannelId('ada', 'bea'))
          await run.channels.sendToBot({ botSlug: 'cy', body: '请核对', deliveryKey: 'b1' });
      }),
    });
    try {
      for (const [slug, name] of [
        ['ada', 'Ada'],
        ['bea', 'Bea'],
        ['cy', 'Cy'],
      ] as const)
        core.registry.create({ slug, displayName: name });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      core.channels.getOrCreateDm('bea', 'Bea');
      await core.channels.appendMessage(dm.id, {
        id: 'ask',
        at: AT,
        author: { kind: 'human' },
        body: '请协作',
      });
      core.runtime.admitDmMessage({ channelId: dm.id, messageId: 'ask', body: '请协作' });
      await core.runtime.whenIdle();
      const adaBea = botDmChannelId('ada', 'bea');
      expect(noticesIn(core, adaBea).map((item) => item.botDmAction?.recipientBotSlug)).toEqual([
        'cy',
      ]);
      expect(noticesIn(core, 'dm-bea')).toEqual([]);
      expect(noticesIn(core, dm.id).map((item) => item.botDmAction?.recipientBotSlug)).toEqual([
        'bea',
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('falls back to the sender Human DM when it has left the cause Group', async () => {
    let groupId = '';
    const core = createCore({
      dshHome: createTempRoot('botharness-self-record-fallback-'),
      agents: adapter(async (run) => {
        if (run.bot.slug !== 'ada' || run.inboundChannelId !== groupId) return;
        core.channels.removeGroupMember(groupId, 'ada', 'left');
        await run.channels.sendToBot({ botSlug: 'bea', body: '请核对', deliveryKey: 'k1' });
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup({ name: 'Crew', members: ['ada', 'bea'] });
      groupId = group.id;
      core.channels.getOrCreateDm('ada', 'Ada');
      await mentionAda(core, group.id);
      expect(noticesIn(core, group.id)).toEqual([]);
      expect(noticesIn(core, 'dm-ada')).toHaveLength(1);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('records nothing for a reply inside the Bot DM that caused it', async () => {
    const core = createCore({
      dshHome: createTempRoot('botharness-self-record-reply-'),
      agents: adapter(async (run) => {
        if (run.bot.slug === 'ada' && run.inboundChannelId === 'dm-ada')
          await run.channels.sendToBot({ botSlug: 'bea', body: '在吗', deliveryKey: 'a1' });
        if (run.bot.slug === 'bea')
          await run.channels.sendToBot({ botSlug: 'ada', body: '在', deliveryKey: 'b1' });
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      core.channels.getOrCreateDm('bea', 'Bea');
      await core.channels.appendMessage(dm.id, {
        id: 'ask',
        at: AT,
        author: { kind: 'human' },
        body: '去问 Bea',
      });
      core.runtime.admitDmMessage({ channelId: dm.id, messageId: 'ask', body: '去问 Bea' });
      await core.runtime.whenIdle();
      expect(
        core.channels.readMessages(botDmChannelId('ada', 'bea')).map((item) => item.body),
      ).toEqual(expect.arrayContaining(['在吗', '在']));
      expect(noticesIn(core, 'dm-bea')).toEqual([]);
      expect(noticesIn(core, botDmChannelId('ada', 'bea'))).toEqual([]);
      expect(selfRecords(core).map((row) => (row as { bot_slug: string }).bot_slug)).toEqual([
        'ada',
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('treats a Bot DM steered into a Group-woken turn as the cause of the reply', async () => {
    let groupId = '';
    let markNovaStarted!: () => void;
    const novaStarted = new Promise<void>((resolve) => (markNovaStarted = resolve));
    let markSteered!: () => void;
    const steered = new Promise<void>((resolve) => (markSteered = resolve));
    const core: Core = createCore({
      dshHome: createTempRoot('botharness-self-record-steer-'),
      agents: {
        async runOrchestrator(run) {
          if (run.bot.slug === 'nova' && run.inboundChannelId === groupId) {
            markNovaStarted();
            await steered;
            await run.channels.send({
              channelId: botDmChannelId('mira', 'nova'),
              body: '章鱼有三颗心',
              deliveryKey: 'n1',
            });
          }
          if (run.bot.slug === 'mira' && run.inboundChannelId === 'dm-mira')
            await run.channels.sendToBot({
              botSlug: 'nova',
              body: '讲个章鱼冷知识',
              deliveryKey: 'm1',
            });
        },
        steerOrchestrator(botSlug) {
          if (botSlug === 'nova') markSteered();
          return true;
        },
        async runAssignment() {},
        requestAssignment(): AssignmentRequestDelivery {
          throw new Error('No Assignment expected');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'mira', displayName: 'Mira' });
      core.registry.create({ slug: 'nova', displayName: 'Nova' });
      const group = core.channels.createGroup({ name: 'Crew', members: ['mira', 'nova'] });
      groupId = group.id;
      core.channels.setGroupWakePolicy(group.id, 'mira', {
        mode: 'mentions',
        count: 5,
        intervalSeconds: 30,
      });
      const miraDm = core.channels.getOrCreateDm('mira', 'Mira')!;
      core.channels.getOrCreateDm('nova', 'Nova');
      await core.channels.appendMessage(group.id, {
        id: 'ask-nova',
        at: AT,
        author: { kind: 'human' },
        body: '@Nova 在吗',
        mentions: [{ botSlug: 'nova', label: 'Nova', start: 0, end: 5 }],
      });
      core.runtime.admitGroupMessage(group.id, 'ask-nova');
      await novaStarted;
      await core.channels.appendMessage(miraDm.id, {
        id: 'ask-mira',
        at: AT,
        author: { kind: 'human' },
        body: '去问 Nova',
      });
      core.runtime.admitDmMessage({
        channelId: miraDm.id,
        messageId: 'ask-mira',
        body: '去问 Nova',
      });
      await core.runtime.whenIdle();
      expect(
        core.channels.readMessages(botDmChannelId('mira', 'nova')).map((item) => item.body),
      ).toEqual(expect.arrayContaining(['讲个章鱼冷知识', '章鱼有三颗心']));
      expect(noticesIn(core, group.id)).toEqual([]);
      expect(noticesIn(core, 'dm-nova')).toEqual([]);
      expect(noticesIn(core, miraDm.id)).toHaveLength(1);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
