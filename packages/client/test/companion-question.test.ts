// @vitest-environment jsdom
import { act, createElement, type ReactNode, type InputHTMLAttributes } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WindowCompanions } from '../src/client/window-companions.js';
import { WindowCompanionsView } from '../src/client/window-companions-view.js';
import { createActions, type BridgeActions } from '../src/client/actions.js';
import { store, type ChannelMessage } from '../src/client/store.js';
import { zhTranslate } from '../src/client/locale.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { UserQuestionCard } from '../src/client/user-question-card.js';
import { companionRequests } from '../src/client/companion-requests.js';
import { BotModePrefs } from '../src/client/bot-mode-prefs.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, variant: _variant, ...props }: { children: ReactNode; variant?: string }) =>
    createElement('button', props, children),
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  Menu: () => null,
  IconEllipsisOutlineRegular: () => null,
  IconCloseFillRegular: () => null,
  IconNewChatOutlineRegular: () => null,
  MarkdownText: () => null,
  StateDot: () => null,
}));

const questions = [
  {
    id: 'branch',
    header: 'Memory',
    question: 'Which branch?',
    options: [
      { label: 'main', description: 'Current branch' },
      { label: 'history', description: 'Earlier memory' },
    ],
  },
  {
    id: 'tasks',
    question: 'Which tasks?',
    multiSelect: true,
    options: [{ label: 'Read' }, { label: 'Summarize' }],
  },
  { id: 'note', question: 'Any instructions?', detail: 'Answer in your own words' },
];
const request = {
  kind: 'user-question' as const,
  botSlug: 'ada',
  channelId: 'dm-ada',
  channelName: 'Ada',
  messageId: 'question',
  sessionId: 'owned-session',
  questions,
};
const message: ChannelMessage = {
  id: 'question',
  at: '2026-10-08T09:00:00Z',
  author: { kind: 'bot', slug: 'ada' },
  body: 'Which branch?',
  userQuestionRequest: request,
};

