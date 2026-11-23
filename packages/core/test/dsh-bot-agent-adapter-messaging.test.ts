import { executeNativeTool, installNativeTools } from '../src/runtime/native-agent-compat.js';
import { Context } from '@deepseek-ai/cordis';
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { ToolRuntime, type ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { SendReviewRequired } from '../src/channels/send-review.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';
import { ASSIGNMENT, groupTools, reportRun } from './support/dsh-bot-agent-adapter.js';

it('registers speaker_policy without external messaging when Team policy is available', async () => {
  const policy = { humanId: 'bob', displayName: 'Bob', roles: [], resolved: [] };
  const speakerPolicy = vi.fn(() => policy);
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onTurn: async (_session, tools) => {
        const tool = tools.find((tool) => tool.name === 'speaker_policy');
        expect(tool).toBeDefined();
        const result = await tool!.execute({ humanId: 'bob', topic: 'money' }, {
          signal: new AbortController().signal,
        } as ToolRunContext);
        expect(JSON.parse(String(result))).toEqual(policy);
      },
    },
  );
  const adapter = createDshBotAgentAdapter({
    agents: host,
    orchestratorCwd: () => '/memory/ada',
    ensureWorkspace: () => {},
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
  });
  try {
    expect(adapter.directTools?.().map((tool) => tool.name)).toContain('speaker_policy');
    await adapter.runOrchestrator({ ...reportRun, speakerPolicy });
    expect(speakerPolicy).toHaveBeenCalledWith('bob', 'money');
  } finally {
    await adapter.close();
  }
});

