// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./human-inbox-test-controls.js')),
  Button: ({
    children,
    variant,
    size,
    ...props
  }: {
    children?: ReactNode;
    variant?: string;
    size?: string;
  }) => createElement('button', { ...props, 'data-variant': variant, 'data-size': size }, children),
  MarkdownText: () => null,
  StateDot: () => null,
  Input: () => null,
}));
vi.mock('../src/client/bot-sidebar.js', async () => {
  const { useSyncExternalStore } = await import('react');
  const { store } = await import('../src/client/store.js');
  return { useClientState: () => useSyncExternalStore(store.subscribe, store.getSnapshot) };
});
vi.mock('../src/client/modal.js', () => ({
  Modal: ({
    children,
    footer,
    onClose,
  }: {
    children: ReactNode;
    footer: ReactNode;
    onClose: () => void;
  }) =>
    createElement(
      'div',
      { role: 'dialog' },
      children,
      footer,
      createElement('button', { onClick: onClose }, 'Close picker'),
    ),
}));
import { createActions, type BridgeActions } from '../src/client/actions.js';
import { HumanInboxView } from '../src/client/human-inbox-view.js';
import { store, type ChannelMessage, type HumanAttentionItem } from '../src/client/store.js';

const item: HumanAttentionItem = {
  id: 'unread:group',
  category: 'unread',
  kind: 'channel-unread',
  channelId: 'group',
  channelName: 'Launch',
  botSlug: '',
  messageId: 'source',
  summary: 'Please review the launch plan.',
  unreadCount: 4,
  createdAt: '2026-10-01T12:00:00Z',
};
const previous = store.getSnapshot();
afterEach(() => {
  store.setRoster(previous.bots, previous.channels);
  store.select(previous.selection);
  store.setHumanInbox(previous.humanInbox);
});

