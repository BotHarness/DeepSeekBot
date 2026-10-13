import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { ChannelUserQuestions, type TimedQuestionPort } from '../src/channels/user-questions.js';
import { nativeTimedQuestions } from '../src/channels/native-timed-questions.js';
import { createTempRoot } from './helpers.js';

const questions = [
  {
    id: 'release-route',
    question: 'Which release channel?',
    options: [{ label: 'Canary' }, { label: 'Stable' }],
  },
];
const answer = { answers: [{ id: 'release-route', selected: ['Stable'] }] };
const sessionId = 'orchestrator-ada';

function nativeLog() {
  const state: { current: ReturnType<TimedQuestionPort['read']> } = {
    current: { state: 'open' },
  };
  return state;
}

function port(
  core: ReturnType<typeof createCore>,
  native: ReturnType<typeof nativeLog>,
  delivered: string[],
): TimedQuestionPort {
  return {
    bind: (id, channelId) => core.runtime.bindNativeQuestionInput?.(id, channelId),
    recover: (id, channelId, messageId) =>
      core.runtime.recoverNativeQuestionInput?.(id, channelId, messageId),
    available: (id, channelId) => core.runtime.nativeQuestionAvailable?.(id, channelId) ?? true,
    read: () => native.current,
    answer: (id, callId) => {
      delivered.push(`${id}:${callId}`);
      return true;
    },
  };
}

