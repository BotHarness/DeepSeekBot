// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { createHostClient, type HostClient } from '../src/host/client';
import {
  answerInChat,
  answerQuestion,
  decideApproval,
  loadApproval,
  loadQuestion,
  requestRef,
} from '../src/host/requests';
import type { HumanAttentionItem } from '../src/host/wire';
import { ApprovalCard } from '../src/ui/chat/approval-card';
import { QuestionCard } from '../src/ui/chat/question-card';
import { t } from '../src/ui/strings';
import { played } from './expo-haptics-shim';
import { FakeHost } from './fake-host';
import inboxWire from './fixtures/inbox-wire.json';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Recorded = keyof typeof inboxWire.rpc;
const recorded = (name: Recorded): unknown => structuredClone(inboxWire.rpc[name].result);
const items = (name: Recorded): HumanAttentionItem[] =>
  (inboxWire.rpc[name].result as { value: { items: HumanAttentionItem[] } }).value.items;

const ROUTE = 'https://studio.tailnet-example.ts.net';
const approval = requestRef(items('humanAttention.action')[0]!)!;
const question = requestRef(items('humanAttention.actionQuestion')[0]!)!;
const expired = { ok: true, value: { status: 'expired' } };

function oneQuestion(): unknown {
  const timeline = recorded('channelTimeline.questionPending') as {
    value: { page: { entries: Array<{ userQuestionRequest: { questions: unknown[] } }> } };
  };
  const request = timeline.value.page.entries[0]!.userQuestionRequest;
  request.questions = request.questions.slice(0, 1);
  return timeline;
}

let client: HostClient | undefined;
let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => {
  played.length = 0;
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  client?.stop();
});

function approvalTimeline(allowAlways: boolean | undefined): unknown {
  const timeline = recorded('channelTimeline.approvalPending') as {
    value: { page: { entries: Array<{ toolApprovalRequest: Record<string, unknown> }> } };
  };
  const request = timeline.value.page.entries[0]!.toolApprovalRequest;
  if (allowAlways === undefined) delete request['allowAlways'];
  else request['allowAlways'] = allowAlways;
  return timeline;
}

function host(): FakeHost {
  const fake = new FakeHost();
  fake.answers.set('toolApprovalStatus', () => recorded('toolApprovalStatus.pending'));
  fake.answers.set('toolApprovalDecide', () => recorded('toolApprovalDecide.accepted'));
  fake.answers.set('userQuestionStatus', () => recorded('userQuestionStatus.pending'));
  fake.answers.set('userQuestionAnswer', () => recorded('userQuestionAnswer.accepted'));
  fake.answers.set('channelTimeline', (args) =>
    args['around'] === approval.messageId
      ? approvalTimeline(true)
      : recorded('channelTimeline.questionPending'),
  );
  return fake;
}

function connect(fake: FakeHost): HostClient {
  client = createHostClient({
    routes: [ROUTE],
    credential: fake.credential,
    carrier: fake.carrier,
    backoff: () => 5,
    timeoutMs: 200,
  });
  client.start();
  return client;
}

function approvalPort(target: HostClient) {
  return {
    load: () => loadApproval(target, approval),
    decide: (outcome: Parameters<typeof decideApproval>[2]) =>
      decideApproval(target, approval, outcome),
  };
}

function questionPort(target: HostClient) {
  return {
    load: () => loadQuestion(target, question),
    answer: (answer: Parameters<typeof answerQuestion>[2]) =>
      answerQuestion(target, question, answer),
  };
}

async function settle(): Promise<void> {
  for (let tries = 0; tries < 20; tries += 1)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
}

async function render(element: ReactElement): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  await settle();
  return container;
}

async function rerender(element: ReactElement): Promise<void> {
  await act(async () => root!.render(element));
  await settle();
}

function button(view: HTMLElement, label: string): HTMLButtonElement {
  const found = view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (found === null) throw new Error(`no button ${label}`);
  return found;
}

async function press(target: HTMLElement): Promise<void> {
  await act(async () => target.click());
  await settle();
}

