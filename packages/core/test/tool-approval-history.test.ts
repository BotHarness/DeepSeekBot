import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import { createTempRoot } from './helpers.js';

const agents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  async close() {},
  requestAssignment() {
    throw new Error('No Assignment expected');
  },
};

describe('approval history and always-allow counts over the Host bridge', () => {
  it('lists Human answers newest first and counts each request a rule answers once', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-approval-history-'), agents });
    const broker = new ChannelToolApproval(core.channels, core.ownership, core.toolRules);
    const methods = createBridgeMethods({ ...core, toolApproval: broker });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'grace', displayName: 'Grace' });
      const channel = core.channels.getOrCreateDm('ada', 'Ada')!;
      core.ownership.claim({
        sessionId: 'qa-ada',
        botSlug: 'ada',
        rootRole: 'orchestrator',
        at: '2026-10-27T08:00:00Z',
      });
      const agent = { session: { id: 'qa-ada', header: { cwd: '/qa/history' } } } as Agent;
      const track = (callId: string, command: string) => {
        broker.track({
          agent,
          name: 'bash',
          callId,
          arguments: { command },
          token: Symbol(callId),
        } as ToolExecution);
        return broker.ask({ agent, toolName: 'bash', callId });
      };
      const card = async (callId: string) => {
        await vi.waitFor(() =>
          expect(
            core.channels
              .readMessages(channel.id)
              .some((m) => m.toolApprovalRequest?.callId === callId),
          ).toBe(true),
        );
        return core.channels
          .readMessages(channel.id)
          .find((m) => m.toolApprovalRequest?.callId === callId)!.id;
      };
      const tick = () => new Promise((done) => setTimeout(done, 5));

      const first = track('call-pwd', 'pwd');
      const firstCard = await card('call-pwd');
      await methods.toolApprovalDecide({
        channelId: channel.id,
        messageId: firstCard,
        outcome: 'rejected',
      });
      expect(await first).toBe('rejected');
      await tick();

      const second = track('call-ls', 'ls');
      const secondCard = await card('call-ls');
      await methods.toolApprovalDecide({
        channelId: channel.id,
        messageId: secondCard,
        outcome: 'allowed-always-exact',
      });
      expect(await second).toBe('allowed-once');
      const saved = methods.toolApprovalRules({ slug: 'ada' });
      expect(saved).toMatchObject({ ok: true, value: { rules: [{ autoApprovedCount: 0 }] } });

      expect(await track('call-ls-2', 'ls')).toBe('allowed-once');
      expect(await track('call-ls-3', 'ls')).toBe('allowed-once');
      const counted = methods.toolApprovalRules({ slug: 'ada' });
      expect(counted).toMatchObject({ ok: true, value: { rules: [{ autoApprovedCount: 2 }] } });

      const history = methods.toolApprovalHistory({ slug: 'ada' });
      expect(history).toMatchObject({
        ok: true,
        value: {
          entries: [
            {
              channelId: channel.id,
              requestMessageId: secondCard,
              toolName: 'bash',
              role: 'orchestrator',
              outcome: 'allowed-always-exact',
            },
            { requestMessageId: firstCard, outcome: 'rejected' },
          ],
        },
      });
      expect(history.ok && history.value.nextCursor).toBeFalsy();

      const page = methods.toolApprovalHistory({ slug: 'ada', limit: 1 });
      if (!page.ok) throw new Error('first page refused');
      expect(page.value.entries.map((entry) => entry.requestMessageId)).toEqual([secondCard]);
      expect(page.value.nextCursor).toBeDefined();
      const next = methods.toolApprovalHistory({
        slug: 'ada',
        limit: 1,
        cursor: page.value.nextCursor,
      });
      expect(next).toMatchObject({
        ok: true,
        value: { entries: [{ requestMessageId: firstCard }] },
      });
      expect(next.ok && next.value.nextCursor).toBeFalsy();

      expect(methods.toolApprovalHistory({ slug: 'grace' })).toEqual({
        ok: true,
        value: { entries: [] },
      });
      expect(methods.toolApprovalHistory({ slug: 'ada', cursor: 'nope' })).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
      expect(methods.toolApprovalHistory({ slug: 'ada', limit: 0 })).toMatchObject({
        ok: false,
      });
      expect(methods.toolApprovalHistory({ slug: 'nobody' })).toMatchObject({ ok: false });
    } finally {
      broker.close();
      await core.runtime.close();
      core.externalMessaging.close();
      core.live.close();
      core.operationalDatabase.close();
    }
  });
});
