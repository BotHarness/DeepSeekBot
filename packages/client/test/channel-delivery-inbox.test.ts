// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { ChannelDeliveryReceipt } from '../src/client/channel-delivery-receipt.js';
import { zhTranslate } from '../src/client/locale.js';
import type { BotSummary, ChannelMessage } from '../src/client/store.js';

const bots: BotSummary[] = ['ada', 'bea'].map((slug) => ({
  slug,
  displayName: slug.toUpperCase(),
  roles: [],
  aggregateState: 'idle',
  workspaces: [],
  createdAt: '2026-10-26T00:00:00.000Z',
}));

const message: ChannelMessage = {
  id: 'm1',
  at: '2026-10-26T00:00:00.000Z',
  author: { kind: 'human' },
  body: '@ADA @BEA please check',
  mentions: [
    { botSlug: 'ada', label: 'ADA', start: 0, end: 4 },
    { botSlug: 'bea', label: 'BEA', start: 5, end: 9 },
  ],
  deliveries: [{ botSlug: 'ada', state: 'ignored' }],
};

async function render(element: ReturnType<typeof createElement>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  return {
    host,
    async cleanup() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

describe('Channel delivery receipt Inbox drill-down', () => {
  it('marks an @-mentioned Bot without an Inbox admission as not received', async () => {
    const view = await render(
      createElement(ChannelDeliveryReceipt, { message, bots, t: zhTranslate }),
    );
    try {
      const trigger = view.host.querySelector<HTMLButtonElement>('.bh-delivery-trigger');
      expect(trigger?.getAttribute('aria-label')).toContain('1 未收到');
      expect(trigger?.getAttribute('aria-label')).toContain('1 已忽略');
      expect(view.host.querySelector('.bh-delivery-pie')?.getAttribute('style')).toContain(
        'var(--dsw-alias-state-warn-primary)',
      );
      await act(async () => trigger?.click());
      expect(document.body.querySelector('.bh-delivery-bot')).toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  it('shows the pie for a Human message whose only mention was never admitted', async () => {
    const view = await render(
      createElement(ChannelDeliveryReceipt, {
        message: { ...message, deliveries: [] },
        bots,
        t: zhTranslate,
      }),
    );
    try {
      const trigger = view.host.querySelector<HTMLButtonElement>('.bh-delivery-trigger');
      expect(trigger?.getAttribute('aria-label')).toContain('2 未收到');
    } finally {
      await view.cleanup();
    }
  });

  it('does not invent missing recipients for a Bot-authored mention', async () => {
    const view = await render(
      createElement(ChannelDeliveryReceipt, {
        message: { ...message, author: { kind: 'bot', slug: 'ada' }, deliveries: [] },
        bots,
        t: zhTranslate,
      }),
    );
    try {
      expect(view.host.querySelector('.bh-delivery-trigger')).toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  it('reports the clicked Bot and whether it ever received the message', async () => {
    const onOpenInbox = vi.fn();
    const view = await render(
      createElement(ChannelDeliveryReceipt, { message, bots, onOpenInbox, t: zhTranslate }),
    );
    try {
      await act(async () =>
        view.host.querySelector<HTMLButtonElement>('.bh-delivery-trigger')?.click(),
      );
      await act(async () =>
        document.body
          .querySelector<HTMLButtonElement>('.bh-delivery-bot[aria-label="查看 BEA 的收件箱"]')
          ?.click(),
      );
      expect(onOpenInbox).toHaveBeenCalledWith({ botSlug: 'bea', missing: true });
      expect(document.body.querySelector('.bh-delivery-panel')).toBeNull();
      await act(async () =>
        view.host.querySelector<HTMLButtonElement>('.bh-delivery-trigger')?.click(),
      );
      await act(async () =>
        document.body
          .querySelector<HTMLButtonElement>('.bh-delivery-bot[aria-label="查看 ADA 的收件箱"]')
          ?.click(),
      );
      expect(onOpenInbox).toHaveBeenLastCalledWith({ botSlug: 'ada', missing: false });
    } finally {
      await view.cleanup();
    }
  });
});
