// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/client/bot-sidebar.js', async () => {
  const { useSyncExternalStore } = await import('react');
  const { store } = await import('../src/client/store.js');
  return { useClientState: () => useSyncExternalStore(store.subscribe, store.getSnapshot) };
});
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./human-inbox-test-controls.js')),
  Button: ({ children, ...props }: { children: ReactNode }) =>
    createElement('button', props, children),
  MarkdownText: () => null,
  StateDot: () => null,
  Input: (props: import('react').InputHTMLAttributes<HTMLInputElement>) =>
    createElement('input', props),
}));

import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { HumanInboxView } from '../src/client/human-inbox-view.js';
import { createStore, store, type HumanAttentionItem } from '../src/client/store.js';

const item = (slug: string, minute: string): HumanAttentionItem => ({
  id: 'question:' + slug,
  kind: 'user-question',
  category: 'action',
  createdAt: '2026-10-01T08:' + minute + ':00Z',
  channelId: 'dm-' + slug,
  channelName: 'channel-' + slug,
  botSlug: slug,
  messageId: 'request-' + slug,
  summary: 'Which launch channel?',
});

describe('Human Inbox native question', () => {
  it.each(['choice', 'custom', 'stale'] as const)(
    'answers %s through the source command while keeping other Bot questions independent',
    async (outcome) => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const previous = store.getSnapshot();
      let pending = true;
      const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
      const call: BridgeCall = async (endpoint, payload) => {
        calls.push({ endpoint, payload });
        if (endpoint === 'channelTimeline')
          return {
            ok: true,
            value: {
              revision: 3,
              page: {
                entries: [
                  {
                    id: 'before',
                    at: '2026-10-01T08:00:00Z',
                    author: { kind: 'human' },
                    body: 'Please check the release.',
                  },
                  {
                    id: 'request-ada',
                    at: '2026-10-01T08:01:00Z',
                    author: { kind: 'bot', slug: 'ada' },
                    body: 'Which launch channel?',
                    userQuestionRequest: {
                      sessionId: 'session-ada',
                      questions: [
                        {
                          id: 'release-route',
                          question: 'Which launch channel?',
                          options: [
                            { label: 'Canary', description: 'Small launch' },
                            { label: 'Stable' },
                          ],
                        },
                      ],
                    },
                  },
                  {
                    id: 'after',
                    at: '2026-10-01T08:02:00Z',
                    author: { kind: 'bot', slug: 'ada' },
                    body: 'The separate check is queued.',
                  },
                ],
                olderCursor: null,
                newerCursor: null,
                hasOlder: false,
                hasNewer: false,
              },
            },
          };
        if (endpoint === 'userQuestionStatus')
          return { ok: true, value: { status: pending ? 'pending' : 'expired' } };
        if (endpoint === 'userQuestionAnswer') {
          pending = false;
          return outcome === 'stale'
            ? {
                ok: false,
                error: {
                  code: 'invalid-input',
                  message: 'Question is no longer pending',
                  details: {},
                },
              }
            : { ok: true, value: { accepted: true } };
        }
        if (endpoint === 'humanAttentionStatus')
          return { ok: true, value: { unreadCount: 0, hasAction: true } };
        if (endpoint === 'humanAttention')
          return {
            ok: true,
            value: {
              items: pending ? [item('ada', '01'), item('bea', '02')] : [item('bea', '02')],
            },
          };
        throw new Error('Unexpected endpoint: ' + endpoint);
      };
      const actions = createActions(call, store);
      store.select({ kind: 'inbox' });
      store.setHumanInbox({
        category: 'action',
        sort: 'oldest',
        status: 'ready',
        items: [item('ada', '01'), item('bea', '02')],
      });
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      const button = (text: string) =>
        [...container.querySelectorAll<HTMLButtonElement>('button')].find(
          (b) => b.textContent === text,
        );
      try {
        await act(async () => root.render(createElement(HumanInboxView, { actions })));
        expect(button('回答问题')).toBeDefined();
        await act(async () => button('回答问题')!.click());
        expect(container.querySelector('.bh-human-inbox-detail')).not.toBeNull();
        expect(container.querySelector('[role="dialog"]')).toBeNull();
        expect(container.querySelector('.bh-question-prompt')?.textContent).toBe(
          'Which launch channel?',
        );
        expect(container.textContent).toContain('Small launch');
        expect(container.querySelector('input[aria-label="其他回答"]')).not.toBeNull();
        expect(container.querySelector('.bh-question-source')).toBeNull();
        expect(container.querySelector('textarea')).toBeNull();
        expect(container.querySelector('.bh-human-inbox-reply h2')?.textContent).toBe(
          '回答问题 · ada',
        );
        expect(container.textContent).not.toContain('The separate check is queued.');
        await act(async () =>
          container.querySelector<HTMLButtonElement>('.bh-human-inbox-context-older')!.click(),
        );
        await act(async () =>
          container.querySelector<HTMLButtonElement>('.bh-human-inbox-context-newer')!.click(),
        );
        expect(container.textContent).toContain('Please check the release.');
        expect(container.textContent).toContain('The separate check is queued.');
        expect(button('回答并继续')).toBeUndefined();
        if (outcome === 'custom') {
          const input = container.querySelector<HTMLInputElement>('input[aria-label="其他回答"]')!;
          await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
              input,
              'Nightly QA',
            );
            input.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await act(async () => button('回答并继续')!.click());
        } else {
          await act(async () => button('CanarySmall launch')!.click());
        }
        expect(
          calls.filter((c) => c.endpoint === 'userQuestionAnswer').map((c) => c.payload),
        ).toEqual([
          {
            channelId: 'dm-ada',
            messageId: 'request-ada',
            answer: {
              answers: [
                outcome === 'custom'
                  ? { id: 'release-route', selected: [], custom: 'Nightly QA' }
                  : { id: 'release-route', selected: ['Canary'] },
              ],
            },
          },
        ]);
        expect(store.getSnapshot().selection).toEqual({ kind: 'inbox' });
        expect(store.getSnapshot().humanInbox.items.map((i) => i.botSlug)).toEqual(['bea']);
        expect(container.textContent).toContain(outcome === 'stale' ? '已过期' : '已回答');
        expect(button('回答并继续')).toBeUndefined();
        expect(calls.some((c) => c.endpoint === 'channelSend')).toBe(false);
      } finally {
        await act(async () => root.unmount());
        container.remove();
        store.select(previous.selection);
        store.setHumanInbox(previous.humanInbox);
      }
    },
  );
});

it('removes a settled question from an older retained Inbox page', async () => {
  const client = createStore();
  const older = Array.from({ length: 51 }, (_, index) => item('bot' + index, '01'));
  const target = older[50]!;
  client.select({ kind: 'inbox' });
  client.setHumanInbox({
    category: 'action',
    status: 'ready',
    items: older,
    nextCursor: 'older-page',
  });
  const call: BridgeCall = async (endpoint) => {
    if (endpoint === 'userQuestionAnswer') return { ok: true, value: { accepted: true } };
    if (endpoint === 'humanAttention')
      return { ok: true, value: { items: older.slice(0, 50), nextCursor: 'new-head' } };
    return { ok: true, value: { unreadCount: 0, hasAction: true } };
  };
  await createActions(call, client).answerUserQuestion(target.channelId!, target.messageId!, [
    { id: 'release-route', selected: ['Canary'] },
  ]);
  expect(client.getSnapshot().humanInbox.items.map((i) => i.id)).toEqual(
    older.slice(0, 50).map((i) => i.id),
  );
});
