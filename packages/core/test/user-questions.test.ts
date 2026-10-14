import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { Agent } from '@deepseek-ai/dsh-agent';

import { createChannelStore } from '../src/channels/store.js';
import { ChannelUserQuestions, type TimedQuestionPort } from '../src/channels/user-questions.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTempRoot, createTestOwnership } from './helpers.js';

const sessionId = 'botharness-orchestrator-question-test';
const channelId = 'dm-ada';
const questions = [
  {
    id: 'memory-branch',
    question: 'Which Memory branch should I switch to?',
    options: [
      { label: 'main', description: 'Current branch' },
      { label: 'history-qa', description: 'Earlier memory' },
    ],
  },
];

function fixture(role: 'orchestrator' | 'assignment' = 'orchestrator', timed?: TimedQuestionPort) {
  const channels = createChannelStore({
    rootDir: join(createTempRoot('bh-question-'), 'channels'),
  });
  channels.getOrCreateDm('ada', 'Ada');
  const ownership = createTestOwnership({ [sessionId]: { botSlug: 'ada', rootRole: role } });
  const agent = { session: { id: sessionId, header: { cwd: '/tmp/memory' } } } as Agent;
  let live = true;
  const warn = vi.fn();
  const states = createBotStateTracker();
  states.setSessionState('ada', sessionId, 'working', undefined, 'orchestrator');
  const answerer = new ChannelUserQuestions(
    channels,
    ownership,
    (candidate) => candidate === agent && live,
    warn,
    (slug, count) => states.setQuestionCount(slug, count),
    timed,
  );
  return {
    channels,
    ownership,
    agent,
    answerer,
    warn,
    states,
    setLive: (value: boolean) => {
      live = value;
    },
  };
}

