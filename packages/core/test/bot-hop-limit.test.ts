import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it } from 'vitest';

import { createCore } from '../src/plugin.js';
import { createBotMessageTool } from '../src/runtime/bot-message-tool.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const NEXT: Record<string, string> = { ada: 'bea', bea: 'cea', cea: 'bea' };

async function relay(botHopLimit: number) {
  const receipts: { bot: string; receipt: Record<string, unknown> }[] = [];
  const runs: string[] = [];
  let calls = 0;
  const core = createCore({
    dshHome: createTempRoot('bh-hop-relay-'),
    botHopLimit: () => botHopLimit,
    agents: {
      async runOrchestrator(run: OrchestratorAgentRun) {
        runs.push(run.bot.slug);
        if (runs.filter((slug) => slug === run.bot.slug).length > 1) return;
        const tool = createBotMessageTool(() => run);
        const result = await tool.execute(
          { bot_id: NEXT[run.bot.slug]!, body: `relay from ${run.bot.slug}` },
          {
            callId: ToolCallId(`relay-${++calls}`),
            signal: new AbortController().signal,
            concludeTurn: () => {},
          } as ToolRunContext,
        );
        receipts.push({ bot: run.bot.slug, receipt: JSON.parse(result as string) });
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    } satisfies BotAgentAdapter,
  });
  try {
    for (const slug of ['ada', 'bea', 'cea'])
      core.registry.create({ slug, displayName: slug.toUpperCase() });
    const dm = core.channels.getOrCreateDm('ada', 'ADA')!;
    await core.channels.appendMessage(dm.id, {
      id: 'human-kickoff',
      at: '2026-11-03T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'Relay this along the chain',
    });
    core.runtime.admitDmMessage({
      channelId: dm.id,
      messageId: 'human-kickoff',
      body: 'Relay this along the chain',
    });
    await core.runtime.whenIdle();
    return { runs, receipts };
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

describe('Bot-to-Bot hop limit across a Bot DM relay', () => {
  it('runs Human → A → B → C → B within the default budget', async () => {
    const { runs, receipts } = await relay(128);
    expect(runs).toEqual(['ada', 'bea', 'cea', 'bea']);
    expect(receipts.map((entry) => entry.receipt['status'])).toEqual([
      'committed',
      'committed',
      'committed',
    ]);
  });

  it('refuses the third hop under a limit of two without delivering it', async () => {
    const { runs, receipts } = await relay(2);
    expect(runs).toEqual(['ada', 'bea', 'cea']);
    expect(receipts.at(-1)).toEqual({
      bot: 'cea',
      receipt: expect.objectContaining({
        status: 'refused',
        reason: 'collaboration-hop-limit',
        hop: 3,
        hopLimit: 2,
      }),
    });
    expect(receipts.at(-1)?.receipt['messageId']).toBeUndefined();
  });
});
