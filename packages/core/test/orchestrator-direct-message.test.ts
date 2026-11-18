import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';

import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createBotMessageTool } from '../src/runtime/bot-message-tool.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';
import { inboxFixture } from './inbox-fixture.js';

describe('Human message sent straight into the Orchestrator Session', () => {
  it('wakes the Orchestrator with the raw text, posts nothing in a Channel and lets it reply in the DM', async () => {
    const f = await inboxFixture();
    try {
      await f.send('Start the weekly report', () => undefined);
      const sessionId = f.core.runtime.currentOrchestratorSessionId?.('ada');
      if (sessionId === undefined) throw new Error('Missing Orchestrator Session');
      const before = f.core.channels.readMessages(f.dm.id).length;
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...f.core });
      let replyId = '';
      f.runs.length = 0;
      const sent = await methods.sessionMessageSend({
        botSlug: 'ada',
        sessionId,
        text: 'Skip the charts this week.',
      });
      if (!sent.ok) throw new Error(sent.error.message);
      await vi.waitFor(() => expect(f.runs).toHaveLength(1));
      const run = f.runs[0]!;
      expect(run.sessionId).toBe(sessionId);
      expect(run.message).toContain(
        '[Human wrote this directly in your Session detail; no Channel shows it]\nSkip the charts this week.\n',
      );
      expect(run.message).not.toContain('Channel: ');
      expect(run.message).toContain(`Source Event ID: ${sent.value.sourceEventId}`);
      expect(f.core.channels.readMessages(f.dm.id)).toHaveLength(before);
      const attention = methods.botAttention({ slug: 'ada' });
      if (!attention.ok) throw new Error(attention.error.message);
      expect(
        attention.value.items.find((item) => item.id === sent.value.sourceEventId),
      ).toMatchObject({ authorKind: 'human', summary: 'Skip the charts this week.' });
      const receipt = await createBotMessageTool(() => run).execute(
        { source_event_id: sent.value.sourceEventId, body: 'Charts skipped.' },
        {
          callId: ToolCallId('reply'),
          signal: new AbortController().signal,
        } as ToolRunContext,
      );
      replyId = JSON.parse(String(receipt)).messageId;
      await f.core.runtime.whenIdle();
      expect(f.core.channels.readMessages(f.dm.id).map((m) => m.id)).toEqual(
        expect.arrayContaining([replyId]),
      );
      expect(f.core.channels.message(f.dm.id, replyId)?.body).toBe('Charts skipped.');
    } finally {
      await f.close();
    }
  });

  it('refuses a Session that is not the Bot’s current Orchestrator', async () => {
    const f = await inboxFixture();
    try {
      await f.send('Hello', () => undefined);
      const current = f.core.runtime.currentOrchestratorSessionId?.('ada');
      expect(current).toEqual(expect.any(String));
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...f.core });
      expect(
        await methods.sessionMessageSend({
          botSlug: 'ada',
          sessionId: 'asg-1',
          text: 'Hi',
        }),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
      expect(
        await methods.sessionMessageSend({
          botSlug: 'ada',
          sessionId: current,
          text: '  ',
        }),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    } finally {
      await f.close();
    }
  });

  it('steers a running Orchestrator turn with the raw text', async () => {
    let started!: () => void;
    let release!: () => void;
    const running = new Promise<void>((resolve) => (started = resolve));
    const held = new Promise<void>((resolve) => (release = resolve));
    const steered: string[] = [];
    const core = createCore({
      dshHome: createTempRoot('bh-orchestrator-direct-steer-'),
      agents: {
        async runOrchestrator() {
          started();
          await held;
        },
        steerOrchestrator(_botSlug, text) {
          steered.push(text);
          return true;
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
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
      if (!dm) throw new Error('Missing DM');
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
      expect(
        await methods.channelSend({
          channelId: dm.id,
          messageId: `human-${randomUUID()}`,
          body: 'Start',
        }),
      ).toMatchObject({ ok: true });
      await running;
      const sessionId = core.runtime.currentOrchestratorSessionId?.('ada');
      const sent = await methods.sessionMessageSend({
        botSlug: 'ada',
        sessionId,
        text: 'Use the staging database instead.',
      });
      expect(sent).toMatchObject({ ok: true });
      expect(steered).toHaveLength(1);
      expect(steered[0]).toContain(
        '[Human wrote this directly in your Session detail; no Channel shows it]\nUse the staging database instead.\n',
      );
      expect(core.channels.readMessages(dm.id).map((m) => m.body)).not.toContain(
        'Use the staging database instead.',
      );
    } finally {
      release();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
