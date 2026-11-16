import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { runTimelineSeedTool, seedTimeline } from '../perf-timeline-seed.mjs';
import { OWNER_HUMAN_CONTEXT } from '../../packages/core/src/humans/context.ts';
import { createCore } from '../../packages/core/src/plugin.ts';
import { createBridgeMethods } from '../../packages/core/src/bridge/methods.ts';
import { createDshBotAgentAdapter } from '../../packages/core/src/runtime/dsh-bot-agent-adapter.ts';
import { ChannelToolApproval } from '../../packages/core/src/workspaces/tool-approval.ts';
import { FakeAgentHost } from '../../packages/core/test/dsh-agent-host-fixture.ts';
import { createTempRoot } from '../../packages/core/test/helpers.ts';

function pendingFixture(change = () => undefined) {
  const args = { channel_id: 'group-fixture', body: 'Fixture only', reply_to: 'human-1' };
  const sessionId = 'direct-' + randomUUID();
  const request = {
    id: 'approval-1',
    author: { kind: 'bot', slug: 'seed-bot' },
    toolApprovalRequest: {
      sessionId,
      callId: sessionId,
      toolName: 'bot_send_message',
      role: 'orchestrator',
      input: JSON.stringify(args),
    },
  };
  change(request);
  let started = false;
  let resolve;
  let reject;
  const decisions = [];
  const rpc = async (method, payload) => {
    if (method === 'channelDm') return { channel: { id: 'dm-seed-bot' } };
    if (method === 'channelMessages') return { messages: started ? [request] : [] };
    if (method === 'botToolRun') {
      started = true;
      return new Promise((done, fail) => {
        resolve = done;
        reject = fail;
      });
    }
    if (method === 'toolApprovalStatus') return { status: 'pending' };
    if (method === 'toolApprovalDecide') {
      decisions.push(payload);
      if (payload.outcome === 'rejected') reject(new Error('approval-denied'));
      else resolve({ result: { messageId: 'bot-message-1' } });
      return { accepted: true };
    }
    throw new Error('Unexpected RPC ' + method);
  };
  return { args, rpc, decisions };
}

