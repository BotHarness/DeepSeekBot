// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
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
import { ActivityCenterView } from '../src/client/activity-center-view.js';
import { activityFeedFor } from '../src/client/activity-feed.js';
import { store, type HumanAttentionItem } from '../src/client/store.js';

const item: HumanAttentionItem = {
  id: 'approval:ada',
  kind: 'tool-approval',
  category: 'action',
  createdAt: '2026-10-17T08:00:00Z',
  channelId: 'group-qa',
  channelName: 'Release QA',
  botSlug: 'ada',
  messageId: 'approval-1',
  summary: 'Approve command',
};

it.each(['page', 'panel'] as const)(
  'decides in the %s list without opening a detail pane or changing the active Channel',
  async (placement) => {
    await scenario(placement, 'success');
  },
);
it('keeps a refused submission retryable and does not hide the pending request', async () => {
  await scenario('panel', 'retry');
});
it('does not submit a stale card after the owning request expires', async () => {
  await scenario('panel', 'expired');
});

async function scenario(placement: 'page' | 'panel', mode: 'success' | 'retry' | 'expired') {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = store.getSnapshot();
  let pending = true;
  let fail = mode === 'retry';
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  const call: BridgeCall = async (endpoint, payload) => {
    calls.push({ endpoint, payload });
    if (endpoint === 'humanAttention')
      return {
        ok: true,
        value: { queryVersion: 1, items: pending && payload.category === 'action' ? [item] : [] },
      };
    if (endpoint === 'humanAttentionStatus')
      return { ok: true, value: { unreadCount: 0, hasAction: pending } };
    if (endpoint === 'channelTimeline')
      return {
        ok: true,
        value: {
          revision: 1,
          page: {
            entries: [
              {
                id: 'before',
                at: item.createdAt,
                author: { kind: 'human' },
                body: 'Check release files.',
              },
              {
                id: item.messageId,
                at: item.createdAt,
                author: { kind: 'bot', slug: 'ada' },
                body: item.summary,
                toolApprovalRequest: {
                  sessionId: 'session-1',
                  callId: 'call-1',
                  toolName: 'bash',
                  role: 'orchestrator',
                  cwd: '/qa',
                  input: '{"command":"echo APPROVAL_2026"}',
                },
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
      if (fail)
        return { ok: false, error: { code: 'unavailable', message: 'Try again', details: {} } };
      pending = false;
      return { ok: true, value: { accepted: true } };
    }
    throw new Error('Unexpected endpoint: ' + endpoint);
  };
  const actions = createActions(call, store);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const button = (text: string) =>
    [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.textContent?.trim() === text,
    );
  store.select(placement === 'panel' ? { kind: 'bot', slug: 'other' } : { kind: 'inbox' });
  store.setHumanInbox({
    ...previous.humanInbox,
    category: 'action',
    sort: 'oldest',
    status: 'idle',
    items: [],
    botSlug: undefined,
    channelId: undefined,
  });
  const selection = store.getSnapshot().selection;
  try {
    await act(async () => root.render(createElement(ActivityCenterView, { actions, placement })));
    expect(button('仅批准这一次')).toBeDefined();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('.bh-human-inbox-detail')).toBeNull();
    expect(container.querySelector('.bh-overview')).toBeNull();
    expect(button('始终允许此范围全部不透明工具')).toBeUndefined();
    expect(container.textContent).toContain('echo APPROVAL_2026');
    expect(container.textContent).not.toContain('Check release files.');
    expect(calls.some((entry) => entry.endpoint === 'activityOverview')).toBe(false);
    expect(calls.some((entry) => entry.endpoint === 'channelMarkRead')).toBe(false);
    expect(container.querySelector('.bh-human-inbox-batch')).toBeNull();
    await act(async () => button('选择')!.click());
    expect(container.querySelector('.bh-human-inbox-batch')).not.toBeNull();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector('.bh-human-inbox-filters')).toBeNull();
    if (placement === 'page') {
      const settings = () =>
        container.querySelector<HTMLButtonElement>('header button[aria-label="通知设置"]')!;
      await act(async () => settings().click());
      await act(async () => button('最新在前')!.click());
      expect(activityFeedFor(actions).getSnapshot().query.sort).toBe('newest');
      expect(container.querySelector('.bh-human-inbox-batch')).toBeNull();
      expect(
        calls
          .filter(
            (entry) => entry.endpoint === 'humanAttention' && entry.payload.category === 'action',
          )
          .at(-1)?.payload.sort,
      ).toBe('newest');
      await act(async () => settings().click());
      await act(async () => button('已处理')!.click());
      expect(activityFeedFor(actions).getSnapshot().query.category).toBe('handled');
      await act(async () => settings().click());
      await act(async () => button('需要你处理')!.click());
      expect(activityFeedFor(actions).getSnapshot().query.category).toBe('action');
      expect(container.querySelector('[role="tablist"]')).toBeNull();
      await act(async () => button('选择')!.click());
    }

    await act(async () => button('取消')!.click());
    expect(container.querySelector('.bh-human-inbox-batch')).toBeNull();
    await act(async () => button('查看上下文')!.click());
    expect(container.querySelector('.bh-activity-approval .bh-human-inbox-reply')).not.toBeNull();
    expect(container.querySelectorAll('.bh-tool-approval-card')).toHaveLength(1);
    expect(container.textContent).toContain('Check release files.');
    await act(async () => button('收起上下文')!.click());
    const card = container.querySelector<HTMLElement>('.bh-tool-approval-card')!;
    card.focus();
    await act(async () => {
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', bubbles: true }));
    });
    expect(calls.filter((entry) => entry.endpoint === 'toolApprovalDecide')).toHaveLength(0);
    if (mode === 'expired') pending = false;
    await act(async () => button(placement === 'panel' ? '拒绝' : '仅批准这一次')!.click());
    if (mode === 'expired') {
      expect(calls.filter((entry) => entry.endpoint === 'toolApprovalDecide')).toHaveLength(0);
      expect(container.textContent).toContain('已过期');
    } else {
      if (mode === 'retry') {
        expect(container.textContent).toContain('Try again');
        expect(button('拒绝')?.disabled).toBe(false);
        expect(activityFeedFor(actions).getSnapshot().pages.action.items).toHaveLength(1);
        fail = false;
        await act(async () => button('拒绝')!.click());
      }
      expect(
        calls.filter((entry) => entry.endpoint === 'toolApprovalDecide').at(-1)?.payload,
      ).toEqual({
        channelId: 'group-qa',
        messageId: 'approval-1',
        outcome: placement === 'panel' ? 'rejected' : 'allowed-once',
      });
      expect(activityFeedFor(actions).getSnapshot().pages.action.items).toHaveLength(0);
      expect(container.querySelector('[data-leaving]')).not.toBeNull();
      await act(async () => new Promise((resolve) => setTimeout(resolve, 250)));
      expect(container.querySelector('[data-attention-id]')).toBeNull();
    }
    expect(store.getSnapshot().selection).toEqual(selection);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.select(previous.selection);
    store.setHumanInbox(previous.humanInbox);
  }
}

it('preserves the read write error when status reconciliation also fails', async () => {
  const failure = new Error('Read write refused');
  const actions = createActions(async (endpoint) => {
    if (endpoint === 'channelMarkAllRead') throw failure;
    if (endpoint === 'humanAttentionStatus') throw new Error('Status unavailable');
    throw new Error(endpoint);
  }, store);
  await expect(actions.markAllRead()).rejects.toBe(failure);
});

it('keeps a newer unread query when read reconciliation returns an older snapshot', async () => {
  let release: (() => void) | undefined;
  let queried: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    queried = resolve;
  });
  let statusQueries = 0;
  const actions = createActions(async (endpoint) => {
    if (endpoint === 'channelMarkAllRead') return { ok: true, value: { channels: 1 } };
    if (endpoint === 'humanAttentionStatus') {
      if (++statusQueries === 1) {
        queried?.();
        return new Promise((resolve) => {
          release = () => resolve({ ok: true, value: { unreadCount: 0, hasAction: true } });
        });
      }
      return { ok: true, value: { unreadCount: 1, hasAction: true } };
    }
    throw new Error(endpoint);
  }, store);
  const reading = actions.markAllRead();
  await started;
  await actions.refreshHumanInboxStatus();
  release?.();
  await reading;
  expect(store.getSnapshot().humanInbox.unreadCount).toBe(1);
});
