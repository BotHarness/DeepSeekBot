// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('../src/ui/bot-avatar', () => ({
  BotAvatar: ({ bot }: { bot: { slug: string } }) =>
    createElement('span', { 'data-testid': `avatar-${bot.slug}` }),
}));

import type { RosterBot } from '../src/host/client';
import type { InboxSnapshot } from '../src/host/inbox';
import type { ApprovalRequest, DecisionResult, QuestionRequest } from '../src/host/requests';
import type { HumanAttentionItem, QuestionAnswer } from '../src/host/wire';
import { ApprovalView, type ApprovalPort } from '../src/ui/approval-view';
import { InboxList } from '../src/ui/inbox-list';
import { QuestionView, type QuestionPort } from '../src/ui/question-view';
import { t } from '../src/ui/strings';
import inboxWire from './fixtures/inbox-wire.json';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Recorded = keyof typeof inboxWire.rpc;
const items = (name: Recorded): HumanAttentionItem[] =>
  (inboxWire.rpc[name].result as { value: { items: HumanAttentionItem[] } }).value.items;
const entry = (name: Recorded, id: string) =>
  (
    inboxWire.rpc[name].result as {
      value: { page: { entries: Array<Record<string, unknown> & { id: string }> } };
    }
  ).value.page.entries.find((message) => message.id === id)!;

const approvalItem = items('humanAttention.action')[0]!;
const questionItem = items('humanAttention.actionQuestion')[0]!;
const ref = (item: HumanAttentionItem) => ({
  channelId: item.channelId!,
  messageId: item.messageId!,
  botSlug: item.botSlug,
});
const card = entry('channelTimeline.approvalPending', approvalItem.messageId!)[
  'toolApprovalRequest'
] as Omit<ApprovalRequest, keyof ReturnType<typeof ref> | 'status'>;
const pendingApproval: ApprovalRequest = {
  ...ref(approvalItem),
  toolName: card.toolName,
  role: card.role,
  cwd: card.cwd,
  input: card.input,
  status: 'pending',
};
const pendingQuestion: QuestionRequest = {
  ...ref(questionItem),
  questions: (
    entry('channelTimeline.questionPending', questionItem.messageId!)['userQuestionRequest'] as {
      questions: QuestionRequest['questions'];
    }
  ).questions,
  status: 'pending',
};

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await act(async () => undefined);
  return host;
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (found === null) throw new Error(`no button ${label}`);
  return found;
}

async function press(target: HTMLElement): Promise<void> {
  await act(async () => target.click());
  await act(async () => undefined);
}

