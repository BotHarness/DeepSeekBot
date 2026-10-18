import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval';
import type { ChannelMessage, ChannelRecord } from '../src/channels/channel.js';
import type { ChannelStore } from '../src/channels/store.js';
import type { SessionOwnership } from '../src/sessions/ownership.js';
import { approveTobCliOperation } from '../src/tob/cli-approval.js';
import type { TobCliWriteProposal } from '../src/tob/cli-broker.js';
import { TobError } from '../src/tob/service.js';
import { ChannelToolApproval, type ToolAutoApproval } from '../src/workspaces/tool-approval.js';
import type { ToolApprovalRuleStore } from '../src/workspaces/tool-approval-rules.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((close) => close());
});

function fixture(policy?: { rules?: ToolApprovalRuleStore; autoApproval?: ToolAutoApproval }) {
  const messages: ChannelMessage[] = [];
  const channel = { id: 'dm-tob', type: 'dm', botSlug: 'tob' } as ChannelRecord;
  const channels = {
    get: (id: string) => (id === channel.id ? channel : undefined),
    message: (_id: string, messageId: string) =>
      messages.find((message) => message.id === messageId),
    appendMessage: async (_id: string, message: ChannelMessage) => {
      messages.push(message);
      return message;
    },
  } as unknown as ChannelStore;
  const owner = { sessionId: 'tob-root', botSlug: 'tob', rootRole: 'orchestrator' as const };
  const ownership = { resolve: () => owner } as unknown as SessionOwnership;
  const actor = { session: { id: owner.sessionId, header: { cwd: '/test/tob' } } } as Agent;
  let scope = 'initial';
  let authorized = true;
  let fullAccess = false;
  const channelApproval = new ChannelToolApproval(
    channels,
    ownership,
    policy?.rules,
    () => scope,
    undefined,
    undefined,
    undefined,
    policy?.autoApproval,
  );
  cleanups.push(() => channelApproval.close());
  const controller = new AbortController();
  const execution = {
    agent: actor,
    name: 'shell',
    callId: ToolCallId('original-shell'),
    arguments: { command: 'deepseekbot settings-set botharness-client --patch-stdin' },
    token: Symbol('shell'),
    signal: controller.signal,
  } as ToolExecution;
  const operation: TobCliWriteProposal = {
    ns: 'botharness-client',
    patch: { assignmentConcurrencyLimit: 3 },
    previousValue: { assignmentConcurrencyLimit: 8 },
    expectedRevision: 4,
  };
  const authorize = vi.fn(() => {
    if (!authorized) throw new TobError('agent-context-expired');
  });
  const request = vi.fn(
    async (input: Parameters<ApprovalService['request']>[0]) =>
      (await channelApproval.ask(input)) ?? 'unavailable',
  );
  const approval = { request } as unknown as ApprovalService;
  const options = {
    execution,
    operation,
    signal: controller.signal,
    authorize,
    approval,
    channelApproval,
    fullAccess: () => fullAccess,
  };
  const track = vi.spyOn(channelApproval, 'track');
  async function card(index = 0) {
    await vi.waitFor(() =>
      expect(messages.filter((m) => m.toolApprovalRequest).length).toBeGreaterThan(index),
    );
    return messages.filter((m) => m.toolApprovalRequest)[index]!;
  }
  return {
    options,
    channelApproval,
    execution,
    operation,
    messages,
    card,
    controller,
    request,
    track,
    authorize,
    setScope: (value: string) => {
      scope = value;
    },
    revoke: () => {
      authorized = false;
    },
    setFullAccess: (value: boolean) => {
      fullAccess = value;
    },
  };
}

function writeAfterApproval(options: Parameters<typeof approveTobCliOperation>[0]) {
  const write = vi.fn();
  const result = approveTobCliOperation(options).then(
    (guard) => {
      guard();
      write();
      return { ok: true as const, guard };
    },
    (error: unknown) => ({ ok: false as const, error }),
  );
  return { result, write };
}

