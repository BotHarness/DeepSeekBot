import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import fc from 'fast-check';
import { expect, it } from 'vitest';

import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createCore } from '../src/plugin.js';
import { createBotMessageTool } from '../src/runtime/bot-message-tool.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const SLUGS = ['ada', 'bea', 'cea', 'dea'] as const;

async function endlessRelay(bots: number, limit: number, picks: number[]) {
  const slugs = SLUGS.slice(0, bots);
  const runs: string[] = [];
  const receipts: Record<string, unknown>[] = [];
  const core = createCore({
    dshHome: createTempRoot('bh-hop-property-'),
    botHopLimit: () => limit,
    agents: {
      async runOrchestrator(run: OrchestratorAgentRun) {
        runs.push(run.bot.slug);
        if (runs.length > limit + 2) return;
        const others = slugs.filter((slug) => slug !== run.bot.slug);
        const next = others[picks[runs.length % picks.length]! % others.length]!;
        const result = await createBotMessageTool(() => run).execute(
          { bot_id: next, body: `relay ${runs.length} from ${run.bot.slug}` },
          {
            callId: ToolCallId(`relay-${runs.length}`),
            signal: new AbortController().signal,
            concludeTurn: () => {},
          } as ToolRunContext,
        );
        receipts.push(JSON.parse(result as string) as Record<string, unknown>);
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    } satisfies BotAgentAdapter,
  });
  try {
    for (const slug of slugs) core.registry.create({ slug, displayName: slug.toUpperCase() });
    const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'ADA')!;
    await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
      id: 'human-kickoff',
      at: '2026-11-03T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'Relay this along the chain',
    });
    core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
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

it('ADR-0261 the hop limit bounds every Bot-to-Bot chain, whatever its shape', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 2, max: SLUGS.length }),
      fc.integer({ min: 1, max: 6 }),
      fc.array(fc.nat({ max: 2 }), { minLength: 1, maxLength: 8 }),
      async (bots, limit, picks) => {
        const { runs, receipts } = await endlessRelay(bots, limit, picks);
        expect(runs).toHaveLength(limit + 1);
        expect(receipts.slice(0, limit).map((receipt) => receipt['status'])).toEqual(
          Array.from({ length: limit }, () => 'committed'),
        );
        expect(receipts[limit]).toMatchObject({
          status: 'refused',
          reason: 'collaboration-hop-limit',
          hop: limit + 1,
          hopLimit: limit,
        });
        expect(receipts[limit]!['messageId']).toBeUndefined();
      },
    ),
    { numRuns: 8 },
  );
}, 60_000);
