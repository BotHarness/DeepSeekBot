// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./activity-list-test-controls.js')),
  Button: ({ children, ...props }: { children: ReactNode }) =>
    createElement('button', props, children),
  MarkdownText: () => null,
  StateDot: () => null,
  Input: () => null,
}));
import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { ActivityListReply } from '../src/client/activity-list-reply.js';
import { ActivityListDismiss } from '../src/client/activity-list-detail-controls.js';
import { createStore, type ChannelMessage, type HumanAttentionItem } from '../src/client/store.js';
import { zhTranslate } from '../src/client/locale.js';
afterEach(() => vi.unstubAllGlobals());
const source: HumanAttentionItem = {
  id: 'reply:source-event',
  sourceEventId: 'source-event',
  channelId: 'group',
  messageId: 'source',
  category: 'replies',
  kind: 'channel-reply',
  createdAt: '2026-10-01T12:00:00Z',
  botSlug: 'ada',
  summary: 'Please review',
};
const message = (id: string): ChannelMessage => ({
  id,
  at: source.createdAt,
  author: { kind: 'bot', slug: 'ada' },
  body: id,
});

describe('Inbox detail context controls', () => {
  it('loads each direction independently through canonical cursors and navigates the exact hovered message', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal('IntersectionObserver', undefined);
    const requests: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    const call: BridgeCall = async (endpoint, payload) => {
      requests.push({ endpoint, payload });
      if (endpoint === 'channelTimeline') {
        const direction = payload['direction'];
        return {
          ok: true,
          value: {
            revision: 9,
            page:
              direction === 'around' && payload['around'] === 'new4'
                ? {
                    entries: ['new4', 'new5'].map(message),
                    olderCursor: null,
                    newerCursor: null,
                    hasOlder: false,
                    hasNewer: false,
                  }
                : direction === 'around'
                  ? {
                      entries: ['old2', 'old1', 'source', 'new1', 'new2'].map(message),
                      olderCursor: 'older-page',
                      newerCursor: 'newer-page',
                      hasOlder: true,
                      hasNewer: true,
                    }
                  : direction === 'older'
                    ? {
                        entries: ['old4', 'old3'].map(message),
                        olderCursor: null,
                        newerCursor: 'unused',
                        hasOlder: false,
                        hasNewer: true,
                      }
                    : {
                        entries: ['new3', 'new4'].map(message),
                        olderCursor: 'unused',
                        newerCursor: null,
                        hasOlder: true,
                        hasNewer: false,
                      },
          },
        };
      }
      return { ok: true, value: { items: [] } };
    };
    const actions = createActions(call, createStore());
    const open = vi.spyOn(actions, 'openChannelAtMessage').mockResolvedValue(undefined);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const ids = () =>
      [...host.querySelectorAll('[data-message-id]')].map((row) =>
        row.getAttribute('data-message-id'),
      );
    const edge = (direction: string) =>
      host.querySelector<HTMLButtonElement>('.bh-activity-list-context-' + direction)!;
    try {
      await act(async () =>
        root.render(
          createElement(ActivityListReply, {
            source,
            actions,
            t: zhTranslate,
            bots: [],
            botName: () => 'Ada',
            onClose: () => undefined,
          }),
        ),
      );
      expect(ids()).toEqual(['source']);
      await act(async () => edge('older').click());
      expect(ids()).toEqual(['old2', 'old1', 'source']);
      await act(async () => edge('older').click());
      expect(ids()).toEqual(['old4', 'old3', 'old2', 'old1', 'source']);
      expect(edge('older').disabled).toBe(true);
      await act(async () => edge('newer').click());
      await act(async () => edge('newer').click());
      expect(ids()).toEqual([
        'old4',
        'old3',
        'old2',
        'old1',
        'source',
        'new1',
        'new2',
        'new3',
        'new4',
      ]);
      expect(edge('newer').disabled).toBe(false);
      expect(
        requests.filter((row) => row.endpoint === 'channelTimeline').map((row) => row.payload),
      ).toEqual([
        { channelId: 'group', direction: 'around', around: 'source', olderLimit: 2, newerLimit: 2 },
        { channelId: 'group', direction: 'older', cursor: 'older-page', limit: 10 },
        { channelId: 'group', direction: 'newer', cursor: 'newer-page', limit: 10 },
      ]);
      await act(async () => edge('newer').click());
      expect(ids().at(-1)).toBe('new5');
      expect(requests.filter((row) => row.endpoint === 'channelTimeline').at(-1)?.payload).toEqual({
        channelId: 'group',
        direction: 'around',
        around: 'new4',
        olderLimit: 0,
        newerLimit: 10,
      });
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>(
            '[data-message-id="old3"] .bh-activity-list-message-source',
          )!
          .click(),
      );
      expect(open).toHaveBeenCalledWith('group', 'old3');
      expect(host.textContent).not.toContain('刷新上下文');
      expect(requests.some((row) => row.endpoint === 'channelMarkRead')).toBe(false);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('keeps a failed dismissal visible for retry and commits only the Inbox decision', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    let accepted = false;
    const requests: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    const call: BridgeCall = async (endpoint, payload) => {
      requests.push({ endpoint, payload });
      if (endpoint === 'humanAttentionDismiss') return { ok: true, value: { accepted } };
      if (endpoint === 'humanAttentionStatus')
        return { ok: true, value: { unreadCount: 3, hasAction: false } };
      return { ok: true, value: { items: [] } };
    };
    const store = createStore();
    const actions = createActions(call, store);
    const close = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          createElement(ActivityListDismiss, { source, actions, t: zhTranslate, onClose: close }),
        ),
      );
      await act(async () => host.querySelector('button')!.click());
      expect(close).not.toHaveBeenCalled();
      expect(host.querySelector('[role="alert"]')).not.toBeNull();
      accepted = true;
      await act(async () => host.querySelector('button')!.click());
      expect(close).toHaveBeenCalledTimes(1);
      expect(
        requests
          .filter((row) => row.endpoint === 'humanAttentionDismiss')
          .map((row) => row.payload),
      ).toEqual([
        { itemId: source.id, sourceKey: source.sourceEventId },
        { itemId: source.id, sourceKey: source.sourceEventId },
      ]);
      expect(
        requests.some((row) =>
          [
            'channelSend',
            'channelMarkRead',
            'toolApprovalDecide',
            'userQuestionAnswer',
            'grantCreate',
          ].includes(row.endpoint),
        ),
      ).toBe(false);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