describe('native DSH questions in a PersonaBot DM', () => {
  it('commits a card, validates the Human answer, and resumes the same waiting request', async () => {
    const state = fixture();
    const wait = state.answerer.ask({ agent: state.agent, questions });
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(1));
    const request = state.channels.readMessages(channelId)[0]!;
    expect(request.userQuestionRequest).toEqual({ sessionId, questions });
    expect(state.answerer.status('ada', request.id)).toBe('pending');
    expect(state.states.snapshot('ada')).toMatchObject({
      state: 'working',
      attention: { approvalCount: 0, questionCount: 1 },
    });
    expect(state.answerer.activeMessageIds()).toEqual([request.id]);
    expect(
      await state.answerer.answer('other-bot', request.id, {
        answers: [{ id: 'memory-branch', selected: ['history-qa'] }],
      }),
    ).toBe(false);
    expect(
      await state.answerer.answer('ada', request.id, {
        answers: [{ id: 'memory-branch', selected: ['unoffered'] }],
      }),
    ).toBe(false);
    const expected = { answers: [{ id: 'memory-branch', selected: ['history-qa'] }] };
    expect(await state.answerer.answer('ada', request.id, expected)).toBe(true);
    expect(await wait).toEqual(expected);
    expect(state.states.snapshot('ada').attention).toBeUndefined();
    expect(
      state.channels
        .readMessages(channelId)
        .find((item) => item.userQuestionResolution !== undefined)?.userQuestionResolution,
    ).toEqual({
      requestMessageId: request.id,
      state: 'answered',
      answers: expected.answers,
    });
    expect(state.answerer.status('ada', request.id)).toBe('expired');
    expect(state.answerer.activeMessageIds()).toEqual([]);
    expect(await state.answerer.answer('ada', request.id, expected)).toBe(false);
  });

  it('posts a card for more than three questions and a long question instead of leaving them to DSH', async () => {
    const state = fixture();
    const many = Array.from({ length: 5 }, (_, index) => ({
      id: 'q' + index,
      question: 'Question ' + index + '?',
      ...(index === 0 ? { detail: 'x'.repeat(20_000) } : {}),
      options: [{ label: 'yes' }, { label: 'no' }],
    }));
    const wait = state.answerer.ask({ agent: state.agent, questions: many });
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(1));
    const request = state.channels.readMessages(channelId)[0]!;
    expect(request.userQuestionRequest?.questions).toHaveLength(5);
    const expected = { answers: many.map((item) => ({ id: item.id, selected: ['yes'] })) };
    expect(await state.answerer.answer('ada', request.id, expected)).toBe(true);
    expect(await wait).toEqual(expected);
  });

  it('accepts a free-text answer and prevents a stopped or stale Session from resuming', async () => {
    const state = fixture();
    const controller = new AbortController();
    const wait = state.answerer.ask({ agent: state.agent, questions, signal: controller.signal });
    const rejected = expect(wait).rejects.toThrow(/cancelled/);
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(1));
    const request = state.channels.readMessages(channelId)[0]!;
    controller.abort();
    await rejected;
    expect(state.states.snapshot('ada').attention).toBeUndefined();
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(2));
    expect(
      state.channels
        .readMessages(channelId)
        .find((item) => item.userQuestionResolution !== undefined)?.userQuestionResolution?.state,
    ).toBe('cancelled');
    expect(state.answerer.status('ada', request.id)).toBe('expired');
    expect(state.answerer.activeMessageIds()).toEqual([]);
    expect(
      await state.answerer.answer('ada', request.id, {
        answers: [{ id: 'memory-branch', selected: [], custom: 'my-history' }],
      }),
    ).toBe(false);
  });

  it('expires a stale live Agent without accepting a late answer', async () => {
    const state = fixture();
    const wait = state.answerer.ask({ agent: state.agent, questions });
    const rejected = expect(wait).rejects.toThrow(/cancelled/);
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(1));
    const id = state.channels.readMessages(channelId)[0]!.id;
    state.setLive(false);
    expect(state.answerer.status('ada', id)).toBe('expired');
    expect(
      await state.answerer.answer('ada', id, {
        answers: [{ id: 'memory-branch', selected: ['history-qa'] }],
      }),
    ).toBe(false);
    await rejected;
    expect(state.states.snapshot('ada').attention).toBeUndefined();
    expect(state.answerer.status('ada', id)).toBe('expired');
    await vi.waitFor(() =>
      expect(state.channels.readMessages(channelId)[0]?.userQuestionResolution?.state).toBe(
        'cancelled',
      ),
    );
  });

  it('keeps cancellation final when a Session stops during answer persistence', async () => {
    const state = fixture();
    const controller = new AbortController();
    const wait = state.answerer.ask({ agent: state.agent, questions, signal: controller.signal });
    const rejected = expect(wait).rejects.toThrow(/cancelled/);
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(1));
    const id = state.channels.readMessages(channelId)[0]!.id;
    const append = state.channels.appendMessage.bind(state.channels);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(state.channels, 'appendMessage').mockImplementation(async (channel, message) => {
      const saved = await append(channel, message);
      if (message.userQuestionResolution?.state === 'answered') await gate;
      return saved;
    });
    const answer = state.answerer.answer('ada', id, {
      answers: [{ id: 'memory-branch', selected: ['history-qa'] }],
    });
    await vi.waitFor(() =>
      expect(
        state.channels
          .readMessages(channelId)
          .some((item) => item.userQuestionResolution?.state === 'answered'),
      ).toBe(true),
    );
    controller.abort();
    release();
    expect(await answer).toBe(false);
    await rejected;
    expect(state.states.snapshot('ada').attention).toBeUndefined();
    await vi.waitFor(() =>
      expect(state.channels.readMessages(channelId)[0]?.userQuestionResolution?.state).toBe(
        'cancelled',
      ),
    );
  });

  it('leaves Assignment questions to another native answerer', async () => {
    const state = fixture('assignment');
    expect(await state.answerer.ask({ agent: state.agent, questions })).toBeUndefined();
    expect(state.channels.readMessages(channelId)).toHaveLength(0);
  });

  it('allows custom answers but rejects incomplete or fabricated option sets', async () => {
    const state = fixture();
    const wait = state.answerer.ask({ agent: state.agent, questions });
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(1));
    const id = state.channels.readMessages(channelId)[0]!.id;
    expect(await state.answerer.answer('ada', id, { answers: [] })).toBe(false);
    expect(
      await state.answerer.answer('ada', id, {
        answers: [{ id: 'memory-branch', selected: ['main', 'history-qa'] }],
      }),
    ).toBe(false);
    expect(
      await state.answerer.answer('ada', id, {
        answers: [{ id: 'memory-branch', selected: ['main'], custom: 'another-branch' }],
      }),
    ).toBe(false);
    const expected = { answers: [{ id: 'memory-branch', selected: [], custom: 'another-branch' }] };
    expect(await state.answerer.answer('ada', id, expected)).toBe(true);
    expect(await wait).toEqual(expected);
    expect(state.states.snapshot('ada').attention).toBeUndefined();
  });
});