async function type(view: HTMLElement, label: string, text: string): Promise<void> {
  const input = view.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const line = (view: HTMLElement) =>
  view.querySelector('[data-testid="card-line"]')?.getAttribute('aria-label');

describe('Tool approval card in the DM', () => {
  const card = (target: HostClient, extra: Record<string, unknown> = {}) =>
    createElement(ApprovalCard, {
      port: approvalPort(target),
      subject: 'bash',
      ...extra,
    });

  it('shows the key action first and keeps the folder in collapsed details', async () => {
    const view = await render(card(connect(host())));
    expect(view.textContent).toContain(t.toolCategory('bash'));
    expect(view.textContent).toContain(t.needsYou);
    expect(view.textContent).toContain(t.runTool('bash'));
    expect(view.textContent).toContain('ls /tmp/mobile-fixture');
    expect(view.textContent).not.toContain('/home/qa/.dsh/botharness/bots/');
    for (const label of [t.allowOnce, t.alwaysAllow, t.reject, t.details])
      expect(button(view, label).disabled).toBe(false);
    expect(view.textContent).toContain(t.alwaysToolScope('bash'));
    await press(button(view, t.details));
    expect(view.textContent).toContain('/home/qa/.dsh/botharness/bots/');
  });

  it('collapses to one line once allowed here', async () => {
    const fake = host();
    const sent: Array<Record<string, unknown>> = [];
    fake.answers.set('toolApprovalDecide', (args) => {
      sent.push(args);
      return recorded('toolApprovalDecide.accepted');
    });
    const view = await render(card(connect(fake)));
    await press(button(view, t.alwaysAllow));
    expect(sent[0]?.['outcome']).toBe('allowed-always-tool');
    expect(played).toEqual(['notification:success']);
    expect(line(view)).toBe(t.cardLine('bash', t.cardOutcome['allowed-always-tool']));
    expect(view.querySelector('button')).toBeNull();
  });

  it('says so when another device decided while the card was open', async () => {
    const target = connect(host());
    const view = await render(card(target));
    expect(button(view, t.allowOnce)).toBeDefined();
    await rerender(card(target, { resolution: { kind: 'tool-approval', outcome: 'rejected' } }));
    expect(line(view)).toBe(t.cardLine('bash', t.elsewhere(t.cardOutcome.rejected)));
  });

  it('says so when a tap lost to another device', async () => {
    const fake = host();
    const view = await render(card(connect(fake)));
    fake.answers.set('toolApprovalDecide', () => recorded('toolApprovalDecide.refused'));
    fake.answers.set('toolApprovalStatus', () => recorded('toolApprovalStatus.decided'));
    fake.answers.set('channelTimeline', () => recorded('channelTimeline.approvalDecided'));
    await press(button(view, t.reject));
    expect(played).toEqual(['notification:warning']);
    expect(line(view)).toBe(t.cardLine('bash', t.elsewhere(t.cardOutcome['allowed-once'])));
  });

  it('collapses an expired approval without buttons', async () => {
    const fake = host();
    fake.answers.set('toolApprovalStatus', () => expired);
    const view = await render(card(connect(fake)));
    expect(line(view)).toBe(t.cardLine('bash', t.cardExpired));
    expect(view.querySelector('button')).toBeNull();
  });

  it('shows a decision already in the DM without asking the Host', async () => {
    const fake = host();
    const view = await render(
      card(connect(fake), { resolution: { kind: 'tool-approval', outcome: 'allowed-once' } }),
    );
    expect(line(view)).toBe(t.cardLine('bash', t.cardOutcome['allowed-once']));
    expect(fake.requests.filter((request) => request.includes('toolApproval'))).toEqual([]);
  });

  it('keeps the buttons and names the refusal when a decision fails while pending', async () => {
    const fake = host();
    const view = await render(card(connect(fake)));
    fake.answers.set('toolApprovalDecide', () => recorded('toolApprovalDecide.refused'));
    await press(button(view, t.allowOnce));
    expect(view.querySelector('[role="alert"]')?.textContent).toContain(t.decideFailed);
    expect(button(view, t.allowOnce).disabled).toBe(false);
  });

  it('keeps three actions but disables Always allow when the Host does not offer it', async () => {
    for (const allowAlways of [false, undefined]) {
      const fake = host();
      fake.answers.set('channelTimeline', () => approvalTimeline(allowAlways));
      const view = await render(card(connect(fake)));
      expect(button(view, t.alwaysAllow).disabled).toBe(true);
      expect(button(view, t.allowOnce).disabled).toBe(false);
      expect(button(view, t.reject).disabled).toBe(false);
      expect(view.textContent).toContain(t.alwaysUnavailable);
      act(() => root?.unmount());
      container?.remove();
      root = undefined;
      client?.stop();
    }
  });
});

describe('Tool approval detail in the DM', () => {
  const card = (target: HostClient) =>
    createElement(ApprovalCard, { port: approvalPort(target), subject: 'edit' });

  function edited(toolName: string, input: Record<string, unknown>): unknown {
    const timeline = approvalTimeline(true) as {
      value: { page: { entries: Array<{ toolApprovalRequest: Record<string, unknown> }> } };
    };
    const request = timeline.value.page.entries[0]!.toolApprovalRequest;
    request['toolName'] = toolName;
    request['input'] = JSON.stringify(input);
    return timeline;
  }

  it('shows a file edit as a diff with its counts, the expiry and a waiting Assignment', async () => {
    const fake = host();
    fake.answers.set('channelTimeline', () =>
      edited('edit', { file_path: 'notes.md', old_string: 'draft', new_string: 'final\nshipped' }),
    );
    fake.answers.set('toolApprovalStatus', () => ({
      ok: true,
      value: {
        status: 'pending',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000 + 30 * 1000).toISOString(),
        execution: 'waiting-human',
      },
    }));
    const view = await render(card(connect(fake)));
    expect(view.textContent).toContain('notes.md  +2 −1');
    expect(view.textContent).toContain(t.expiresInMinutes(5));
    expect(view.textContent).toContain(t.waitingHumanCapacity);
    await press(button(view, t.details));
    const diff = view.querySelector('[data-testid="approval-diff"]')!;
    expect(diff.textContent).toBe('- draft+ final+ shipped');
    expect(view.textContent).toContain(t.riskTool);
  });

  it('reveals every line of a long diff before the Human decides', async () => {
    const fake = host();
    const lines = Array.from({ length: 45 }, (_, index) => `line ${index}`).join('\n');
    fake.answers.set('channelTimeline', () =>
      edited('write', { file_path: 'long.md', content: lines }),
    );
    const view = await render(card(connect(fake)));
    await press(button(view, t.details));
    const diff = () => view.querySelector('[data-testid="approval-diff"]')!.textContent;
    expect(diff()).not.toContain('line 44');
    await press(button(view, t.diffMore(5)));
    expect(diff()).toContain('line 44');
    expect(view.querySelector('[data-testid="approval-diff-more"]')).toBeNull();
  });

  it('puts the original attachment warning next to the buttons', async () => {
    const fake = host();
    fake.answers.set('channelTimeline', () =>
      edited('channel_attachment_open', { attachment_id: 'a1' }),
    );
    const view = await render(card(connect(fake)));
    expect(view.textContent).toContain(t.riskOriginal);
  });

  it('puts the secret warning next to the buttons for secret_cli', async () => {
    const fake = host();
    fake.answers.set('channelTimeline', () =>
      edited('secret_cli', { account: 'github', program: 'gh', args: ['repo', 'list'] }),
    );
    const view = await render(card(connect(fake)));
    expect(view.textContent).toContain(t.riskSecretCli);
    expect(view.textContent).toContain(t.alwaysKindScope);
  });
});

