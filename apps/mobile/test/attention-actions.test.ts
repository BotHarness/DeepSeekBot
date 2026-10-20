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

import {
  allowAutoRejectionOnce,
  decideJoinRequest,
  findAttentionItem,
  replyToAssignment,
} from '../src/host/attention-actions';
import { createHostClient, type HostClient } from '../src/host/client';
import type { HumanAttentionItem } from '../src/host/wire';
import { AttentionItemView } from '../src/ui/attention-item';
import { PrivateInputCard } from '../src/ui/chat/private-input-card';
import { t } from '../src/ui/strings';
import { played } from './expo-haptics-shim';
import { FakeHost } from './fake-host';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ROUTE = 'https://studio.tailnet-example.ts.net';

const AUTO: HumanAttentionItem = {
  id: 'autoreject:e1',
  category: 'action',
  kind: 'auto-rejection',
  createdAt: '2026-10-20T00:00:00.000Z',
  channelId: 'dm-ada',
  botSlug: 'ada',
  summary: 'Rejected by the cautious template.',
  sourceEventId: 'e1',
  autoRejection: {
    sessionId: 's1',
    toolName: 'bash',
    input: '{"command":"rm -rf build"}',
    template: 'cautious',
    reason: 'Deletes files outside the task.',
  },
};

const JOIN: HumanAttentionItem = {
  id: 'join:r1',
  category: 'action',
  kind: 'group-join-request',
  createdAt: '2026-10-20T00:00:00.000Z',
  channelId: 'group-launch',
  channelName: 'Launch',
  botSlug: 'ada',
  summary: '',
  requestId: 'r1',
};

const ASK: HumanAttentionItem = {
  id: 'assignment:s9',
  category: 'action',
  kind: 'assignment-waiting-human',
  createdAt: '2026-10-20T00:00:00.000Z',
  channelId: 'dm-ada',
  botSlug: 'ada',
  summary: 'Which region should I deploy to?',
  assignmentSessionId: 's9',
  sourceEventId: 'report-3',
};

