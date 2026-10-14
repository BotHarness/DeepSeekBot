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

function fixture() {
  let broker: ChannelToolApproval;
  let valid = true;
  const core = createCore({
    dshHome: createTempRoot('botharness-inbox-approval-'),
    agents,
    activeToolApprovalMessageIds: () => broker?.activeMessageIds() ?? [],
  });
  broker = new ChannelToolApproval(core.channels, core.ownership, undefined, () =>
    valid ? 'qa-scope' : undefined,
  );
  core.companions.attachApprovals(broker);
  const methods = createBridgeMethods({ ...core, toolApproval: broker });
  const start = async (slug: string, signal?: AbortSignal) => {
    core.registry.create({ slug, displayName: slug });
    const channel = core.channels.getOrCreateDm(slug, slug)!;
    const sessionId = 'qa-' + slug;
    core.ownership.claim({
      sessionId,
      botSlug: slug,
      rootRole: 'orchestrator',
      at: '2026-10-01T08:00:00Z',
    });
    const agent = { session: { id: sessionId, header: { cwd: '/qa/release' } } } as Agent;
    broker.track({
      agent,
      name: 'bash',
      callId: 'call-' + slug,
      arguments: { command: 'echo QA_RELEASE' },
      token: Symbol(slug),
    } as ToolExecution);
    const answer = broker.ask({
      agent,
      toolName: 'bash',
      callId: 'call-' + slug,
      ...(signal ? { signal } : {}),
    });
    await vi.waitFor(() => expect(core.channels.readMessages(channel.id)).toHaveLength(1));
    return { channelId: channel.id, message: core.channels.readMessages(channel.id)[0]!, answer };
  };
  return {
    core,
    broker,
    methods,
    start,
    revoke: () => {
      valid = false;
    },
  };
}

