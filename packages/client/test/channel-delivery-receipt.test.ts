// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { ChannelDeliveryReceipt } from '../src/client/channel-delivery-receipt.js';
import { zhTranslate } from '../src/client/locale.js';
import type { BotSummary, ChannelMessage } from '../src/client/store.js';

const bots: BotSummary[] = ['ada', 'bea', 'cee', 'dee', 'elle', 'fen', 'gia', 'hank'].map(
  (slug) => ({
    slug,
    displayName: slug.toUpperCase(),
    roles: [],
    aggregateState: 'idle',
    workspaces: [],
    createdAt: '2026-09-26T00:00:00.000Z',
  }),
);

const message: ChannelMessage = {
  id: 'm1',
  at: '2026-09-26T00:00:00.000Z',
  author: { kind: 'bot', slug: 'ada' },
  body: 'Please coordinate',
  deliveries: [
    { botSlug: 'ada', state: 'handled' },
    { botSlug: 'bea', state: 'pending' },
    { botSlug: 'cee', state: 'running' },
    { botSlug: 'dee', state: 'handled' },
    { botSlug: 'elle', state: 'ignored' },
    { botSlug: 'fen', state: 'retryable' },
    { botSlug: 'gia', state: 'needs-repair' },
    { botSlug: 'hank', state: 'observed' },
  ],
};

