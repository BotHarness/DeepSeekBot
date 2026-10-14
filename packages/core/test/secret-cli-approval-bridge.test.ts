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

describe('secret_cli always allow over the Host bridge', () => {
  it('saves a kind rule for secret_cli and refuses the outcome on another card', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-secret-cli-bridge-'), agents });
    const broker = new ChannelToolApproval(core.channels, core.ownership, core.toolRules);
    const methods = createBridgeMethods({ ...core, toolApproval: broker });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const channel = core.channels.getOrCreateDm('ada', 'Ada')!;
      core.ownership.claim({
        sessionId: 'qa-ada',
        botSlug: 'ada',
        rootRole: 'orchestrator',
        at: '2026-10-14T08:00:00Z',
      });
      const agent = { session: { id: 'qa-ada', header: { cwd: '/qa/secret' } } } as Agent;
      const ask = async (name: string, callId: string, args: unknown) => {
        broker.track({
          agent,
          name,
          callId,
          arguments: args,
          token: Symbol(callId),
        } as ToolExecution);
        const answer = broker.ask({ agent, toolName: name, callId });
        await vi.waitFor(() =>
          expect(
            core.channels
              .readMessages(channel.id)
              .some((m) => m.toolApprovalRequest?.callId === callId),
          ).toBe(true),
        );
        const message = core.channels
          .readMessages(channel.id)
          .find((m) => m.toolApprovalRequest?.callId === callId)!;
        return { answer, messageId: message.id };
      };
      const bash = await ask('bash', 'call-bash', { command: 'pwd' });
      expect(
        await methods.toolApprovalDecide({
          channelId: channel.id,
          messageId: bash.messageId,
          outcome: 'allowed-always-kind',
        }),
      ).toMatchObject({ ok: false });
      await methods.toolApprovalDecide({
        channelId: channel.id,
        messageId: bash.messageId,
        outcome: 'rejected',
      });
      expect(await bash.answer).toBe('rejected');

      const secret = await ask('secret_cli', 'call-secret', {
        account: 'github-work',
        references: ['private:00000000-0000-0000-0000-000000000000:token'],
        program: 'gh',
        args: ['repo', 'list'],
        env: [{ name: 'GH_TOKEN', value: '{{token}}' }],
      });
      expect(
        await methods.toolApprovalDecide({
          channelId: channel.id,
          messageId: secret.messageId,
          outcome: 'allowed-always-kind',
        }),
      ).toMatchObject({ ok: true });
      expect(await secret.answer).toBe('allowed-once');
      const listed = methods.toolApprovalRules({ slug: 'ada' });
      expect(listed).toMatchObject({
        ok: true,
        value: {
          rules: [
            {
              kind: 'secret-cli',
              toolName: 'secret_cli',
              input: '{"program":"gh","account":"github-work","env":["GH_TOKEN"]}',
            },
          ],
        },
      });
    } finally {
      broker.close();
      await core.runtime.close();
      core.externalMessaging.close();
      core.live.close();
      core.operationalDatabase.close();
    }
  });
});