describe('Human Inbox approval Host boundary', () => {
  it.each(['allowed-once', 'rejected'] as const)(
    'discovers current companion requests without speech replay and reconciles a competing %s decision',
    async (outcome) => {
      const f = fixture();
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const ada = await f.start('ada');
        const response = f.core.companions.open(
          new Request('http://localhost/api/botharness/companion?botId=ada&dm=0'),
        );
        reader = response.body!.getReader();
        const read = async () => {
          const text = new TextDecoder().decode((await reader!.read()).value);
          const data = /data: ([^\n]+)/u.exec(text)?.[1];
          if (!data) throw new Error('Missing companion snapshot');
          return JSON.parse(data) as { bot: { requests: unknown[] } };
        };
        expect((await read()).bot.requests).toMatchObject([
          {
            kind: 'tool-approval',
            botSlug: 'ada',
            channelId: 'dm-ada',
            messageId: ada.message.id,
            sessionId: 'qa-ada',
            callId: 'call-ada',
            input: '{\n  "command": "echo QA_RELEASE"\n}',
          },
        ]);
        const results = await Promise.all(
          [0, 1].map(() =>
            f.methods.toolApprovalDecide({
              channelId: ada.channelId,
              messageId: ada.message.id,
              outcome,
            }),
          ),
        );
        expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
        expect(await ada.answer).toBe(outcome);
        expect((await read()).bot.requests).toEqual([]);
        expect(
          f.core.channels
            .readMessages(ada.channelId)
            .filter((message) => message.toolApprovalDecision),
        ).toHaveLength(1);
        await reader.cancel();
        f.core.companions.attachApprovals(
          new ChannelToolApproval(f.core.channels, f.core.ownership),
        );
        reader = f.core.companions
          .open(new Request('http://localhost/api/botharness/companion?botId=ada'))
          .body!.getReader();
        expect((await read()).bot.requests).toEqual([]);
      } finally {
        await reader?.cancel();
        f.broker.close();
        f.core.companions.close();
        await f.core.runtime.close();
        f.core.externalMessaging.close();
        f.core.live.close();
        f.core.operationalDatabase.close();
      }
    },
  );
  it.each(['allowed-once', 'rejected'] as const)(
    'settles %s once, resumes its native caller and preserves another Bot action',
    async (outcome) => {
      const f = fixture();
      try {
        const ada = await f.start('ada');
        const bea = await f.start('bea');
        expect(f.methods.humanAttention({ category: 'action', sort: 'oldest' })).toMatchObject({
          ok: true,
          value: { items: [{ botSlug: 'ada' }, { botSlug: 'bea' }] },
        });
        expect(
          f.methods.channelTimeline({
            channelId: ada.channelId,
            direction: 'around',
            around: ada.message.id,
            olderLimit: 2,
            newerLimit: 2,
          }),
        ).toMatchObject({
          ok: true,
          value: {
            page: {
              entries: [
                {
                  toolApprovalRequest: {
                    toolName: 'bash',
                    input: '{\n  "command": "echo QA_RELEASE"\n}',
                  },
                },
              ],
            },
          },
        });
        expect(
          await f.methods.toolApprovalDecide({
            channelId: bea.channelId,
            messageId: ada.message.id,
            outcome,
          }),
        ).toMatchObject({ ok: false });
        const results = await Promise.all([
          f.methods.toolApprovalDecide({
            channelId: ada.channelId,
            messageId: ada.message.id,
            outcome,
          }),
          f.methods.toolApprovalDecide({
            channelId: ada.channelId,
            messageId: ada.message.id,
            outcome,
          }),
        ]);
        expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
        expect(await ada.answer).toBe(outcome);
        const response = f.core.channels
          .readMessages(ada.channelId)
          .find((m) => m.toolApprovalDecision)!;
        expect(
          f.methods.humanAttention({ category: 'handled', channelId: ada.channelId }),
        ).toMatchObject({
          ok: true,
          value: {
            items: [
              { kind: 'tool-approval', messageId: ada.message.id, responseMessageId: response.id },
            ],
          },
        });

        expect(
          f.core.channels
            .readMessages(ada.channelId)
            .filter((message) => message.toolApprovalDecision),
        ).toMatchObject([
          {
            author: { kind: 'human' },
            replyTo: ada.message.id,
            toolApprovalDecision: { requestMessageId: ada.message.id, outcome },
          },
        ]);
        expect(f.methods.humanAttention({ category: 'action', sort: 'oldest' })).toMatchObject({
          ok: true,
          value: { items: [{ botSlug: 'bea' }] },
        });
        expect(
          await f.methods.toolApprovalDecide({
            channelId: ada.channelId,
            messageId: ada.message.id,
            outcome,
          }),
        ).toMatchObject({ ok: false });
        f.broker.close();
        await bea.answer;
      } finally {
        f.broker.close();
        await f.core.runtime.close();
        f.core.operationalDatabase.close();
      }
    },
  );
  it.each(['cancelled', 'revoked'] as const)(
    'rejects a %s source without recording a Human decision',
    async (cause) => {
      const f = fixture();
      const abort = new AbortController();
      try {
        const pending = await f.start('ada', abort.signal);
        if (cause === 'cancelled') abort.abort();
        else f.revoke();
        expect(
          await f.methods.toolApprovalDecide({
            channelId: pending.channelId,
            messageId: pending.message.id,
            outcome: 'allowed-once',
          }),
        ).toMatchObject({ ok: false });
        expect(await pending.answer).toBe(cause === 'cancelled' ? 'cancelled' : 'unavailable');
        expect(f.methods.humanAttention({ category: 'action' })).toMatchObject({
          ok: true,
          value: { items: [] },
        });
        expect(f.core.channels.readMessages(pending.channelId)).toHaveLength(1);
      } finally {
        f.broker.close();
        await f.core.runtime.close();
        f.core.operationalDatabase.close();
      }
    },
  );

  it('reports when a pending approval expires and drops it once decided', async () => {
    const f = fixture();
    try {
      const before = Date.now();
      const pending = await f.start('ada');
      const status = f.methods.toolApprovalStatus({
        channelId: pending.channelId,
        messageId: pending.message.id,
      });
      expect(status).toMatchObject({ ok: true, value: { status: 'pending' } });
      const expiresAt = Date.parse((status as { value: { expiresAt: string } }).value.expiresAt);
      expect(expiresAt).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000);
      await f.methods.toolApprovalDecide({
        channelId: pending.channelId,
        messageId: pending.message.id,
        outcome: 'rejected',
      });
      expect(
        f.methods.toolApprovalStatus({
          channelId: pending.channelId,
          messageId: pending.message.id,
        }),
      ).toEqual({ ok: true, value: { status: 'expired' } });
    } finally {
      f.broker.close();
      await f.core.runtime.close();
      f.core.operationalDatabase.close();
    }
  });
});