describe('Tob CLI operations use existing Channel approval', () => {
  it('reviews parsed global old/new values and revision without replacing the parent Shell call', async () => {
    const f = fixture();
    const untrackShell = f.channelApproval.track(f.execution)!;
    const pending = approveTobCliOperation(f.options);
    const card = await f.card();
    const details = card.toolApprovalRequest!;
    expect(details.toolName).toBe('deepseekbot settings-set');
    expect(details.callId).not.toBe(f.execution.callId);
    expect(JSON.parse(details.input)).toEqual({
      parentShellCallId: 'original-shell',
      scope: 'global',
      ...f.operation,
    });
    expect(f.request).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: f.execution.agent,
        callId: details.callId,
        toolName: details.toolName,
        signal: f.controller.signal,
      }),
    );
    expect(
      f.channelApproval.executionGuard(f.execution.agent!, f.execution.callId)?.(
        f.execution.name,
        f.execution.arguments,
      ),
    ).toBe(true);
    expect(await f.channelApproval.decide('tob', card.id, 'allowed-once')).toBe(true);
    const guard = await pending;
    expect(() => guard()).not.toThrow();

    expect(f.channelApproval.executionGuard(f.execution.agent!, details.callId)).toBeUndefined();
    expect(
      f.channelApproval.executionGuard(f.execution.agent!, f.execution.callId)?.(
        f.execution.name,
        f.execution.arguments,
      ),
    ).toBe(true);
    expect(f.execution.name).toBe('shell');
    expect(f.execution.arguments).toEqual({
      command: 'deepseekbot settings-set botharness-client --patch-stdin',
    });
    untrackShell();
  });

  it('gives two CLI operations inside the same Shell distinct approval identities', async () => {
    const f = fixture();
    const first = writeAfterApproval(f.options);
    const second = writeAfterApproval(f.options);
    const one = await f.card(0),
      two = await f.card(1);
    expect(one.toolApprovalRequest!.callId).not.toBe(two.toolApprovalRequest!.callId);
    await f.channelApproval.decide('tob', one.id, 'rejected');
    await f.channelApproval.decide('tob', two.id, 'rejected');
    expect(await first.result).toMatchObject({ ok: false, error: { code: 'approval-denied' } });
    expect(await second.result).toMatchObject({ ok: false, error: { code: 'approval-denied' } });
    expect(first.write).not.toHaveBeenCalled();
    expect(second.write).not.toHaveBeenCalled();
    for (const message of [one, two])
      expect(
        f.channelApproval.executionGuard(f.execution.agent!, message.toolApprovalRequest!.callId),
      ).toBeUndefined();
  });

  it('cancelled Human approval cannot reach the write and releases tracking', async () => {
    const f = fixture();
    const pending = writeAfterApproval(f.options);
    const card = await f.card();
    f.controller.abort();
    expect(await pending.result).toMatchObject({
      ok: false,
      error: { code: 'approval-cancelled' },
    });
    expect(pending.write).not.toHaveBeenCalled();
    expect(
      f.channelApproval.executionGuard(f.execution.agent!, card.toolApprovalRequest!.callId),
    ).toBeUndefined();
  });

  it('fails closed when native approval is missing, or tracking cannot establish ownership', async () => {
    const f = fixture();
    const missing = writeAfterApproval({ ...f.options, approval: undefined });
    expect(await missing.result).toMatchObject({
      ok: false,
      error: { code: 'approval-unavailable' },
    });
    expect(missing.write).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
    const call = f.track.mock.calls[0]![0];
    expect(f.channelApproval.executionGuard(f.execution.agent!, call.callId)).toBeUndefined();
    f.track.mockReturnValueOnce(undefined);
    const unowned = writeAfterApproval(f.options);
    expect(await unowned.result).toMatchObject({
      ok: false,
      error: { code: 'approval-unavailable' },
    });
    expect(unowned.write).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
  });

  it.each(['rejected', 'cancelled', 'unavailable'] as const)(
    'honors native policy outcome %s without manufacturing approval',
    async (outcome) => {
      const f = fixture();
      f.request.mockResolvedValueOnce(outcome);
      const pending = writeAfterApproval(f.options);
      expect(await pending.result).toMatchObject({ ok: false });
      expect(pending.write).not.toHaveBeenCalled();
      expect(f.messages).toHaveLength(0);
      const call = f.track.mock.calls[0]![0];
      expect(f.channelApproval.executionGuard(f.execution.agent!, call.callId)).toBeUndefined();
    },
  );

  it('rechecks the Channel scope after the decision and before subsequent execution', async () => {
    const f = fixture();
    const pending = approveTobCliOperation(f.options);
    const card = await f.card();
    await f.channelApproval.decide('tob', card.id, 'allowed-once');
    const guard = await pending;
    f.setScope('changed');
    expect(() => guard()).toThrow('approval-authority-changed');
  });

  it('rechecks the broker authority after approval and does not write on revocation', async () => {
    const f = fixture();
    const pending = writeAfterApproval(f.options);
    const card = await f.card();
    f.revoke();
    await f.channelApproval.decide('tob', card.id, 'allowed-once');
    expect(await pending.result).toMatchObject({
      ok: false,
      error: { code: 'agent-context-expired' },
    });
    expect(pending.write).not.toHaveBeenCalled();
  });

  it('allows the existing full-access policy only while it and invocation authority remain valid', async () => {
    const f = fixture();
    f.setFullAccess(true);
    const guard = await approveTobCliOperation(f.options);
    expect(f.request).not.toHaveBeenCalled();
    expect(f.track).not.toHaveBeenCalled();
    expect(() => guard()).not.toThrow();
    f.setFullAccess(false);
    expect(() => guard()).toThrow('approval-authority-changed');
    f.setFullAccess(true);
    f.revoke();
    expect(() => guard()).toThrow('agent-context-expired');
  });

  it('removes internal tracking when the native approval service fails', async () => {
    const f = fixture();
    f.request.mockRejectedValueOnce(new Error('approval service disconnected'));
    await expect(approveTobCliOperation(f.options)).rejects.toThrow(
      'approval service disconnected',
    );
    const call = f.track.mock.calls[0]![0];
    expect(f.channelApproval.executionGuard(f.execution.agent!, call.callId)).toBeUndefined();
  });

  it('rejects an aborted invocation before asking even under full access', async () => {
    const f = fixture();
    f.setFullAccess(true);
    f.controller.abort();
    await expect(approveTobCliOperation(f.options)).rejects.toThrow('agent-context-expired');
    expect(f.request).not.toHaveBeenCalled();
    expect(f.track).not.toHaveBeenCalled();
  });
});