describe('native timed question card continuation', () => {
  it('also waits for native settlement when the answer arrives before the deadline', async () => {
    const answer = { answers: [{ id: 'memory-branch', selected: ['main'] }] };
    let native: ReturnType<TimedQuestionPort['read']> = { state: 'open' };
    const port: TimedQuestionPort = { read: () => native, answer: vi.fn(() => true) };
    const state = fixture('orchestrator', port);
    const wait = state.answerer.ask({
      agent: state.agent,
      questions,
      wait: { callId: 'in-time', timed: true },
    } as Parameters<ChannelUserQuestions['ask']>[0]);
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(1));
    const id = state.channels.readMessages(channelId)[0]!.id;
    expect(await state.answerer.answer('ada', id, answer)).toBe(true);
    expect(await wait).toEqual(answer);
    expect(state.channels.readMessages(channelId)).toHaveLength(1);
    expect(state.answerer.status('ada', id)).toBe('submitted');
    expect(port.answer).not.toHaveBeenCalled();
    native = { state: 'answered', answer };
    await state.answerer.reconcileSession(sessionId);
    expect(state.answerer.status('ada', id)).toBe('answered');
  });
  async function continued() {
    const answer = { answers: [{ id: 'memory-branch', selected: ['history-qa'] }] };
    let native: ReturnType<TimedQuestionPort['read']> = { state: 'open' };
    const port: TimedQuestionPort = { read: vi.fn(() => native), answer: vi.fn(() => true) };
    const state = fixture('orchestrator', port);
    const controller = new AbortController();
    const wait = state.answerer.ask({
      agent: state.agent,
      questions,
      signal: controller.signal,
      wait: { callId: 'original', timed: true },
    } as Parameters<ChannelUserQuestions['ask']>[0]);
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(1));
    const id = state.channels.readMessages(channelId)[0]!.id;
    const error = Object.assign(new Error('native deadline'), {
      name: 'UserQuestionError',
      code: 'ASK_TIMED_OUT',
    });
    const rejected = expect(wait).rejects.toBe(error);
    controller.abort(error);
    await rejected;
    native = { state: 'continued' };
    return {
      ...state,
      port,
      id,
      answer,
      setNative: (value: typeof native) => {
        native = value;
      },
    };
  }

  it('keeps the original card answerable after the foreground ends and settles only on native admission', async () => {
    const state = await continued();
    expect(state.channels.readMessages(channelId)).toHaveLength(1);
    expect(state.channels.readMessages(channelId)[0]?.userQuestionRequest?.callId).toBe('original');
    expect(state.answerer.status('ada', state.id)).toBe('pending');
    expect(state.answerer.requests('ada')).toMatchObject([
      { messageId: state.id, callId: 'original' },
    ]);
    expect(state.answerer.activeSessionIds()).toEqual([sessionId]);
    expect(state.states.snapshot('ada').attention?.questionCount).toBe(1);
    expect(await state.answerer.answer('other', state.id, state.answer)).toBe(false);
    expect(await state.answerer.answer('ada', state.id, { answers: [] })).toBe(false);
    expect(state.port.answer).not.toHaveBeenCalled();
    expect(await state.answerer.answer('ada', state.id, state.answer)).toBe(true);
    expect(state.port.answer).toHaveBeenCalledWith(sessionId, 'original', state.answer);
    expect(state.answerer.status('ada', state.id)).toBe('submitted');
    expect(state.answerer.requests('ada')).toMatchObject([
      { messageId: state.id, callId: 'original' },
    ]);
    await state.answerer.reconcileSession(sessionId);
    expect(state.channels.readMessages(channelId)).toHaveLength(1);
    expect(await state.answerer.answer('ada', state.id, state.answer)).toBe(false);
    state.setNative({ state: 'answered', answer: state.answer });
    await state.answerer.reconcileSession(sessionId);
    expect(state.channels.readMessages(channelId)[0]?.userQuestionResolution).toMatchObject({
      state: 'answered',
      answers: state.answer.answers,
    });
    expect(state.answerer.status('ada', state.id)).toBe('answered');
    expect(state.answerer.requests('ada')).toEqual([]);
    expect(state.answerer.activeMessageIds()).toEqual([]);
    expect(state.states.snapshot('ada').attention).toBeUndefined();
  });

  it('lets a discarded native reply be submitted again without falsely recording an answer', async () => {
    const state = await continued();
    expect(await state.answerer.answer('ada', state.id, state.answer)).toBe(true);
    state.answerer.discardReply(sessionId, 'other-call');
    expect(state.answerer.status('ada', state.id)).toBe('submitted');
    state.answerer.discardReply(sessionId, 'original');
    expect(state.answerer.status('ada', state.id)).toBe('pending');
    expect(state.channels.readMessages(channelId)).toHaveLength(1);
    expect(await state.answerer.answer('ada', state.id, state.answer)).toBe(true);
    state.answerer.close();
  });

  it('fails closed for changed ownership and a missing native question', async () => {
    for (const invalidate of [
      (state: Awaited<ReturnType<typeof continued>>) => state.setNative(undefined),
      (state: Awaited<ReturnType<typeof continued>>) => {
        vi.spyOn(state.ownership, 'resolve').mockReturnValue(undefined);
      },
    ]) {
      const state = await continued();
      invalidate(state);
      expect(state.answerer.status('ada', state.id)).toBe('expired');
      expect(await state.answerer.answer('ada', state.id, state.answer)).toBe(false);
      expect(state.port.answer).not.toHaveBeenCalled();
      expect(state.states.snapshot('ada').attention).toBeUndefined();
    }
  });
});