describe('Question card in the DM', () => {
  const card = (target: HostClient, extra: Record<string, unknown> = {}) =>
    createElement(QuestionCard, {
      port: questionPort(target),
      botName: 'Inbox QA',
      subject: 'Which colour?',
      ...extra,
    });

  it('answers lettered single and multiple choices, then collapses', async () => {
    const fake = host();
    const sent: Array<Record<string, unknown>> = [];
    fake.answers.set('userQuestionAnswer', (args) => {
      sent.push(args);
      return recorded('userQuestionAnswer.accepted');
    });
    const view = await render(card(connect(fake)));
    expect(view.textContent).toContain('Which snacks?');
    expect(view.textContent).toContain(t.multiSelectHint);
    expect(button(view, t.submitChoice).disabled).toBe(true);
    await press(button(view, t.option('A', 'Teal')));
    expect(button(view, t.option('A', 'Teal')).getAttribute('aria-checked')).toBe('true');
    await press(button(view, t.option('B', 'Biscuits')));
    await type(view, `${t.otherAnswer}: Which snacks?`, 'fruit');
    expect(played).toEqual([]);
    await press(button(view, t.submitChoice));
    expect(played).toEqual(['impact:light']);
    expect(sent[0]?.['answer']).toEqual({
      answers: [
        { id: 'colour', selected: ['Teal'] },
        { id: 'snacks', selected: ['Biscuits'], custom: 'fruit' },
      ],
    });
    expect(line(view)).toBe(t.cardLine('Which colour?', t.cardAnswered));
  });

  it('says so when another device answered while the card was open', async () => {
    const target = connect(host());
    const view = await render(card(target));
    await rerender(card(target, { resolution: { kind: 'user-question', state: 'answered' } }));
    expect(line(view)).toBe(t.cardLine('Which colour?', t.elsewhere(t.cardAnswered)));
  });

  it('says so when an answer lost to another device', async () => {
    const fake = host();
    const view = await render(card(connect(fake)));
    fake.answers.set('userQuestionAnswer', () => recorded('userQuestionAnswer.refused'));
    fake.answers.set('userQuestionStatus', () => recorded('userQuestionStatus.answered'));
    fake.answers.set('channelTimeline', () => recorded('channelTimeline.questionAnswered'));
    await press(button(view, t.option('A', 'Teal')));
    await press(button(view, t.option('A', 'Tea')));
    await press(button(view, t.submitChoice));
    expect(line(view)).toBe(t.cardLine('Which colour?', t.elsewhere(t.cardAnswered)));
  });

  it('collapses an expired or cancelled question', async () => {
    const fake = host();
    fake.answers.set('userQuestionStatus', () => expired);
    const view = await render(card(connect(fake)));
    expect(line(view)).toBe(t.cardLine('Which colour?', t.cardExpired));
    await rerender(card(client!, { resolution: { kind: 'user-question', state: 'cancelled' } }));
    expect(line(view)).toBe(t.cardLine('Which colour?', t.cardCancelled));
  });

  it('answers a single choice on tap without a Submit button', async () => {
    const fake = host();
    fake.answers.set('channelTimeline', () => oneQuestion());
    const sent: Array<Record<string, unknown>> = [];
    fake.answers.set('userQuestionAnswer', (args) => {
      sent.push(args);
      return recorded('userQuestionAnswer.accepted');
    });
    const view = await render(card(connect(fake), { replyInChat: true }));
    expect(view.querySelector(`button[aria-label="${t.submitChoice}"]`)).toBeNull();
    expect(view.querySelector('textarea')).toBeNull();
    expect(view.textContent).toContain(t.replyInChat);
    await press(button(view, t.option('B', 'Amber')));
    expect(sent[0]?.['answer']).toEqual({ answers: [{ id: 'colour', selected: ['Amber'] }] });
    expect(line(view)).toBe(t.cardLine('Which colour?', t.cardAnswered));
  });

  it('keeps the typed answer and Submit outside the DM', async () => {
    const fake = host();
    fake.answers.set('channelTimeline', () => oneQuestion());
    const view = await render(card(connect(fake)));
    await type(view, `${t.otherAnswer}: Which colour?`, 'violet');
    expect(button(view, t.submitChoice).disabled).toBe(false);
  });

  it('retains an expanded chat answer across closing and reopening without submitting it', async () => {
    const fake = host();
    const view = await render(card(connect(fake), { expandInput: true }));
    const label = `${t.otherAnswer}: Which colour?`;
    await press(button(view, label));
    await type(view, t.editDraft, 'violet\nsecond line');
    await press(button(view, t.done));
    expect(view.querySelector('textarea')).toBeNull();
    expect(button(view, label).textContent).toContain('violet');
    await press(button(view, label));
    expect(view.querySelector('textarea')?.value).toBe('violet\nsecond line');
    expect(fake.requests.filter((request) => request.includes('userQuestionAnswer'))).toEqual([]);
  });

  it('collapses as answered here when the chat answered it', async () => {
    const target = connect(host());
    const view = await render(card(target));
    await rerender(
      card(target, {
        answeredHere: true,
        resolution: { kind: 'user-question', state: 'answered' },
      }),
    );
    expect(line(view)).toBe(t.cardLine('Which colour?', t.cardAnswered));
  });

  it('sends a chat reply as the custom answer to a single pending question', async () => {
    const fake = host();
    fake.answers.set('channelTimeline', () => oneQuestion());
    const sent: Array<Record<string, unknown>> = [];
    fake.answers.set('userQuestionAnswer', (args) => {
      sent.push(args);
      return recorded('userQuestionAnswer.accepted');
    });
    expect(await answerInChat(connect(fake), question, 'violet')).toBe(true);
    expect(sent[0]?.['answer']).toEqual({
      answers: [{ id: 'colour', selected: [], custom: 'violet' }],
    });
  });

  it('leaves a chat reply as a message when the question has several parts', async () => {
    const fake = host();
    expect(await answerInChat(connect(fake), question, 'violet')).toBe(false);
    expect(fake.requests.filter((request) => request.includes('userQuestionAnswer'))).toEqual([]);
  });
});