async function type(container: HTMLElement, label: string, text: string): Promise<void> {
  const input = container.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const notice = (container: HTMLElement, tone: string) =>
  container.querySelector(`[data-testid="notice-${tone}"]`)?.textContent;

function approvalPort(
  load: () => Promise<ApprovalRequest>,
  decide: (outcome: 'allowed-once' | 'rejected') => Promise<DecisionResult> = async () =>
    'accepted',
): ApprovalPort & { decide: ReturnType<typeof vi.fn> } {
  return { load: vi.fn(load), decide: vi.fn(decide) };
}

describe('Tool approval screen', () => {
  it('shows the PersonaBot, tool and readable arguments, then allows once', async () => {
    const port = approvalPort(async () => pendingApproval);
    const view = await render(createElement(ApprovalView, { port, botName: 'Inbox QA' }));
    expect(view.textContent).toContain(t.wantsToRun('Inbox QA', 'bash'));
    expect(view.textContent).toContain('command');
    expect(view.textContent).toContain('ls /tmp/mobile-fixture');
    expect(view.textContent).toContain('/home/qa/.dsh/botharness/bots/');

    await press(button(view, t.allowOnce));
    expect(port.decide).toHaveBeenCalledWith('allowed-once');
    expect(notice(view, 'success')).toBe(t.approved);
    expect(view.querySelector(`button[aria-label="${t.allowOnce}"]`)).toBeNull();
  });

  it('says a tap had no effect when another device decided first', async () => {
    let decided = false;
    const port = approvalPort(
      async () =>
        decided ? { ...pendingApproval, status: 'decided', outcome: 'rejected' } : pendingApproval,
      async () => {
        decided = true;
        return 'decided';
      },
    );
    const view = await render(createElement(ApprovalView, { port, botName: 'Inbox QA' }));
    await press(button(view, t.allowOnce));
    expect(notice(view, 'warning')).toBe(t.alreadyDecidedAs(t.outcome.rejected));
    expect(view.querySelector(`button[aria-label="${t.reject}"]`)).toBeNull();
  });

  it('opens an already-decided approval without buttons', async () => {
    const port = approvalPort(async () => ({
      ...pendingApproval,
      status: 'decided',
      outcome: 'allowed-once',
    }));
    const view = await render(createElement(ApprovalView, { port, botName: 'Inbox QA' }));
    expect(notice(view, 'warning')).toBe(t.alreadyDecidedAs(t.outcome['allowed-once']));
    expect(view.querySelector('button')).toBeNull();
  });

  it('opens an expired approval with a clear message', async () => {
    const port = approvalPort(async () => ({ ...pendingApproval, status: 'expired' }));
    const view = await render(createElement(ApprovalView, { port, botName: 'Inbox QA' }));
    expect(notice(view, 'warning')).toBe(t.expired);
    expect(view.querySelector('button')).toBeNull();
  });

  it('re-reads when the live Inbox drops the item while it is open', async () => {
    let status: ApprovalRequest['status'] = 'pending';
    const port = approvalPort(async () => ({ ...pendingApproval, status }));
    const view = await render(createElement(ApprovalView, { port, botName: 'Inbox QA' }));
    expect(button(view, t.allowOnce)).toBeDefined();
    status = 'decided';
    await act(async () =>
      root!.render(createElement(ApprovalView, { port, botName: 'Inbox QA', listed: false })),
    );
    await act(async () => undefined);
    expect(notice(view, 'warning')).toBe(t.alreadyDecided);
  });

  it('keeps the buttons and shows the Host refusal when a decision fails', async () => {
    const port = approvalPort(
      async () => pendingApproval,
      async () => {
        throw new Error('The Host could not be reached.');
      },
    );
    const view = await render(createElement(ApprovalView, { port, botName: 'Inbox QA' }));
    await press(button(view, t.reject));
    expect(notice(view, 'danger')).toBe(`${t.decideFailed} The Host could not be reached.`);
    expect(button(view, t.reject).disabled).toBe(false);
  });
});

describe('Human question screen', () => {
  function questionPort(
    load: () => Promise<QuestionRequest>,
    answer: (value: QuestionAnswer) => Promise<DecisionResult> = async () => 'accepted',
  ): QuestionPort & { answer: ReturnType<typeof vi.fn> } {
    return { load: vi.fn(load), answer: vi.fn(answer) };
  }

  it('answers a choice and a multi-choice with free text', async () => {
    const port = questionPort(async () => pendingQuestion);
    const view = await render(createElement(QuestionView, { port, botName: 'Inbox QA' }));
    expect(view.textContent).toContain('Which colour?');
    expect(view.textContent).toContain(t.multiSelectHint);
    expect(button(view, t.submit).disabled).toBe(true);

    await press(button(view, 'Teal'));
    expect(button(view, 'Teal').getAttribute('aria-checked')).toBe('true');
    await press(button(view, 'Amber'));
    expect(button(view, 'Teal').getAttribute('aria-checked')).toBe('false');
    expect(button(view, t.submit).disabled).toBe(true);
    await press(button(view, 'Tea'));
    await press(button(view, 'Biscuits'));
    await type(view, `${t.otherAnswer}: Which snacks?`, 'fruit');
    expect(button(view, t.submit).disabled).toBe(false);

    await press(button(view, t.submit));
    expect(port.answer).toHaveBeenCalledWith({
      answers: [
        { id: 'colour', selected: ['Amber'] },
        { id: 'snacks', selected: ['Tea', 'Biscuits'], custom: 'fruit' },
      ],
    });
    expect(notice(view, 'success')).toBe(t.answered);
    expect(view.querySelector(`button[aria-label="${t.submit}"]`)).toBeNull();
  });

  it('typing a free-text answer replaces a single choice', async () => {
    const port = questionPort(async () => pendingQuestion);
    const view = await render(createElement(QuestionView, { port, botName: 'Inbox QA' }));
    await press(button(view, 'Teal'));
    await type(view, `${t.otherAnswer}: Which colour?`, 'Green');
    expect(button(view, 'Teal').getAttribute('aria-checked')).toBe('false');
    await type(view, `${t.otherAnswer}: Which snacks?`, 'none');
    await press(button(view, t.submit));
    expect(port.answer).toHaveBeenCalledWith({
      answers: [
        { id: 'colour', selected: [], custom: 'Green' },
        { id: 'snacks', selected: [], custom: 'none' },
      ],
    });
  });

  it('says the answer was not sent when another device answered first', async () => {
    const port = questionPort(
      async () => pendingQuestion,
      async () => 'decided',
    );
    const view = await render(createElement(QuestionView, { port, botName: 'Inbox QA' }));
    await press(button(view, 'Teal'));
    await press(button(view, 'Tea'));
    await press(button(view, t.submit));
    expect(notice(view, 'warning')).toBe(t.alreadyAnswered);
  });

  it('opens already-answered and expired questions without a send button', async () => {
    for (const [status, text] of [
      ['decided', t.alreadyAnswered],
      ['expired', t.expired],
    ] as const) {
      const port = questionPort(async () => ({ ...pendingQuestion, status }));
      const view = await render(createElement(QuestionView, { port, botName: 'Inbox QA' }));
      expect(notice(view, 'warning')).toBe(text);
      expect(view.querySelector(`button[aria-label="${t.submit}"]`)).toBeNull();
      act(() => root?.unmount());
      view.remove();
    }
  });
});

describe('Inbox list', () => {
  const bot: RosterBot = {
    slug: approvalItem.botSlug,
    displayName: 'Inbox QA',
    roles: [],
    computerAccess: false,
    browserAccess: false,
    state: 'waiting',
    paused: false,
  };
  const ready = (action: HumanAttentionItem[]): InboxSnapshot => ({
    status: 'ready',
    sections: {
      action,
      replies: [
        {
          id: 'reply:1',
          category: 'replies',
          kind: 'channel-mention',
          createdAt: approvalItem.createdAt,
          channelId: 'group-1',
          channelName: 'launch',
          botSlug: bot.slug,
          summary: '@Human the draft is ready',
        },
      ],
      handled: items('humanAttention.handled').slice(0, 2),
    },
  });

  it('orders actions, then mentions and replies, then handled history', async () => {
    const opened: string[] = [];
    const view = await render(
      createElement(InboxList, {
        snapshot: ready([approvalItem, questionItem]),
        bot: (slug: string) => (slug === bot.slug ? bot : undefined),
        onOpen: (item: HumanAttentionItem) => opened.push(item.id),
        refreshing: false,
        onRefresh: () => undefined,
        now: Date.parse(approvalItem.createdAt) + 5 * 60_000,
      }),
    );
    const headers = [...view.querySelectorAll('[role="header"]')].map((node) => node.textContent);
    expect(headers).toEqual([
      t.inboxSections.action,
      t.inboxSections.replies,
      t.inboxSections.handled,
    ]);
    const rows = [...view.querySelectorAll('[data-testid^="inbox-row-"]')].map((node) =>
      node.getAttribute('data-testid'),
    );
    expect(rows.slice(0, 3)).toEqual([
      `inbox-row-${approvalItem.id}`,
      `inbox-row-${questionItem.id}`,
      'inbox-row-reply:1',
    ]);
    expect(view.textContent).toContain(t.inChannel('launch'));
    expect(view.textContent).toContain(t.ago(5));
    await press(view.querySelector<HTMLElement>(`[data-testid="inbox-row-${questionItem.id}"]`)!);
    expect(opened).toEqual([questionItem.id]);
  });

  it('says nothing needs the Human when no action is waiting, and flags a stale read', async () => {
    const snapshot = { ...ready([]), stale: 'The Host could not be reached.' } as InboxSnapshot;
    const view = await render(
      createElement(InboxList, {
        snapshot,
        bot: () => undefined,
        onOpen: () => undefined,
        refreshing: false,
        onRefresh: () => undefined,
      }),
    );
    expect(view.textContent).toContain(t.inboxEmpty);
    expect(notice(view, 'warning')).toBe(`${t.inboxStale} The Host could not be reached.`);
  });
});
