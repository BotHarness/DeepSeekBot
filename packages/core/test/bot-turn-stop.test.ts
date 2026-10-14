import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function stoppableAgents() {
  const messages: string[] = [];
  let started!: () => void;
  let running = new Promise<void>((resolve) => {
    started = resolve;
  });
  let finish: (() => void) | undefined;
  let sessionId: string | undefined;
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      messages.push(run.message);
      sessionId = run.sessionId;
      const held = new Promise<void>((resolve) => {
        finish = resolve;
      });
      started();
      await held;
      sessionId = undefined;
    },
    stopOrchestratorTurn() {
      const stopped = sessionId;
      finish?.();
      return stopped;
    },
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
  return {
    agents,
    messages,
    running: () => running,
    rearm() {
      running = new Promise<void>((resolve) => {
        started = resolve;
      });
    },
    finish: () => finish?.(),
  };
}

describe('Stopping a working PersonaBot', () => {
  it('ends the running turn, records the stop and leaves the Bot idle', async () => {
    const fake = stoppableAgents();
    const core = createCore({ dshHome: createTempRoot('bh-turn-stop-'), agents: fake.agents });
    const bridge = createBridgeMethods({ ...core });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      expect(await bridge.channelBotStop({ channelId: dm.id, botSlug: 'ada' })).toEqual({
        ok: false,
        error: { code: 'not-working', message: 'Ada is not working right now' },
      });
      const sent = await bridge.channelSend({
        channelId: dm.id,
        messageId: 'human-00000000-0000-4000-8000-000000000001',
        body: 'Write a very long report',
      });
      expect(sent).toMatchObject({ ok: true });
      await fake.running();

      const stopped = await bridge.channelBotStop({ channelId: dm.id, botSlug: 'ada' });
      expect(stopped, JSON.stringify(stopped)).toMatchObject({
        ok: true,
        value: { stopped: { botSlug: 'ada', sessionId: expect.any(String) } },
      });
      await core.runtime.whenIdle();
      const messages = core.channels.readMessages(dm.id);
      expect(messages.find((message) => message.sessionFailure)).toBeUndefined();
      const notice = messages[0]!;
      expect(notice).toMatchObject({
        author: { kind: 'system' },
        body: 'Human stopped Ada.',
        turnStop: { botSlug: 'ada', botName: 'Ada', humanName: 'Human' },
      });
      if (stopped.ok) expect(notice.id).toBe(stopped.value.stopped.messageId);
      expect(await bridge.channelBotStop({ channelId: dm.id, botSlug: 'ada' })).toMatchObject({
        ok: false,
        error: { code: 'not-working' },
      });

      fake.rearm();
      await bridge.channelSend({
        channelId: dm.id,
        messageId: 'human-00000000-0000-4000-8000-000000000002',
        body: 'Just say hi',
      });
      await fake.running();
      fake.finish();
      await core.runtime.whenIdle();
      expect(fake.messages).toHaveLength(2);
      expect(fake.messages[0]).not.toContain('stopped your previous turn');
      expect(fake.messages[1]).toContain('[Host: the Human stopped your previous turn');
    } finally {
      fake.finish();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('refuses a Channel the Bot is not in and an unknown Bot', async () => {
    const fake = stoppableAgents();
    const core = createCore({
      dshHome: createTempRoot('bh-turn-stop-refuse-'),
      agents: fake.agents,
    });
    const bridge = createBridgeMethods({ ...core });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bo', displayName: 'Bo' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      expect(await bridge.channelBotStop({ channelId: dm.id, botSlug: 'bo' })).toMatchObject({
        ok: false,
        error: { code: 'invalid-input', message: 'Bo is not in this Channel' },
      });
      expect(await bridge.channelBotStop({ channelId: dm.id, botSlug: 'nobody' })).toMatchObject({
        ok: false,
        error: { code: 'not-found' },
      });
      expect(await bridge.channelBotStop({ channelId: 'missing', botSlug: 'ada' })).toMatchObject({
        ok: false,
        error: { code: 'not-found' },
      });
      expect(await bridge.channelBotStop({ channelId: dm.id })).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
