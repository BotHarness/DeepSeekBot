import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it } from 'vitest';

import { MAX_BOT_HOPS } from '../src/channels/channel.js';
import { createCore } from '../src/plugin.js';
import { createBotMessageTool } from '../src/runtime/bot-message-tool.js';
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

async function reviewRounds(rounds: number) {
  const runs: string[] = [];
  const receipts: Array<Record<string, unknown>> = [];
  let groupId = '';
  const core = createCore({
    dshHome: createTempRoot('bh-review-rounds-'),
    agents: adapter(async (run) => {
      runs.push(run.bot.slug);
      const turn = runs.filter((slug) => slug === run.bot.slug).length;
      if (run.bot.slug === 'nexus' && turn <= rounds) {
        const tool = createBotMessageTool(() => run);
        const context = {
          callId: ToolCallId(`round-${turn}`),
          signal: new AbortController().signal,
          concludeTurn: () => {},
        } as ToolRunContext;
        const result = await tool.execute(
          { channel_id: groupId, body: `@美工 Aura 第 ${turn} 轮：请修改` },
          context,
        );
        receipts.push(JSON.parse(result as string));
      }
      if (run.bot.slug === 'aura')
        await run.channels.send({ channelId: groupId, body: `@总控 Nexus 第 ${turn} 版已改好` });
    }),
  });
  try {
    core.registry.create({ slug: 'nexus', displayName: '总控 Nexus' });
    core.registry.create({ slug: 'aura', displayName: '美工 Aura' });
    const group = core.channels.createGroup({ name: 'Studio', members: ['nexus', 'aura'] });
    groupId = group.id;
    await core.channels.appendMessage(group.id, {
      id: 'kickoff',
      at: '2026-10-26T00:00:00.000Z',
      author: { kind: 'human' },
      body: '@总控 Nexus 和美工 Aura 迭代一个配色，直到满意',
      mentions: [{ botSlug: 'nexus', label: '总控 Nexus', start: 0, end: 9 }],
    });
    core.runtime.admitGroupMessage(group.id, 'kickoff');
    await core.runtime.whenIdle();
    return { runs, receipts };
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

describe('Bot-to-Bot review rounds in one Group', () => {
  it('wakes the colleague on every round a Bot sends the work back', async () => {
    const { runs, receipts } = await reviewRounds(3);
    expect(runs).toEqual(['nexus', 'aura', 'nexus', 'aura', 'nexus', 'aura', 'nexus']);
    expect(receipts.every((receipt) => receipt['notWoken'] === undefined)).toBe(true);
  });

  it('tells the sender when the hop limit stops the colleague from waking', async () => {
    const { runs, receipts } = await reviewRounds(MAX_BOT_HOPS);
    const lastRound = Math.ceil(MAX_BOT_HOPS / 2) + 1;
    expect(runs.filter((slug) => slug === 'aura')).toHaveLength(lastRound - 1);
    expect(receipts).toHaveLength(lastRound);
    expect(receipts.slice(0, -1).every((receipt) => receipt['notWoken'] === undefined)).toBe(true);
    expect(receipts.at(-1)).toMatchObject({
      status: 'committed',
      notWoken: [{ botId: 'aura', reason: 'collaboration-hop-limit' }],
    });
  });
});

describe('Ordinary Group delivery throughout one Bot exchange', () => {
  it('wakes an all-messages colleague on every later message in the exchange', async () => {
    const runs: string[] = [];
    let groupId = '';
    const core = createCore({
      dshHome: createTempRoot('bh-ordinary-chain-'),
      agents: adapter(async (run) => {
        runs.push(run.bot.slug);
        if (run.bot.slug === 'nexus' && runs.filter((slug) => slug === 'nexus').length <= 2)
          await run.channels.send({ channelId: groupId, body: '@美工 Aura 请继续' });
        if (run.bot.slug === 'aura')
          await run.channels.send({ channelId: groupId, body: '@总控 Nexus 改好了' });
      }),
    });
    try {
      core.registry.create({ slug: 'nexus', displayName: '总控 Nexus' });
      core.registry.create({ slug: 'aura', displayName: '美工 Aura' });
      core.registry.create({ slug: 'atlas', displayName: '叙事 Atlas' });
      const group = core.channels.createGroup({
        name: 'Studio',
        members: ['nexus', 'aura', 'atlas'],
      });
      groupId = group.id;
      core.channels.setGroupWakePolicy(
        group.id,
        'atlas',
        { mode: 'all', count: 5, intervalSeconds: 30 },
        { kind: 'human' },
      );
      await core.channels.appendMessage(group.id, {
        id: 'kickoff',
        at: '2026-10-26T00:00:00.000Z',
        author: { kind: 'human' },
        body: '@总控 Nexus 开始',
        mentions: [{ botSlug: 'nexus', label: '总控 Nexus', start: 0, end: 9 }],
      });
      core.runtime.admitGroupMessage(group.id, 'kickoff');
      await core.runtime.whenIdle();
      const atlas = core.channels
        .readMessages(group.id)
        .filter((message) => message.author.kind === 'bot')
        .map((message) => message.deliveries?.some((delivery) => delivery.botSlug === 'atlas'));
      expect(atlas.every(Boolean)).toBe(true);
      expect(runs.filter((slug) => slug === 'atlas').length).toBeGreaterThan(1);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
