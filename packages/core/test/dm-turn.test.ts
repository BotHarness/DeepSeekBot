import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installOrchestratorFileTools } from '../src/workspaces/orchestrator-file-tools.js';

vi.mock('../src/workspaces/orchestrator-file-tools.js', () => ({
  installOrchestratorFileTools: vi.fn(async () => async () => undefined),
}));

import { apply, type BotHarnessCore } from '../src/index.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

const contexts: Context[] = [];
const persistedSessions = new Map<string, Set<string>>();

beforeEach(() => {
  vi.mocked(installOrchestratorFileTools).mockClear();
  vi.stubEnv('DSH_HOME', createTempRoot('botharness-dm-turn-'));
});

afterEach(async () => {
  while (contexts.length > 0) {
    const ctx = contexts.pop();
    if (ctx !== undefined) await ctx.fiber.dispose();
  }
  vi.unstubAllEnvs();
  persistedSessions.clear();
});

interface Harness {
  ctx: Context;
  host: FakeAgentHost;
  core: BotHarnessCore;
  dshHome: string;
}

function startHarness(): Harness {
  const dshHome = process.env['DSH_HOME'] ?? '';
  const ctx = new Context();
  contexts.push(ctx);
  const stored = persistedSessions.get(dshHome) ?? new Set<string>();
  persistedSessions.set(dshHome, stored);
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      sendMessage: true,
      messageChannel: 'dm-ada',
      onAgentCreated: (agent) => {
        for (const session of host.sessions) stored.add(session.id);
        ctx.emit('agent/created', { agent } as never);
      },
      onSessionEvent: (session, event) =>
        ctx.emit('session/event', session as never, event as never),
    },
  );
  ctx.provide('tools', { register: () => () => undefined, guard: () => () => undefined });
  ctx.provide('systemPrompt', { section: () => () => undefined });
  ctx.provide('sessions', { list: () => host.sessions });
  ctx.provide('sessionPersistence', {
    stat: async (id: string) => (stored.has(id) ? {} : undefined),
  } as never);
  ctx.provide('agents', host as never);
  ctx.provide('workspaceRegistry', {
    get: (id: string) =>
      id === 'test-workspace'
        ? { id, path: dshHome, title: 'Test Workspace', status: async () => 'ok' as const }
        : undefined,
    list: () => [
      {
        id: 'test-workspace',
        path: dshHome,
        title: 'Test Workspace',
        status: async () => 'ok' as const,
      },
    ],
  } as never);
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'test', model: 'test' }),
  });

  apply(ctx, { enabled: true });
  const core = ctx.get('botharness') as BotHarnessCore | undefined;
  if (core === undefined) throw new Error('core was not provided');
  attachOperationalModule(core.operationalDatabase, 'dm-turn-grant-fixture').transaction(
    (database) => {
      database
        .prepare(`INSERT OR IGNORE INTO workspace_grants
      (id, bot_slug, workspace_id, workspace_path, workspace_title, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
        .run(
          'grant-1',
          'ada',
          'test-workspace',
          dshHome,
          'Test Workspace',
          '2026-09-21T00:00:00.000Z',
        );
    },
    ['workspace-grants'],
  );
  return { ctx, host, core, dshHome };
}

async function admitTurn(
  core: BotHarnessCore,
  channelId: string,
  messageId: string,
  body: string,
): Promise<void> {
  await core.channels.appendMessage(channelId, {
    id: messageId,
    at: '2026-09-21T00:00:01.000Z',
    author: { kind: 'human' },
    body,
  });
  const admission = core.runtime.admitDmMessage({ channelId, messageId, body });
  if (!admission.admitted) throw new Error(`admission rejected: ${admission.reason}`);
  await admission.settled;
}

describe('DM turn end to end', () => {
  it('publishes processing before a directly admitted Human DM turn settles', async () => {
    const { core } = startHarness();
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = core.channels.getOrCreateDm('ada', 'Ada');
    if (dm === undefined) throw new Error('DM channel missing');
    const response = core.live.open(
      new Request(`http://localhost/api/botharness/stream?channelId=${dm.id}&after=0`),
    );
    const reader = response.body!.getReader();
    await admitTurn(core, dm.id, 'live-processing', '请核对发布状态');
    const states: string[] = [];
    while (!states.includes('handled')) {
      const next = await reader.read();
      if (next.done) break;
      const frame = new TextDecoder().decode(next.value);
      if (!frame.includes('event: channel/admission')) continue;
      const data = frame.split('data: ')[1]?.trim();
      if (data === undefined) continue;
      const update = JSON.parse(data) as { messageId: string; deliveries: { state: string }[] };
      if (update.messageId === 'live-processing')
        states.push(...update.deliveries.map((item) => item.state));
    }
    await reader.cancel();
    expect(states).toContain('running');
    expect(states).toContain('handled');
    expect(states.indexOf('running')).toBeLessThan(states.indexOf('handled'));
  });

  it('runs a real Orchestrator and Assignment turn through the Host wiring', async () => {
    const { ctx, host, core, dshHome } = startHarness();
    expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const dm = core.channels.getOrCreateDm('ada', 'Ada');
    if (dm === undefined) throw new Error('DM channel missing');

    await admitTurn(core, dm.id, 'human-1', '请核对发布状态');
    expect(installOrchestratorFileTools).toHaveBeenCalledOnce();
    expect(vi.mocked(installOrchestratorFileTools).mock.calls[0]?.[1].session.id).toBe(
      core.ownership.rootsFor('ada', 'orchestrator')[0]?.sessionId,
    );

    expect(core.channels.readMessages(dm.id).map((message) => message.body)).toEqual([
      '发布状态已经核对完成。',
      '请核对发布状态',
    ]);
    expect(
      core.channels.readMessages(dm.id).some((message) => message.body.includes('private')),
    ).toBe(false);

    const ownership = core.ownership.list();
    expect(ownership).toHaveLength(2);
    const orchestrator = ownership.find((record) => record.rootRole === 'orchestrator');
    const assignment = ownership.find((record) => record.rootRole === 'assignment');
    expect(orchestrator).toMatchObject({
      botSlug: 'ada',
      provenance: 'created',
      parentSessionId: undefined,
      cwdReference: join(dshHome, 'botharness', 'bots', 'ada', 'memory'),
    });
    expect(assignment).toMatchObject({
      botSlug: 'ada',
      provenance: 'created',
      parentSessionId: undefined,
    });
    expect(core.ownership.rootsFor('ada', 'orchestrator')).toHaveLength(1);
    expect(core.ownership.rootsFor('ada', 'assignment')).toHaveLength(1);
    expect(host.createOptions.map((options) => options.meta?.agentPreset)).toEqual([
      'standard',
      'standard',
    ]);
    expect(host.createOptions.map((options) => options.meta?.cwd)).toEqual([
      join(dshHome, 'botharness', 'bots', 'ada', 'memory'),
      dshHome,
    ]);
    for (const session of host.sessions) {
      expect(session.snapshotEvents(0, 2).map((event) => [event.type, event.data])).toEqual([
        ['sandbox/mode', { mode: 'workspace-write' }],
        ['approval/policy', { policy: 'ask' }],
      ]);
    }

    expect(core.runtime.listAssignments('ada')).toEqual([
      expect.objectContaining({
        purpose: '核对发布状态',
        permission: {
          grantId: 'grant-1',
          workspaceId: 'test-workspace',
          primaryCwd: dshHome,
          mode: 'workspace-write',
          approval: 'ask',
          presetRevision: 0,
        },
        latestReport: expect.objectContaining({ state: 'completed', summary: '发布状态正常' }),
      }),
    ]);

    const bridge = ctx.get('botharnessBridge') as {
      sessions(slug: string): { sessions: Array<{ sessionId: string }> };
    };
    expect(
      bridge
        .sessions('ada')
        .sessions.map((session) => session.sessionId)
        .sort(),
    ).toEqual(ownership.map((record) => record.sessionId).sort());
    expect(core.registry.create({ slug: 'bob', displayName: 'Bob' }).ok).toBe(true);
    expect(bridge.sessions('bob').sessions).toEqual([]);

    expect(core.states.snapshot('ada').sessions).toEqual({
      [orchestrator?.sessionId ?? '']: 'done',
      [assignment?.sessionId ?? '']: 'done',
    });

    ctx.emit('agent/disposed', {
      agent: { session: { id: orchestrator?.sessionId ?? '' } },
    } as never);
    expect(core.states.snapshot('ada').sessions).toEqual({
      [assignment?.sessionId ?? '']: 'done',
    });

    expect(host.disposed).toEqual([]);
  });

  it('reuses the owned Orchestrator root across turns and after a restart', async () => {
    const first = startHarness();
    expect(first.core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const dm = first.core.channels.getOrCreateDm('ada', 'Ada');
    if (dm === undefined) throw new Error('DM channel missing');

    await admitTurn(first.core, dm.id, 'human-1', '请核对发布状态');
    await admitTurn(first.core, dm.id, 'human-2', '再核对一次');

    const orchestratorId = first.core.ownership.rootsFor('ada', 'orchestrator')[0]?.sessionId;
    expect(first.core.ownership.rootsFor('ada', 'orchestrator')).toHaveLength(1);
    expect(
      first.host.createOptions
        .map((options) => String(options.sessionId))
        .filter((sessionId) => sessionId === orchestratorId),
    ).toHaveLength(1);
    expect(first.host.resumeOptions).toEqual([]);

    const home = first.dshHome;
    await first.ctx.fiber.dispose();
    vi.stubEnv('DSH_HOME', home);

    const second = startHarness();
    const restartedDm = second.core.channels.getOrCreateDm('ada', 'Ada');
    if (restartedDm === undefined) throw new Error('DM channel missing after restart');
    await admitTurn(second.core, restartedDm.id, 'human-3', '第三次核对');

    expect(second.core.ownership.rootsFor('ada', 'orchestrator')).toHaveLength(1);
    expect(second.host.resumeOptions).toHaveLength(1);
    expect(String(second.host.resumeOptions[0]?.resumeSessionId)).toBe(orchestratorId);
    expect(second.core.states.snapshot('ada').sessions[orchestratorId ?? '']).toBe('done');
  });
});
