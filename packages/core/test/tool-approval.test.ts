import { describe, expect, it, vi } from 'vitest';

import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';

import type { ChannelMessage, ChannelRecord } from '../src/channels/channel.js';
import type { ChannelStore } from '../src/channels/store.js';
import type { SessionOwnership } from '../src/sessions/ownership.js';
import { rmSync } from 'node:fs';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createToolApprovalRuleStore } from '../src/workspaces/tool-approval-rules.js';
import { createTempRoot } from './helpers.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';

const botSlug = 'ada';
const sessionId = 'botharness-assignment-test';
const channelId = 'dm-ada';

function fixture(
  attention?: {
    changed(slug: string, count: number): void;
    warn(message: string): void;
  },
  ownedSessionId = sessionId,
) {
  const messages: ChannelMessage[] = [];
  const channel = { id: channelId, type: 'dm', botSlug } as ChannelRecord;
  const channels = {
    get: vi.fn((id: string) => (id === channelId ? channel : undefined)),
    appendMessage: vi.fn(async (id: string, message: ChannelMessage) => {
      if (id !== channelId) return undefined;
      messages.push(message);
      return message;
    }),
  } as unknown as ChannelStore;
  const ownership = {
    resolve: vi.fn((id: string) =>
      id === ownedSessionId
        ? { sessionId: ownedSessionId, botSlug, rootRole: 'assignment' as const }
        : undefined,
    ),
  } as unknown as SessionOwnership;
  const agent = { session: { id: ownedSessionId, header: { cwd: '/tmp/project' } } } as Agent;
  const broker = new ChannelToolApproval(channels, ownership, undefined, undefined, attention);
  const execution = (signal?: AbortSignal, callId = 'call-1'): ToolExecution =>
    ({
      agent,
      name: 'bash',
      callId,
      arguments: { command: 'pwd && ls' },
      token: Symbol('call'),
      signal,
    }) as ToolExecution;
  return { broker, channels, ownership, messages, agent, execution };
}

