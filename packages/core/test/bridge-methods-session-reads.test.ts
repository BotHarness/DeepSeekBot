import { EngineHost } from '../src/engines/engine-host.js';
import { engineRouteFetch } from '../src/engines/engine-route.js';
import { createEngineSelectionBridge } from '../src/engines/engine-selection-bridge.js';
import { createEngineGateway } from '../src/engines/engine-gateway.js';
import { createEngineStore, engineStorePath } from '../src/engines/engine-store.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createTestRosterStore } from './roster-fixture.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createUsageProjection, type UsageProjection } from '../src/usage/usage.js';
import { type BotRuntime } from '../src/runtime/bot-runtime.js';
import { createTestOwnership } from './helpers.js';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { roots, modelOwners, setup } from './support/bridge-methods.js';

afterEach(() => {
  for (const owner of modelOwners.splice(0)) owner.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bridge methods', () => {
  it('bounds read-only Session usage to the current DM Bot and rejects Group and missing scopes', async () => {
    const ownership = createTestOwnership({
      first: { botSlug: 'ada', rootRole: 'orchestrator' },
      assignment: { botSlug: 'ada', rootRole: 'assignment' },
      other: { botSlug: 'outsider', rootRole: 'orchestrator' },
    });
    ownership.claim({
      sessionId: 'latest',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: '2026-10-12T00:00:00.000Z',
    });
    const usageHome = mkdtempSync(join(tmpdir(), 'botharness-session-usage-'));
    roots.push(usageHome);
    const owner = mountOperationalDatabase({
      dshHome: usageHome,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    modelOwners.push(owner);
    const usage = createUsageProjection({ ownership, database: owner });
    const read = vi.fn(async () => ({ events: [], inheritedEventCount: 0 }));
    const { registry, channels, methods } = setup(
      [],
      ['ada'],
      undefined,
      ownership,
      undefined,
      undefined,
      undefined,
      usage,
      undefined,
      read,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const result = await methods.profileSessionUsage({
      channelId: dm.id,
      slug: 'outsider',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected scoped usage');
    expect(result.value.slug).toBe('ada');
    expect(result.value.weeks).toBe(26);
    expect(result.value.rows.map((row) => row.sessionId)).toEqual(['latest', 'assignment']);
    expect(read.mock.calls).toHaveLength(2);
    const group = channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Group', members: ['ada'] });
    expect((await methods.profileSessionUsage({ channelId: group.id })).ok).toBe(false);
    expect((await methods.profileSessionUsage({ channelId: 'missing' })).ok).toBe(false);
    expect((await methods.profileSessionUsage({})).ok).toBe(false);
    expect(read.mock.calls).toHaveLength(2);
  });

  it("traces a Bot's recent tool calls from its own Session log only", async () => {
    const ownership = createTestOwnership({
      'session-ada': { botSlug: 'ada', rootRole: 'orchestrator' },
      'session-other': { botSlug: 'outsider', rootRole: 'orchestrator' },
    });
    const read = vi.fn(async () => ({
      events: [
        { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } },
        {
          type: 'tool/call',
          seq: 2,
          time: 2,
          data: {
            turn: 1,
            step: 1,
            callId: 'c1',
            name: 'browser_open',
            arguments: '{"url":"https://x.com"}',
          },
        },
        {
          type: 'tool/result',
          seq: 3,
          time: 3,
          data: {
            turn: 1,
            step: 1,
            message: {
              toolCallId: 'c1',
              isError: true,
              content: [{ type: 'text', text: 'Error: failed' }],
            },
          },
        },
      ],
      inheritedEventCount: 0,
    }));
    const { registry, methods } = setup(
      [],
      ['ada'],
      undefined,
      ownership,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      read,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const result = await methods.botToolTrace({
      slug: 'ada',
      sessionId: 'session-ada',
      turns: 5,
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        sessionId: 'session-ada',
        turns: [
          {
            turn: 1,
            calls: [
              {
                name: 'browser_open',
                outcome: 'error',
                result: 'Error: failed',
              },
            ],
          },
        ],
      },
    });
    expect(read).toHaveBeenCalledWith('session-ada');
    expect((await methods.botToolTrace({ slug: 'ada', sessionId: 'session-other' })).ok).toBe(
      false,
    );
    expect(
      (
        await methods.botToolTrace({
          slug: 'ada',
          sessionId: 'session-ada',
          turns: 0,
        })
      ).ok,
    ).toBe(false);
    expect((await methods.botToolTrace({ slug: 'nobody' })).ok).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads an Assignment's MAIN and SUBAGENT timeline without raw tool input", async () => {
    const ownership = createTestOwnership({ 'asg-1': { botSlug: 'ada' } });
    ownership.claim({
      sessionId: 'sub-1',
      botSlug: 'ada',
      rootRole: 'assignment',
      provenance: 'subagent',
      parentSessionId: 'asg-1',
      at: '2026-09-19T00:00:01.000Z',
    });
    ownership.claim({
      sessionId: 'fork-1',
      botSlug: 'ada',
      rootRole: 'assignment',
      provenance: 'fork',
      parentSessionId: 'asg-1',
      at: '2026-09-19T00:00:02.000Z',
    });
    const read = vi.fn(async (sessionId: string) => ({
      events: [
        {
          type: 'tool/call',
          seq: 1,
          time: 1,
          data: {
            turn: 1,
            callId: `${sessionId}-c1`,
            name: 'bash',
            arguments: '{"command":"cat ~/.ssh/id_rsa"}',
          },
        },
      ],
      inheritedEventCount: 0,
    }));
    const assignment = {
      sessionId: 'asg-1',
      botSlug: 'ada',
      sourceEventId: 'source-1',
      title: 'Check the release',
      description: 'Check that the release is live.',
      activity: 'working' as const,
      createdAt: '2026-09-19T00:00:00.000Z',
      updatedAt: '2026-09-19T00:00:01.000Z',
    };
    const { registry, methods } = setup(
      [],
      ['ada'],
      () =>
        ({
          getAssignment: (_slug: string, sessionId: string) =>
            sessionId === 'asg-1' ? assignment : undefined,
          whenIdle: async () => undefined,
          close: async () => undefined,
        }) as unknown as BotRuntime,
      ownership,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      read,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const result = await methods.assignmentTimeline({
      slug: 'ada',
      sessionId: 'asg-1',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        assignment,
        rounds: [],
        omittedRounds: 0,
        omittedSubagents: 0,
        lanes: [
          {
            role: 'main',
            index: 0,
            sessionId: 'asg-1',
            state: 'idle',
            startedAt: '1970-01-01T00:00:00.001Z',
            updatedAt: '1970-01-01T00:00:00.001Z',
            omitted: 0,
            entries: [
              {
                status: 'running',
                kind: 'other',
                tool: 'bash',
                at: '1970-01-01T00:00:00.001Z',
              },
            ],
          },
          {
            role: 'subagent',
            index: 1,
            sessionId: 'sub-1',
            state: 'idle',
            startedAt: '1970-01-01T00:00:00.001Z',
            updatedAt: '1970-01-01T00:00:00.001Z',
            omitted: 0,
            entries: [
              {
                status: 'running',
                kind: 'other',
                tool: 'bash',
                at: '1970-01-01T00:00:00.001Z',
              },
            ],
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain('id_rsa');
    expect(read.mock.calls.map(([id]) => id)).toEqual(['asg-1', 'sub-1']);
    const subagents = await methods.sessionSubagents({
      slug: 'ada',
      sessionId: 'asg-1',
    });
    expect(subagents).toMatchObject({
      ok: true,
      value: {
        sessionId: 'asg-1',
        role: 'assignment',
        omittedSubagents: 0,
        lanes: [{ role: 'subagent', index: 1, sessionId: 'sub-1', state: 'idle' }],
      },
    });
    expect(JSON.stringify(subagents)).not.toContain('id_rsa');
    expect((await methods.sessionSubagents({ slug: 'ada', sessionId: 'sub-1' })).ok).toBe(false);
    expect((await methods.sessionSubagents({ slug: 'ada', sessionId: 'nope' })).ok).toBe(false);
    expect((await methods.sessionSubagents({ slug: 'ada' })).ok).toBe(false);
    const progress = await methods.sessionProgress({
      slug: 'ada',
      sessionIds: ['asg-1', 'sub-1', 'nope'],
    });
    expect(progress).toEqual({
      ok: true,
      value: {
        sessions: [
          { sessionId: 'asg-1', lastEventAt: expect.any(Number) },
          { sessionId: 'sub-1', error: 'not-found' },
          { sessionId: 'nope', error: 'not-found' },
        ],
      },
    });
    expect(await methods.sessionTranscript({ slug: 'ada', sessionId: 'asg-1' })).toMatchObject({
      ok: true,
      value: { sessionId: 'asg-1', role: 'assignment', omitted: 0 },
    });
    expect((await methods.sessionTranscript({ slug: 'ada', sessionId: 'sub-1' })).ok).toBe(false);
    expect((await methods.sessionTranscript({ slug: 'ada' })).ok).toBe(false);
    expect((await methods.sessionProgress({ slug: 'ada', sessionIds: [] })).ok).toBe(false);
    expect((await methods.sessionProgress({ slug: 'nobody', sessionIds: ['asg-1'] })).ok).toBe(
      false,
    );
    expect((await methods.assignmentTimeline({ slug: 'ada', sessionId: 'nope' })).ok).toBe(false);
    expect((await methods.assignmentTimeline({ slug: 'ada' })).ok).toBe(false);
    expect((await methods.assignmentTimeline({ slug: 'nobody', sessionId: 'asg-1' })).ok).toBe(
      false,
    );
  });

  it("reads a Bot's recent turn input from its own Session log only", async () => {
    const ownership = createTestOwnership({
      'session-ada': { botSlug: 'ada', rootRole: 'orchestrator' },
      'session-other': { botSlug: 'outsider', rootRole: 'orchestrator' },
    });
    const read = vi.fn(async () => ({
      events: [
        { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } },
        {
          type: 'user/message',
          seq: 2,
          time: 2,
          data: {
            source: { kind: 'user' },
            content: [{ type: 'text', text: 'Hi' }],
          },
        },
      ],
      inheritedEventCount: 0,
    }));
    const { registry, methods } = setup(
      [],
      ['ada'],
      undefined,
      ownership,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      read,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    expect(await methods.botTurnInput({ slug: 'ada', sessionId: 'session-ada' })).toMatchObject({
      ok: true,
      value: {
        slug: 'ada',
        sessionId: 'session-ada',
        turns: [{ turn: 1, messages: [{ step: 1, source: 'user', text: 'Hi' }] }],
      },
    });
    expect((await methods.botTurnInput({ slug: 'ada', sessionId: 'session-other' })).ok).toBe(
      false,
    );
    expect(
      (
        await methods.botTurnInput({
          slug: 'ada',
          sessionId: 'session-ada',
          turns: 21,
        })
      ).ok,
    ).toBe(false);
    expect((await methods.botTurnInput({ slug: 'nobody' })).ok).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);
    expect((await methods.botSystemPrompt({ slug: 'ada' })).ok).toBe(false);
  });

  it('reports the Orchestrator Session the runtime resumes, not an archived newer one', async () => {
    const ownership = createTestOwnership({
      resumed: { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    ownership.claim({
      sessionId: 'archived',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: '2026-10-12T00:00:00.000Z',
    });
    const usageHome = mkdtempSync(join(tmpdir(), 'botharness-session-usage-'));
    roots.push(usageHome);
    const owner = mountOperationalDatabase({
      dshHome: usageHome,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    modelOwners.push(owner);
    const usage = createUsageProjection({ ownership, database: owner });
    const read = vi.fn(async () => ({ events: [], inheritedEventCount: 0 }));
    let current: string | undefined = 'resumed';
    const runtime = {
      listAssignments: () => [],
      currentOrchestratorSessionId: () => current,
    } as unknown as BotRuntime;
    const { registry, channels, methods } = setup(
      [],
      ['ada'],
      () => runtime,
      ownership,
      undefined,
      undefined,
      undefined,
      usage,
      undefined,
      read,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const rows = async () => {
      const result = await methods.profileSessionUsage({ channelId: dm.id });
      if (!result.ok) throw new Error('Expected scoped usage');
      return result.value.rows.map((row) => row.sessionId);
    };
    expect(await rows()).toEqual(['resumed']);
    current = undefined;
    expect(await rows()).toEqual([]);
  });

  it('reads titles only for the requested Bot’s Orchestrator roots and only when requested', async () => {
    const ownership = createTestOwnership({
      'ada-orchestrator': { botSlug: 'ada', rootRole: 'orchestrator' },
      'ada-assignment': { botSlug: 'ada', rootRole: 'assignment' },
      'bob-orchestrator': { botSlug: 'bob', rootRole: 'orchestrator' },
    });
    const readTitles = vi.fn(async () => new Map([['ada-orchestrator', 'Review the release']]));
    const { methods } = setup(
      [],
      ['ada'],
      undefined,
      ownership,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      readTitles,
    );
    methods.create({ slug: 'ada', displayName: 'Ada' });

    expect(methods.sessions({ slug: 'ada' })).toMatchObject({ ok: true });
    expect(readTitles).not.toHaveBeenCalled();
    const result = await methods.sessions({ slug: 'ada', includeTitles: true });

    expect(readTitles).toHaveBeenCalledOnce();
    expect(readTitles).toHaveBeenCalledWith(['ada-orchestrator']);
    expect(result).toMatchObject({
      ok: true,
      value: {
        sessions: expect.arrayContaining([
          expect.objectContaining({
            sessionId: 'ada-orchestrator',
            displayTitle: 'Review the release',
          }),
        ]),
      },
    });
  });

  it('lists only root Sessions owned by the bot, preserving role and cwd evidence', async () => {
    const ownership = createTestOwnership({
      'session-1': { botSlug: 'ada', rootRole: 'orchestrator' },
      'session-2': { botSlug: 'ada', rootRole: 'assignment' },
      'session-3': { botSlug: 'bob', rootRole: 'assignment' },
    });
    const { methods } = setup([], ['ada'], undefined, ownership);
    methods.create({
      slug: 'ada',
      displayName: 'Ada',
      workspaces: ['/srv/ada/'],
    });

    ownership.recordAgentPreset('session-2', 'minimal');
    const result = await methods.sessions({ slug: 'ada' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sessions).toEqual([
      expect.objectContaining({ sessionId: 'session-1', role: 'orchestrator' }),
      expect.objectContaining({
        sessionId: 'session-2',
        role: 'assignment',
        agentPreset: 'minimal',
      }),
    ]);
    expect(result.value.sessions[0]).not.toHaveProperty('agentPreset');
    expect(result.value.sessions.map((session) => session.sessionId)).not.toContain('session-3');
  });

  it('reports the model each root Session last ran on, else the configured route', async () => {
    const ownership = createTestOwnership({
      orc: { botSlug: 'ada', rootRole: 'orchestrator' },
      work: { botSlug: 'ada', rootRole: 'assignment' },
    });
    const usage = {
      latestRoute: (sessionId: string) =>
        sessionId === 'work'
          ? { provider: 'opencode-go', model: 'deepseek-v4.1-flash' }
          : undefined,
    } as unknown as UsageProjection;
    const { methods, registry } = setup(
      [],
      ['ada'],
      undefined,
      ownership,
      undefined,
      undefined,
      undefined,
      usage,
    );
    methods.create({ slug: 'ada', displayName: 'Ada' });
    const orchestrator = {
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'high',
    };
    vi.spyOn(registry, 'get').mockImplementation(
      (slug) =>
        ({
          slug,
          modelPlan: { orchestrator, assignmentDefault: orchestrator },
        }) as unknown as ReturnType<typeof registry.get>,
    );

    const result = await methods.sessions({ slug: 'ada' });
    if (!result.ok) throw new Error('Expected Sessions');
    expect(
      Object.fromEntries(
        result.value.sessions.map((session) => [session.sessionId, session.modelRoute]),
      ),
    ).toEqual({
      orc: orchestrator,
      work: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
    });
  });

  it('names the engine instead of a model for a Session that runs on a subscription engine', async () => {
    const ownership = createTestOwnership({
      engine: { botSlug: 'ada', rootRole: 'orchestrator' },
      native: { botSlug: 'ada', rootRole: 'assignment' },
    });
    const usage = {
      latestRoute: () => ({ provider: 'deepseek', model: 'deepseek-v4.1-flash' }),
    } as unknown as UsageProjection;
    const { methods } = setup(
      [],
      ['ada'],
      undefined,
      ownership,
      undefined,
      undefined,
      undefined,
      usage,
      undefined,
      undefined,
      (sessionId) =>
        sessionId === 'engine'
          ? { engine: 'codex', account: 'ChatGPT pro', state: 'idle' }
          : undefined,
    );
    methods.create({ slug: 'ada', displayName: 'Ada' });

    const result = await methods.sessions({ slug: 'ada' });
    if (!result.ok) throw new Error('Expected Sessions');
    const byId = Object.fromEntries(
      result.value.sessions.map((session) => [session.sessionId, session]),
    );
    expect(byId['engine']?.engine).toEqual({ engine: 'codex', account: 'ChatGPT pro' });
    expect(byId['engine']?.modelRoute).toBeUndefined();
    expect(byId['native']?.engine).toBeUndefined();
    expect(byId['native']?.modelRoute).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4.1-flash',
    });
  });

  it('marks which Orchestrator Session the runtime resumes', async () => {
    const ownership = createTestOwnership({
      resumed: { botSlug: 'ada', rootRole: 'orchestrator' },
      archived: { botSlug: 'ada', rootRole: 'orchestrator' },
      work: { botSlug: 'ada', rootRole: 'assignment' },
    });
    const runtime = {
      listAssignments: () => [],
      currentOrchestratorSessionId: () => 'resumed',
    } as unknown as BotRuntime;
    const { methods } = setup([], ['ada'], () => runtime, ownership);
    methods.create({ slug: 'ada', displayName: 'Ada' });

    const result = await methods.sessions({ slug: 'ada' });
    if (!result.ok) throw new Error('Expected Sessions');
    const flags = Object.fromEntries(
      result.value.sessions.map((session) => [session.sessionId, session.currentOrchestrator]),
    );
    expect(flags).toEqual({ resumed: true, archived: false, work: undefined });
  });

  it('projects each Assignment access snapshot independently of the Bot default', async () => {
    const ownership = createTestOwnership({
      'session-orchestrator': { botSlug: 'ada', rootRole: 'orchestrator' },
      'session-safe': { botSlug: 'ada', rootRole: 'assignment' },
      'session-danger': { botSlug: 'ada', rootRole: 'assignment' },
    });
    const { methods } = setup(
      [],
      ['ada'],
      () => ({
        admitGroupMessage() {},
        admitBotDmMessage() {},
        async withdrawNetworkMembership() {},
        admitGroupInvitation() {},
        admitDmMessage: () => ({
          admitted: true as const,
          settled: Promise.resolve(),
        }),
        listAssignments: () =>
          (['session-safe', 'session-danger'] as const).map((sessionId) => ({
            sessionId,
            title: 'Inspect files',
            description: 'Inspect files',
            activity: 'idle' as const,
            createdAt: '2026-09-19T00:00:00.000Z',
            updatedAt: '2026-09-19T00:00:00.000Z',
            permission: {
              grantId: 'grant',
              workspaceId: 'workspace',
              primaryCwd: '/projects/ada',
              mode:
                sessionId === 'session-danger'
                  ? ('danger-full-access' as const)
                  : ('workspace-write' as const),
              approval: sessionId === 'session-danger' ? ('never' as const) : ('ask' as const),
              presetRevision: sessionId === 'session-danger' ? 1 : 0,
            },
          })),
        getAssignment: () => undefined,
        whenIdle: async () => undefined,
        close: async () => undefined,
      }),
      ownership,
    );
    methods.create({ slug: 'ada', displayName: 'Ada' });

    const result = await methods.sessions({ slug: 'ada' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sessions).toHaveLength(3);
    expect(result.value.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId: 'session-orchestrator',
          role: 'orchestrator',
        }),
        expect.objectContaining({
          sessionId: 'session-safe',
          assignmentAccessMode: 'workspace-write',
        }),
        expect.objectContaining({
          sessionId: 'session-danger',
          assignmentAccessMode: 'danger-full-access',
        }),
      ]),
    );
  });

  it('resolves only owned root Sessions to their PersonaBot for return navigation', () => {
    const ownership = createTestOwnership({
      'session-orchestrator': { botSlug: 'ada', rootRole: 'orchestrator' },
      'session-assignment': { botSlug: 'ada', rootRole: 'assignment' },
      'session-other': { botSlug: 'bob', rootRole: 'orchestrator' },
    });
    ownership.claim({
      sessionId: 'session-child',
      botSlug: 'ada',
      rootRole: 'assignment',
      parentSessionId: 'session-assignment',
      provenance: 'subagent',
      at: '2026-09-19T00:00:01.000Z',
    });
    const { methods } = setup([], ['ada'], undefined, ownership);
    methods.create({
      slug: 'ada',
      displayName: 'Ada',
      avatar:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=',
    });

    expect(methods.sessionOwner({ sessionId: 'session-orchestrator' })).toEqual({
      ok: true,
      value: {
        owner: {
          botSlug: 'ada',
          displayName: 'Ada',
          avatar: expect.stringMatching(/^\/api\/botharness\/bot-avatar\?slug=ada&v=/u),
          avatarSeed: 2,
          role: 'orchestrator',
        },
      },
    });
    expect(methods.sessionOwner({ sessionId: 'session-assignment' })).toEqual({
      ok: true,
      value: {
        owner: {
          botSlug: 'ada',
          displayName: 'Ada',
          avatar: expect.stringMatching(/^\/api\/botharness\/bot-avatar\?slug=ada&v=/u),
          avatarSeed: 2,
          role: 'assignment',
        },
      },
    });
    expect(methods.sessionOwner({ sessionId: 'session-child' })).toEqual({
      ok: true,
      value: { owner: null },
    });
    expect(methods.sessionOwner({ sessionId: 'session-other' })).toEqual({
      ok: true,
      value: { owner: null },
    });
    expect(methods.sessionOwner({ sessionId: 'unowned' })).toEqual({
      ok: true,
      value: { owner: null },
    });
    expect(methods.sessionOwner({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'sessionId is required' },
    });
  });

  it('lists the root Sessions of every current PersonaBot for the native Session list', () => {
    const ownership = createTestOwnership({
      'session-orchestrator': { botSlug: 'ada', rootRole: 'orchestrator' },
      'session-assignment': { botSlug: 'ada', rootRole: 'assignment' },
      'session-gone': { botSlug: 'bob', rootRole: 'orchestrator' },
    });
    ownership.claim({
      sessionId: 'session-child',
      botSlug: 'ada',
      rootRole: 'assignment',
      parentSessionId: 'session-assignment',
      provenance: 'subagent',
      at: '2026-09-19T00:00:01.000Z',
    });
    const { methods } = setup([], ['ada'], undefined, ownership);
    methods.create({ slug: 'ada', displayName: 'Ada' });

    const result = methods.botSessionIds({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.value.sessionIds].sort()).toEqual([
      'session-assignment',
      'session-orchestrator',
    ]);
    expect(result.value.groups).toEqual([
      {
        botSlug: 'ada',
        displayName: 'Ada',
        sessionIds: expect.arrayContaining(['session-orchestrator', 'session-assignment']),
      },
    ]);
  });

  it('rejects malformed or unknown session reads', async () => {
    const { methods } = setup();

    expect(await methods.sessions({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'slug is required' },
    });
    expect(await methods.sessions({ slug: 'missing' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown PersonaBot: missing' },
    });
  });
});

it('returns the live Orchestrator runner through list and detail after engine use and none', async () => {
  const f = setup();
  f.registry.create({ slug: 'ada', displayName: 'Ada' });
  f.registry.create({ slug: 'eve', displayName: 'Eve' });
  const notifications: unknown[] = [];
  const host = new EngineHost({
    root: join(f.root, 'engines'),
    local: true,
    gateway: createEngineGateway(),
    sessions: () => undefined,
    persistence: () => undefined,
    changed: () => notifications.push(methods.list({})),
  });
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    registry: f.registry,
    states: f.states,
    channels: f.channels,
    ownership: createTestOwnership(),
    roster: createTestRosterStore(),
    orchestratorRunner: (slug) => host.orchestratorRunner(slug),
  });
  const use = (engine: string | null) =>
    engineRouteFetch(
      new Request('http://host/api/botharness/engines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'use', bot: 'ada', role: 'orchestrator', engine }),
      }),
      {
        host,
        botExists: (slug) => f.registry.get(slug) !== undefined,
        ...createEngineSelectionBridge(OWNER_HUMAN_CONTEXT, {
          engineSelection: host,
          registry: f.registry,
        }),
      },
    );
  const bots = () => {
    const result = methods.list({});
    if (!result.ok) throw new Error(result.error.message);
    return result.value.bots;
  };
  try {
    expect(bots().every((bot) => !('orchestratorRunner' in bot))).toBe(true);
    expect((await use('codex')).status).toBe(200);
    const runner = { engine: 'codex', displayName: 'Codex' };
    expect(bots().find((bot) => bot.slug === 'ada')).toHaveProperty('orchestratorRunner', runner);
    expect(bots().find((bot) => bot.slug === 'eve')).not.toHaveProperty('orchestratorRunner');
    expect(methods.get({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: { bot: { orchestratorRunner: runner } },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      value: { bots: [expect.objectContaining({ orchestratorRunner: runner }), expect.anything()] },
    });
    host.store.rememberAccount('ada', 'codex', 'ChatGPT Plus');
    host.store.rememberAccount('eve', 'codex', 'ChatGPT Pro');
    expect(bots().find((bot) => bot.slug === 'ada')).toHaveProperty('orchestratorRunner', {
      ...runner,
      account: 'ChatGPT Plus',
    });
    expect(
      createEngineStore(engineStorePath(join(f.root, 'engines'))).account('ada', 'codex'),
    ).toBe('ChatGPT Plus');
    expect((await use(null)).status).toBe(200);
    expect(bots().find((bot) => bot.slug === 'ada')).not.toHaveProperty('orchestratorRunner');
    expect(methods.get({ slug: 'ada' })).not.toHaveProperty('value.bot.orchestratorRunner');
    expect(notifications).toHaveLength(2);
    expect(await use('codex')).toHaveProperty('status', 200);
    expect(bots().find((bot) => bot.slug === 'ada')).toHaveProperty('orchestratorRunner', {
      ...runner,
      account: 'ChatGPT Plus',
    });
  } finally {
    await host.close();
  }
});