function input(node: Element, index: number, value: string): void {
  const field = node.querySelectorAll<HTMLInputElement>('input:not([type=checkbox])')[index]!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
function button(node: Element, text: string): HTMLButtonElement {
  return [...node.querySelectorAll<HTMLButtonElement>('button')].find((entry) =>
    entry.textContent?.includes(text),
  )!;
}
function choice(node: Element, text: string): HTMLLabelElement {
  return [...node.querySelectorAll<HTMLLabelElement>('label.bh-card-main')].find((entry) =>
    entry.textContent?.includes(text),
  )!;
}

it('keeps all question drafts through speech, reading, offline and current-state reconciliation, then answers once without switching Channel', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  const old = store.getSnapshot();
  const events = new EventTarget();
  let revision = 0;
  let pending = true;
  const answers: unknown[] = [];
  const prefs = new BotModePrefs();
  const call: BridgeCall = async (endpoint, payload) => {
    if (endpoint === 'userQuestionStatus')
      return { ok: true, value: { status: pending ? 'pending' : 'expired' } };
    if (endpoint === 'userQuestionAnswer') {
      answers.push(payload);
      pending = false;
      snapshot();
      return { ok: true, value: { accepted: true } };
    }
    if (endpoint === 'toolApprovalStatus') return { ok: true, value: { status: 'pending' } };
    if (endpoint === 'humanAttentionStatus')
      return { ok: true, value: { unreadCount: 0, hasAction: true } };
    throw new Error(endpoint);
  };
  const companion = new WindowCompanions({
    context: async () => ({ profileId: 'question-qa' }),
    source: () => ({
      readyState: 1,
      addEventListener: events.addEventListener.bind(events),
      close() {},
    }),
    update: async (value) => {
      revision = value.revision;
    },
  });
  const approval = {
    kind: 'tool-approval',
    botSlug: 'ada',
    channelId: 'dm-ada',
    channelName: 'Ada',
    messageId: 'approval',
    sessionId: 'owned-session',
    callId: 'call',
    toolName: 'bash',
    role: 'orchestrator',
    cwd: '/qa',
    input: 'echo QA',
    expiresAt: '2099-10-08T00:00:00Z',
  };
  const emit = (name: string, data: unknown) =>
    events.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) }));
  const snapshot = () =>
    emit('companion/selection', {
      profileId: 'question-qa',
      consumerId: 'live',
      selectionRevision: revision,
      bots: [
        {
          slug: 'ada',
          name: 'Ada',
          paused: false,
          requests: [approval, ...(pending ? [request] : [])],
        },
      ],
      activity: { generation: 'host', revision, bots: [] },
    });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  try {
    store.select({ kind: 'channel', channelId: 'unrelated' });
    await companion.start();
    companion.select('ada');
    companion.configureCapacity({ layers: 1, retention: 1 });
    companion.get('ada')!.configure({ activity: false, dm: false, group: false });
    emit('companion/baseline', {
      profileId: 'question-qa',
      consumerId: 'live',
      bots: [],
      activity: { generation: 'host', revision: 0, bots: [] },
    });
    await Promise.resolve();
    snapshot();
    await act(async () =>
      root.render(
        createElement(WindowCompanionsView, {
          companion,
          prefs,
          actions: createActions(call, store),
          t: zhTranslate,
          openDm() {},
          openAttention() {},
          openChannel() {},
        }),
      ),
    );
    expect(node.querySelectorAll('.bh-companion-pending > ol > li')).toHaveLength(1);
    expect(node.querySelector('.bh-question-card')).toBeNull();
    expect(node.textContent).toContain('1/2');
    await act(() => node.querySelector<HTMLButtonElement>('[aria-label="下一项请求"]')!.click());
    expect(node.textContent).toContain('2/2');
    const card = () => node.querySelector('.bh-question-card')!;
    expect(card().textContent).toContain('Any instructions?');
    expect(card().textContent).not.toContain('Current branch');
    expect(card().textContent).not.toContain('Answer in your own words');
    await act(() => button(card(), '详情').click());
    expect(card().textContent).toContain('Current branch');
    expect(card().textContent).toContain('Answer in your own words');
    expect(card().querySelector('[aria-pressed="true"]')).toBeNull();
    await act(() => button(card(), '回答并继续').click());
    expect(answers).toEqual([]);
    await act(() => button(card(), 'main').click());
    await act(() => input(card(), 0, 'custom-branch'));
    expect(button(card(), 'main').getAttribute('aria-pressed')).toBe('false');
    await act(() => button(card(), 'history').click());
    expect(card().querySelectorAll<HTMLInputElement>('input:not([type=checkbox])')[0]!.value).toBe(
      '',
    );
    await act(() => choice(card(), 'Read').click());
    await act(() => choice(card(), 'Summarize').click());
    expect(
      [...card().querySelectorAll<HTMLInputElement>('input[type=checkbox]')].map(
        (field) => field.checked,
      ),
    ).toEqual([true, true]);
    expect(
      [...card().querySelectorAll('.bh-question-letter')].map((entry) => entry.textContent),
    ).toEqual(['A', 'B', 'A', 'B']);
    await act(() => input(card(), 1, 'also check status'));
    await act(() => input(card(), 2, 'Keep it short'));
    await act(() => {
      companion.get('ada')!.configure({ dm: true });
      snapshot();
    });
    await act(() => {
      emit('companion/message', {
        generation: 'host',
        botId: 'ada',
        messageId: 'speech',
        channelId: 'dm-ada',
        channelName: 'Ada',
        body: 'Do you need anything else?',
      });
      companion.get('ada')!.reading(true);
      companion.get('ada')!.advance(30_000);
      snapshot();
    });
    expect(card().querySelectorAll<HTMLInputElement>('input:not([type=checkbox])')[2]!.value).toBe(
      'Keep it short',
    );
    expect(card().querySelector('.bh-question-source')).toBeNull();
    await act(() => prefs.setDeveloperMode(true));
    expect(card().querySelector('.bh-question-source code')?.textContent).toBe('owned-session');
    expect(card().textContent).toContain('Memory');
    await act(() => prefs.setDeveloperMode(false));
    expect(card().querySelector('.bh-question-source')).toBeNull();
    expect(card().querySelectorAll<HTMLInputElement>('input:not([type=checkbox])')[2]!.value).toBe(
      'Keep it short',
    );
    expect(companion.get('ada')!.getSnapshot().cards[0]?.shown).toBe(0);
    expect(node.querySelectorAll('.bh-companion-pending > ol > li')).toHaveLength(1);
    await act(() => events.dispatchEvent(new Event('error')));
    expect(button(card(), '回答并继续').disabled).toBe(true);
    await act(async () => {
      emit('companion/baseline', {
        profileId: 'question-qa',
        consumerId: 'live',
        bots: [{ slug: 'ada', name: 'Ada', paused: false, requests: [approval, request] }],
        activity: { generation: 'host', revision: 0, bots: [] },
      });
      await Promise.resolve();
      snapshot();
    });
    expect(card().querySelectorAll<HTMLInputElement>('input:not([type=checkbox])')[2]!.value).toBe(
      'Keep it short',
    );
    const submit = button(card(), '回答并继续');
    submit.focus();
    await act(async () => {
      submit.click();
      submit.click();
    });
    expect(answers).toEqual([
      {
        channelId: 'dm-ada',
        messageId: 'question',
        answer: {
          answers: [
            { id: 'branch', selected: ['history'] },
            { id: 'tasks', selected: ['Read', 'Summarize'], custom: 'also check status' },
            { id: 'note', selected: [], custom: 'Keep it short' },
          ],
        },
      },
    ]);
    expect(node.querySelector('.bh-question-card')).toBeNull();
    expect(node.querySelector('.bh-tool-approval-card')).not.toBeNull();
    expect(node.querySelector('.bh-companion-pending')?.contains(document.activeElement)).toBe(
      true,
    );
    expect(store.getSnapshot().selection).toEqual({ kind: 'channel', channelId: 'unrelated' });
    await act(() => companion.remove('ada'));
    expect(answers).toHaveLength(1);
  } finally {
    await act(() => root.unmount());
    companion.dispose();
    node.remove();
    store.select(old.selection);
    store.setHumanInbox(old.humanInbox);
    vi.unstubAllGlobals();
  }
});