describe('Channel delivery receipt', () => {
  it('keeps the sender out and opens a live per-Bot status card', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(createElement(ChannelDeliveryReceipt, { message, bots, t: zhTranslate })),
      );
      const trigger = host.querySelector<HTMLButtonElement>('.bh-delivery-trigger');
      expect(trigger?.getAttribute('aria-label')).toContain('1 已处理');
      expect(trigger?.getAttribute('aria-label')).toContain('1 处理中');
      expect(trigger?.getAttribute('aria-label')).toContain('1 已投递');
      const pie = trigger?.querySelector<HTMLElement>('.bh-delivery-pie');
      expect(pie?.getAttribute('style')).toContain('conic-gradient');
      expect(pie?.getAttribute('style')).toContain('var(--dsw-alias-state-business-primary)');
      expect(trigger?.querySelector('svg')).toBeNull();
      expect(trigger?.hasAttribute('title')).toBe(false);
      expect(document.body.querySelector('.bh-delivery-panel')).toBeNull();
      expect(trigger?.getAttribute('aria-expanded')).toBe('false');

      await act(async () => trigger?.click());
      const panel = document.body.querySelector<HTMLElement>('.bh-delivery-panel');
      expect(panel).not.toBeNull();
      expect(trigger?.getAttribute('aria-expanded')).toBe('true');
      expect(panel?.textContent).toContain('BEA');
      expect(panel?.textContent).toContain('CEE');
      expect(panel?.textContent).toContain('DEE');
      expect(panel?.textContent).toContain('HANK');
      expect(panel?.textContent).toContain('已读');
      expect(panel?.textContent).toContain('已忽略');
      expect(panel?.textContent).toContain('失败，可重试');
      expect(panel?.textContent).toContain('处理失败，需检查');
      expect(panel?.textContent).not.toContain('ADA');

      await act(async () =>
        root.render(
          createElement(ChannelDeliveryReceipt, {
            message: {
              ...message,
              deliveries: (message.deliveries ?? []).map((item) =>
                item.botSlug === 'bea' ? { ...item, state: 'handled' as const } : item,
              ),
            },
            bots,
            t: zhTranslate,
          }),
        ),
      );
      expect(trigger?.getAttribute('aria-label')).toContain('2 已处理');
      expect(panel?.textContent).toContain('2 已处理');

      await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
      expect(document.body.querySelector('.bh-delivery-panel')).toBeNull();
      expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('shows local Human unread and read status only for another author', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const botMessage: ChannelMessage = {
      ...message,
      deliveries: [],
      humanReceipts: [{ humanId: 'local-human', displayName: 'Human', state: 'unread' }],
    };
    try {
      await act(async () =>
        root.render(
          createElement(ChannelDeliveryReceipt, { message: botMessage, bots, t: zhTranslate }),
        ),
      );
      const trigger = host.querySelector<HTMLButtonElement>('.bh-delivery-trigger');
      expect(trigger?.getAttribute('aria-label')).toContain('1 你未读');
      await act(async () => trigger?.click());
      expect(document.body.querySelector('.bh-delivery-panel')?.textContent).toContain('你');
      await act(async () =>
        root.render(
          createElement(ChannelDeliveryReceipt, {
            message: {
              ...botMessage,
              humanReceipts: [{ ...botMessage.humanReceipts![0]!, state: 'read' }],
            },
            bots,
            t: zhTranslate,
          }),
        ),
      );
      expect(trigger?.getAttribute('aria-label')).toContain('1 你已读');
      await act(async () =>
        root.render(
          createElement(ChannelDeliveryReceipt, {
            message: botMessage,
            bots,
            humanMembers: [{ humanId: 'local-human', displayName: '教授 🐻' }],
            t: zhTranslate,
          }),
        ),
      );
      expect(document.body.querySelector('.bh-delivery-panel')?.textContent).toContain('教授 🐻');
      await act(async () =>
        root.render(
          createElement(ChannelDeliveryReceipt, {
            message: { ...botMessage, author: { kind: 'human' } },
            bots,
            t: zhTranslate,
          }),
        ),
      );
      expect(host.querySelector('.bh-delivery-trigger')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('shows independent Bot statuses for a system-authored departure notice', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          createElement(ChannelDeliveryReceipt, {
            message: {
              ...message,
              author: { kind: 'system' },
              body: 'ADA left the Channel.',
              memberDeparture: { memberKind: 'bot', memberId: 'ada', displayName: 'ADA' },
              deliveries: [
                { botSlug: 'bea', state: 'pending' },
                { botSlug: 'cee', state: 'handled' },
              ],
            },
            bots,
            t: zhTranslate,
          }),
        ),
      );
      const trigger = host.querySelector<HTMLButtonElement>('.bh-delivery-trigger');
      expect(trigger?.getAttribute('aria-label')).toContain(
        '1 ' + zhTranslate('message.delivery.pending'),
      );
      expect(trigger?.getAttribute('aria-label')).toContain(
        '1 ' + zhTranslate('message.delivery.handled'),
      );
      await act(async () => trigger?.click());
      const panel = document.body.querySelector('.bh-delivery-panel');
      expect(panel?.textContent).toContain('BEA');
      expect(panel?.textContent).toContain('CEE');
      expect(panel?.textContent).not.toContain('ADA');
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('shows no pie without an admitted recipient or for an optimistic echo', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          createElement(ChannelDeliveryReceipt, {
            message: { ...message, deliveries: [{ botSlug: 'ada', state: 'handled' }] },
            bots,
            t: zhTranslate,
          }),
        ),
      );
      expect(host.innerHTML).toBe('');
      await act(async () =>
        root.render(
          createElement(ChannelDeliveryReceipt, {
            message: {
              ...message,
              deliveries: [
                { botSlug: 'ada', state: 'handled' },
                { botSlug: 'bea', state: 'handled' },
              ],
            },
            bots,
            t: zhTranslate,
          }),
        ),
      );
      expect(host.querySelector('.bh-delivery-pie')?.getAttribute('style')).toContain(
        'var(--dsw-alias-state-success-primary)',
      );
      expect(host.querySelector('.bh-delivery-pie')?.getAttribute('style')).not.toContain(
        'conic-gradient',
      );
      await act(async () =>
        root.render(
          createElement(ChannelDeliveryReceipt, {
            message: { ...message, pending: true },
            bots,
            t: zhTranslate,
          }),
        ),
      );
      expect(host.innerHTML).toBe('');
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
