import { describe, expect, it } from 'vitest';

import { botDmChannelId, MAX_BOT_HOPS } from '../src/channels/channel.js';
import { createCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
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

describe('Bot-to-Bot DM tracer', () => {
  it('delivers A → B → A through one two-member DM with one notice where the exchange began', async () => {
    const home = createTempRoot('botharness-bot-dm-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.bot.slug + ':' + run.inboundChannelId);
        if (run.bot.slug === 'ada' && run.inboundChannelId === 'dm-ada') {
          const contact = run.channels.contacts().contacts.find((item) => item.botId === 'bea');
          expect(contact?.displayName).toBe('Bea');
          const first = await run.channels.sendToBot({
            botSlug: 'bea',
            body: '请核对状态',
            deliveryKey: 'one-tool-call',
          });
          const retry = await run.channels.sendToBot({
            botSlug: 'bea',
            body: '请核对状态',
            deliveryKey: 'one-tool-call',
          });
          expect(retry.message.id).toBe(first.message.id);
          return;
        }
        if (run.bot.slug === 'bea') {
          expect(run.message).toContain('direct message from PersonaBot ada');
          await run.channels.send({ body: '状态已核对', deliveryKey: 'bea-reply' });
          return;
        }
        expect(run.bot.slug).toBe('ada');
        expect(run.message).toContain('状态已核对');
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const humanDm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(humanDm.id, {
        id: 'human-start',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: '请和 Bea 协作',
      });
      core.runtime.admitDmMessage({
        channelId: humanDm.id,
        messageId: 'human-start',
        body: '请和 Bea 协作',
      });
      await core.runtime.whenIdle();
      const botDm = core.channels
        .list()
        .find((channel) => channel.type === 'dm' && channel.botSlug === undefined)!;
      expect(botDm.members).toEqual(['ada', 'bea']);
      const conversation = core.channels.readMessages(botDm.id).reverse();
      expect(conversation.map((item) => item.body)).toEqual(['请核对状态', '状态已核对']);
      expect(runs).toEqual(['ada:dm-ada', 'bea:' + botDm.id, 'ada:' + botDm.id]);
      const adaActions = core.channels
        .readMessages('dm-ada')
        .filter((item) => item.botDmAction?.recipientBotSlug === 'bea');
      expect(adaActions).toHaveLength(1);
      expect(adaActions[0]).toMatchObject({
        body: '',
        botDmAction: { channelId: botDm.id, messageId: conversation[0]!.id },
      });
      expect(
        core.channels.readMessages('dm-bea').filter((item) => item.botDmAction !== undefined),
      ).toEqual([]);
      const facts = attachOperationalModule(core.operationalDatabase, 'bot-dm-test').read((db) =>
        db
          .prepare(`
          SELECT e.message_id, a.bot_slug, a.reason, a.attempt_state
          FROM inbox_admissions a
          JOIN source_events e ON e.source_event_id = a.source_event_id
          WHERE e.channel_id = ? ORDER BY e.created_at, e.message_id
        `)
          .all(botDm.id),
      );
      expect(facts).toEqual([
        {
          message_id: conversation[0]!.id,
          bot_slug: 'bea',
          reason: 'bot-dm',
          attempt_state: 'handled',
        },
        {
          message_id: conversation[1]!.id,
          bot_slug: 'ada',
          reason: 'bot-dm',
          attempt_state: 'handled',
        },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps a keyed send retryable when the Bot DM append fails before commit', async () => {
    const home = createTempRoot('botharness-bot-dm-keyed-retry-');
    let attempts = 0;
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (run.bot.slug !== 'ada') return;
        attempts++;
        await run.channels.sendToBot({
          botSlug: 'bea',
          body: 'Retryable handoff',
          deliveryKey: 'stable-send',
        });
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const humanDm = core.channels.getOrCreateDm('ada', 'Ada')!;
      const originalAppend = core.channels.appendMessageOnce.bind(core.channels);
      let failOnce = true;
      core.channels.appendMessageOnce = (channelId, message) => {
        if (channelId === botDmChannelId('ada', 'bea') && failOnce) {
          failOnce = false;
          return Promise.reject(new Error('precommit append failure'));
        }
        return originalAppend(channelId, message);
      };
      await core.channels.appendMessage(humanDm.id, {
        id: 'human-retry',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Send to Bea',
      });
      core.runtime.admitDmMessage({
        channelId: humanDm.id,
        messageId: 'human-retry',
        body: 'Send to Bea',
      });
      await core.runtime.whenIdle();
      expect(attempts).toBe(1);
      expect(
        attachOperationalModule(core.operationalDatabase, 'bot-dm-retry-test').read((db) =>
          db
            .prepare("SELECT attempt_state FROM source_events WHERE message_id = 'human-retry'")
            .get(),
        ),
      ).toEqual({ attempt_state: 'retryable' });
      expect(core.channels.readMessages(botDmChannelId('ada', 'bea'))).toEqual([]);
      expect(
        core.channels.readMessages(humanDm.id).filter((item) => item.sessionFailure),
      ).toHaveLength(1);

      core.runtime.admitDmMessage({
        channelId: humanDm.id,
        messageId: 'human-retry',
        body: 'Send to Bea',
      });
      await core.runtime.whenIdle();
      expect(attempts).toBe(2);
      expect(
        core.channels.readMessages(botDmChannelId('ada', 'bea')).map((item) => item.body),
      ).toEqual(['Retryable handoff']);
      expect(
        core.channels.readMessages(humanDm.id).filter((item) => item.botDmAction !== undefined),
      ).toHaveLength(1);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('reports a failed Bot DM recipient turn in that Bot’s Human DM', async () => {
    const home = createTempRoot('botharness-bot-dm-failure-');
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (run.bot.slug === 'ada') {
          await run.channels.sendToBot({
            botSlug: 'bea',
            body: 'Please inspect this',
            deliveryKey: 'failure-case',
          });
          return;
        }
        throw new Error('Bea turn failed');
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const humanDm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(humanDm.id, {
        id: 'human-failure',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Ask Bea',
      });
      core.runtime.admitDmMessage({
        channelId: humanDm.id,
        messageId: 'human-failure',
        body: 'Ask Bea',
      });
      await core.runtime.whenIdle();
      const botDm = botDmChannelId('ada', 'bea');
      expect(core.channels.readMessages(botDm)).toHaveLength(1);
      const failures = core.channels.readMessages('dm-bea').filter((item) => item.sessionFailure);
      expect(failures).toHaveLength(1);
      expect(failures[0]?.body).toContain('Bea turn failed');
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('sends to two colleagues concurrently without mixing their DM admissions', async () => {
    const home = createTempRoot('botharness-bot-dm-concurrent-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.bot.slug);
        if (run.bot.slug === 'cee') {
          expect(() => run.channels.read({ channelId: botDmChannelId('ada', 'bea') })).toThrow();
          return;
        }
        if (run.bot.slug !== 'ada') return;
        await Promise.all([
          run.channels.sendToBot({ botSlug: 'bea', body: 'For Bea', deliveryKey: 'send-bea' }),
          run.channels.sendToBot({ botSlug: 'cee', body: 'For Cee', deliveryKey: 'send-cee' }),
        ]);
      }),
    });
    try {
      for (const slug of ['ada', 'bea', 'cee']) {
        core.registry.create({ slug, displayName: slug });
      }
      const dm = core.channels.getOrCreateDm('ada', 'ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'human-two-colleagues',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Contact two colleagues',
      });
      core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'human-two-colleagues',
        body: 'Contact two colleagues',
      });
      await core.runtime.whenIdle();
      expect(runs.sort()).toEqual(['ada', 'bea', 'cee']);
      const conversations = core.channels
        .list()
        .filter((channel) => channel.type === 'dm' && channel.botSlug === undefined)
        .sort((left, right) => left.members[1]!.localeCompare(right.members[1]!));
      expect(conversations.map((channel) => channel.members)).toEqual([
        ['ada', 'bea'],
        ['ada', 'cee'],
      ]);
      expect(
        conversations.map(
          (channel) => core.channels.readMessages(channel.id)[0]?.deliveries?.[0]?.botSlug,
        ),
      ).toEqual(['bea', 'cee']);
      expect(
        core.channels.readMessages(dm.id).filter((message) => message.botDmAction !== undefined),
      ).toHaveLength(2);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('wakes a colleague on every round of one causal root until the hop limit', async () => {
    const home = createTempRoot('botharness-bot-dm-loop-');
    const core = createCore({ dshHome: home, agents: adapter(async () => {}) });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      core.channels.getOrCreateDm('ada', 'Ada');
      core.channels.getOrCreateDm('bea', 'Bea');
      const dm = core.channels.getOrCreateBotDm('ada', 'bea', 'Ada · Bea')!;
      for (const [id, sender, hop] of [
        ['first', 'ada', 1],
        ['reply', 'bea', 2],
        ['repeat', 'ada', 3],
      ] as const) {
        await core.channels.appendMessage(dm.id, {
          id,
          at: new Date(Date.UTC(2026, 8, 25, 0, 0, hop)).toISOString(),
          author: { kind: 'bot', slug: sender },
          body: id,
          botCausation: {
            rootSourceEventId: 'one-root',
            parentSourceEventId: 'one-parent',
            hop,
          },
        });
      }
      expect(core.channels.message(dm.id, 'first')?.deliveries).toEqual([
        { botSlug: 'bea', state: 'pending' },
      ]);
      expect(core.channels.message(dm.id, 'reply')?.deliveries).toEqual([
        { botSlug: 'ada', state: 'pending' },
      ]);
      expect(core.channels.message(dm.id, 'repeat')?.deliveries).toEqual([
        { botSlug: 'bea', state: 'pending' },
      ]);
      expect(
        core.channels.readMessages('dm-ada').filter((message) => message.botDmAction !== undefined),
      ).toHaveLength(2);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('recovers a committed send whose recipient wake was interrupted by restart', async () => {
    const home = createTempRoot('botharness-bot-dm-restart-');
    const before = createCore({ dshHome: home, agents: adapter(async () => {}) });
    let botDmId = '';
    try {
      before.registry.create({ slug: 'ada', displayName: 'Ada' });
      before.registry.create({ slug: 'bea', displayName: 'Bea' });
      before.channels.getOrCreateDm('ada', 'Ada');
      const dm = before.channels.getOrCreateBotDm('ada', 'bea', 'Ada · Bea')!;
      botDmId = dm.id;
      await before.channels.appendMessage(dm.id, {
        id: 'bot-before-restart',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: '重启前发送',
        botCausation: {
          rootSourceEventId: 'root-restart',
          parentSourceEventId: 'root-restart',
          hop: 1,
        },
      });
      expect(before.channels.message(dm.id, 'bot-before-restart')?.deliveries).toEqual([
        { botSlug: 'bea', state: 'pending' },
      ]);
    } finally {
      await before.runtime.close();
      before.operationalDatabase.close();
    }
    const resumed: string[] = [];
    const after = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        resumed.push(run.bot.slug + ':' + run.inboundChannelId);
        expect(run.message).toContain('You may finish without replying');
      }),
    });
    try {
      await after.runtime.whenIdle();
      expect(resumed).toEqual(['bea:' + botDmId]);
      expect(after.channels.readMessages(botDmId).map((message) => message.id)).toEqual([
        'bot-before-restart',
      ]);
      expect(after.channels.message(botDmId, 'bot-before-restart')?.deliveries).toEqual([
        { botSlug: 'bea', state: 'handled' },
      ]);
      expect(
        after.channels
          .readMessages('dm-ada')
          .filter((item) => item.botDmAction?.messageId === 'bot-before-restart'),
      ).toHaveLength(1);
    } finally {
      await after.runtime.close();
      after.operationalDatabase.close();
    }
  });

  it('commits an over-hop message and its action without waking the recipient again', async () => {
    const home = createTempRoot('botharness-bot-dm-hop-');
    const core = createCore({ dshHome: home, agents: adapter(async () => {}) });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      core.channels.getOrCreateDm('ada', 'Ada');
      const dm = core.channels.getOrCreateBotDm('ada', 'bea', 'Ada · Bea')!;
      await core.channels.appendMessage(dm.id, {
        id: 'bot-over-hop',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: '超过跳数上限',
        botCausation: {
          rootSourceEventId: 'root-over-hop',
          parentSourceEventId: 'parent-over-hop',
          hop: MAX_BOT_HOPS + 1,
        },
      });
      expect(core.channels.message(dm.id, 'bot-over-hop')?.deliveries).toBeUndefined();
      expect(
        core.channels
          .readMessages('dm-ada')
          .some((item) => item.botDmAction?.messageId === 'bot-over-hop'),
      ).toBe(true);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('rejects an archived recipient before committing a Bot DM message', async () => {
    const home = createTempRoot('botharness-bot-dm-archived-');
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (run.bot.slug !== 'ada') return;
        await expect(run.channels.sendToBot({ botSlug: 'bea', body: 'Hi' })).rejects.toThrow(
          'active PersonaBot',
        );
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      core.registry.setPaused('bea', true);
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'human-archived',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: '请联系 Bea',
      });
      core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'human-archived',
        body: '请联系 Bea',
      });
      await core.runtime.whenIdle();
      expect(
        core.channels
          .list()
          .filter((channel) => channel.type === 'dm' && channel.botSlug === undefined),
      ).toEqual([]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