async function mount(source = item, resolved = false) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const actions = {
    ...createActions(async () => ({ ok: true, value: { items: [] } }), store),
    refreshHumanInbox: vi.fn(async () => undefined),
    humanInboxContext: vi.fn(async (): Promise<ChannelMessage[]> => [
      {
        id: 'source',
        at: source.createdAt,
        author: { kind: 'bot', slug: 'ada' },
        body: source.summary,
        ...(source.kind === 'workspace-grant-request'
          ? { grantRequest: true as const, grantRequestResolved: resolved }
          : {}),
      },
    ]),
    listHostFolders: vi.fn(async () => ({
      path: '/qa/project',
      home: '/qa',
      crumbs: [],
      entries: [],
      truncated: false,
    })),
    pickWorkspaceFolder: vi.fn(async () => null),
    resolveWorkspaceGrantRequest: vi.fn(async () => undefined),
    markRead: vi.fn(async () => undefined),
    openChannelAtMessage: vi.fn(async () => undefined),
    openBot: vi.fn(async () => undefined),
    setHumanInboxFilters: vi.fn(async (filters) => store.setHumanInbox(filters)),
  } satisfies BridgeActions;
  actions.humanInboxContextPage = vi.fn(async () => ({
    entries: await actions.humanInboxContext(),
    olderCursor: null,
    newerCursor: null,
    hasOlder: false,
    hasNewer: false,
  }));
  store.select({ kind: 'inbox' });
  store.setHumanInbox({
    category: source.category,
    status: 'ready',
    items: [source],
    botSlug: undefined,
    channelId: undefined,
    sort: 'oldest',
  });
  await act(async () => root.render(createElement(HumanInboxView, { actions })));
  return {
    host,
    actions,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

describe('compact Human Inbox interactions', () => {
  it('keeps repair maintenance in details and preserves source navigation and missing-source fallback', async () => {
    const repair: HumanAttentionItem = {
      ...item,
      id: 'repair:event:ada',
      category: 'action',
      kind: 'bot-message-needs-repair',
      botSlug: 'ada',
      sourceEventId: 'event',
    };
    const view = await mount(repair);
    try {
      const rowActions = view.host.querySelector('.bh-human-inbox-row-actions')!;
      expect(
        [...rowActions.querySelectorAll('button')].map((button) => button.textContent),
      ).toEqual(['稍后提醒', '']);
      expect(rowActions.textContent).not.toContain('查看 Bot 收件箱');
      await act(async () =>
        rowActions.querySelector<HTMLButtonElement>('.bh-human-inbox-source-link')!.click(),
      );
      expect(view.actions.openChannelAtMessage).toHaveBeenCalledWith('group', 'source');
      view.actions.openChannelAtMessage.mockRejectedValueOnce(
        new Error('Source no longer available'),
      );
      await act(async () =>
        rowActions.querySelector<HTMLButtonElement>('.bh-human-inbox-source-link')!.click(),
      );
      expect(view.actions.openBot).toHaveBeenCalledWith('ada');
      view.actions.openBot.mockClear();
      expect(view.host.querySelector('.bh-human-inbox-detail')).toBeNull();
      await act(async () =>
        view.host.querySelector<HTMLButtonElement>('.bh-human-inbox-row-open')!.click(),
      );
      const maintenance = [
        ...view.host.querySelectorAll<HTMLButtonElement>('.bh-human-inbox-detail button'),
      ].find((button) => button.textContent === '查看 Bot 收件箱')!;
      expect(maintenance).toBeDefined();
      await act(async () => maintenance.click());
      expect(view.actions.openBot).toHaveBeenCalledWith('ada');
      await act(async () => store.setHumanInbox({ items: [{ ...repair, channelName: '' }] }));
      view.actions.openBot.mockClear();
      await act(async () =>
        rowActions.querySelector<HTMLButtonElement>('.bh-human-inbox-source-link')!.click(),
      );
      expect(view.actions.openBot).toHaveBeenCalledWith('ada');
    } finally {
      await view.close();
    }
  });

  it('opens canonical details from the row without marking the summary read', async () => {
    const view = await mount();
    try {
      expect(view.host.querySelector('.bh-human-inbox-detail')).toBeNull();
      expect(view.host.querySelector('select')).toBeNull();
      const row = view.host.querySelector<HTMLButtonElement>('.bh-human-inbox-row-open')!;
      await act(async () => row.click());
      expect(view.actions.humanInboxContextPage).toHaveBeenCalledWith(
        'group',
        { direction: 'around', around: 'source', olderLimit: 2, newerLimit: 2 },
        expect.any(AbortSignal),
      );
      expect(row.getAttribute('aria-expanded')).toBe('true');
      expect(view.host.querySelector('.bh-human-inbox-detail')?.id).toBe(
        row.getAttribute('aria-controls'),
      );
      expect(view.actions.markRead).not.toHaveBeenCalled();
      expect(view.actions.listHostFolders).not.toHaveBeenCalled();
    } finally {
      await view.close();
    }
  });
  it('keeps the avatar source link independent of detail activation and preserves the exact anchor', async () => {
    const view = await mount();
    try {
      await act(async () =>
        view.host.querySelector<HTMLButtonElement>('.bh-human-inbox-source-link')!.click(),
      );
      expect(view.actions.openChannelAtMessage).toHaveBeenCalledWith('group', 'source');
      expect(view.actions.humanInboxContext).not.toHaveBeenCalled();
      expect(view.host.querySelector('.bh-human-inbox-detail')).toBeNull();
      expect(view.host.querySelector('button button')).toBeNull();
    } finally {
      await view.close();
    }
  });
  it('opens the workspace picker from the list action and can reopen after cancel', async () => {
    const view = await mount({
      ...item,
      category: 'action',
      kind: 'workspace-grant-request',
      botSlug: 'ada',
    });
    try {
      const action = view.host.querySelector<HTMLButtonElement>(
        '.bh-human-inbox-row-actions [data-variant="primary"]',
      )!;
      expect(action.textContent).toBe('选择工作区');
      await act(async () => action.click());
      expect(view.actions.humanInboxContext).toHaveBeenCalledTimes(1);
      expect(view.actions.listHostFolders).toHaveBeenCalledTimes(1);
      expect(view.host.querySelector('.bh-human-inbox-detail')).toBeNull();
      expect(
        view.host.querySelector('.bh-human-inbox-row-open')?.getAttribute('aria-expanded'),
      ).toBe('false');
      expect(view.host.querySelector('[role="dialog"]')).not.toBeNull();
      expect(view.actions.resolveWorkspaceGrantRequest).not.toHaveBeenCalled();
      await act(async () =>
        Array.from(view.host.querySelectorAll<HTMLButtonElement>('button'))
          .find((button) => button.textContent === 'Close picker')!
          .click(),
      );
      await act(async () =>
        view.host.querySelector<HTMLButtonElement>('.bh-human-inbox-row-open')!.click(),
      );
      await act(async () =>
        view.host
          .querySelector<HTMLButtonElement>('.bh-human-inbox-row-actions [data-variant="primary"]')!
          .click(),
      );
      expect(view.actions.listHostFolders).toHaveBeenCalledTimes(2);
      await act(async () =>
        Array.from(view.host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
          .find((button) => button.textContent === '授权此工作区')!
          .click(),
      );
      expect(view.actions.resolveWorkspaceGrantRequest).toHaveBeenCalledWith(
        'ada',
        'source',
        '/qa/project',
        expect.any(Function),
        expect.anything(),
      );
    } finally {
      await view.close();
    }
  });
  it('rechecks a request resolved in another window before reopening the picker', async () => {
    const view = await mount({
      ...item,
      category: 'action',
      kind: 'workspace-grant-request',
      botSlug: 'ada',
    });
    try {
      await act(async () =>
        view.host
          .querySelector<HTMLButtonElement>('.bh-human-inbox-row-actions [data-variant="primary"]')!
          .click(),
      );
      await act(async () =>
        Array.from(view.host.querySelectorAll<HTMLButtonElement>('button'))
          .find((button) => button.textContent === 'Close picker')!
          .click(),
      );
      view.actions.humanInboxContext.mockResolvedValue([
        {
          id: 'source',
          at: item.createdAt,
          author: { kind: 'bot', slug: 'ada' },
          body: item.summary,
          grantRequest: true,
          grantRequestResolved: true,
        },
      ]);
      await act(async () =>
        view.host
          .querySelector<HTMLButtonElement>('.bh-human-inbox-row-actions [data-variant="primary"]')!
          .click(),
      );
      expect(view.actions.listHostFolders).toHaveBeenCalledTimes(1);
      expect(view.host.querySelector('[role="dialog"]')).toBeNull();
      expect(view.actions.resolveWorkspaceGrantRequest).not.toHaveBeenCalled();
    } finally {
      await view.close();
    }
  });
  it('uses the native picker fallback from the list and cancellation grants nothing', async () => {
    const view = await mount({
      ...item,
      category: 'action',
      kind: 'workspace-grant-request',
      botSlug: 'ada',
    });
    view.actions.listHostFolders.mockRejectedValueOnce(
      Object.assign(new Error('native picker'), {
        rpcError: { code: 'directory-picker/unavailable' },
      }),
    );
    try {
      await act(async () =>
        view.host
          .querySelector<HTMLButtonElement>('.bh-human-inbox-row-actions [data-variant="primary"]')!
          .click(),
      );
      expect(view.actions.pickWorkspaceFolder).toHaveBeenCalledTimes(1);
      expect(view.actions.resolveWorkspaceGrantRequest).not.toHaveBeenCalled();
    } finally {
      await view.close();
    }
  });
  it('does not open a picker for a canonically resolved stale request', async () => {
    const view = await mount(
      { ...item, category: 'action', kind: 'workspace-grant-request', botSlug: 'ada' },
      true,
    );
    try {
      await act(async () =>
        view.host
          .querySelector<HTMLButtonElement>('.bh-human-inbox-row-actions [data-variant="primary"]')!
          .click(),
      );
      expect(view.actions.listHostFolders).not.toHaveBeenCalled();
      expect(view.host.querySelector('[role="dialog"]')).toBeNull();
    } finally {
      await view.close();
    }
  });
  it('changes native sort selection while retaining the other filters', async () => {
    const view = await mount();
    try {
      const filters = view.host.querySelectorAll('.bh-human-inbox-selector');
      await act(async () => (filters[filters.length - 1] as HTMLButtonElement).click());
      const option = Array.from(
        view.host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
      ).find((button) => button.textContent === '最新在前')!;
      await act(async () => option.click());
      expect(view.actions.setHumanInboxFilters).toHaveBeenCalledWith({
        botSlug: undefined,
        channelId: undefined,
        sort: 'newest',
      });
      expect(view.host.querySelector('[role="menu"]')).toBeNull();
    } finally {
      await view.close();
    }
  });
  it('opens a source-only summary without querying undefined Channel identifiers', async () => {
    const view = await mount({
      id: 'report',
      category: 'info',
      kind: 'assignment-report',
      botSlug: 'ada',
      assignmentSessionId: 'session',
      summary: 'Completed.',
      createdAt: item.createdAt,
    });
    try {
      await act(async () =>
        view.host.querySelector<HTMLButtonElement>('.bh-human-inbox-row-open')!.click(),
      );
      expect(view.host.querySelector('.bh-human-inbox-detail')?.textContent).toContain(
        'Completed.',
      );
      expect(view.actions.humanInboxContext).not.toHaveBeenCalled();
    } finally {
      await view.close();
    }
  });
});