describe('disruptive scoped CLI operations require Human review', () => {
  function release(command: string): TobCliWriteProposal {
    return {
      command,
      target: 'release',
      previousValue: { version: '1.0.0' },
      patch: { version: '1.1.0', confirm: true },
    };
  }

  it.each(['release-install', 'release-restart', 'bot-delete-confirm', 'bot-delete-retry'])(
    'does not bypass %s via full access, saved rules or automatic reviewer',
    async (command) => {
      const match = vi.fn(() => ({ id: 'allow-all' }));
      const createPending = vi.fn();
      const template = vi.fn(() => ({ name: 'allow-all', text: 'Allow operations' }));
      const review = vi.fn(async () => ({ outcome: 'allow' as const, reason: 'Allowed' }));
      const f = fixture({
        rules: { match, createPending } as unknown as ToolApprovalRuleStore,
        autoApproval: { template, review, log: vi.fn() },
      });
      f.setFullAccess(true);
      const operation = release(command);
      const pending = writeAfterApproval({ ...f.options, operation });
      const card = await f.card();
      expect(card.toolApprovalRequest).toMatchObject({
        toolName: 'deepseekbot ' + command,
        externalDecision: 'each-use',
      });
      expect(JSON.parse(card.toolApprovalRequest!.input)).toMatchObject({
        ...operation,
        parentShellCallId: 'original-shell',
      });
      expect(pending.write).not.toHaveBeenCalled();
      expect(match).not.toHaveBeenCalled();
      expect(template).not.toHaveBeenCalled();
      expect(review).not.toHaveBeenCalled();
      expect(await f.channelApproval.decide('tob', card.id, 'allowed-always-exact')).toBe(false);
      expect(await f.channelApproval.decide('tob', card.id, 'allowed-always-all')).toBe(false);
      expect(createPending).not.toHaveBeenCalled();
      expect(await f.channelApproval.decide('tob', card.id, 'allowed-once')).toBe(true);
      expect(await pending.result).toMatchObject({ ok: true });
      expect(pending.write).toHaveBeenCalledTimes(1);
      expect(f.channelApproval.activeMessageIds()).toEqual([]);
      expect(
        f.channelApproval.executionGuard(f.execution.agent!, card.toolApprovalRequest!.callId),
      ).toBeUndefined();
    },
  );

  it('does not reuse a prior automatic-rejection override for a disruptive command', async () => {
    const f = fixture();
    const operation = release('release-restart');
    f.messages.push({
      id: 'old-rejection',
      at: new Date().toISOString(),
      author: { kind: 'system' },
      body: 'Rejected',
      toolAutoApproval: {
        botSlug: 'tob',
        sessionId: 'tob-root',
        callId: 'older-cli-call',
        toolName: 'deepseekbot release-restart',
        input: JSON.stringify({
          parentShellCallId: 'original-shell',
          scope: 'global',
          ...operation,
        }),
        template: 'cautious',
        outcome: 'rejected',
        reason: 'Needs review',
      },
    });
    expect(await f.channelApproval.overrideRejection('dm-tob', 'old-rejection')).toMatchObject({
      ok: true,
    });
    const pending = writeAfterApproval({ ...f.options, operation });
    const card = await f.card();
    expect(pending.write).not.toHaveBeenCalled();
    expect(card.toolApprovalRequest!.externalDecision).toBe('each-use');
    await f.channelApproval.decide('tob', card.id, 'rejected');
    expect(await pending.result).toMatchObject({ ok: false, error: { code: 'approval-denied' } });
  });

  it('refuses a native allowed-once outcome that has no committed Human decision', async () => {
    const f = fixture();
    f.setFullAccess(true);
    f.request.mockResolvedValueOnce('allowed-once');
    const pending = writeAfterApproval({ ...f.options, operation: release('release-restart') });
    expect(await pending.result).toMatchObject({
      ok: false,
      error: { code: 'approval-authority-changed' },
    });
    expect(pending.write).not.toHaveBeenCalled();
    expect(f.messages).toEqual([]);
  });

  it.each(['rejected', 'cancelled'] as const)(
    'never writes on Human %s even with full access',
    async (outcome) => {
      const f = fixture();
      f.setFullAccess(true);
      const pending = writeAfterApproval({ ...f.options, operation: release('release-restart') });
      const card = await f.card();
      if (outcome === 'cancelled') f.controller.abort();
      else await f.channelApproval.decide('tob', card.id, 'rejected');
      expect(await pending.result).toMatchObject({
        ok: false,
        error: { code: outcome === 'rejected' ? 'approval-denied' : 'approval-cancelled' },
      });
      expect(pending.write).not.toHaveBeenCalled();
      expect(f.channelApproval.activeMessageIds()).toEqual([]);
    },
  );

  it('fails closed for a disruptive write when Human approval is unavailable', async () => {
    const f = fixture();
    f.setFullAccess(true);
    const pending = writeAfterApproval({
      ...f.options,
      operation: release('release-restart'),
      approval: undefined,
    });
    expect(await pending.result).toMatchObject({
      ok: false,
      error: { code: 'approval-unavailable' },
    });
    expect(pending.write).not.toHaveBeenCalled();
  });

  it('rechecks scope and invocation authority after Human review', async () => {
    const f = fixture();
    const pending = approveTobCliOperation({ ...f.options, operation: release('release-restart') });
    const card = await f.card();
    await f.channelApproval.decide('tob', card.id, 'allowed-once');
    const guard = await pending;
    f.setScope('new-scope');
    expect(() => guard()).toThrow('approval-authority-changed');
    f.setScope('initial');
    f.revoke();
    expect(() => guard()).toThrow('agent-context-expired');
  });

  it('shows the target Bot scope on model-plan approvals', async () => {
    const f = fixture();
    const operation = {
      command: 'model-plan-customize',
      target: 'research',
      previousValue: { revision: 2 },
      patch: { orchestrator: { provider: 'deepseek', model: 'chat' } },
      expectedRevision: 2,
    };
    const pending = writeAfterApproval({ ...f.options, operation });
    const card = await f.card();
    expect(JSON.parse(card.toolApprovalRequest!.input)).toMatchObject({
      scope: 'bot:research',
      target: 'research',
      expectedRevision: 2,
    });
    await f.channelApproval.decide('tob', card.id, 'rejected');
    await pending.result;
  });
});
