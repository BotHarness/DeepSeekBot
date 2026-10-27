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
  Input: () => null,
}));

import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { HumanInboxView } from '../src/client/human-inbox-view.js';
import { store, type HumanAttentionItem } from '../src/client/store.js';

describe('Human Inbox Assignment reply', () => {
  it('shows exact report context, sends one addressed DM response and opens the native Session', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot();
    const source: HumanAttentionItem = {
      id: 'assignment:session',
      category: 'action',
      kind: 'assignment-blocked',
      botSlug: 'ada',
      assignmentSessionId: 'session',
      sourceEventId: 'report',
      createdAt: '2026-10-01T10:00:00Z',
      summary: 'Choose a route',
    };
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    const openSession = vi.fn();
    const call: BridgeCall = async (endpoint, payload) => {
      calls.push({ endpoint, payload });
      if (endpoint === 'humanAssignmentContext')
        return {
          ok: true,
          value: {
            context: {
              botSlug: 'ada',
              sessionId: 'session',
              sourceEventId: 'report',
              title: 'Launch review',
              description: 'Review the launch checklist before release.',
              purpose: 'Review the launch checklist before release.',
              canReply: true,
              reports: [
                {
                  sourceEventId: 'before',
                  at: '2026-10-01T09:59:00Z',
                  state: 'progress',
                  summary: 'Dependencies ready',
                },
                {
                  sourceEventId: 'report',
                  at: source.createdAt,
                  state: 'blocked',
                  summary: source.summary,
                },
              ],
            },
          },
        };
      if (endpoint === 'channelSend')
        return {
          ok: true,
          value: {
            message: {
              id: payload['messageId'],
              at: '2026-10-01T10:01:00Z',
              author: { kind: 'human' },
              body: payload['body'],
              assignmentReply: payload['assignmentReply'],
            },
          },
        };
      if (endpoint === 'humanAttentionStatus')
        return { ok: true, value: { unreadCount: 1, hasAction: true } };
      if (endpoint === 'humanAttention') return { ok: true, value: { items: [source] } };
      throw new Error('Unexpected endpoint ' + endpoint);
    };
    const actions = createActions(call, store, {
      pickDirectory: async () => null,
      createWorkspace: async () => ({ workspaceId: 'project' }),
      openSession,
    });
    store.select({ kind: 'inbox' });
    store.setHumanInbox({ category: 'action', sort: 'oldest', status: 'ready', items: [source] });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const button = (text: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        (node) => node.textContent === text,
      )!;
    try {
      await act(async () => root.render(createElement(HumanInboxView, { actions })));
      await act(async () => button('回应事项').click());
      expect(container.querySelector('.bh-human-inbox-detail')).not.toBeNull();
      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(container.textContent).toContain('Launch review');
      expect(container.textContent).not.toContain('Dependencies ready');
      await act(async () =>
        container.querySelector<HTMLButtonElement>('.bh-human-inbox-context-older')!.click(),
      );
      expect(container.textContent).toContain('Dependencies ready');
      const input = container.querySelector('textarea')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
          input,
          'Use canary',
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => button('发送回复').click());
      expect(calls.find((row) => row.endpoint === 'channelSend')?.payload).toMatchObject({
        channelId: 'dm-ada',
        body: 'Use canary',
        assignmentReply: { sessionId: 'session', sourceEventId: 'report' },
      });
      expect(container.textContent).toContain('已发送给 Bot');
      expect(store.getSnapshot().selection).toEqual({ kind: 'inbox' });
      await act(async () => button('打开 Assignment Session').click());
      expect(openSession).toHaveBeenCalledWith('session');
      openSession.mockImplementationOnce(() => {
        throw new Error('DSH Session navigation is unavailable');
      });
      await act(async () => button('打开 Assignment Session').click());
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('来源已不可用');
      expect(store.getSnapshot().selection).toEqual({ kind: 'inbox' });
      await act(async () => button('查看来源').click());
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('来源已不可用');
      expect(container.textContent).toContain('Use canary');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.select(previous.selection);
      store.setHumanInbox(previous.humanInbox);
    }
  });
});
