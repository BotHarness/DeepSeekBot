import { type ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import type { AssignmentRequestOutcome } from '../src/runtime/bot-runtime.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';
import { ASSIGNMENT, groupTools } from './support/dsh-bot-agent-adapter.js';

describe('DSH Bot Agent adapter', () => {
  it('returns retryable capacity facts to the model for creation and addressed requests', async () => {
    const calls: Array<Promise<unknown>> = [];
    const refusal = {
      outcome: 'capacity' as const,
      code: 'assignment-capacity' as const,
      activeCount: 3,
      limit: 3,
      retryable: true as const,
      message: 'Nothing was awakened. Wait for active work to settle before retrying.',
    };
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onAgentCreated: () => {
          const tools = host.scopes.get('orchestrator-ada')?.tools ?? [];
          for (const [name, args] of [
            [
              'create_assignment',
              { title: 'Continue A', description: 'Continue A', grant_id: 'grant-1', key: 'a' },
            ],
            ['send_assignment_request', { session_id: 'assignment-1', text: 'Continue A' }],
          ] as const) {
            const tool = tools.find((tool) => tool.name === name);
            if (tool === undefined) throw new Error(`Missing Tool ${name}`);
            calls.push(tool.execute(args, {} as ToolRunContext));
          }
        },
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    try {
      await adapter.runOrchestrator({
        sessionId: 'orchestrator-ada',
        resume: false,
        bot: BOT,
        inboundChannelId: 'dm-test',
        inbox: '',
        message: 'Continue A',
        channels: {
          ...groupTools,
          contacts: async () => ({ outputLimit: 12_000, contacts: [] }),
          sendToBot: async () => {
            throw new Error('unexpected Bot DM');
          },
          ignore: () => ({
            sourceEventId: 'source-1',
            ignoredAt: BOT.createdAt,
            alreadyIgnored: false,
          }),
          read: () => [],
          requestGrant: async () => {
            throw new Error('unexpected Grant request');
          },
          send: async (input) => ({
            id: 'bot-1',
            at: BOT.createdAt,
            author: { kind: 'bot', slug: BOT.slug },
            body: input.body,
          }),
        },
        assignments: {
          create: () => refusal,
          request: () => ({
            ...refusal,
            assignment: { ...ASSIGNMENT, activity: 'idle' },
            delivery: 'capacity',
          }),
          grants: () => [],
          list: () => [],
          inspect: () => undefined,
          stop: async () => {
            throw new Error('unexpected stop');
          },
        },
      });
      const outputs = (await Promise.all(calls)).map((output) => JSON.parse(String(output)));
      expect(outputs).toEqual([
        refusal,
        { ...refusal, sessionId: 'assignment-1', activity: 'idle' },
      ]);
    } finally {
      await adapter.close();
    }
  });

  it('returns the assignment-ended refusal for a request to an archived Assignment', async () => {
    const calls: Array<Promise<unknown>> = [];
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onAgentCreated: () => {
          const tools = host.scopes.get('orchestrator-ada')?.tools ?? [];
          for (const [name, args] of [
            ['send_assignment_request', { session_id: 'assignment-1', text: 'Continue A' }],
          ] as const) {
            const tool = tools.find((tool) => tool.name === name);
            if (tool === undefined) throw new Error(`Missing Tool ${name}`);
            calls.push(tool.execute(args, {} as ToolRunContext));
          }
        },
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    try {
      await adapter.runOrchestrator({
        sessionId: 'orchestrator-ada',
        resume: false,
        bot: BOT,
        inboundChannelId: 'dm-test',
        inbox: '',
        message: 'Continue A',
        channels: {
          ...groupTools,
          contacts: async () => ({ outputLimit: 12_000, contacts: [] }),
          sendToBot: async () => {
            throw new Error('unexpected Bot DM');
          },
          ignore: () => ({
            sourceEventId: 'source-1',
            ignoredAt: BOT.createdAt,
            alreadyIgnored: false,
          }),
          read: () => [],
          requestGrant: async () => {
            throw new Error('unexpected Grant request');
          },
          send: async (input) => ({
            id: 'bot-1',
            at: BOT.createdAt,
            author: { kind: 'bot', slug: BOT.slug },
            body: input.body,
          }),
        },
        assignments: {
          create: () => ({ outcome: 'key-busy', message: 'unused' }),
          request: () => ({
            outcome: 'refused',
            code: 'assignment-ended',
            delivery: 'refused',
            message:
              'Assignment Session assignment-1 is archived (resolved); nothing was delivered.',
            assignment: { ...ASSIGNMENT, activity: 'idle' },
          }),
          grants: () => [],
          list: () => [],
          inspect: () => undefined,
          stop: async () => {
            throw new Error('unexpected stop');
          },
        },
      });
      const outputs = (await Promise.all(calls)).map((output) => JSON.parse(String(output)));
      expect(outputs).toEqual([
        {
          outcome: 'refused',
          code: 'assignment-ended',
          message: 'Assignment Session assignment-1 is archived (resolved); nothing was delivered.',
          sessionId: 'assignment-1',
          activity: 'idle',
        },
      ]);
    } finally {
      await adapter.close();
    }
  });

  it.each([
    {
      name: 'delivers the request',
      retry: {
        delivery: 'followup',
        acceptance: 'pending',
        assignment: { ...ASSIGNMENT, activity: 'working' },
      },
      output: {
        sessionId: 'assignment-1',
        activity: 'working',
        delivery: 'followup',
        acceptance: 'pending',
        unarchived: true,
      },
    },
    {
      name: 'reports a capacity refusal without delivering',
      retry: {
        outcome: 'capacity',
        code: 'assignment-capacity',
        activeCount: 4,
        limit: 4,
        retryable: true,
        message: 'full',
        delivery: 'capacity',
        assignment: { ...ASSIGNMENT, activity: 'idle' },
      },
      output: {
        outcome: 'capacity',
        code: 'assignment-capacity',
        activeCount: 4,
        limit: 4,
        retryable: true,
        message: 'full',
        sessionId: 'assignment-1',
        activity: 'idle',
        unarchived: true,
      },
    },
  ] satisfies Array<{
    name: string;
    retry: AssignmentRequestOutcome;
    output: Record<string, unknown>;
  }>)('unarchives an archived Assignment and then $name', async ({ retry, output }) => {
    const calls: Array<Promise<unknown>> = [];
    const unarchived: string[] = [];
    const requests: unknown[] = [];
    let archived = true;
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onAgentCreated: () => {
          const tools = host.scopes.get('orchestrator-ada')?.tools ?? [];
          for (const [name, args] of [
            ['send_assignment_request', { session_id: 'assignment-1', text: 'Continue A' }],
          ] as const) {
            const tool = tools.find((tool) => tool.name === name);
            if (tool === undefined) throw new Error(`Missing Tool ${name}`);
            calls.push(tool.execute(args, {} as ToolRunContext));
          }
        },
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    try {
      await adapter.runOrchestrator({
        sessionId: 'orchestrator-ada',
        resume: false,
        bot: BOT,
        inboundChannelId: 'dm-test',
        inbox: '',
        message: 'Continue A',
        channels: {
          ...groupTools,
          contacts: async () => ({ outputLimit: 12_000, contacts: [] }),
          sendToBot: async () => {
            throw new Error('unexpected Bot DM');
          },
          ignore: () => ({
            sourceEventId: 'source-1',
            ignoredAt: BOT.createdAt,
            alreadyIgnored: false,
          }),
          read: () => [],
          requestGrant: async () => {
            throw new Error('unexpected Grant request');
          },
          send: async (input) => ({
            id: 'bot-1',
            at: BOT.createdAt,
            author: { kind: 'bot', slug: BOT.slug },
            body: input.body,
          }),
        },
        assignments: {
          create: () => ({ outcome: 'key-busy', message: 'unused' }),
          request: (input) => {
            requests.push(input);
            return archived
              ? {
                  outcome: 'refused',
                  code: 'assignment-ended',
                  delivery: 'refused',
                  message: 'archived',
                  assignment: { ...ASSIGNMENT, activity: 'idle' },
                }
              : retry;
          },
          unarchive: async (sessionId) => {
            unarchived.push(sessionId);
            archived = false;
            return { outcome: 'unarchived', assignment: { ...ASSIGNMENT, activity: 'idle' } };
          },
          grants: () => [],
          list: () => [],
          inspect: () => undefined,
          stop: async () => {
            throw new Error('unexpected stop');
          },
        },
      });
      const outputs = (await Promise.all(calls)).map((output) => JSON.parse(String(output)));
      expect(unarchived).toEqual(['assignment-1']);
      expect(requests).toEqual([
        expect.objectContaining({ sessionId: 'assignment-1', text: 'Continue A' }),
        expect.objectContaining({ sessionId: 'assignment-1', text: 'Continue A' }),
      ]);
      expect(outputs).toEqual([output]);
    } finally {
      await adapter.close();
    }
  });

  it('follows up a settled Assignment instead of steering a stale run', async () => {
    const beginTurn = vi.fn();
    const steeringTurn = vi.fn();
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onSessionEvent: (session, event) => {
          if (session.id === 'assignment-1' && event.type === 'turn/start') {
            expect(adapter.requestAssignment({ ...run, beginTurn: steeringTurn }).delivery).toBe(
              'steer',
            );
          }
        },
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      hasSession: async () => false,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    let reported = false;
    const run = {
      beginTurn,
      sessionId: 'assignment-1',
      bot: BOT,
      text: '核对发布状态',
      permission: {
        grantId: 'grant-1',
        workspaceId: 'workspace-1',
        primaryCwd: '/project',
        mode: 'workspace-write',
        approval: 'ask',
        presetRevision: 0,
      },
      report: async (input: { state: string; summary: string }) => {
        reported = true;
        return { ...input, at: BOT.createdAt };
      },
    } as Parameters<typeof adapter.runAssignment>[0];

    const first = adapter.runAssignment(run);
    await Promise.resolve();
    await first;
    expect(reported).toBe(true);
    expect(beginTurn).toHaveBeenCalledOnce();
    expect(steeringTurn).not.toHaveBeenCalled();

    const settled = adapter.requestAssignment(run);
    expect(settled.delivery).toBe('followup');
    if (settled.delivery === 'followup') await settled.done;
    expect(beginTurn).toHaveBeenCalledTimes(2);
    expect(steeringTurn).not.toHaveBeenCalled();
    await adapter.close();
  });
});
