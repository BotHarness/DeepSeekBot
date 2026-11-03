import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { botDmChannelId } from '../src/channels/channel.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function team(options: { adaFails?: boolean } = {}) {
  const runs: Array<{ slug: string; channelId: string | undefined; message: string }> = [];
  let started!: () => void;
  const adaStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let release: (() => void) | undefined;
  let adaSession: string | undefined;
  let beaRound = 0;
  const agents: BotAgentAdapter = {
    async runOrchestrator(run: OrchestratorAgentRun) {
      runs.push({ slug: run.bot.slug, channelId: run.inboundChannelId, message: run.message });
      if (run.bot.slug === 'bea') {
        beaRound += 1;
        await run.channels.sendToBot({
          botSlug: 'ada',
          body: `Round ${beaRound}: keep the campaign going`,
          deliveryKey: `bea-${beaRound}`,
        });
        return;
      }
      if (options.adaFails && run.inboundChannelId === botDmChannelId('ada', 'bea'))
        throw new Error('INVALID_REQUEST: Function call is missing a thought_signature');
      if (runs.filter((entry) => entry.slug === 'ada').length > 1) return;
      adaSession = run.sessionId;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      started();
      await held;
      adaSession = undefined;
    },
    stopOrchestratorTurn() {
      const stopped = adaSession;
      release?.();
      return stopped;
    },
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
  return { agents, runs, adaStarted, release: () => release?.() };
}

async function humanDm(
  core: ReturnType<typeof createCore>,
  slug: string,
  id: string,
  body: string,
): Promise<void> {
  const dm = core.channels.getOrCreateDm(slug, slug)!;
  await core.channels.appendMessage(dm.id, {
    id,
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body,
  });
  const admission = core.runtime.admitDmMessage({ channelId: dm.id, messageId: id, body });
  expect(admission).toMatchObject({ admitted: true });
}

describe('A stopped PersonaBot stays stopped', () => {
  it('takes no Bot message until the Human writes to it, then catches up', async () => {
    const fake = team();
    const core = createCore({ dshHome: createTempRoot('bh-stop-hold-'), agents: fake.agents });
    const bridge = createBridgeMethods({ ...core });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      await humanDm(core, 'ada', 'human-ada-1', 'Run the ad campaign');
      await fake.adaStarted;

      const stopped = await bridge.channelBotStop({ channelId: 'dm-ada', botSlug: 'ada' });
      expect(stopped).toMatchObject({ ok: true });
      await core.runtime.whenIdle();
      expect(core.runtime.heldCause?.('ada')).toBe('human-stop');
      expect(core.channels.readMessages('dm-ada')[0]).toMatchObject({
        author: { kind: 'system' },
        turnStop: { botSlug: 'ada', held: true, cause: 'human-stop' },
      });

      await humanDm(core, 'bea', 'human-bea-1', 'Ping Ada');
      await core.runtime.whenIdle();
      await humanDm(core, 'bea', 'human-bea-2', 'Ping Ada again');
      await core.runtime.whenIdle();
      expect(core.channels.readMessages(botDmChannelId('ada', 'bea'))).toHaveLength(2);
      expect(fake.runs.filter((run) => run.slug === 'ada')).toHaveLength(1);

      await humanDm(core, 'ada', 'human-ada-2', 'OK, carry on');
      await core.runtime.whenIdle();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await core.runtime.whenIdle();
      expect(core.runtime.heldCause?.('ada')).toBeUndefined();
      const ada = fake.runs.filter((run) => run.slug === 'ada');
      expect(ada.map((run) => run.channelId)).toEqual([
        'dm-ada',
        'dm-ada',
        botDmChannelId('ada', 'bea'),
      ]);
      expect(ada[1]!.message).toContain('[Host: the Human stopped your previous turn');
      expect(ada[1]!.message).toContain('OK, carry on');
      expect(ada[2]!.message).toContain('Round 2: keep the campaign going');
    } finally {
      fake.release();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('holds a Bot whose automatic runs fail three times in a row with the same request error', async () => {
    const fake = team({ adaFails: true });
    const core = createCore({ dshHome: createTempRoot('bh-failure-hold-'), agents: fake.agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      for (let round = 1; round <= 3; round += 1) {
        await humanDm(core, 'bea', `human-bea-${round}`, 'Ping Ada');
        await core.runtime.whenIdle();
      }
      expect(core.runtime.heldCause?.('ada')).toBe('failures');
      expect(fake.runs.filter((run) => run.slug === 'ada')).toHaveLength(3);
      const notice = core.channels
        .readMessages('dm-ada')
        .find((message) => message.turnStop !== undefined);
      expect(notice).toMatchObject({
        author: { kind: 'system' },
        turnStop: { botSlug: 'ada', held: true, cause: 'failures', failures: 3 },
      });

      await humanDm(core, 'bea', 'human-bea-4', 'Ping Ada once more');
      await core.runtime.whenIdle();
      expect(fake.runs.filter((run) => run.slug === 'ada')).toHaveLength(3);

      await humanDm(core, 'ada', 'human-ada-1', 'Try again');
      await core.runtime.whenIdle();
      expect(core.runtime.heldCause?.('ada')).toBeUndefined();
      expect(fake.runs.filter((run) => run.slug === 'ada').at(3)).toMatchObject({
        channelId: 'dm-ada',
      });
    } finally {
      fake.release();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('does not hold a Bot whose failures are transient', async () => {
    const runs: string[] = [];
    const core = createCore({
      dshHome: createTempRoot('bh-transient-no-hold-'),
      agents: {
        async runOrchestrator(run) {
          runs.push(run.bot.slug);
          if (run.bot.slug === 'bea') {
            await run.channels.sendToBot({
              botSlug: 'ada',
              body: `Ping ${runs.length}`,
              deliveryKey: `bea-${runs.length}`,
            });
            return;
          }
          throw new Error('RATE_LIMIT: slow down');
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment expected');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      for (let round = 1; round <= 3; round += 1) {
        await humanDm(core, 'bea', `human-bea-${round}`, 'Ping Ada');
        await core.runtime.whenIdle();
      }
      expect(core.runtime.heldCause?.('ada')).toBeUndefined();
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