describe('timeline seed owner decisions', () => {
  it('allows only the current exact direct operation once', async () => {
    const f = pendingFixture();
    expect(await runTimelineSeedTool({ ...f, slug: 'seed-bot', pollMs: 1 })).toEqual({
      result: { messageId: 'bot-message-1' },
    });
    expect(f.decisions).toEqual([
      { channelId: 'dm-seed-bot', messageId: 'approval-1', outcome: 'allowed-once' },
    ]);
  });

  it.each([
    [
      'Bot',
      (message) => {
        message.author.slug = 'foreign-bot';
      },
    ],
    [
      'body',
      (message) => {
        message.toolApprovalRequest.input = JSON.stringify({
          channel_id: 'group-fixture',
          body: 'Other action',
          reply_to: 'human-1',
        });
      },
    ],
    [
      'tool',
      (message) => {
        message.toolApprovalRequest.toolName = 'bash';
      },
    ],
    [
      'Session',
      (message) => {
        message.toolApprovalRequest.sessionId = 'ordinary-session';
      },
    ],
    [
      'call',
      (message) => {
        message.toolApprovalRequest.callId = 'other-call';
      },
    ],
    [
      'role',
      (message) => {
        message.toolApprovalRequest.role = 'assignment';
      },
    ],
  ])('refuses a different %s without deciding it', async (_name, change) => {
    const f = pendingFixture(change);
    await expect(runTimelineSeedTool({ ...f, slug: 'seed-bot', pollMs: 1 })).rejects.toThrow(
      'timeline-seed-unrelated-approval',
    );
    expect(f.decisions).toEqual([]);
  });

  it('ends an unavailable operation without waiting for the browser protocol deadline', async () => {
    const f = pendingFixture();
    const rpc = async (method, args) =>
      method === 'channelMessages' ? { messages: [] } : f.rpc(method, args);
    await expect(
      runTimelineSeedTool({ ...f, rpc, slug: 'seed-bot', pollMs: 1, timeoutMs: 20 }),
    ).rejects.toThrow('timeline-seed-tool-timeout');
    expect(f.decisions).toEqual([]);
  });

  it('rejects the exact pending card after a timeout and observes the underlying refusal', async () => {
    const f = pendingFixture();
    let statuses = 0;
    const rpc = async (method, args) =>
      method === 'toolApprovalStatus' && statuses++ === 0
        ? new Promise(() => undefined)
        : f.rpc(method, args);
    vi.useFakeTimers();
    try {
      const operation = runTimelineSeedTool({
        ...f,
        rpc,
        slug: 'seed-bot',
        pollMs: 1,
        timeoutMs: 20,
      }).catch((failure) => failure);
      await vi.advanceTimersByTimeAsync(1);
      expect(statuses).toBe(1);
      await vi.advanceTimersByTimeAsync(20);
      const error = await operation;
      expect(error.message).toBe('timeline-seed-tool-timeout');
      expect(error.timelineSeed).toMatchObject({
        messageId: 'approval-1',
        callId: expect.stringMatching(/^direct-/u),
        sessionId: expect.stringMatching(/^direct-/u),
        cleanup: 'rejected',
        operation: 'failed',
      });
      expect(f.decisions).toEqual([
        { channelId: 'dm-seed-bot', messageId: 'approval-1', outcome: 'rejected' },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts an already-completed baseline operation without manufacturing an approval', async () => {
    const f = pendingFixture();
    const rpc = async (method, args) =>
      method === 'botToolRun' ? { result: { messageId: 'baseline-message' } } : f.rpc(method, args);
    expect(await runTimelineSeedTool({ ...f, rpc, slug: 'seed-bot', pollMs: 1 })).toEqual({
      result: { messageId: 'baseline-message' },
    });
    expect(f.decisions).toEqual([]);
  });

  it('seeds through actual Native Tool execution and canonical Human approvals without saving rules', async () => {
    const host = new FakeAgentHost();
    const nativeCreate = host.create.bind(host);
    const home = createTempRoot('timeline-seed-');
    const adapter = createDshBotAgentAdapter({
      agents: host,
      orchestratorCwd: () => home,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    });
    const core = createCore({ dshHome: home, agents: adapter });
    const approval = new ChannelToolApproval(core.channels, core.ownership, core.toolRules);
    const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, toolApproval: approval });
    const decisions = [];
    let groupId;
    vi.spyOn(host, 'create').mockImplementation(async (options) => {
      const handle = await nativeCreate(options);
      const execute = handle.agent.ctx.tools.execute.bind(handle.agent.ctx.tools);
      vi.spyOn(handle.agent.ctx.tools, 'execute').mockImplementation(async (input) => {
        const untrack = approval.track({ ...input, token: Symbol(input.callId) });
        assert.ok(untrack, 'real runtime ownership must precede native approval');
        try {
          assert.equal(
            await approval.ask({
              agent: input.agent,
              toolName: input.name,
              callId: input.callId,
              signal: input.signal,
            }),
            'allowed-once',
          );
          return await execute(input);
        } finally {
          untrack();
        }
      });
      return handle;
    });
    const rpc = async (method, payload) => {
      if (method === 'toolApprovalDecide') {
        assert.equal(methods.toolApprovalStatus(payload).value.status, 'pending');
        const request = core.channels.message(
          payload.channelId,
          payload.messageId,
        ).toolApprovalRequest;
        assert.equal(
          core.channels.readMessages(groupId).filter((message) => message.author.kind === 'bot')
            .length,
          decisions.length,
        );
        assert.equal(request.toolName, 'bot_send_message');
        decisions.push(payload);
      }
      const result = await methods[method](payload);
      assert.equal(result.ok, true, result.error?.message);
      if (method === 'channelCreate') groupId = result.value.channel.id;
      return result.value;
    };
    try {
      const fixture = await seedTimeline({
        rpc,
        count: 3,
        bodies: [(index) => 'Real fixture ' + index],
      });
      expect(fixture.messageIds).toHaveLength(3);
      expect(core.channels.readMessages(groupId).map((message) => message.id)).toEqual(
        [...fixture.messageIds].reverse(),
      );
      expect(decisions).toHaveLength(2);
      expect(decisions.every((decision) => decision.outcome === 'allowed-once')).toBe(true);
      for (const slug of fixture.bots)
        expect(methods.toolApprovalRules({ slug })).toMatchObject({
          ok: true,
          value: { rules: [] },
        });
      expect(host.received.size).toBe(0);
    } finally {
      approval.close();
      await core.runtime.close();
      core.externalMessaging.close();
      core.live.close();
      core.operationalDatabase.close();
    }
  }, 60_000);
});
