// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    Button: ({ children, onClick }: PropsWithChildren<{ onClick?(): void }>) =>
      createElement('button', { onClick }, children),
    Input: stub,
    Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
    Modal: ({ children, title, onClose }: PropsWithChildren<{ title: string; onClose(): void }>) =>
      createElement(
        'div',
        { role: 'dialog', 'aria-label': title },
        children,
        createElement('button', { onClick: onClose }, 'Close'),
      ),
    StateDot: stub,
    IconChevronDownOutlineRegular: stub,
    IconCloseOutlineRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    Menu: ({ anchor }: { anchor: unknown }) => anchor,
    Tooltip: ({ children }: PropsWithChildren) => children,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotInboxDialog } from '../src/client/bot-inbox-dialog.js';
import { zhTranslate } from '../src/client/locale.js';
import type { BotAttentionItem } from '../src/client/store.js';

const item = (id: string, sourceMessageId: string, extra: Partial<BotAttentionItem> = {}) =>
  ({
    id,
    botSlug: 'ada',
    reason: 'group-mention',
    state: 'handled',
    createdAt: '2026-10-26T00:00:00.000Z',
    sourceKind: 'human-message',
    sourceChannelId: 'group-team',
    sourceChannelName: 'Team',
    sourceMessageId,
    sourceAvailable: true,
    authorKind: 'human',
    summary: 'Summary ' + id,
    ...extra,
  }) satisfies BotAttentionItem;

async function render(props: {
  botSlug: string;
  botName: string;
  missing: boolean;
  actions: BridgeActions;
}) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onClose = vi.fn();
  await act(async () =>
    root.render(
      createElement(BotInboxDialog, { ...props, messageId: 'm1', t: zhTranslate, onClose }),
    ),
  );
  return {
    onClose,
    dialog: () => document.body.querySelector<HTMLElement>(`[data-bot-inbox-dialog]`),
    async cleanup() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

describe('Bot Inbox dialog', () => {
  it('shows the Inbox item for this message, with its note, above the history', async () => {
    const botInboxPage = vi.fn(async (slug: string, cursor?: string) =>
      cursor === undefined
        ? {
            items: [
              item('older', 'm0', { summary: 'Earlier ask' }),
              item('this', 'm1', {
                state: 'ignored',
                resolutionNote: 'Already answered in the thread',
              }),
            ],
            nextCursor: 'next',
          }
        : { items: [item('oldest', 'm-1', { summary: 'Oldest ask', botSlug: slug })] },
    );
    const view = await render({
      botSlug: 'ada',
      botName: 'ADA',
      missing: false,
      actions: { botInboxPage } as unknown as BridgeActions,
    });
    try {
      expect(botInboxPage).toHaveBeenCalledWith('ada', undefined);
      expect(document.body.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
        'ADA 的收件箱',
      );
      const dialog = view.dialog();
      const match = dialog?.querySelector('[data-inbox-match]');
      expect(match?.textContent).toContain('这条消息');
      expect(match?.textContent).toContain('Already answered in the thread');
      expect(match?.textContent).not.toContain('Earlier ask');
      expect(dialog?.querySelector('[data-inbox-history]')?.textContent).toContain('Earlier ask');
      expect(dialog?.textContent).not.toContain('没有进入');

      const more = [...(dialog?.querySelectorAll('button') ?? [])].find(
        (button) => button.textContent === '加载更多',
      );
      await act(async () => more?.click());
      expect(botInboxPage).toHaveBeenLastCalledWith('ada', 'next');
      expect(dialog?.querySelector('[data-inbox-history]')?.textContent).toContain('Oldest ask');
      expect(dialog?.textContent).not.toContain('加载更多');
    } finally {
      await view.cleanup();
    }
  });

  it('explains that a not-received Bot never got the message', async () => {
    const view = await render({
      botSlug: 'bea',
      botName: 'BEA',
      missing: true,
      actions: { botInboxPage: vi.fn(async () => ({ items: [] })) } as unknown as BridgeActions,
    });
    try {
      expect(view.dialog()?.textContent).toContain('这条消息没有进入 BEA 的收件箱。');
      expect(view.dialog()?.textContent).toContain(zhTranslate('inbox.empty'));
    } finally {
      await view.cleanup();
    }
  });

  it('offers a retry when the Inbox cannot be read', async () => {
    const botInboxPage = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: [item('this', 'm1')] });
    const view = await render({
      botSlug: 'ada',
      botName: 'ADA',
      missing: false,
      actions: { botInboxPage } as unknown as BridgeActions,
    });
    try {
      expect(view.dialog()?.textContent).toContain('offline');
      const retry = [...(view.dialog()?.querySelectorAll('button') ?? [])].find(
        (button) => button.textContent === zhTranslate('inbox.retry'),
      );
      await act(async () => retry?.click());
      expect(view.dialog()?.querySelector('[data-inbox-match]')?.textContent).toContain(
        'Summary this',
      );
    } finally {
      await view.cleanup();
    }
  });
});