describe('explicit Inbox completion with messaging tools', () => {
  async function fixture(
    check: (
      run: OrchestratorAgentRun,
      call: (args: Record<string, unknown>) => Promise<Record<string, unknown>>,
    ) => Promise<void>,
  ) {
    const adapter = createDshBotAgentAdapter({
      agents: new FakeAgentHost(),
      onAgentSetup: (ctx) => {
        Object.assign(ctx.tools, {
          execute: async (input: {
            name: string;
            arguments: unknown;
            callId: string;
            signal: AbortSignal;
          }) => {
            const tool = ctx.tools.get(input.name);
            if (!tool) throw new Error('Missing fixture tool');
            const native = new Context();
            const providers = native.plugin({
              name: 'direct-test-services',
              apply(c: Context) {
                c.provide('systemPrompt', {
                  tools: () => () => undefined,
                  section: () => () => undefined,
                  getSectionOrder: () => 1,
                });
              },
            });
            const runtime = native.plugin(ToolRuntime, {});
            try {
              await providers.await();
              await runtime.await();
              native.tools.register(tool);
              await native.inject(['tools'], (c) => installNativeTools(c)).await();
              return await executeNativeTool(native, {
                ...input,
                callId: ToolCallId(input.callId),
              });
            } finally {
              await runtime.dispose();
              await providers.dispose();
            }
          },
        });
      },
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    const run: OrchestratorAgentRun = {
      ...reportRun,
      channels: {
        ...reportRun.channels,
        list: () => ({
          channels: [
            {
              id: 'group',
              type: 'group',
              kind: 'group',
              humanMembers: [],
              name: 'Group',
              members: [{ botId: 'ada', displayName: 'Ada', active: true }],
            },
          ],
        }),
      },
      replyDestination: () => ({ kind: 'channel', channelId: 'group', messageId: 'request' }),
      triage: {
        current: () => [],
        list: () => ({ total: 0, snoozed: 0, groups: [] }),
        snooze: () => {
          throw new Error('unexpected snooze');
        },
        resolve: ({ ids }) => ({ outcome: 'resolved', resolved: ids ?? [], alreadyResolved: [] }),
      },
    };
    try {
      await check(run, async (args) =>
        JSON.parse(
          JSON.stringify(
            await adapter.runDirectTool!(
              run,
              args.action ? 'channel_action' : 'bot_send_message',
              args.action ? args : { source_event_id: 'request', ...args },
              new AbortController().signal,
            ),
          ),
        ),
      );
    } finally {
      await adapter.close();
    }
  }
  it('resolves explicitly selected work only after delivery commits', async () => {
    await fixture(async (run, call) => {
      const events: string[] = [];
      run.channels.send = async (input) => {
        events.push('commit');
        return {
          id: 'sent',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: input.body,
        };
      };
      run.triage!.resolve = ({ ids }) => {
        events.push('resolve');
        return { outcome: 'resolved', resolved: ids!, alreadyResolved: [] };
      };
      expect(await call({ body: 'Answer', resolve_inbox_ids: ['request'] })).toMatchObject({
        status: 'committed',
        messageId: 'sent',
        inboxResolution: { resolved: ['request'] },
      });
      expect(events).toEqual(['commit', 'resolve']);
    });
  });
  it('keeps Inbox work open when held or when sending fails', async () => {
    await fixture(async (run, call) => {
      const resolve = vi.spyOn(run.triage!, 'resolve');
      run.channels.send = async () => {
        throw new SendReviewRequired({
          status: 'held',
          channelId: 'group',
          draftId: 'draft',
          reason: 'changed',
        });
      };
      expect(await call({ body: 'Old', resolve_inbox_ids: ['request'] })).toMatchObject({
        status: 'held',
      });
      run.channels.send = async () => {
        throw new Error('refused');
      };
      await expect(call({ body: 'Old', resolve_inbox_ids: ['request'] })).rejects.toThrow(
        'refused',
      );
      expect(resolve).not.toHaveBeenCalled();
    });
  });
  it('reports a resolution failure separately from successful delivery', async () => {
    await fixture(async (run, call) => {
      run.triage!.resolve = () => {
        throw new Error('unobserved item');
      };
      expect(await call({ body: 'Answer', resolve_inbox_ids: ['request'] })).toMatchObject({
        status: 'committed',
        messageId: 'bot-1',
        inboxResolution: { outcome: 'failed', reason: 'inbox-resolution-failed' },
      });
    });
  });
  it('drop alone does not resolve; an explicit selection does, and refused drops never do', async () => {
    await fixture(async (run, call) => {
      const resolve = vi.spyOn(run.triage!, 'resolve');
      run.channels.dropDraft = (input) => ({
        status: 'dropped',
        channelId: input.channelId,
        draftId: input.draftId,
        reason: 'explicit-drop',
      });
      const args = { body: '', channel_id: 'group', draft_id: 'draft', action: 'drop' };
      await call(args);
      expect(resolve).not.toHaveBeenCalled();
      expect(await call({ ...args, resolve_inbox_ids: ['request'] })).toMatchObject({
        status: 'dropped',
        inboxResolution: { resolved: ['request'] },
      });
      run.channels.dropDraft = (input) => ({
        status: 'refused',
        channelId: input.channelId,
        draftId: input.draftId,
        reason: 'unavailable',
      });
      await call({ ...args, resolve_inbox_ids: ['request'] });
      expect(resolve).toHaveBeenCalledTimes(1);
    });
  });
  it('keeps the exhausted draft source open while resolving selected completed background work', async () => {
    await fixture(async (run, call) => {
      const resolve = vi.spyOn(run.triage!, 'resolve');
      run.channels.dropDraft = (input) => ({
        status: 'dropped',
        channelId: input.channelId,
        draftId: input.draftId,
        reason: 'explicit-drop-does-not-resolve-inbox',
        budget: { used: 2, limit: 2, exhausted: true },
        keepOpenInboxIds: ['request-source', 'request-message'],
      });
      const args = { body: '', channel_id: 'group', draft_id: 'draft', action: 'drop' };
      const continuation = {
        reason: 'exhausted-drop-keeps-original-work-open',
        instruction: expect.stringContaining('Use inbox_snooze'),
      };
      expect(await call(args)).toMatchObject({
        inboxResolution: { outcome: 'not-requested', ...continuation },
      });
      expect(resolve).not.toHaveBeenCalled();
      expect(await call({ ...args, resolve_inbox_ids: ['fyi'] })).toMatchObject({
        inboxResolution: { resolved: ['fyi'], ...continuation },
      });
      resolve.mockClear();
      expect(
        await call({ ...args, resolve_inbox_ids: ['request-source', 'request-message', 'fyi'] }),
      ).toMatchObject({
        status: 'dropped',
        inboxResolution: {
          resolved: ['fyi'],
          keptOpen: ['request-source', 'request-message'],
          reason: 'exhausted-drop-keeps-original-work-open',
        },
      });
      expect(resolve).toHaveBeenCalledWith({ ids: ['fyi'], outcome: 'done' });
      resolve.mockClear();
      expect(await call({ ...args, resolve_inbox_ids: ['request-message'] })).toMatchObject({
        inboxResolution: { outcome: 'kept-open', keptOpen: ['request-message'] },
      });
      expect(resolve).not.toHaveBeenCalled();
      run.channels.dropDraft = (input) => ({
        status: 'dropped',
        channelId: input.channelId,
        draftId: input.draftId,
        reason: 'explicit-peer-yield',
        budget: { used: 2, limit: 2, exhausted: true },
        yieldedToMessageIds: ['peer-answer'],
      });
      expect(await call({ ...args, resolve_inbox_ids: ['request-message'] })).toMatchObject({
        inboxResolution: { resolved: ['request-message'] },
      });
    });
  });
  it('reports omitted completion without resolving work or hiding committed delivery', async () => {
    await fixture(async (run, call) => {
      const resolve = vi.spyOn(run.triage!, 'resolve');
      expect(await call({ body: 'Answer' })).toMatchObject({
        status: 'committed',
        messageId: 'bot-1',
        inboxResolution: { outcome: 'not-requested' },
      });
      expect(resolve).not.toHaveBeenCalled();
    });
  });
  it('requires an explicit Channel for drop and preserves refusal checks', async () => {
    await fixture(async (run, call) => {
      const drop = vi.fn((input: { channelId: string; draftId: string }) => ({
        status: 'refused' as const,
        channelId: input.channelId,
        draftId: input.draftId,
        reason: 'draft-channel-mismatch' as const,
      }));
      run.channels.dropDraft = drop;
      const resolve = vi.spyOn(run.triage!, 'resolve');
      const args = { body: '', draft_id: 'draft', action: 'drop', resolve_inbox_ids: ['request'] };
      await expect(call(args)).rejects.toThrow('channel_id');
      await call({ ...args, channel_id: 'explicit-group' });
      expect(drop).toHaveBeenLastCalledWith({ channelId: 'explicit-group', draftId: 'draft' });
      run.inboundChannelId = undefined;
      await expect(call(args)).rejects.toThrow('channel_id');
      expect(drop).toHaveBeenCalledTimes(1);
      expect(resolve).not.toHaveBeenCalled();
    });
  });
  it('rejects malformed completion IDs before delivery', async () => {
    await fixture(async (run, call) => {
      const send = vi.spyOn(run.channels, 'send');
      for (const ids of [['other'], ['request', 'other']])
        await expect(call({ body: 'Answer', resolve_inbox_ids: ids })).rejects.toThrow(
          'explicitly referenced reply source',
        );
      expect(send).not.toHaveBeenCalled();
    });
  });
  it('treats an empty completion list as no resolution request (#3296)', async () => {
    await fixture(async (_run, call) => {
      expect(await call({ body: 'Answer', resolve_inbox_ids: [] })).toMatchObject({
        status: 'committed',
        inboxResolution: { outcome: 'not-requested' },
      });
    });
  });
  it('rejects yielding without a drop or observed handle before any side effect', async () => {
    await fixture(async (run, call) => {
      const send = vi.spyOn(run.channels, 'send');
      run.channels.dropDraft = () => {
        throw new Error('unexpected drop');
      };
      const resolve = vi.spyOn(run.triage!, 'resolve');
      for (const args of [
        {
          action: 'inspect',
          channel_id: 'group',
          yield_to_message_ids: ['peer'],
          observation_id: 'seen',
        },
        { body: '', action: 'drop', draft_id: 'draft', yield_to_message_ids: ['peer'] },
        {
          body: '',
          action: 'drop',
          draft_id: 'draft',
          observation_id: 'seen',
          yield_to_message_ids: [],
        },
      ])
        await expect(call({ channel_id: 'group', ...args })).rejects.toThrow(/yield|inspection/);
      expect(send).not.toHaveBeenCalled();
      expect(resolve).not.toHaveBeenCalled();
    });
  });
});

describe('DSH Bot Agent adapter', () => {
  it('rechecks source authority for native tools on the current Orchestrator turn', async () => {
    const denials: Array<string | undefined> = [];
    let invalid = false;
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
          const guards = host.scopes.get('orchestrator-ada')!.guards;
          denials.push(guards.map((guard) => guard({ name: 'shell' })).find(Boolean));
          invalid = true;
          denials.push(guards.map((guard) => guard({ name: 'shell' })).find(Boolean));
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
      await expect(
        adapter.runOrchestrator({
          sessionId: 'orchestrator-ada',
          resume: false,
          requireContent: () => {
            if (invalid) throw new Error('Source Event content was purged');
          },
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
        }),
      ).rejects.toThrow('Source Event content was purged');
      expect(denials).toEqual([
        undefined,
        'Source Event content was purged or its authority is unavailable',
      ]);
    } finally {
      await adapter.close();
    }
  });

  it('dispatches Group attention Tools only during the owning Orchestrator run', async () => {
    const calls: Array<Promise<unknown>> = [];
    const writes: unknown[] = [];
    const assignmentRequests: unknown[] = [];
    const rejectedSourceCalls: Array<Promise<{ ok: boolean; error?: string }>> = [];
    const current = {
      mode: 'digest' as const,
      count: 5,
      intervalSeconds: 30,
      revision: 0,
      lastActor: null,
      changedAt: null,
    };
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onAgentCreated: () => {
          const tools = host.scopes.get('orchestrator-ada')?.tools ?? [];
          const read = tools.find((tool) => tool.name === 'group_attention_get');
          const write = tools.find((tool) => tool.name === 'group_attention_set');
          if (read === undefined || write === undefined)
            throw new Error('Group Tools not registered');
          calls.push(read.execute({ channel_id: 'group-team' }, {} as ToolRunContext));
          calls.push(
            write.execute({ channel_id: 'group-team', mode: 'mentions' }, {} as ToolRunContext),
          );
          const sourceGet = tools.find((tool) => tool.name === 'source_attention_get');
          const sourceSet = tools.find((tool) => tool.name === 'source_attention_set');
          const sourceReset = tools.find((tool) => tool.name === 'source_attention_reset');
          if (!sourceGet || !sourceSet || !sourceReset)
            throw new Error('Source attention Tools not registered');
          calls.push(sourceGet.execute({}, {} as ToolRunContext));
          calls.push(sourceSet.execute({ wake: 'immediate' }, {} as ToolRunContext));
          calls.push(sourceReset.execute({}, {} as ToolRunContext));
          calls.push(
            sourceSet.execute(
              {
                sourceClass: 'group-ordinary',
                wake: 'digest',
                digestCount: 7,
                digestIntervalSeconds: 45,
              },
              {} as ToolRunContext,
            ),
          );
          calls.push(sourceReset.execute({ sourceClass: 'group-ordinary' }, {} as ToolRunContext));
          const sendAssignment = tools.find((tool) => tool.name === 'send_assignment_request');
          if (sendAssignment === undefined)
            throw new Error('Assignment request Tool not registered');
          calls.push(
            sendAssignment.execute(
              {
                session_id: 'assignment-1',
                text: 'Continue',
                provider: 'deepseek',
                model: 'pro',
                reasoning_effort: 'off',
              },
              {} as ToolRunContext,
            ),
          );
          rejectedSourceCalls.push(
            sendAssignment
              .execute(
                {
                  session_id: 'assignment-1',
                  text: 'Reject',
                  provider: 'deepseek',
                },
                {} as ToolRunContext,
              )
              .then(
                () => ({ ok: true }),
                (error) => ({ ok: false, error: String(error) }),
              ),
          );
          for (const call of [
            sourceSet.execute({ sourceClass: 'human-dm', wake: 'immediate' }, {} as ToolRunContext),
            sourceReset.execute({ sourceClass: 'group-invite' }, {} as ToolRunContext),
          ])
            rejectedSourceCalls.push(
              call.then(
                () => ({ ok: true }),
                (error) => ({ ok: false, error: String(error) }),
              ),
            );
        },
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    await adapter.runOrchestrator({
      sessionId: 'orchestrator-ada',
      resume: false,
      bot: BOT,
      message: 'Change my Group attention to mentions',
      inboundChannelId: 'dm-test',
      inbox: '',
      sourcePolicy: {
        setImmediateDelivery: (sourceClass, delivery) => ({
          sourceClass,
          delivery,
          admission: 'admit',
          wake: 'immediate',
          revision: 2,
          lastActor: { kind: 'bot', botSlug: 'ada' },
          changedAt: BOT.createdAt,
          overrideActive: true,
          recentWakeCount: 0,
        }),
        resetImmediateDelivery: (sourceClass) => ({
          sourceClass,
          delivery: 'steer',
          admission: 'admit',
          wake: 'immediate',
          revision: 3,
          lastActor: { kind: 'bot', botSlug: 'ada' },
          changedAt: BOT.createdAt,
          overrideActive: false,
          recentWakeCount: 0,
        }),
        list: () => [],
        setAssignmentReport: (wake) => ({
          sourceClass: 'assignment-report',
          admission: 'admit',
          wake,
          delivery: 'steer',
          revision: 2,
          lastActor: { kind: 'bot', botSlug: 'ada' },
          changedAt: BOT.createdAt,
          overrideActive: true,
          recentWakeCount: 0,
        }),
        resetAssignmentReport: () => ({
          sourceClass: 'assignment-report',
          admission: 'admit',
          wake: 'conditional',
          delivery: 'steer',
          revision: 3,
          lastActor: { kind: 'bot', botSlug: 'ada' },
          changedAt: BOT.createdAt,
          overrideActive: false,
          recentWakeCount: 0,
        }),
        setGroupOrdinary: (wake, digestCount, digestIntervalSeconds) => ({
          sourceClass: 'group-ordinary',
          admission: 'admit',
          wake,
          digestCount,
          digestIntervalSeconds,
          delivery: 'steer',
          revision: 2,
          lastActor: { kind: 'bot', botSlug: 'ada' },
          changedAt: BOT.createdAt,
          overrideActive: true,
          recentWakeCount: 0,
        }),
        resetGroupOrdinary: () => ({
          sourceClass: 'group-ordinary',
          admission: 'admit',
          wake: 'digest',
          digestCount: 5,
          digestIntervalSeconds: 30,
          delivery: 'steer',
          revision: 3,
          lastActor: { kind: 'bot', botSlug: 'ada' },
          changedAt: BOT.createdAt,
          overrideActive: false,
          recentWakeCount: 0,
        }),
      },
      channels: {
        ...groupTools,
        readGroupWakePolicy: () => current,
        setGroupWakePolicy: (input) => {
          writes.push(input);
          return {
            ...current,
            mode: input.mode,
            revision: 1,
            lastActor: { kind: 'bot', botSlug: 'ada' },
          };
        },
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
        create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
        grants: () => [],
        list: () => [],
        inspect: () => undefined,
        stop: async () => ASSIGNMENT,
        request: (input) => {
          assignmentRequests.push(input);
          return {
            assignment: {
              ...ASSIGNMENT,
              ...(input.model === undefined ? {} : { modelRoute: input.model }),
            },
            delivery: 'followup',
          };
        },
      },
    });
    expect((await Promise.all(calls)).map((value) => JSON.parse(String(value)))).toMatchObject([
      { channelId: 'group-team', mode: 'digest', revision: 0 },
      { channelId: 'group-team', mode: 'mentions', revision: 1 },
      { policies: [] },
      { sourceClass: 'assignment-report', wake: 'immediate', revision: 2 },
      { sourceClass: 'assignment-report', wake: 'conditional', revision: 3 },
      {
        sourceClass: 'group-ordinary',
        wake: 'digest',
        digestCount: 7,
        digestIntervalSeconds: 45,
        revision: 2,
      },
      { sourceClass: 'group-ordinary', wake: 'digest', revision: 3 },
      {
        sessionId: 'assignment-1',
        modelRoute: { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' },
      },
    ]);
    expect(writes).toEqual([
      {
        channelId: 'group-team',
        mode: 'mentions',
        count: 5,
        intervalSeconds: 30,
      },
    ]);
    expect(await Promise.all(rejectedSourceCalls)).toEqual([
      {
        ok: false,
        error: expect.stringContaining('provider and model must be specified together'),
      },
      { ok: false, error: expect.stringContaining('Direct sources require delivery') },
      { ok: false, error: expect.stringContaining('must be one of') },
    ]);
    expect(assignmentRequests).toEqual([
      {
        sessionId: 'assignment-1',
        mode: 'next-turn',
        text: 'Continue',
        model: { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' },
      },
    ]);
    const write = host.scopes
      .get('orchestrator-ada')
      ?.tools.find((tool) => tool.name === 'group_attention_set');
    await expect(
      write?.execute({ channel_id: 'group-team', mode: 'all' }, {} as ToolRunContext),
    ).rejects.toThrow('Orchestrator run is unavailable');
    await adapter.close();
  });

  it('checks draft Channel access without reading messages and caches only for the current run', async () => {
    const host = new FakeAgentHost();
    const probes: string[] = [];
    const drafts: string[] = [];
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
      publishDraft: (event) => {
        if (event.type === 'update') drafts.push(event.draft.body);
      },
    });
    const run = (resume: boolean) =>
      adapter.runOrchestrator({
        sessionId: 'orchestrator-ada',
        resume,
        bot: BOT,
        inboundChannelId: 'dm-test',
        inbox: '',
        message: '请核对发布状态',
        channels: {
          ...groupTools,
          list: ({ channelId }: { channelId?: string } = {}) => {
            const id = channelId ?? 'dm-test';
            probes.push(id);
            return {
              channels:
                id === 'outside'
                  ? []
                  : [
                      {
                        id,
                        name: 'test',
                        type: 'dm' as const,
                        kind: 'human-dm' as const,
                        members: [],
                        humanMembers: [],
                      },
                    ],
            };
          },
          contacts: async () => ({ outputLimit: 12_000, contacts: [] }),
          sendToBot: async () => {
            throw new Error('unexpected Bot DM');
          },
          ignore: () => ({
            sourceEventId: 'source-1',
            ignoredAt: BOT.createdAt,
            alreadyIgnored: false,
          }),
          read: () => {
            throw new Error('draft access must not read Channel messages');
          },
          requestGrant: async (reason) => ({
            id: 'grant-request-1',
            at: BOT.createdAt,
            author: { kind: 'bot', slug: BOT.slug },
            body: reason,
            grantRequest: true,
          }),
          send: async (input) => ({
            id: 'bot-1',
            at: BOT.createdAt,
            author: { kind: 'bot' as const, slug: BOT.slug },
            body: input.body,
          }),
        },
        assignments: {
          create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
          grants: () => [],
          list: () => [],
          inspect: () => undefined,
          stop: async () => ({
            sessionId: 'test',
            title: 'test',
            description: 'test',
            activity: 'stopped',
            createdAt: '',
            updatedAt: '',
          }),
          request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
        },
      });
    let frameIndex = 0;
    const callIndexes = new Map<string, number>();
    const stream = (callId: string, argumentsDelta: string) => {
      if (!callIndexes.has(callId)) callIndexes.set(callId, callIndexes.size);
      adapter.acceptAssistantStream('orchestrator-ada', {
        type: 'chunk',
        attemptId: 'attempt-1',
        revision: 1,
        index: frameIndex++,
        time: 1,
        chunk: {
          type: 'tool-call-delta',
          index: callIndexes.get(callId),
          id: callId,
          name: 'bot_send_message',
          argumentsDelta,
        },
      } as AssistantStreamFrame);
    };

    const first = run(false);
    stream('allowed', '{"channel_id":"dm-test","body":"a');
    stream('allowed', 'b');
    stream('allowed', 'c"}');
    stream('denied-1', '{"body":"private","channel_id":"outside"}');
    stream('denied-2', '{"body":"private","channel_id":"outside"}');
    await first;
    expect(probes).toEqual(['dm-test', 'outside']);
    expect(drafts).toEqual(['a', 'ab', 'abc']);

    const second = run(true);
    frameIndex = 0;
    callIndexes.clear();
    stream('next', '{"channel_id":"dm-test","body":"next"}');
    await second;
    expect(probes).toEqual(['dm-test', 'outside', 'dm-test']);
    expect(drafts.at(-1)).toBe('next');
    await adapter.close();
  });
});