describe('timed question cards outlive their asking Agent', () => {
  function recoveringPort(native: () => ReturnType<TimedQuestionPort['read']>) {
    const delivered: string[][] = [];
    const port = {
      read: vi.fn(() => native()),
      answer: vi.fn(() => true),
      available: vi.fn(() => true),
      bind: vi.fn(() => undefined),
      recover: vi.fn((sessionId: string, channel: string, messageId: string) => {
        delivered.push([sessionId, channel, messageId]);
        return async (deliver: () => boolean) => deliver();
      }),
    } satisfies TimedQuestionPort;
    return { port, delivered };
  }

  async function askTimed(state: ReturnType<typeof fixture>, callId = 'original') {
    const controller = new AbortController();
    const wait = state.answerer.ask({
      agent: state.agent,
      questions,
      signal: controller.signal,
      wait: { callId, timed: true },
    } as Parameters<ChannelUserQuestions['ask']>[0]);
    void wait.catch(() => undefined);
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(1));
    return { controller, id: state.channels.readMessages(channelId)[0]!.id };
  }

  const answer = { answers: [{ id: 'memory-branch', selected: ['history-qa'] }] };

  it('keeps the card open across a Host restart and answers it through the resumed Session', async () => {
    let native: ReturnType<TimedQuestionPort['read']> = { state: 'open' };
    const before = recoveringPort(() => native);
    const state = fixture('orchestrator', before.port);
    const { id } = await askTimed(state);
    state.answerer.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(state.channels.readMessages(channelId)).toHaveLength(1);

    const states = createBotStateTracker();
    const after = recoveringPort(() => native);
    const restarted = new ChannelUserQuestions(
      state.channels,
      state.ownership,
      () => false,
      vi.fn(),
      (slug, count) => states.setQuestionCount(slug, count),
      after.port,
    );
    expect(restarted.status('ada', id)).toBe('expired');
    await restarted.recover([{ channelId, messageId: id }]);
    expect(restarted.status('ada', id)).toBe('pending');
    expect(restarted.requests('ada')).toMatchObject([{ messageId: id, callId: 'original' }]);
    expect(restarted.activeMessageIds()).toEqual([id]);
    expect(states.snapshot('ada').attention?.questionCount).toBe(1);

    after.port.recover.mockImplementationOnce((sessionId, channel, messageId) => {
      after.delivered.push([sessionId, channel, messageId]);
      return async (deliver) => {
        native = { state: 'continued' };
        return deliver();
      };
    });
    expect(await restarted.answer('ada', id, answer)).toBe(true);
    expect(after.delivered).toEqual([[sessionId, channelId, id]]);
    expect(after.port.answer).toHaveBeenCalledWith(sessionId, 'original', answer);
    expect(restarted.status('ada', id)).toBe('submitted');
    native = { state: 'answered', answer };
    await restarted.reconcileSession(sessionId);
    expect(
      state.channels.readMessages(channelId).find((item) => item.userQuestionResolution)
        ?.userQuestionResolution,
    ).toEqual({
      requestMessageId: id,
      state: 'answered',
      answers: answer.answers,
    });
    expect(restarted.status('ada', id)).toBe('answered');
    expect(states.snapshot('ada').attention).toBeUndefined();
  });

  it('records a native answer settled while the Host was down', async () => {
    const { port } = recoveringPort(() => ({ state: 'answered', answer }));
    const state = fixture('orchestrator', port);
    const message = await state.channels.appendMessage(channelId, {
      id: 'recovered-card',
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: 'ada' },
      body: questions[0]!.question,
      userQuestionRequest: { sessionId, callId: 'original', questions },
    });
    expect(message).toBeDefined();
    await state.answerer.recover([{ channelId, messageId: 'recovered-card' }]);
    expect(state.answerer.status('ada', 'recovered-card')).toBe('answered');
    expect(state.answerer.activeMessageIds()).toEqual([]);
  });

  it('recovers nothing for a missing native question, another owner, an unavailable Session or a blocking card', async () => {
    for (const setup of [
      (port: ReturnType<typeof recoveringPort>['port']) => port.read.mockReturnValue(undefined),
      (port: ReturnType<typeof recoveringPort>['port']) => port.available.mockReturnValue(false),
      (_port: unknown, state: ReturnType<typeof fixture>) =>
        vi.spyOn(state.ownership, 'resolve').mockReturnValue(undefined),
    ]) {
      const { port } = recoveringPort(() => ({ state: 'continued' }));
      const state = fixture('orchestrator', port);
      await state.channels.appendMessage(channelId, {
        id: 'card',
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: 'card',
        userQuestionRequest: { sessionId, callId: 'original', questions },
      });
      setup(port, state);
      await state.answerer.recover([{ channelId, messageId: 'card' }]);
      expect(state.answerer.activeMessageIds()).toEqual([]);
      expect(state.channels.readMessages(channelId)).toHaveLength(1);
      expect(state.states.snapshot('ada').attention).toBeUndefined();
    }
    const { port } = recoveringPort(() => ({ state: 'continued' }));
    const state = fixture('orchestrator', port);
    await state.channels.appendMessage(channelId, {
      id: 'blocking',
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: 'ada' },
      body: 'blocking',
      userQuestionRequest: { sessionId, questions },
    });
    await state.answerer.recover([{ channelId, messageId: 'blocking' }]);
    expect(state.answerer.activeMessageIds()).toEqual([]);
  });

  it('keeps a timed card answerable when its Agent is disposed or goes stale', async () => {
    for (const end of [
      (state: ReturnType<typeof fixture>) => state.answerer.cancelSession(sessionId),
      (state: ReturnType<typeof fixture>) => state.setLive(false),
    ]) {
      let native: ReturnType<TimedQuestionPort['read']> = { state: 'continued' };
      const { port, delivered } = recoveringPort(() => native);
      const state = fixture('orchestrator', port);
      const { id } = await askTimed(state);
      end(state);
      expect(state.answerer.status('ada', id)).toBe('pending');
      expect(state.states.snapshot('ada').attention?.questionCount).toBe(1);
      expect(await state.answerer.answer('ada', id, answer)).toBe(true);
      expect(delivered).toEqual([[sessionId, channelId, id]]);
      expect(port.answer).toHaveBeenCalledWith(sessionId, 'original', answer);
      native = undefined;
      state.answerer.discardReply(sessionId, 'original');
      expect(state.answerer.status('ada', id)).toBe('expired');
    }
  });

  it('cancels the card when a stopped turn drops the native question', async () => {
    let native: ReturnType<TimedQuestionPort['read']> = { state: 'open' };
    const { port } = recoveringPort(() => native);
    const state = fixture('orchestrator', port);
    const { controller, id } = await askTimed(state);
    controller.abort(new Error('turn stopped'));
    expect(state.answerer.status('ada', id)).toBe('pending');
    expect(await state.answerer.answer('ada', id, answer)).toBe(false);
    native = undefined;
    await state.answerer.reconcileSession(sessionId);
    await vi.waitFor(() =>
      expect(
        state.channels.readMessages(channelId).find((item) => item.userQuestionResolution)
          ?.userQuestionResolution?.state,
      ).toBe('cancelled'),
    );
    expect(state.answerer.activeMessageIds()).toEqual([]);
  });

  it('still cancels a blocking card on Host shutdown', async () => {
    const state = fixture();
    const wait = state.answerer.ask({ agent: state.agent, questions });
    const rejected = expect(wait).rejects.toThrow(/cancelled/);
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(1));
    state.answerer.close();
    await rejected;
    await vi.waitFor(() =>
      expect(
        state.channels.readMessages(channelId).find((item) => item.userQuestionResolution)
          ?.userQuestionResolution?.state,
      ).toBe('cancelled'),
    );
  });
});

