import type { Agent } from '@deepseek-ai/dsh-agent';
import { describe, expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
const agents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  async close() {},
  requestAssignment() {
    throw new Error('Unexpected Assignment');
  },
};
describe('Activity Center Host query', () => {
  it('counts all explicit actions beyond one page without counting unread or mentions', async () => {
    const core = createCore({ dshHome: createTempRoot('bh-overview-'), agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      for (let i = 0; i < 61; i++)
        await core.channels.appendMessage(dm.id, {
          id: 'grant-' + i,
          at: '2026-10-01T09:00:00Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'Choose workspace',
          grantRequest: true,
        });
      await core.channels.appendMessage(dm.id, {
        id: 'ordinary',
        at: '2026-10-01T09:00:01Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Status update',
      });
      const methods = createBridgeMethods({ ...core });
      expect(methods.activityOverview({})).toMatchObject({
        ok: true,
        value: {
          actionCount: 61,
          bots: [
            { slug: 'ada', state: 'idle', hasAction: true, sessions: [] },
            { slug: 'bea', state: 'idle', hasAction: false, sessions: [] },
          ],
        },
      });
      expect(core.humanAttention.actionSummary()).toEqual({ count: 61, botSlugs: ['ada'] });
      expect(core.humanAttention.status()).toEqual({ unreadCount: 62, hasAction: true });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});

it('shows only live executing roots and follows execution changes without reviving them after restart', async () => {
  const home = createTempRoot('bh-overview-executing-');
  const core = createCore({ dshHome: home, agents });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.registry.create({ slug: 'bea', displayName: 'Bea' });
    for (const [sessionId, rootRole, parentSessionId] of [
      ['orch', 'orchestrator', undefined],
      ['assignment', 'assignment', undefined],
      ['child', 'assignment', 'assignment'],
      ['waiting', 'assignment', undefined],
      ['stale', 'orchestrator', undefined],
    ] as const)
      core.ownership.claim({
        sessionId,
        botSlug: 'ada',
        rootRole,
        ...(parentSessionId === undefined ? {} : { parentSessionId }),
        at: '2026-10-01T09:00:00Z',
      });
    for (const [id, state] of [
      ['orch', 'thinking'],
      ['assignment', 'working'],
      ['child', 'working'],
      ['waiting', 'waiting'],
      ['stale', 'thinking'],
    ] as const)
      core.states.setSessionState('ada', id, state);
    const live = new Set(['orch', 'assignment', 'child', 'waiting']);
    const methods = createBridgeMethods({ ...core, runningSessionIds: () => live });
    expect(methods.activityOverview({})).toMatchObject({
      ok: true,
      value: {
        actionCount: 0,
        bots: [
          {
            slug: 'ada',
            state: 'waiting',
            sessions: [
              { sessionId: 'orch', role: 'orchestrator', state: 'thinking' },
              { sessionId: 'assignment', role: 'assignment', state: 'working' },
            ],
          },
          { slug: 'bea', state: 'idle', sessions: [] },
        ],
      },
    });
    core.states.setSessionState('ada', 'orch', 'done');
    live.delete('assignment');
    expect(methods.activityOverview({})).toMatchObject({
      ok: true,
      value: {
        bots: [
          { slug: 'ada', sessions: [] },
          { slug: 'bea', sessions: [] },
        ],
      },
    });
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
  const restored = createCore({ dshHome: home, agents });
  try {
    expect(
      createBridgeMethods({ ...restored, runningSessionIds: () => new Set() }).activityOverview({}),
    ).toMatchObject({
      ok: true,
      value: {
        bots: [
          { slug: 'ada', state: 'idle', sessions: [] },
          { slug: 'bea', state: 'idle', sessions: [] },
        ],
      },
    });
  } finally {
    await restored.runtime.close();
    restored.operationalDatabase.close();
  }
});

it('keeps a real pending question in actions without replacing the canonical Session activity', async () => {
  const { ChannelUserQuestions } = await import('../src/channels/user-questions.js');
  const core = createCore({
    dshHome: createTempRoot('bh-overview-question-'),
    agents,
    activeQuestionMessageIds: () => broker.activeMessageIds(),
  });
  const broker = new ChannelUserQuestions(core.channels, core.ownership);
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.channels.getOrCreateDm('ada', 'Ada');
    core.ownership.claim({
      sessionId: 'orch',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: '2026-10-01T09:00:00Z',
    });
    core.states.setSessionState('ada', 'orch', 'working');

    const answer = broker.ask({
      agent: { session: { id: 'orch', header: { cwd: '/qa' } } } as Agent,
      questions: [{ id: 'route', question: 'Which route?' }],
    });
    void answer.catch(() => undefined);
    const methods = createBridgeMethods({
      ...core,
      userQuestions: broker,
      runningSessionIds: () => new Set(['orch']),
    });
    const { vi } = await import('vitest');
    await vi.waitFor(() =>
      expect(methods.activityOverview({})).toMatchObject({
        ok: true,
        value: {
          actionCount: 1,
          bots: [
            {
              slug: 'ada',
              state: 'working',
              hasAction: true,
              sessions: [{ sessionId: 'orch', state: 'working' }],
            },
          ],
        },
      }),
    );
    broker.close();
    await vi.waitFor(() => expect(core.humanAttention.actionCount()).toBe(0));
  } finally {
    broker.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('keeps Overview execution identical to the Host snapshot while real native approvals remain independent actions', async () => {
  const { ChannelToolApproval } = await import('../src/workspaces/tool-approval.js');
  const core = createCore({
    dshHome: createTempRoot('bh-overview-orthogonal-'),
    agents,
    activeToolApprovalMessageIds: () => broker.activeMessageIds(),
  });
  const broker = new ChannelToolApproval(core.channels, core.ownership);
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.channels.getOrCreateDm('ada', 'Ada');
    for (const [sessionId, role, toolName, toolKind, effect] of [
      ['orch', 'orchestrator', 'browser_tabs', 'execute', 'executing'],
      ['assignment', 'assignment', 'bash', 'execute', 'executing'],
    ] as const) {
      core.ownership.claim({
        sessionId,
        botSlug: 'ada',
        rootRole: role,
        at: '2026-10-01T09:00:00Z',
      });
      core.states.setSessionState(
        'ada',
        sessionId,
        'working',
        {
          toolName,
          toolKind,
          effect,
          startedAt: 10,
          activeToolCount: 1,
          sources: [{ role, count: 1 }],
        },
        role,
      );
    }
    const native = { session: { id: 'assignment', header: { cwd: '/qa' } } } as Agent;
    broker.track({
      agent: native,
      name: 'bash',
      callId: 'call-1',
      arguments: { command: 'private input' },
      token: Symbol('call'),
    } as import('@deepseek-ai/dsh-tools').ToolExecution);
    const answer = broker.ask({ agent: native, toolName: 'bash', callId: 'call-1' });
    const methods = createBridgeMethods({
      ...core,
      toolApproval: broker,
      runningSessionIds: () => new Set(['orch', 'assignment']),
    });
    const { vi } = await import('vitest');
    await vi.waitFor(() => expect(core.humanAttention.actionCount()).toBe(1));
    const overview = methods.activityOverview({});
    const shared = methods.activitySnapshot({});
    expect(overview).toMatchObject({
      ok: true,
      value: {
        actionCount: 1,
        bots: [
          {
            slug: 'ada',
            state: 'working',
            hasAction: true,
            activity: { toolName: 'browser_tabs', sources: [{ role: 'orchestrator', count: 1 }] },
            sessions: [
              { sessionId: 'orch', state: 'working' },
              { sessionId: 'assignment', state: 'working' },
            ],
          },
        ],
      },
    });
    if (!overview.ok || !shared.ok) throw Error('Expected public Host queries');
    expect(overview.value.bots[0]?.state).toBe(shared.value.bots[0]?.state);
    expect(overview.value.bots[0]?.activity).toEqual(shared.value.bots[0]?.activity);
    expect(JSON.stringify(overview)).not.toContain('private input');
    core.states.setSessionState('ada', 'orch', 'done', undefined, 'orchestrator');
    expect(methods.activityOverview({})).toMatchObject({
      ok: true,
      value: { bots: [{ state: 'working', hasAction: true, activity: { toolName: 'bash' } }] },
    });
    const message = core.channels
      .readMessages('dm-ada')
      .find((message) => message.toolApprovalRequest !== undefined)!;
    expect(await broker.decide('ada', message.id, 'rejected')).toBe(true);
    await answer;
    core.states.clearSession('ada', 'assignment');
    expect(methods.activityOverview({})).toMatchObject({
      ok: true,
      value: { actionCount: 0, bots: [{ state: 'idle', hasAction: false, sessions: [] }] },
    });
  } finally {
    broker.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('exposes independent active state even when waiting outranks work and no display session detail exists', async () => {
  const core = createCore({ dshHome: createTempRoot('bh-active-summary-'), agents });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const activityEvents: { active?: boolean; state: string }[] = [];
    core.states.onActivity((event) => activityEvents.push(event));
    core.states.setSessionState('ada', 'working-root', 'working');
    core.states.setSessionState('ada', 'approval-root', 'waiting');
    const methods = createBridgeMethods({ ...core });
    expect(methods.activitySnapshot({})).toMatchObject({
      ok: true,
      value: { bots: [{ slug: 'ada', state: 'waiting', active: true }] },
    });
    expect(activityEvents.at(-1)).toMatchObject({ state: 'waiting', active: true });
    core.states.setSessionState('ada', 'working-root', 'done');
    expect(activityEvents.at(-1)).toMatchObject({ state: 'waiting', active: false });
    expect(methods.activitySnapshot({})).toMatchObject({
      ok: true,
      value: { bots: [{ slug: 'ada', state: 'waiting', active: false }] },
    });
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
