import { type ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';
import { ASSIGNMENT, groupTools } from './support/dsh-bot-agent-adapter.js';

describe('Assignment Directory Tools', () => {
  it('forward list filters and archive decisions to the Orchestrator run', async () => {
    const calls: Array<Promise<unknown>> = [];
    const queries: unknown[] = [];
    const archived: string[] = [];
    const created: unknown[] = [];
    const refusals: Array<Promise<unknown>> = [];
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onAgentCreated: () => {
          const scope = host.scopes.get('orchestrator-ada');
          const tool = (name: string) => {
            const found = scope?.tools.find((candidate) => candidate.name === name);
            if (found === undefined) throw new Error(`${name} not registered`);
            return found;
          };
          calls.push(
            tool('list_assignments').execute(
              {
                query: 'release',
                activity: ['idle'],
                include_archived: true,
                limit: 5,
                cursor: 'c1',
              },
              {} as ToolRunContext,
            ),
          );
          calls.push(
            tool('archive_assignment').execute({ session_id: 'a-1' }, {} as ToolRunContext),
          );
          calls.push(
            tool('archive_assignment').execute({ session_id: 'busy' }, {} as ToolRunContext),
          );
          calls.push(
            tool('unarchive_assignment').execute({ session_id: 'a-1' }, {} as ToolRunContext),
          );
          calls.push(
            tool('create_assignment').execute(
              {
                title: 'Check release notes',
                description: 'Compare the draft release notes with merged PRs.',
                instructions: 'Read CHANGELOG.md first.',
                grant_id: 'grant-1',
              },
              {} as ToolRunContext,
            ),
          );
          refusals.push(
            tool('create_assignment').execute(
              { description: 'No title given.', grant_id: 'grant-1' },
              {} as ToolRunContext,
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
      message: 'Tidy up finished work',
      inboundChannelId: 'dm-test',
      inbox: '',
      channels: {
        ...groupTools,
        contacts: async () => ({ outputLimit: 12_000, contacts: [] }),
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        ignore: () => {
          throw new Error('unexpected ignore');
        },
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
        create: (input) => {
          created.push(input);
          return { outcome: 'created', assignment: ASSIGNMENT };
        },
        grants: () => [],
        list: () => [],
        query: (input) => {
          queries.push(input);
          return { assignments: [ASSIGNMENT], nextCursor: 'c2' };
        },
        archive: async (sessionId) => {
          if (sessionId === 'busy')
            return {
              outcome: 'refused',
              code: 'assignment-active',
              assignment: { ...ASSIGNMENT, sessionId, activity: 'working' },
              message: 'still active',
            };
          archived.push(sessionId);
          return {
            outcome: 'archived',
            assignment: { ...ASSIGNMENT, sessionId, archivedAt: BOT.createdAt },
          };
        },
        unarchive: async (sessionId) => ({
          outcome: 'unarchived',
          assignment: { ...ASSIGNMENT, sessionId },
        }),
        inspect: () => undefined,
        stop: async () => ASSIGNMENT,
        request: () => {
          throw new Error('unexpected Assignment request');
        },
      },
    });
    try {
      const results = (await Promise.all(calls)).map((value) => JSON.parse(String(value)));
      expect(queries).toEqual([
        { query: 'release', activity: ['idle'], includeArchived: true, limit: 5, cursor: 'c1' },
      ]);
      expect(results).toMatchObject([
        { assignments: [{ sessionId: ASSIGNMENT.sessionId }], nextCursor: 'c2' },
        { outcome: 'archived', sessionId: 'a-1', archivedAt: BOT.createdAt },
        { outcome: 'refused', code: 'assignment-active', sessionId: 'busy', activity: 'working' },
        { outcome: 'unarchived', sessionId: 'a-1' },
        {
          outcome: 'created',
          sessionId: ASSIGNMENT.sessionId,
          title: ASSIGNMENT.title,
          description: ASSIGNMENT.description,
        },
      ]);
      expect(archived).toEqual(['a-1']);
      expect(created).toContainEqual({
        title: 'Check release notes',
        description: 'Compare the draft release notes with merged PRs.',
        instructions: 'Read CHANGELOG.md first.',
        grantId: 'grant-1',
      });
      await expect(refusals[0]).rejects.toThrow(/missing required property "title"/);
    } finally {
      await adapter.close();
    }
  });

  it('lets the Orchestrator pick an allowed mode for a new Assignment', async () => {
    let modesFail = false;
    let narrowed = false;
    let modeParameter: unknown;
    const calls: Array<Promise<unknown>> = [];
    const created: Array<{ title: string; mode?: string }> = [];
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onAgentCreated: () => {
          const scope = host.scopes.get('orchestrator-ada');
          const tool = (name: string) => {
            const found = scope?.tools.find((candidate) => candidate.name === name);
            if (found === undefined) throw new Error(`${name} not registered`);
            return found;
          };
          const create = (mode: string) =>
            tool('create_assignment').execute(
              {
                title: 'Port the parser',
                description: 'Port the parser to the new API.',
                grant_id: 'grant-1',
                mode,
              },
              {} as ToolRunContext,
            );
          modeParameter = Reflect.get(
            Reflect.get(tool('create_assignment').parameters, 'properties') as object,
            'mode',
          );
          calls.push(tool('list_assignment_models').execute({}, {} as ToolRunContext));
          calls.push(create('ptc'));
          calls.push(create('acp').then(String, (error: Error) => error.message));
          const settled = Promise.allSettled([...calls]);
          calls.push(
            settled.then(() => {
              narrowed = true;
              return create('ptc').then(String, (error: Error) => error.message);
            }),
          );
          calls.push(
            Promise.allSettled([...calls]).then(() => {
              modesFail = true;
              return tool('list_assignment_models').execute({}, {} as ToolRunContext);
            }),
          );
        },
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: {
        currentSelection: () => ({ provider: 'test', model: 'test' }),
      },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
      assignmentModes: async () => {
        if (modesFail) throw new Error('roster unavailable');
        return {
          default: 'deepseekbot',
          restricted: true,
          allowed: narrowed
            ? [{ id: 'deepseekbot' }]
            : [{ id: 'deepseekbot' }, { id: 'ptc', name: 'PTC' }],
        };
      },
    });
    await adapter.runOrchestrator({
      sessionId: 'orchestrator-ada',
      resume: false,
      bot: BOT,
      message: 'Port the parser',
      inboundChannelId: 'dm-test',
      inbox: '',
      channels: {
        ...groupTools,
        contacts: async () => ({ outputLimit: 12_000, contacts: [] }),
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        ignore: () => {
          throw new Error('unexpected ignore');
        },
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
        create: (input) => {
          created.push(input);
          return {
            outcome: 'created',
            assignment: {
              ...ASSIGNMENT,
              ...(input.mode === undefined ? {} : { agentPreset: input.mode }),
            },
          };
        },
        grants: () => [],
        list: () => [],
        inspect: () => undefined,
        stop: async () => ASSIGNMENT,
        request: () => {
          throw new Error('unexpected Assignment request');
        },
      },
    });
    try {
      const [models, accepted, refused, narrowedRefusal, withoutModes] = await Promise.all(calls);
      expect(modeParameter).toMatchObject({ type: 'string', enum: ['deepseekbot', 'ptc'] });
      expect(Reflect.get(modeParameter as object, 'description')).toContain(
        'omitted uses this Bot’s mode (deepseekbot)',
      );
      expect(Reflect.get(modeParameter as object, 'description')).toContain('- ptc: PTC');
      expect(JSON.parse(String(models))).toMatchObject({
        assignmentModes: {
          default: 'deepseekbot',
          allowed: [{ id: 'deepseekbot' }, { id: 'ptc', name: 'PTC' }],
        },
      });
      expect(JSON.parse(String(accepted))).toMatchObject({
        outcome: 'created',
        mode: 'ptc',
      });
      expect(refused).toContain('"mode" must be one of ["deepseekbot","ptc"]');
      expect(narrowedRefusal).toContain('mode ptc is not allowed; choose one of deepseekbot');
      const fallback = JSON.parse(String(withoutModes)) as Record<string, unknown>;
      expect(fallback['assignmentModes']).toBeUndefined();
      expect(String(fallback['assignmentModesError'])).toContain('roster unavailable');
      expect(created).toContainEqual({
        title: 'Port the parser',
        description: 'Port the parser to the new API.',
        grantId: 'grant-1',
        mode: 'ptc',
      });
      expect(created.filter((input) => input.title === 'Port the parser')).toEqual([
        expect.objectContaining({ mode: 'ptc' }),
      ]);
    } finally {
      await adapter.close();
    }
  });

  it('waits for the installed modes before it picks a new Session mode', async () => {
    const host = new FakeAgentHost();
    let current = 'stale-default';
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: {
        currentSelection: () => ({ provider: 'test', model: 'test' }),
      },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
      botModeOf: () => current,
      ensureBotModes: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        current = 'deepseekbot';
      },
    });
    try {
      await adapter.runAssignment({
        sessionId: 'assignment-fresh',
        bot: BOT,
        text: 'Port the parser',
        permission: {
          grantId: 'grant-1',
          workspaceId: 'workspace-1',
          primaryCwd: '/project',
          mode: 'workspace-write',
          approval: 'ask',
          presetRevision: 0,
        },
        report: vi.fn(),
      });
      expect(host.createOptions.at(-1)?.meta).toMatchObject({ agentPreset: 'deepseekbot' });
    } finally {
      await adapter.close();
    }
  });

  it('frees the Session for the next turn when the mode roster read never answers', async () => {
    const host = new FakeAgentHost();
    let hang = true;
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: {
        currentSelection: () => ({ provider: 'test', model: 'test' }),
      },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
      preparationTimeoutMs: 20,
      ensureBotModes: () => (hang ? new Promise<void>(() => undefined) : Promise.resolve()),
    });
    const run = {
      sessionId: 'assignment-hung-roster',
      bot: BOT,
      text: 'Port the parser',
      permission: {
        grantId: 'grant-1',
        workspaceId: 'workspace-1',
        primaryCwd: '/project',
        mode: 'workspace-write' as const,
        approval: 'ask' as const,
        presetRevision: 0,
      },
      report: vi.fn(),
    };
    try {
      await expect(adapter.runAssignment(run)).rejects.toThrow('took longer than');
      hang = false;
      await adapter.runAssignment(run);
      expect(host.createOptions.at(-1)?.sessionId).toBe('assignment-hung-roster');
    } finally {
      await adapter.close();
    }
  });

  it('starts an Assignment in its chosen mode and resumes it in the mode its log records', async () => {
    const host = new FakeAgentHost();
    const mounted: Array<string | undefined> = [];
    let recorded: string | null = null;
    let current = 'deepseekbot';
    const sessionModes: Array<[string, string]> = [];
    const adapterFor = () =>
      createDshBotAgentAdapter({
        agents: host,
        defaultModel: {
          currentSelection: () => ({ provider: 'test', model: 'test' }),
        },
        orchestratorCwd: () => '/memory/ada',
        ensureWorkspace: () => undefined,
        botModeOf: () => current,
        recordSessionMode: (sessionId, mode) => sessionModes.push([sessionId, mode]),
        resolveAgentPresets: () => ({
          mount: async (_agentCtx, id) => {
            mounted.push(id);
            return undefined;
          },
          presetForSession: () => recorded,
        }),
      });
    const permission = {
      grantId: 'grant-1',
      workspaceId: 'workspace-1',
      primaryCwd: '/project',
      mode: 'workspace-write' as const,
      approval: 'ask' as const,
      presetRevision: 0,
    };
    const first = adapterFor();
    try {
      await first.runAssignment({
        sessionId: 'assignment-ptc',
        bot: BOT,
        text: 'Port the parser',
        agentPreset: 'ptc',
        permission,
        report: vi.fn(),
      });
      expect(host.createOptions.at(-1)?.meta).toMatchObject({ agentPreset: 'ptc' });
    } finally {
      await first.close();
    }
    recorded = 'ptc';
    current = 'standard';
    const second = adapterFor();
    try {
      await second.runAssignment({
        sessionId: 'assignment-ptc',
        bot: BOT,
        text: 'Continue',
        resume: true,
        permission,
        report: vi.fn(),
      });
      expect(host.resumeOptions.map((options) => String(options.resumeSessionId))).toEqual([
        'assignment-ptc',
      ]);
      expect(sessionModes).toEqual([
        ['assignment-ptc', 'ptc'],
        ['assignment-ptc', 'ptc'],
      ]);
      expect(mounted).toEqual(['ptc', 'ptc']);
    } finally {
      await second.close();
    }
  });

  it('unarchives and sends an optional message through the Assignment Request path', async () => {
    const calls: Array<Promise<unknown>> = [];
    const unarchived: string[] = [];
    const requests: unknown[] = [];
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onAgentCreated: () => {
          const tool = host.scopes
            .get('orchestrator-ada')
            ?.tools.find((candidate) => candidate.name === 'unarchive_assignment');
          if (tool === undefined) throw new Error('unarchive_assignment not registered');
          const run = (args: Record<string, unknown>) =>
            calls.push(
              Promise.resolve(tool.execute(args as never, {} as ToolRunContext)).then(
                (value) => JSON.parse(String(value)),
                (error: unknown) => String(error),
              ),
            );
          run({ session_id: 'quiet' });
          run({ session_id: 'resume', message: 'The Human wants this after all; continue' });
          run({ session_id: 'steer', message: 'Wrap up', mode: 'next-step' });
          run({ session_id: 'stopped', message: 'Continue' });
          run({ session_id: 'full', message: 'Continue' });
          run({ session_id: 'bad-mode', message: 'Continue', mode: 'later' });
          run({ session_id: 'blank', message: '  ' });
          run({ session_id: 'mode-only', mode: 'next-step' });
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
      message: 'Continue the stopped work',
      inboundChannelId: 'dm-test',
      inbox: '',
      channels: {
        ...groupTools,
        contacts: async () => ({ outputLimit: 12_000, contacts: [] }),
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        ignore: () => {
          throw new Error('unexpected ignore');
        },
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
        archive: async () => {
          throw new Error('unexpected archive');
        },
        unarchive: async (sessionId) => {
          unarchived.push(sessionId);
          return {
            outcome: 'unarchived',
            assignment: { ...ASSIGNMENT, sessionId, activity: 'idle' },
          };
        },
        inspect: (sessionId) => ({
          ...ASSIGNMENT,
          sessionId,
          activity: 'stopped',
          botSlug: BOT.slug,
          sourceEventId: 'source-1',
        }),
        stop: async () => ASSIGNMENT,
        request: (input) => {
          requests.push(input);
          if (input.sessionId === 'stopped')
            throw new Error(`Assignment Session stopped was stopped by the Human`);
          if (input.sessionId === 'full')
            return {
              outcome: 'capacity',
              code: 'assignment-capacity',
              activeCount: 4,
              limit: 4,
              retryable: true,
              message: 'At capacity',
              assignment: { ...ASSIGNMENT, sessionId: input.sessionId, activity: 'idle' },
              delivery: 'capacity',
            };
          return {
            assignment: { ...ASSIGNMENT, sessionId: input.sessionId },
            delivery: input.mode === 'next-step' ? 'steer' : 'followup',
          };
        },
      },
    });
    try {
      const values = await Promise.all(calls);
      expect(values.slice(0, 5)).toEqual([
        { outcome: 'unarchived', sessionId: 'quiet', activity: 'idle' },
        {
          outcome: 'unarchived',
          sessionId: 'resume',
          activity: 'working',
          delivery: 'followup',
          acceptance: 'pending',
        },
        {
          outcome: 'unarchived',
          sessionId: 'steer',
          activity: 'working',
          delivery: 'steer',
          acceptance: 'accepted',
        },
        {
          outcome: 'unarchived',
          sessionId: 'stopped',
          activity: 'stopped',
          delivery: 'refused',
          code: 'request-not-delivered',
          message:
            'Assignment Session stopped is active, but the request was not delivered: Assignment Session stopped was stopped by the Human',
        },
        {
          outcome: 'unarchived',
          sessionId: 'full',
          activity: 'idle',
          delivery: 'refused',
          code: 'request-not-delivered',
          requestCode: 'assignment-capacity',
          activeCount: 4,
          limit: 4,
          retryable: true,
          message:
            'Assignment Session full is active, but the request was not delivered: At capacity',
        },
      ]);
      expect(values.slice(5)).toEqual([
        expect.stringContaining('unarchive_assignment: mode must be next-turn or next-step'),
        expect.stringContaining('unarchive_assignment: message must not be blank'),
        expect.stringContaining('unarchive_assignment: mode requires message'),
      ]);
      expect(unarchived).toEqual(['quiet', 'resume', 'steer', 'stopped', 'full']);
      expect(requests).toEqual([
        {
          sessionId: 'resume',
          mode: 'next-turn',
          text: 'The Human wants this after all; continue',
        },
        { sessionId: 'steer', mode: 'next-step', text: 'Wrap up' },
        { sessionId: 'stopped', mode: 'next-turn', text: 'Continue' },
        { sessionId: 'full', mode: 'next-turn', text: 'Continue' },
      ]);
    } finally {
      await adapter.close();
    }
  });
});