it.each(['native', 'wrong-target', 'offline', 'expired', 'unmounted'] as const)(
  'cannot answer a %s question context',
  async (context) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const old = store.getSnapshot();
    store.select({ kind: 'channel', channelId: 'unrelated' });
    let checks = 0;
    let release: ((status: 'pending') => void) | undefined;
    const actions = {
      userQuestionStatus: vi.fn(() => {
        checks++;
        return context === 'unmounted' && checks > 1
          ? new Promise<'pending'>((done) => {
              release = done;
            })
          : Promise.resolve(context === 'expired' && checks > 1 ? 'expired' : 'pending');
      }),
      answerUserQuestion: vi.fn().mockResolvedValue(undefined),
    } as unknown as BridgeActions;
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    let unmounted = false;
    try {
      await act(async () =>
        root.render(
          createElement(UserQuestionCard, {
            message,
            actions,
            t: zhTranslate,
            ...(context === 'native'
              ? {}
              : {
                  companionTarget: {
                    botSlug: 'ada',
                    channelId: 'dm-ada',
                    sessionId: context === 'wrong-target' ? 'another-session' : 'owned-session',
                    live: context !== 'offline',
                  },
                }),
          }),
        ),
      );
      await act(() => button(node, 'history').click());
      await act(() => choice(node, 'Read').click());
      await act(() => input(node, 2, 'QA'));
      await act(async () => button(node, '回答并继续').click());
      if (context === 'unmounted') {
        await act(() => root.unmount());
        unmounted = true;
        await act(async () => release?.('pending'));
      }
      expect(actions.answerUserQuestion).not.toHaveBeenCalled();
    } finally {
      if (!unmounted) await act(() => root.unmount());
      node.remove();
      store.select(old.selection);
    }
  },
);

it('accepts only formal well-formed questions qualified for the selected Bot', () => {
  expect(companionRequests([request], 'ada')).toEqual([request]);
  expect(companionRequests([{ ...request, callId: 'native-timed-call' }], 'ada')).toEqual([
    { ...request, callId: 'native-timed-call' },
  ]);
  const many = {
    ...request,
    questions: [...questions, { id: 'extra', question: 'One more?', detail: 'x'.repeat(20_000) }],
  };
  expect(companionRequests([many], 'ada')).toEqual([many]);
  expect(
    companionRequests(
      [
        { ...request, kind: 'message' },
        { ...request, botSlug: 'bea' },
        { ...request, channelId: '' },
        { ...request, channelId: 7 },
        { ...request, questions: [] },
        { ...request, callId: '' },
        { ...request, callId: 7 },
        { ...request, questions: [questions[0], questions[0]] },
        {
          ...request,
          questions: [{ id: 'x', question: '?', options: [{ label: 'a' }, { label: 'a' }] }],
        },
        { ...request, questions: [{ id: 'x', question: '?', multiSelect: 'yes' }] },
      ],
      'ada',
    ),
  ).toEqual([]);
});
