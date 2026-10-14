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
import { createStore, store, type HumanAttentionItem } from '../src/client/store.js';

const item = (slug: string, minute: string): HumanAttentionItem => ({
  id: 'approval:' + slug,
  kind: 'tool-approval',
  category: 'action',
  createdAt: '2026-10-01T08:' + minute + ':00Z',
  channelId: 'dm-' + slug,
  channelName: 'channel-' + slug,
  botSlug: slug,
  messageId: 'request-' + slug,
  summary: 'Approve bash',
});

describe('Human Inbox tool approval', () => {
  it.each(['allowed-once', 'rejected', 'stale'] as const)(
    'decides %s through the source command while keeping other Bot requests independent',
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
                    body: 'Approve bash',
                    toolApprovalRequest: {
                      sessionId: 'session-ada',
                      callId: 'call-ada',
                      toolName: 'bash',
                      role: 'orchestrator',
                      cwd: '/qa/release',
                      input: '{"command":"echo QA_RELEASE"}',
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
        if (endpoint === 'toolApprovalStatus')
          return { ok: true, value: { status: pending ? 'pending' : 'expired' } };
        if (endpoint === 'toolApprovalDecide') {
          pending = false;
          return outcome === 'stale'
            ? {
                ok: false,
                error: {
                  code: 'invalid-input',
                  message: 'Tool approval request is no longer pending',
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
        expect(button('处理审批')).toBeDefined();
        await act(async () => button('处理审批')!.click());
        expect(container.querySelector('.bh-human-inbox-detail')).not.toBeNull();
        expect(container.querySelector('[role="dialog"]')).toBeNull();
        expect(container.querySelector('.bh-tool-approval-input')).toBeNull();
        await act(async () =>
          container.querySelector<HTMLButtonElement>('.bh-request-summary')!.click(),
        );
        expect(container.querySelector('.bh-tool-approval-input')?.textContent).toBe(
          '$ echo QA_RELEASE',
        );
        expect(container.textContent).toContain('/qa/release');
        expect(container.querySelector('textarea')).toBeNull();
        expect(container.querySelector('.bh-human-inbox-reply h2')?.textContent).toBe(
          '工具审批 · ada',
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
        await act(async () => button(outcome === 'rejected' ? '拒绝' : '仅批准这一次')!.click());
        expect(
          calls.filter((c) => c.endpoint === 'toolApprovalDecide').map((c) => c.payload),
        ).toEqual([
          {
            channelId: 'dm-ada',
            messageId: 'request-ada',
            outcome: outcome === 'rejected' ? 'rejected' : 'allowed-once',
          },
        ]);
        expect(store.getSnapshot().selection).toEqual({ kind: 'inbox' });
        expect(store.getSnapshot().humanInbox.items.map((i) => i.botSlug)).toEqual(['bea']);
        expect(container.textContent).toContain(
          outcome === 'stale' ? '已过期' : outcome === 'rejected' ? '已拒绝' : '已允许',
        );
        expect(button('仅批准这一次')).toBeUndefined();
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

it('opens a fresh Human Inbox with oldest action order', async () => {
  const client = createStore();
  const requests: Record<string, unknown>[] = [];
  const call: BridgeCall = async (endpoint, payload) => {
    if (endpoint === 'humanAttention') {
      requests.push(payload);
      return { ok: true, value: { items: [] } };
    }
    return { ok: true, value: { unreadCount: 0, hasAction: false } };
  };
  await createActions(call, client).openHumanInbox();
  expect(requests).toMatchObject([{ category: 'action', sort: 'oldest' }]);
});

it('removes a confirmed decision from retained older pages', async () => {
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
    if (endpoint === 'toolApprovalDecide') return { ok: true, value: { accepted: true } };
    if (endpoint === 'humanAttention')
      return { ok: true, value: { items: older.slice(0, 50), nextCursor: 'new-head' } };
    return { ok: true, value: { unreadCount: 0, hasAction: true } };
  };
  await createActions(call, client).decideToolApproval(
    target.channelId!,
    target.messageId!,
    'allowed-once',
  );
  expect(client.getSnapshot().humanInbox.items.map((i) => i.id)).toEqual(
    older.slice(0, 50).map((i) => i.id),
  );
});