function host(): FakeHost {
  const fake = new FakeHost();
  fake.methods.set('humanAttention', () => ({ items: [AUTO, JOIN, ASK] }));
  fake.methods.set('toolAutoRejectionOverride', () => ({
    accepted: true,
    channelId: 'dm-ada',
    messageId: 'm',
  }));
  fake.methods.set('channelGroupJoinDecide', (args) => ({
    channel: {
      id: 'group-launch',
      joinRequests: [{ id: 'r1', status: args['accept'] === true ? 'accepted' : 'declined' }],
    },
  }));
  fake.methods.set('humanAssignmentContext', () => ({
    context: {
      botSlug: 'ada',
      sessionId: 's9',
      purpose: 'Deploy the launch site',
      sourceEventId: 'report-3',
      reports: [
        {
          sourceEventId: 'report-3',
          at: '2026-10-20T00:00:00.000Z',
          state: 'waiting-human',
          summary: 'Which region should I deploy to?',
        },
      ],
      canReply: true,
    },
  }));
  fake.methods.set('channelSend', (args) => ({
    message: {
      id: args['messageId'],
      at: '2026-10-20T00:01:00.000Z',
      author: { kind: 'human' },
      body: args['body'],
      assignmentReply: args['assignmentReply'],
    },
  }));
  return fake;
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

function button(view: HTMLElement, label: string): HTMLButtonElement {
  const found = view.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  if (found === null) throw new Error(`no control ${label}`);
  return found;
}

async function press(target: HTMLElement): Promise<void> {
  await act(async () => target.click());
  await settle();
}

const line = (page: HTMLElement) =>
  page.querySelector('[data-testid="card-line"]')?.getAttribute('aria-label');
const sent = (fake: FakeHost, method: string) =>
  fake.calls.filter((call) => call.method === method).map((call) => call.args);

function view(target: HostClient, item: HumanAttentionItem, known = true) {
  return createElement(AttentionItemView, {
    client: target,
    target: { id: item.id, botSlug: item.botSlug },
    ...(known ? { known: item } : {}),
    botName: 'Ada',
    fallback: createElement('p', null, 'fallback'),
  });
}

describe('Phone actions for Inbox items', () => {
  it('finds an item by id among the Bot’s actions, asking for auto-rejections by kind', async () => {
    const fake = host();
    const target = connect(fake);
    expect(await findAttentionItem(target, { id: AUTO.id, botSlug: 'ada' })).toEqual(AUTO);
    expect(await findAttentionItem(target, { id: 'gone', botSlug: 'ada' })).toBeUndefined();
    expect(sent(fake, 'humanAttention')).toEqual([
      { category: 'action', botSlug: 'ada', limit: 100, kind: 'auto-rejection' },
      { category: 'action', botSlug: 'ada', limit: 100 },
    ]);
  });

  it('allows an auto-rejected call once and shows its reason and input', async () => {
    const fake = host();
    const page = await render(view(connect(fake), AUTO));
    expect(page.textContent).toContain(t.autoRejectionTitle('Ada'));
    expect(page.textContent).toContain('Deletes files outside the task.');
    await press(button(page, t.details));
    expect(page.textContent).toContain('rm -rf build');
    await press(button(page, t.autoRejectionAllow));
    expect(sent(fake, 'toolAutoRejectionOverride')).toEqual([{ itemId: AUTO.id }]);
    expect(line(page)).toBe(t.cardLine(t.kind['auto-rejection']!, t.autoRejectionAllowed));
    expect(page.querySelector(`[aria-label="${t.autoRejectionAllow}"]`)).toBeNull();
    expect(played).toEqual(['notification:success']);
  });

  it('accepts a group join request', async () => {
    const fake = host();
    const page = await render(view(connect(fake), JOIN));
    expect(page.textContent).toContain(t.joinTitle('Ada', 'Launch'));
    await press(button(page, t.joinAccept));
    expect(sent(fake, 'channelGroupJoinDecide')).toEqual([
      { channelId: 'group-launch', requestId: 'r1', accept: true },
    ]);
    expect(line(page)).toBe(t.cardLine(t.kind['group-join-request']!, t.joinAccepted));
  });

  it('keeps a join request open when the computer does not confirm it', async () => {
    const fake = host();
    fake.methods.set('channelGroupJoinDecide', () => ({
      channel: { id: 'group-launch', joinRequests: [{ id: 'r1', status: 'pending' }] },
    }));
    const target = connect(fake);
    await expect(decideJoinRequest(target, 'group-launch', 'r1', false)).rejects.toThrow(
      'did not confirm',
    );
  });

  it('replies to an Assignment so the reply carries its target', async () => {
    const fake = host();
    const page = await render(view(connect(fake), ASK, false));
    expect(page.textContent).toContain(t.assignmentWaiting('Ada'));
    expect(page.textContent).toContain('Which region should I deploy to?');
    await press(button(page, t.details));
    expect(page.textContent).toContain('Deploy the launch site');
    const input = page.querySelector<HTMLTextAreaElement>('[aria-label="Reply to the Bot"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(input) as object,
        'value',
      )!.set!;
      setter.call(input, 'Use eu-west-1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await press(button(page, t.assignmentSend));
    const [args] = sent(fake, 'channelSend');
    expect(args).toMatchObject({
      channelId: 'dm-ada',
      body: 'Use eu-west-1',
      assignmentReply: { sessionId: 's9', sourceEventId: 'report-3' },
    });
    expect(String(args?.['messageId'])).toMatch(/^human-/u);
    expect(page.textContent).toContain(t.assignmentSent);
    expect(page.querySelector('[aria-label="Reply to the Bot"]')).toBeNull();
  });

  it('refuses an Assignment reply the computer stored without its target', async () => {
    const fake = host();
    fake.methods.set('channelSend', (args) => ({
      message: { id: args['messageId'], author: { kind: 'human' }, body: args['body'] },
    }));
    await expect(
      replyToAssignment(connect(fake), 'ada', 's9', 'report-3', 'Use eu-west-1'),
    ).rejects.toThrow('did not confirm');
  });

  it('refuses an override the computer did not accept', async () => {
    const fake = host();
    fake.methods.set('toolAutoRejectionOverride', () => ({ accepted: false }));
    await expect(allowAutoRejectionOnce(connect(fake), AUTO.id)).rejects.toThrow('did not confirm');
  });

  it('falls back when the item is no longer waiting', async () => {
    const fake = host();
    fake.methods.set('humanAttention', () => ({ items: [] }));
    const page = await render(view(connect(fake), JOIN, false));
    expect(page.textContent).toContain('fallback');
  });

  it('opens the private input form on this phone and collapses once it is handled', async () => {
    const fill = vi.fn();
    const page = await render(
      createElement(PrivateInputCard, {
        botName: 'Ada',
        purpose: 'Read the private repository',
        onFill: fill,
      }),
    );
    expect(page.textContent).toContain(t.privateInputTitle('Ada'));
    expect(page.textContent).toContain('Read the private repository');
    expect(page.textContent).toContain(t.privateInputNote);
    await press(button(page, t.privateInputFill));
    expect(fill).toHaveBeenCalledOnce();
    act(() =>
      root!.render(
        createElement(PrivateInputCard, { botName: 'Ada', resolved: true, onFill: fill }),
      ),
    );
    expect(line(page)).toBe(t.cardLine(t.kind['private-input']!, t.privateInputDone));
  });
});
