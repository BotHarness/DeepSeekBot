// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./activity-list-test-controls.js')),
  Button: ({ children, ...props }: { children: ReactNode }) =>
    createElement('button', props, children),
  MarkdownText: () => null,
  StateDot: () => null,
  Input: () => null,
}));

vi.mock('../src/client/bot-sidebar.js', async () => {
  const { useSyncExternalStore } = await import('react');
  const { store } = await import('../src/client/store.js');
  return { useClientState: () => useSyncExternalStore(store.subscribe, store.getSnapshot) };
});

import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { ActivityListView } from '../src/client/activity-list-view.js';
import { store } from '../src/client/store.js';

describe('Human Inbox inline reply', () => {
  it.each(['unread', 'replies', 'mention'] as const)(
    'keeps %s context and draft across refresh and failure, and retries one reply id',
    async (category) => {
      const inboxCategory = category === 'mention' ? 'replies' : category;
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      let seeMessage: ((id: string) => void) | undefined;
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          constructor(
            callback: (
              entries: Array<{
                isIntersecting: boolean;
                intersectionRatio: number;
                target: Element;
              }>,
            ) => void,
          ) {
            seeMessage = (id) =>
              callback([
                {
                  isIntersecting: true,
                  intersectionRatio: 1,
                  target: document.querySelector('[data-message-id="' + id + '"]')!,
                },
              ]);
          }
          observe() {}
          disconnect() {}
        },
      );
      const previous = store.getSnapshot();
      const requests: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
      let failReply = true;
      let failContext = false;
      const call: BridgeCall = async (endpoint, payload) => {
        requests.push({ endpoint, payload });
        if (endpoint === 'channelTimeline' && failContext)
          return {
            ok: false,
            error: { code: 'invalid-input', message: 'Source unavailable', details: {} },
          };
        if (endpoint === 'channelTimeline')
          return {
            ok: true,
            value: {
              revision: 2,
              page: {
                entries: [
                  {
                    id: 'before',
                    at: '2026-09-30T12:00:00Z',
                    author: { kind: 'human' },
                    body: 'Please review.',
                  },
                  {
                    id: 'source',
                    at: '2026-09-30T12:01:00Z',
                    author: { kind: 'bot', slug: 'ada' },
                    body: 'The launch plan is ready.',
                  },
                  {
                    id: 'newer',
                    at: '2026-09-30T12:01:30Z',
                    author: { kind: 'bot', slug: 'ada' },
                    body: 'New release check update.',
                  },
                ],
                olderCursor: null,
                newerCursor: null,
                hasOlder: false,
                hasNewer: false,
              },
            },
          };
        if (endpoint === 'channelSend')
          return failReply
            ? {
                ok: false,
                error: {
                  code: 'invalid-input',
                  message: 'Reply target must exist in this Channel',
                  details: {},
                },
              }
            : {
                ok: true,
                value: {
                  message: {
                    id: payload['messageId'],
                    at: '2026-09-30T12:02:00Z',
                    author: { kind: 'human' },
                    body: payload['body'],
                    replyTo: payload['replyTo'],
                  },
                },
              };
        if (endpoint === 'humanAttentionStatus')
          return { ok: true, value: { unreadCount: 0, hasAction: false } };
        return { ok: true, value: { items: [] } };
      };
      const actions = createActions(call, store);
      store.select({ kind: 'inbox' });
      store.setActivityList({
        category: inboxCategory,
        status: 'ready',
        items: [
          {
            id: 'unread:group-team',
            kind:
              category === 'mention'
                ? 'channel-mention'
                : category === 'replies'
                  ? 'channel-reply'
                  : 'channel-unread',
            category: inboxCategory,
            createdAt: '2026-09-30T12:01:00Z',
            channelId: 'group-team',
            channelName: 'Launch planning',
            botSlug: 'ada',
            messageId: 'source',
            summary: 'The launch plan is ready.',
            unreadCount: 1,
            sourceEventId: 'source-event',
            isUnread: true,
          },
        ],
      });
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      const button = (text: string) =>
        [...container.querySelectorAll<HTMLButtonElement>('button')].find(
          (candidate) => candidate.textContent === text,
        );
      try {
        await act(async () => root.render(createElement(ActivityListView, { actions })));
        expect(requests.some((request) => request.endpoint === 'channelMarkRead')).toBe(false);
        await act(async () => button('回复')?.click());
        expect(container.querySelector('.bh-activity-list-reply-source')?.textContent).toContain(
          'The launch plan is ready.',
        );
        const textarea = container.querySelector('textarea')!;
        await act(async () => {
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
            textarea,
            'Launch Friday.',
          );
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => seeMessage?.('source'));
        expect(requests.find((request) => request.endpoint === 'channelMarkRead')?.payload).toEqual(
          {
            channelId: 'group-team',
            messageId: 'source',
          },
        );
        expect(container.querySelector('textarea')?.value).toBe('Launch Friday.');
        expect(container.querySelector('.bh-activity-list-reply-source')?.textContent).toContain(
          'The launch plan is ready.',
        );
        expect(
          requests.some(
            (request) =>
              request.endpoint === 'channelMarkRead' && request.payload['messageId'] === 'newer',
          ),
        ).toBe(false);
        expect(container.querySelectorAll('.bh-activity-list-message time')).toHaveLength(1);
        await act(async () =>
          container.querySelector<HTMLButtonElement>('.bh-activity-list-context-older')!.click(),
        );
        await act(async () =>
          container.querySelector<HTMLButtonElement>('.bh-activity-list-context-newer')!.click(),
        );
        expect(
          [...container.querySelectorAll('.bh-activity-list-message')].map((row) =>
            row.getAttribute('data-message-id'),
          ),
        ).toEqual(['before', 'source', 'newer']);
        expect(container.querySelectorAll('.bh-activity-list-message time')).toHaveLength(3);
        await act(async () => seeMessage?.('newer'));
        expect(
          requests.filter((request) => request.endpoint === 'channelMarkRead').at(-1)?.payload,
        ).toEqual({ channelId: 'group-team', messageId: 'newer' });
        failContext = true;
        await act(async () =>
          container
            .querySelector<HTMLButtonElement>(
              '.bh-activity-list-reply-source .bh-activity-list-message-source',
            )!
            .click(),
        );
        expect(store.getSnapshot().selection).toEqual({ kind: 'inbox' });
        expect(container.querySelector('textarea')?.value).toBe('Launch Friday.');
        expect(container.textContent).toContain('来源已不可用');
        await act(async () => button('重试')?.click());
        expect(container.textContent).toContain('来源已不可用');
        expect(container.querySelector('textarea')?.value).toBe('Launch Friday.');
        expect(button('发送回复')?.disabled).toBe(true);
        failContext = false;
        await act(async () => button('重试')?.click());
        await act(async () => button('发送回复')?.click());
        expect(container.textContent).toContain('草稿已保留');
        expect(container.querySelector('textarea')?.value).toBe('Launch Friday.');
        failReply = false;
        await act(async () => button('发送回复')?.click());
        expect(container.textContent).toContain('回复已发送');
        expect(store.getSnapshot().selection).toEqual({ kind: 'inbox' });
        const sends = requests.filter((request) => request.endpoint === 'channelSend');
        expect(sends).toHaveLength(2);
        expect(sends[0]?.payload).toEqual(sends[1]?.payload);
        expect(sends[0]?.payload).toMatchObject({
          channelId: 'group-team',
          replyTo: 'source',
          body: 'Launch Friday.',
        });
      } finally {
        await act(async () => root.unmount());
        container.remove();
        store.select(previous.selection);
        store.setActivityList(previous.activityList);
        vi.unstubAllGlobals();
      }
    },
  );
});