describe('Channel tool approval', () => {
  it.each([
    ['browser_open', 'browser'],
    ['computer_click', 'computer'],
    ['deepseekbot release-install', undefined],
    ['deepseekbot release-restart', undefined],
    ['deepseekbot bot-delete-confirm', undefined],
    ['deepseekbot bot-delete-retry', undefined],
    ['pwsh', undefined],
  ] as const)('saves, restores and revokes explicit Always allow for %s', async (name, device) => {
    const state = fixture();
    const home = createTempRoot('bh-explicit-approval-');
    const database = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    const rules = createToolApprovalRuleStore(
      attachOperationalModule(database, 'tool-approval-rules'),
    );
    const broker = new ChannelToolApproval(state.channels, state.ownership, rules);
    let target = 'target-a';
    const execution = (callId: string): ToolExecution => ({
      ...state.execution(undefined, callId),
      name,
      arguments:
        name === 'pwsh'
          ? { command: 'deepseekbot grant-write-set ada --grant project --enabled' }
          : { action: callId },
    });
    const track = (owner: ChannelToolApproval, callId: string) =>
      owner.track(
        execution(callId),
        'operation',
        false,
        device,
        undefined,
        device
          ? { authorizationScope: () => target }
          : { requireExplicitApproval: name !== 'pwsh' },
      );
    const ask = (owner: ChannelToolApproval, callId: string) =>
      owner.ask({ agent: state.agent, toolName: name, callId });
    let restored: ChannelToolApproval | undefined;
    try {
      const legacy = rules.createPending({
        botSlug,
        role: 'assignment',
        scopeKey: JSON.stringify(['assignment', '/tmp/project']),
        kind: 'tool',
        toolName: name,
        input: '',
      });
      rules.activate(botSlug, legacy.id);
      track(broker, 'first');
      const first = ask(broker, 'first');
      await vi.waitFor(() => expect(state.messages).toHaveLength(1));
      expect(state.messages[0]!.toolApprovalRequest?.allowAlways).toBe(true);
      expect(await broker.decide(botSlug, state.messages[0]!.id, 'allowed-always-tool')).toBe(true);
      expect(await first).toBe('allowed-once');
      const saved = rules.list(botSlug).find((rule) => rule.id !== legacy.id)!;
      broker.close();
      restored = new ChannelToolApproval(state.channels, state.ownership, rules);
      track(restored, 'changed-input');
      expect(await ask(restored, 'changed-input')).toBe('allowed-once');
      expect(state.messages).toHaveLength(2);
      if (device) {
        const owner = state.ownership.resolve(sessionId)!;
        vi.spyOn(state.ownership, 'resolve').mockImplementation((id) => ({
          ...owner,
          sessionId: id,
        }));
        const nextAgent = fixture(undefined, 'another-session').agent;
        restored.track(
          { ...execution('another-session-call'), agent: nextAgent },
          'operation',
          false,
          device,
          undefined,
          { authorizationScope: () => target },
        );
        expect(
          await restored.ask({ agent: nextAgent, toolName: name, callId: 'another-session-call' }),
        ).toBe('allowed-once');
        expect(state.messages).toHaveLength(2);
      }
      rules.revoke(botSlug, saved.id);
      expect(restored.validAfterDecision(state.agent, 'changed-input')).toBe(false);
      track(restored, 'revoked');
      const revoked = ask(restored, 'revoked');
      await vi.waitFor(() => expect(state.messages).toHaveLength(3));
      await restored.decide(botSlug, state.messages[2]!.id, 'allowed-always-tool');
      expect(await revoked).toBe('allowed-once');
      if (device) {
        target = 'target-b';
        expect(restored.validAfterDecision(state.agent, 'revoked')).toBe(false);
        track(restored, 'new-target');
        const changed = ask(restored, 'new-target');
        await vi.waitFor(() => expect(state.messages).toHaveLength(5));
        await restored.decide(botSlug, state.messages[4]!.id, 'rejected');
        expect(await changed).toBe('rejected');
      }
    } finally {
      broker.close();
      restored?.close();
      database.close();
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('persists Always allow for the selected tool and asks again after revoke or for another tool', async () => {
    const state = fixture();
    const home = createTempRoot('bh-tool-decision-');
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const rules = createToolApprovalRuleStore(
      attachOperationalModule(owner, 'tool-approval-rules'),
    );
    const broker = new ChannelToolApproval(state.channels, state.ownership, rules);
    try {
      broker.track(state.execution());
      const first = broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-1' });
      await vi.waitFor(() => expect(state.messages).toHaveLength(1));
      expect(state.messages[0]?.toolApprovalRequest?.allowAlways).toBe(true);
      expect(await broker.decide(botSlug, state.messages[0]!.id, 'allowed-always-tool')).toBe(true);
      expect(await first).toBe('allowed-once');
      expect(rules.list(botSlug)).toMatchObject([{ kind: 'tool', toolName: 'bash', input: '' }]);
      broker.track({
        ...state.execution(undefined, 'call-2'),
        arguments: { command: 'different arguments' },
      });
      expect(await broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-2' })).toBe(
        'allowed-once',
      );
      expect(state.messages).toHaveLength(2);
      broker.track({ ...state.execution(undefined, 'call-3'), name: 'pwsh' });
      const other = broker.ask({ agent: state.agent, toolName: 'pwsh', callId: 'call-3' });
      await vi.waitFor(() => expect(state.messages).toHaveLength(3));
      await broker.decide(botSlug, state.messages[2]!.id, 'rejected');
      expect(await other).toBe('rejected');
      rules.revoke(botSlug, rules.list(botSlug)[0]!.id);
      broker.track(state.execution(undefined, 'call-4'));
      const revoked = broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-4' });
      await vi.waitFor(() => expect(state.messages).toHaveLength(5));
      await broker.decide(botSlug, state.messages[4]!.id, 'rejected');
      expect(await revoked).toBe('rejected');
    } finally {
      broker.close();
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('commits a Human decision promptly but holds its native outcome until capacity is reserved', async () => {
    const state = fixture();
    let release!: () => void;
    const capacity = new Promise<void>((resolve) => {
      release = resolve;
    });
    const lease = { resume: vi.fn(() => capacity), release: vi.fn() };
    const begin = vi.fn(() => lease);
    const broker = new ChannelToolApproval(
      state.channels,
      state.ownership,
      undefined,
      undefined,
      undefined,
      begin,
    );
    broker.track(state.execution());
    const delivered = vi.fn();
    const answer = broker
      .ask({ agent: state.agent, toolName: 'bash', callId: 'call-1' })
      .then((value) => {
        delivered(value);
        return value;
      });
    await vi.waitFor(() => expect(state.messages).toHaveLength(1));
    expect(begin).toHaveBeenCalledWith(sessionId, 'call-1', expect.any(AbortSignal));
    expect(await broker.decide(botSlug, state.messages[0]!.id, 'allowed-once')).toBe(true);
    expect(state.messages[1]?.toolApprovalDecision?.outcome).toBe('allowed-once');
    expect(lease.resume).toHaveBeenCalledTimes(1);
    expect(delivered).not.toHaveBeenCalled();
    release();
    expect(await answer).toBe('allowed-once');
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it('returns unavailable if authority disappears after the Human decision and releases the wait', async () => {
    const state = fixture();
    let refuse!: (error: Error) => void;
    const capacity = new Promise<void>((_resolve, reject) => {
      refuse = reject;
    });
    const lease = { resume: () => capacity, release: vi.fn() };
    const broker = new ChannelToolApproval(
      state.channels,
      state.ownership,
      undefined,
      undefined,
      undefined,
      () => lease,
    );
    broker.track(state.execution());
    const answer = broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-1' });
    await vi.waitFor(() => expect(state.messages).toHaveLength(1));
    expect(await broker.decide(botSlug, state.messages[0]!.id, 'allowed-once')).toBe(true);
    refuse(new Error('authority unavailable'));
    expect(await answer).toBe('unavailable');
    expect(lease.release).toHaveBeenCalledTimes(1);
    expect(broker.status(botSlug, state.messages[0]!.id)).toBe('expired');
  });

  it('shows the new-Bot preview on a bot_create card, and declining reports rejected', async () => {
    const state = fixture();
    const preview = { memoryFolder: '/bots/<new-bot-id>/memory', defaultLocation: true };
    state.broker.track(
      {
        ...state.execution(),
        name: 'bot_create',
        arguments: { display_name: 'Tim', tags: ['translator'] },
      } as ToolExecution,
      'operation',
      false,
      undefined,
      preview,
    );
    const answer = state.broker.ask({
      agent: state.agent,
      toolName: 'bot_create',
      callId: 'call-1',
    });
    await vi.waitFor(() => expect(state.messages).toHaveLength(1));
    expect(state.messages[0]?.toolApprovalRequest).toMatchObject({
      toolName: 'bot_create',
      botCreatePreview: preview,
    });
    expect(JSON.parse(state.messages[0]!.toolApprovalRequest!.input)).toEqual({
      display_name: 'Tim',
      tags: ['translator'],
    });
    expect(await state.broker.decide(botSlug, state.messages[0]!.id, 'rejected')).toBe(true);
    expect(await answer).toBe('rejected');
  });

  it('lets a saved rule allow bot_create without a card', async () => {
    const state = fixture();
    const match = vi.fn(() => ({ id: 'rule-1' }));
    const broker = new ChannelToolApproval(state.channels, state.ownership, {
      match,
      recordAutoApproval: vi.fn(),
    } as never);
    broker.track({
      ...state.execution(),
      name: 'bot_create',
      arguments: { display_name: 'Tim' },
    } as ToolExecution);
    expect(await broker.ask({ agent: state.agent, toolName: 'bot_create', callId: 'call-1' })).toBe(
      'allowed-once',
    );
    expect(match).toHaveBeenCalledWith(expect.objectContaining({ toolName: 'bot_create' }));
    expect(state.messages).toHaveLength(0);
  });

  it('posts a card for a tool input longer than 16 KB instead of refusing the call', async () => {
    const state = fixture();
    const execution = {
      ...state.execution(),
      arguments: { command: 'echo ' + 'x'.repeat(20_000) },
    } as ToolExecution;
    expect(state.broker.track(execution)).toBeTypeOf('function');
    const answer = state.broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-1' });
    await vi.waitFor(() => expect(state.messages).toHaveLength(1));
    expect(state.messages[0]!.toolApprovalRequest?.input.length).toBeGreaterThan(20_000);
    expect(await state.broker.decide(botSlug, state.messages[0]!.id, 'allowed-once')).toBe(true);
    expect(await answer).toBe('allowed-once');
  });

  it('keeps one native tool call paused until a Human decision is committed', async () => {
    const state = fixture();
    const untrack = state.broker.track(state.execution());
    expect(untrack).toBeTypeOf('function');
    const answer = state.broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-1' });
    await vi.waitFor(() => expect(state.messages).toHaveLength(1));
    const request = state.messages[0]!;
    expect(request.toolApprovalRequest).toMatchObject({
      sessionId,
      toolName: 'bash',
      role: 'assignment',
      cwd: '/tmp/project',
      input: '{\n  "command": "pwd && ls"\n}',
    });
    expect(state.broker.status(botSlug, request.id)).toBe('pending');
    expect(state.broker.activeMessageIds()).toEqual([request.id]);
    expect(await state.broker.decide('other-bot', request.id, 'allowed-once')).toBe(false);
    expect(state.messages).toHaveLength(1);
    expect(await state.broker.decide(botSlug, request.id, 'allowed-once')).toBe(true);
    expect(await answer).toBe('allowed-once');
    expect(state.messages[1]?.toolApprovalDecision).toEqual({
      requestMessageId: request.id,
      outcome: 'allowed-once',
    });
    expect(state.broker.status(botSlug, request.id)).toBe('expired');
    expect(state.broker.activeMessageIds()).toEqual([]);
    expect(await state.broker.decide(botSlug, request.id, 'allowed-once')).toBe(false);
    untrack?.();
  });

  it('records a rejection and leaves the native call denied', async () => {
    const state = fixture();
    const untrack = state.broker.track(state.execution());
    const answer = state.broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-1' });
    await vi.waitFor(() => expect(state.messages).toHaveLength(1));
    const requestId = state.messages[0]!.id;
    expect(await state.broker.decide(botSlug, requestId, 'rejected')).toBe(true);
    expect(await answer).toBe('rejected');
    expect(state.messages[1]?.toolApprovalDecision).toEqual({
      requestMessageId: requestId,
      outcome: 'rejected',
    });
    untrack?.();
  });

  it('cancels a pending approval with the original tool signal', async () => {
    const state = fixture();
    const controller = new AbortController();
    const untrack = state.broker.track(state.execution(controller.signal));
    const answer = state.broker.ask({
      agent: state.agent,
      toolName: 'bash',
      callId: 'call-1',
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(state.messages).toHaveLength(1));
    controller.abort();
    expect(await answer).toBe('cancelled');
    expect(state.broker.status(botSlug, state.messages[0]!.id)).toBe('expired');
    expect(await state.broker.decide(botSlug, state.messages[0]!.id, 'allowed-once')).toBe(false);
    untrack?.();
  });

  it('expires a pending native approval when its Workspace Grant is revoked', async () => {
    const state = fixture();
    let grantActive = true;
    const broker = new ChannelToolApproval(state.channels, state.ownership, undefined, () =>
      grantActive ? 'assignment:grant-1' : undefined,
    );
    broker.track(state.execution());
    const answer = broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-1' });
    await vi.waitFor(() => expect(state.messages).toHaveLength(1));
    const requestId = state.messages[0]!.id;
    expect(broker.status(botSlug, requestId)).toBe('pending');

    grantActive = false;
    broker.cancelInvalid();

    expect(await answer).toBe('unavailable');
    expect(broker.status(botSlug, requestId)).toBe('expired');
    expect(await broker.decide(botSlug, requestId, 'allowed-once')).toBe(false);
    expect(state.messages).toHaveLength(1);
  });
  it('refuses a native call if its Grant is revoked after one-time approval', async () => {
    const state = fixture();
    let grantActive = true;
    const broker = new ChannelToolApproval(state.channels, state.ownership, undefined, () =>
      grantActive ? 'assignment:grant-1' : undefined,
    );
    broker.track(state.execution());
    const answer = broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-1' });
    await vi.waitFor(() => expect(state.messages).toHaveLength(1));

    expect(await broker.decide(botSlug, state.messages[0]!.id, 'allowed-once')).toBe(true);
    expect(await answer).toBe('allowed-once');
    expect(broker.validAfterDecision(state.agent, 'call-1')).toBe(true);
    grantActive = false;
    expect(broker.validAfterDecision(state.agent, 'call-1')).toBe(false);
  });

  it('uses a Human-saved exact rule for later calls and loses it after revoke', async () => {
    const state = fixture();
    let active = true;
    const rules = {
      match: vi.fn((input: { toolName: string; input: string }) =>
        active && input.toolName === 'bash' && input.input.includes('pwd')
          ? { id: 'rule-1', botSlug }
          : undefined,
      ),
      recordAutoApproval: vi.fn(),
      createPending: vi.fn(),
      activate: vi.fn(),
      revoke: vi.fn(),
      list: vi.fn(),
    } as unknown as import('../src/workspaces/tool-approval-rules.js').ToolApprovalRuleStore;
    const broker = new ChannelToolApproval(state.channels, state.ownership, rules);
    broker.track(state.execution());
    expect(await broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-1' })).toBe(
      'allowed-once',
    );
    expect(broker.validAfterDecision(state.agent, 'call-1')).toBe(true);
    expect(state.messages).toHaveLength(0);
    expect(rules.recordAutoApproval).toHaveBeenCalledExactlyOnceWith(botSlug, 'rule-1');
    active = false;
    expect(broker.validAfterDecision(state.agent, 'call-1')).toBe(false);
    broker.close();
  });

  it('asks every time for an each-use call and never saves a rule for it', async () => {
    const state = fixture();
    const rules = {
      match: vi.fn(() => ({ id: 'rule-all' })),
      recordAutoApproval: vi.fn(),
      createPending: vi.fn(),
      activate: vi.fn(),
      revoke: vi.fn(),
      list: vi.fn(),
    } as unknown as import('../src/workspaces/tool-approval-rules.js').ToolApprovalRuleStore;
    const broker = new ChannelToolApproval(state.channels, state.ownership, rules);
    broker.track(state.execution(), 'each-use');
    expect(broker.willPrompt(state.agent, 'call-1')).toBe(true);
    const answer = broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-1' });
    await vi.waitFor(() => expect(state.messages).toHaveLength(1));
    const request = state.messages[0]!;
    expect(request.toolApprovalRequest).toMatchObject({ externalDecision: 'each-use' });
    expect(await broker.decide(botSlug, request.id, 'allowed-always-exact')).toBe(false);
    expect(await broker.decide(botSlug, request.id, 'allowed-always-all')).toBe(false);
    expect(
      await broker.decide(botSlug, request.id, 'allowed-once', {
        actor: { kind: 'external' } as never,
        authorized: () => true,
      }),
    ).toBe(false);
    expect(rules.createPending).not.toHaveBeenCalled();
    expect(await broker.decide(botSlug, request.id, 'allowed-once')).toBe(true);
    expect(await answer).toBe('allowed-once');
    broker.close();
  });

  it('remembers a rememberable each-use call without saving a rule', async () => {
    const state = fixture();
    const rules = {
      match: vi.fn(() => undefined),
      createPending: vi.fn(),
      activate: vi.fn(),
      revoke: vi.fn(),
      list: vi.fn(),
    } as unknown as import('../src/workspaces/tool-approval-rules.js').ToolApprovalRuleStore;
    const broker = new ChannelToolApproval(state.channels, state.ownership, rules);
    broker.track(state.execution(), 'each-use', true);
    const answer = broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-1' });
    await vi.waitFor(() => expect(state.messages).toHaveLength(1));
    const request = state.messages[0]!;
    expect(broker.remembered(state.agent, 'call-1')).toBe(false);
    expect(await broker.decide(botSlug, request.id, 'allowed-always-all')).toBe(false);
    expect(await broker.decide(botSlug, request.id, 'allowed-always-exact')).toBe(true);
    expect(await answer).toBe('allowed-once');
    expect(broker.remembered(state.agent, 'call-1')).toBe(true);
    expect(rules.createPending).not.toHaveBeenCalled();
    broker.close();
  });

  it('declines requests that do not match the exact tracked Agent and tool', async () => {
    const state = fixture();
    state.broker.track(state.execution());
    const otherAgent = { session: { id: sessionId, header: { cwd: '/tmp/project' } } } as Agent;
    expect(
      await state.broker.ask({ agent: otherAgent, toolName: 'bash', callId: 'call-1' }),
    ).toBeUndefined();
    expect(
      await state.broker.ask({ agent: state.agent, toolName: 'write', callId: 'call-1' }),
    ).toBeUndefined();
    expect(state.messages).toHaveLength(0);
    state.broker.close();
  });
});

describe('committed native approval attention', () => {
  it('counts concurrent requests, preserves a rejected sibling, and clears before execution resumes', async () => {
    const changed = vi.fn();
    const state = fixture({ changed, warn: vi.fn() });
    state.broker.track(state.execution());
    const second = state.execution(undefined, 'call-2');
    state.broker.track(second);
    const firstAnswer = state.broker.ask({
      agent: state.agent,
      toolName: 'bash',
      callId: 'call-1',
    });
    const secondAnswer = state.broker.ask({
      agent: state.agent,
      toolName: 'bash',
      callId: 'call-2',
    });
    await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith(botSlug, 2));
    expect(await state.broker.decide('other', state.messages[0]!.id, 'allowed-once')).toBe(false);
    expect(changed).toHaveBeenLastCalledWith(botSlug, 2);
    expect(await state.broker.decide(botSlug, state.messages[0]!.id, 'rejected')).toBe(true);
    expect(await firstAnswer).toBe('rejected');
    expect(changed).toHaveBeenLastCalledWith(botSlug, 1);
    state.broker.close();
    expect(await secondAnswer).toBe('cancelled');
    expect(changed).toHaveBeenLastCalledWith(botSlug, 0);
  });

  it.each(['abort', 'untrack', 'ownership', 'close'] as const)(
    'clears committed attention on %s',
    async (cause) => {
      const changed = vi.fn();
      const state = fixture({ changed, warn: vi.fn() });
      const controller = new AbortController();
      const untrack = state.broker.track(state.execution());
      const answer = state.broker.ask({
        agent: state.agent,
        toolName: 'bash',
        callId: 'call-1',
        signal: controller.signal,
      });
      await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith(botSlug, 1));
      if (cause === 'abort') controller.abort();
      if (cause === 'untrack') untrack?.();
      if (cause === 'ownership') {
        vi.mocked(state.ownership.resolve).mockReturnValue(undefined);
        state.broker.cancelInvalid();
      }
      if (cause === 'close') state.broker.close();
      await answer;
      expect(changed).toHaveBeenLastCalledWith(botSlug, 0);
    },
  );

  it('does not publish failed or aborted-before-commit requests', async () => {
    const changed = vi.fn();
    const state = fixture({ changed, warn: vi.fn() });
    state.broker.track(state.execution());
    vi.mocked(state.channels.appendMessage).mockResolvedValueOnce(undefined);
    expect(await state.broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-1' })).toBe(
      'unavailable',
    );
    expect(changed).not.toHaveBeenCalled();
    let commit!: () => void;
    vi.mocked(state.channels.appendMessage).mockImplementationOnce(
      (_id, message) =>
        new Promise((resolve) => {
          commit = () => resolve(message);
        }),
    );
    const controller = new AbortController();
    const answer = state.broker.ask({
      agent: state.agent,
      toolName: 'bash',
      callId: 'call-1',
      signal: controller.signal,
    });
    controller.abort();
    commit();
    expect(await answer).toBe('cancelled');
    expect(changed).not.toHaveBeenCalled();
  });

  it('does not change approval outcome if presentation publication fails', async () => {
    const warn = vi.fn();
    const state = fixture({
      changed: () => {
        throw new Error('offline observer');
      },
      warn,
    });
    state.broker.track(state.execution());
    const answer = state.broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-1' });
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith('tool-approval-attention-publication-failed'),
    );
    expect(await state.broker.decide(botSlug, state.messages[0]!.id, 'allowed-once')).toBe(true);
    expect(await answer).toBe('allowed-once');
  });
});