describe('a timed question card across a Host restart', () => {
  it('stays answerable and resumes its own Orchestrator Session with the late answer', async () => {
    const home = createTempRoot('bh-timed-question-recovery-');
    const native = nativeLog();
    const runs: OrchestratorAgentRun[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs.push(run);
        if (run.acceptNativeInput !== undefined) {
          native.current = { state: 'continued' };
          run.acceptNativeInput();
        }
      },
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
    };

    const first = createCore({ dshHome: home, agents });
    let messageId: string;
    let channelId: string;
    try {
      first.registry.create({ slug: 'ada', displayName: 'Ada' });
      channelId = first.channels.getOrCreateDm('ada', 'Ada')!.id;
      first.ownership.claim({
        sessionId,
        botSlug: 'ada',
        rootRole: 'orchestrator',
        at: '2026-10-13T09:00:00Z',
      });
      const broker = new ChannelUserQuestions(
        first.channels,
        first.ownership,
        () => true,
        undefined,
        undefined,
        port(first, native, []),
      );
      const agent = { session: { id: sessionId, header: { cwd: '/qa' } } } as Agent;
      const wait = broker.ask({
        agent,
        questions,
        wait: { callId: 'call-1', timed: true },
      } as Parameters<ChannelUserQuestions['ask']>[0]);
      void wait.catch(() => undefined);
      await vi.waitFor(() => expect(first.channels.readMessages(channelId)).toHaveLength(1));
      messageId = first.channels.readMessages(channelId)[0]!.id;
      expect(first.humanAttention.openTimedQuestionCards()).toEqual([{ channelId, messageId }]);
      broker.close();
      await first.runtime.whenIdle();
      expect(first.channels.readMessages(channelId)).toHaveLength(1);
    } finally {
      await first.runtime.close();
      first.operationalDatabase.close();
    }

    let broker: ChannelUserQuestions | undefined;
    const second = createCore({
      dshHome: home,
      agents,
      activeQuestionMessageIds: () => broker?.activeMessageIds() ?? [],
    });
    try {
      const delivered: string[] = [];
      broker = new ChannelUserQuestions(
        second.channels,
        second.ownership,
        () => false,
        undefined,
        undefined,
        port(second, native, delivered),
      );
      await broker.recover(second.humanAttention.openTimedQuestionCards());
      expect(broker.status('ada', messageId, channelId)).toBe('pending');
      expect(
        second.humanAttention.list({ category: 'action', botSlug: 'ada' }).items,
      ).toMatchObject([{ kind: 'user-question', messageId }]);

      expect(await broker.answer('ada', messageId, answer)).toBe(true);
      expect(delivered).toEqual([`${sessionId}:call-1`]);
      expect(runs.map((run) => [run.sessionId, run.resume, run.message])).toEqual([
        [sessionId, true, ''],
      ]);
      expect(runs[0]?.inboundChannelId).toBe(channelId);
      native.current = { state: 'answered', answer };
      await broker.reconcileSession(sessionId);
      expect(second.humanAttention.openTimedQuestionCards()).toEqual([]);
      expect(broker.status('ada', messageId, channelId)).toBe('answered');
    } finally {
      broker?.close();
      await second.runtime.close();
      second.operationalDatabase.close();
    }
  });

  it('refuses recovery once the Orchestrator Session is archived or the card is not its own', async () => {
    const home = createTempRoot('bh-timed-question-archived-');
    const archived = new Set<string>();
    const agents: BotAgentAdapter = {
      async runOrchestrator() {
        throw new Error('No resumed turn expected');
      },
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
    };
    const core = createCore({
      dshHome: home,
      agents,
      workspaces: () => ({ archivedSessionIds: [...archived] }) as never,
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const channelId = core.channels.getOrCreateDm('ada', 'Ada')!.id;
      core.ownership.claim({
        sessionId,
        botSlug: 'ada',
        rootRole: 'orchestrator',
        at: '2026-10-13T09:00:00Z',
      });
      const card = await core.channels.appendMessage(channelId, {
        id: 'card',
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: 'Which release channel?',
        userQuestionRequest: { sessionId, callId: 'call-1', questions },
      });
      expect(card).toBeDefined();
      expect(core.runtime.recoverNativeQuestionInput?.(sessionId, channelId, 'card')).toBeTypeOf(
        'function',
      );
      expect(core.runtime.recoverNativeQuestionInput?.(sessionId, channelId, 'other')).toBe(
        undefined,
      );
      expect(core.runtime.recoverNativeQuestionInput?.('unowned', channelId, 'card')).toBe(
        undefined,
      );
      archived.add(sessionId);
      expect(core.runtime.nativeQuestionAvailable?.(sessionId, channelId)).toBe(false);
      expect(core.runtime.recoverNativeQuestionInput?.(sessionId, channelId, 'card')).toBe(
        undefined,
      );
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});

describe('the native timed question port', () => {
  function context(services: Record<string, unknown>) {
    return {
      get: (name: string) => services[name],
      logger: { warn: vi.fn() },
    } as unknown as Parameters<typeof nativeTimedQuestions>[0];
  }
  const runtime = {} as Parameters<typeof nativeTimedQuestions>[1];
  const view = (state: string) => ({
    active: [{ callId: 'call-1', questions, state }],
    settled: [],
  });

  it('reads a stored Session through the native projection and keeps the last live view', async () => {
    const roots: unknown[] = [];
    const session = { id: sessionId };
    let live = view('open');
    const restore = vi.fn(() => ({ snapshot: { values: { userQuestions: view('continued') } } }));
    const readSession = vi.fn(async () => ({
      session: { id: sessionId },
      inheritedEventCount: 0,
      events: [{ seq: 0 }],
    }));
    const services = {
      agents: { roots: () => roots },
      sessionProjections: {
        stateOf: () => ({ questions: live }),
        restore,
      },
      sessionQuery: { readSession },
      userQuestions: { answer: vi.fn(() => true) },
    };
    const port = nativeTimedQuestions(context(services), runtime, {
      get: () => undefined,
      list: () => [],
    });
    expect(port.read(sessionId, 'call-1')).toBeUndefined();
    await port.load?.([sessionId]);
    expect(readSession).toHaveBeenCalledWith(sessionId);
    expect(restore).toHaveBeenCalledWith({}, [{ seq: 0 }], 0, { id: sessionId }, 0);
    expect(port.read(sessionId, 'call-1')).toEqual({ state: 'continued' });
    expect(port.answer(sessionId, 'call-1', answer)).toBe(false);

    roots.push({ session });
    expect(port.read(sessionId, 'call-1')).toEqual({ state: 'open' });
    live = view('continued');
    expect(port.answer(sessionId, 'call-1', answer)).toBe(true);
    expect(services.userQuestions.answer).toHaveBeenCalledWith({ session }, 'call-1', answer);
    live = { active: [], settled: [{ callId: 'call-1', answers: answer.answers }] } as never;
    expect(port.read(sessionId, 'call-1')).toEqual({ state: 'answered', answer });
    roots.length = 0;
    expect(port.read(sessionId, 'call-1')).toEqual({ state: 'answered', answer });
  });

  it('skips Sessions that are live or unreadable', async () => {
    const readSession = vi.fn(async () => {
      throw new Error('missing');
    });
    const ctx = context({
      agents: { roots: () => [] },
      sessionProjections: { stateOf: () => undefined, restore: vi.fn() },
      sessionQuery: { readSession },
    });
    const port = nativeTimedQuestions(ctx, runtime, {
      get: (id) => (id === 'live' ? ({ id } as never) : undefined),
      list: () => [],
    });
    await port.load?.(['live', 'gone']);
    expect(readSession).toHaveBeenCalledTimes(1);
    expect(port.read('gone', 'call-1')).toBeUndefined();
  });
});