describe('live question attention authority', () => {
  it('counts committed requests, combines approvals, and independently clears each source', async () => {
    const state = fixture();
    const original = state.states.snapshot('ada');
    state.states.setApprovalCount('ada', 2);
    const first = state.answerer.ask({ agent: state.agent, questions });
    const second = state.answerer.ask({ agent: state.agent, questions });
    await vi.waitFor(() => expect(state.states.snapshot('ada').attention?.questionCount).toBe(2));
    const ids = state.answerer.activeMessageIds();
    const answer = { answers: [{ id: 'memory-branch', selected: ['main'] }] };
    expect(await state.answerer.answer('ada', ids[0]!, answer)).toBe(true);
    await first;
    expect(state.states.snapshot('ada').attention).toEqual({ approvalCount: 2, questionCount: 1 });
    expect(await state.answerer.answer('ada', ids[1]!, answer)).toBe(true);
    await second;
    expect(state.states.snapshot('ada')).toEqual({ ...original, attention: { approvalCount: 2 } });
    state.states.setApprovalCount('ada', 0);
    expect(state.states.snapshot('ada')).toEqual(original);
    const fresh = new ChannelUserQuestions(state.channels, state.ownership);
    expect(fresh.activeMessageIds()).toEqual([]);
    expect(createBotStateTracker().snapshot('ada').attention).toBeUndefined();
  });

  it('does not publish an uncommitted or failed request, including abort during persistence', async () => {
    const state = fixture();
    let release!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const append = state.channels.appendMessage.bind(state.channels);
    vi.spyOn(state.channels, 'appendMessage').mockImplementation(async (channel, message) => {
      if (message.userQuestionRequest) await gate;
      return append(channel, message);
    });
    const controller = new AbortController();
    const request = state.answerer.ask({
      agent: state.agent,
      questions,
      signal: controller.signal,
    });
    const rejected = expect(request).rejects.toThrow(/cancelled/);
    expect(state.states.snapshot('ada').attention).toBeUndefined();
    expect(state.answerer.requests('ada')).toEqual([]);
    controller.abort();
    release();
    await rejected;
    expect(state.states.snapshot('ada').attention).toBeUndefined();
    vi.mocked(state.channels.appendMessage).mockRejectedValueOnce(new Error('storage failed'));
    await expect(state.answerer.ask({ agent: state.agent, questions })).rejects.toThrow(
      'storage failed',
    );
    expect(state.states.snapshot('ada').attention).toBeUndefined();
    expect(state.answerer.activeMessageIds()).toEqual([]);
  });

  it('clears disposed Sessions and close without requiring a query or changing execution', async () => {
    const state = fixture();
    const request = state.answerer.ask({ agent: state.agent, questions });
    const rejected = expect(request).rejects.toThrow(/cancelled/);
    await vi.waitFor(() => expect(state.states.snapshot('ada').attention?.questionCount).toBe(1));
    state.answerer.cancelSession(sessionId);
    await rejected;
    expect(state.states.snapshot('ada').attention).toBeUndefined();
    expect(state.states.snapshot('ada').state).toBe('working');
    const next = state.answerer.ask({ agent: state.agent, questions });
    const closed = expect(next).rejects.toThrow(/cancelled/);
    await vi.waitFor(() => expect(state.states.snapshot('ada').attention?.questionCount).toBe(1));
    state.answerer.close();
    await closed;
    expect(state.states.snapshot('ada').attention).toBeUndefined();
  });
});
