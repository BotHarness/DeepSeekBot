import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { ChannelUserQuestions } from '../src/channels/user-questions.js';
import { createTempRoot } from './helpers.js';

const agents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  async close() {},
  requestAssignment() {
    throw new Error('No Assignment expected');
  },
};
const questions = [
  {
    id: 'release-route',
    question: 'Which release channel?',
    options: [{ label: 'Canary' }, { label: 'Stable' }],
  },
];
function fixture() {
  let broker: ChannelUserQuestions;
  let live = true;
  const home = createTempRoot('bh-inbox-question-');
  const core = createCore({
    dshHome: home,
    agents,
    activeQuestionMessageIds: () => broker?.activeMessageIds() ?? [],
  });
  broker = new ChannelUserQuestions(core.channels, core.ownership, () => live);
  core.companions.attachQuestions(broker);
  const methods = createBridgeMethods({ ...core, userQuestions: broker });
  const start = async (slug: string, signal?: AbortSignal) => {
    core.registry.create({ slug, displayName: slug });
    const channel = core.channels.getOrCreateDm(slug, slug)!;
    const sessionId = 'qa-' + slug;
    core.ownership.claim({
      sessionId,
      botSlug: slug,
      rootRole: 'orchestrator',
      at: '2026-10-01T09:00:00Z',
    });
    const agent = { session: { id: sessionId, header: { cwd: '/qa/release' } } } as Agent;
    const answer = broker.ask({ agent, questions, ...(signal ? { signal } : {}) });
    void answer.catch(() => undefined);
    await vi.waitFor(() => expect(core.channels.readMessages(channel.id)).toHaveLength(1));
    return {
      channelId: channel.id,
      message: core.channels.readMessages(channel.id)[0]!,
      answer,
      agent,
    };
  };
  return {
    home,
    core,
    broker,
    methods,
    start,
    expire: () => {
      live = false;
    },
  };
}
describe('Human Inbox question Host boundary', () => {
  it('projects only current committed questions, settles a competing answer once and does not resurrect history after owner replacement', async () => {
    const f = fixture();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const ada = await f.start('ada');
      const bea = await f.start('bea');
      const controller = new AbortController();
      const second = f.broker.ask({ agent: ada.agent, questions, signal: controller.signal });
      const cancelled = expect(second).rejects.toThrow(/cancelled/);
      await vi.waitFor(() => expect(f.broker.requests('ada')).toHaveLength(2));
      const copied = f.broker.requests('ada');
      copied[0]!.questions[0]!.options![0]!.label = 'mutated view';
      expect(f.broker.requests('ada')[0]!.questions[0]!.options![0]!.label).toBe('Canary');
      reader = f.core.companions
        .open(new Request('http://localhost/api/botharness/companion?botId=ada&dm=0'))
        .body!.getReader();
      const read = async () => {
        const text = new TextDecoder().decode((await reader!.read()).value);
        const data = /data: ([^\n]+)/u.exec(text)?.[1];
        if (!data) throw new Error('Missing companion snapshot');
        return JSON.parse(data) as { bot: { requests: unknown[] } };
      };
      expect((await read()).bot.requests).toMatchObject([
        {
          kind: 'user-question',
          botSlug: 'ada',
          channelId: 'dm-ada',
          messageId: ada.message.id,
          sessionId: 'qa-ada',
          questions,
        },
        {
          kind: 'user-question',
          botSlug: 'ada',
          channelId: 'dm-ada',
          sessionId: 'qa-ada',
          questions,
        },
      ]);
      const answer = { answers: [{ id: 'release-route', selected: ['Canary'] }] };
      const results = await Promise.all(
        [0, 1].map(() =>
          f.methods.userQuestionAnswer({ channelId: 'dm-ada', messageId: ada.message.id, answer }),
        ),
      );
      expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
      expect(await ada.answer).toEqual(answer);
      expect((await read()).bot.requests).toHaveLength(1);
      expect(f.broker.requests('bea')).toHaveLength(1);
      expect(
        f.core.channels
          .readMessages('dm-ada')
          .filter((message) => message.userQuestionResolution?.state === 'answered'),
      ).toHaveLength(1);
      controller.abort();
      await cancelled;
      expect((await read()).bot.requests).toEqual([]);
      const fresh = new ChannelUserQuestions(f.core.channels, f.core.ownership);
      f.core.companions.attachQuestions(fresh);
      await reader.cancel();
      reader = f.core.companions
        .open(new Request('http://localhost/api/botharness/companion?botId=ada&dm=0'))
        .body!.getReader();
      expect((await read()).bot.requests).toEqual([]);
      expect(fresh.requests('ada')).toEqual([]);
      f.broker.close();
      await bea.answer.catch(() => undefined);
    } finally {
      await reader?.cancel();
      f.broker.close();
      f.core.companions.close();
      await f.core.runtime.close();
      f.core.externalMessaging.close();
      f.core.live.close();
      f.core.operationalDatabase.close();
    }
  });
  it('pages handled decisions by stable scope, keeps reading independent and reconstructs after restart', async () => {
    const f = fixture();
    let expected: string[] = [];
    try {
      for (const slug of ['ada', 'bea', 'cy']) {
        const scene = await f.start(slug);
        expect(
          await f.methods.userQuestionAnswer({
            channelId: scene.channelId,
            messageId: scene.message.id,
            answer: { answers: [{ id: 'release-route', selected: ['Canary'] }] },
          }),
        ).toMatchObject({ ok: true });
        await scene.answer;
      }
      const all = f.core.humanAttention.list({ category: 'handled' });
      expected = all.items.map((item) => item.id);
      expect(expected).toHaveLength(3);
      const first = f.core.humanAttention.list({ category: 'handled', limit: 1 });
      const second = f.core.humanAttention.list({
        category: 'handled',
        limit: 1,
        cursor: first.nextCursor!,
      });
      expect([...first.items, ...second.items].map((item) => item.id)).toEqual(
        expected.slice(0, 2),
      );
      expect(
        f.core.humanAttention
          .list({ category: 'handled', sort: 'oldest' })
          .items.map((item) => item.id),
      ).toEqual([...expected].reverse());
      expect(
        f.methods.humanAttention({ category: 'handled', botSlug: 'ada', cursor: first.nextCursor }),
      ).toMatchObject({ ok: false });
      expect(
        f.methods.humanAttention({ category: 'handled', sort: 'oldest', cursor: first.nextCursor }),
      ).toMatchObject({ ok: false });
      expect(
        f.core.humanAttention.list({ category: 'handled', channelId: 'dm-ada' }).items,
      ).toMatchObject([{ botSlug: 'ada' }]);
      const pending = await f.start('dee');
      await f.core.channels.markRead(pending.channelId, pending.message.id);
      expect(f.core.humanAttention.status().hasAction).toBe(true);
      expect(
        f.core.humanAttention.list({ category: 'handled' }).items.map((item) => item.id),
      ).toEqual(expected);
      f.broker.close();
      await pending.answer.catch(() => undefined);
    } finally {
      f.broker.close();
      await f.core.runtime.close();
      f.core.operationalDatabase.close();
    }
    const reopened = createCore({ dshHome: f.home, agents });
    try {
      expect(
        reopened.humanAttention.list({ category: 'handled' }).items.map((item) => item.id),
      ).toEqual(expected);
    } finally {
      await reopened.runtime.close();
      reopened.operationalDatabase.close();
    }
  });

  it.each(['choice', 'custom'] as const)(
    'settles %s once through the canonical command and preserves other Bot work',
    async (mode) => {
      const f = fixture();
      try {
        const ada = await f.start('ada');
        const bea = await f.start('bea');
        expect(f.methods.humanAttention({ category: 'action' })).toMatchObject({
          ok: true,
          value: {
            items: [
              { botSlug: 'ada', kind: 'user-question' },
              { botSlug: 'bea', kind: 'user-question' },
            ],
          },
        });
        expect(
          f.methods.channelTimeline({
            channelId: ada.channelId,
            direction: 'around',
            around: ada.message.id,
            olderLimit: 2,
            newerLimit: 2,
          }),
        ).toMatchObject({
          ok: true,
          value: { page: { entries: [{ userQuestionRequest: { questions } }] } },
        });
        const answer = {
          answers: [
            mode === 'choice'
              ? { id: 'release-route', selected: ['Canary'] }
              : { id: 'release-route', selected: [], custom: 'Nightly QA' },
          ],
        };
        expect(
          await f.methods.userQuestionAnswer({
            channelId: bea.channelId,
            messageId: ada.message.id,
            answer,
          }),
        ).toMatchObject({ ok: false });
        expect(
          await f.methods.userQuestionAnswer({
            channelId: ada.channelId,
            messageId: ada.message.id,
            answer: { answers: [{ id: 'release-route', selected: ['Invented'] }] },
          }),
        ).toMatchObject({ ok: false });
        expect(
          f.methods.userQuestionStatus({ channelId: ada.channelId, messageId: ada.message.id }),
        ).toMatchObject({ ok: true, value: { status: 'pending' } });
        const results = await Promise.all([
          f.methods.userQuestionAnswer({
            channelId: ada.channelId,
            messageId: ada.message.id,
            answer,
          }),
          f.methods.userQuestionAnswer({
            channelId: ada.channelId,
            messageId: ada.message.id,
            answer,
          }),
        ]);
        expect(results.map((r) => r.ok).sort()).toEqual([false, true]);
        expect(await ada.answer).toEqual(answer);
        const response = f.core.channels
          .readMessages(ada.channelId)
          .find((m) => m.userQuestionResolution)!;
        const handled = f.methods.humanAttention({ category: 'handled', botSlug: 'ada' });
        if (!handled.ok) throw new Error(JSON.stringify(handled.error));
        expect(handled).toMatchObject({
          ok: true,
          value: {
            items: [
              {
                category: 'handled',
                kind: 'user-question',
                channelId: ada.channelId,
                messageId: ada.message.id,
                responseMessageId: response.id,
              },
            ],
          },
        });

        expect(
          f.core.channels
            .readMessages(ada.channelId)
            .filter((m) => m.author.kind === 'human' && m.userQuestionResolution),
        ).toMatchObject([
          {
            replyTo: ada.message.id,
            userQuestionResolution: {
              requestMessageId: ada.message.id,
              state: 'answered',
              answers: answer.answers,
            },
          },
        ]);
        expect(f.methods.humanAttention({ category: 'action' })).toMatchObject({
          ok: true,
          value: { items: [{ botSlug: 'bea' }] },
        });
        expect(
          await f.methods.userQuestionAnswer({
            channelId: ada.channelId,
            messageId: ada.message.id,
            answer,
          }),
        ).toMatchObject({ ok: false });
        f.broker.close();
        await bea.answer.catch(() => undefined);
      } finally {
        f.broker.close();
        await f.core.runtime.close();
        f.core.operationalDatabase.close();
      }
    },
  );
  it.each(['cancelled', 'expired'] as const)(
    'rejects %s work without accepting a Human answer',
    async (cause) => {
      const f = fixture();
      const abort = new AbortController();
      try {
        const pending = await f.start('ada', abort.signal);
        if (cause === 'cancelled') abort.abort();
        else f.expire();
        expect(
          await f.methods.userQuestionAnswer({
            channelId: pending.channelId,
            messageId: pending.message.id,
            answer: { answers: [{ id: 'release-route', selected: ['Canary'] }] },
          }),
        ).toMatchObject({ ok: false });
        await expect(pending.answer).rejects.toThrow(/cancelled/);
        expect(f.methods.humanAttention({ category: 'action' })).toMatchObject({
          ok: true,
          value: { items: [] },
        });
        expect(
          f.core.channels.readMessages(pending.channelId).filter((m) => m.author.kind === 'human'),
        ).toHaveLength(0);
      } finally {
        f.broker.close();
        await f.core.runtime.close();
        f.core.operationalDatabase.close();
      }
    },
  );
});
