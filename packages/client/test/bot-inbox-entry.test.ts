// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { ChannelSidebarEntrySection } from '../src/client/channel-sidebar-view.js';
import { setInboxLayout } from '../src/client/inbox-view-prefs.js';
import { zhTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';
import { item } from './support/bot-inbox-entry.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./support/bot-inbox-entry.js')).mockInboxPrimitives(),
);

describe('DM Bot Inbox sidebar entry', () => {
  beforeEach(() => setInboxLayout('source'));
  afterEach(() => setInboxLayout('time'));
  it.each(['group', 'dm'] as const)(
    'shows a readable %s source and opens the same message without consuming it',
    async (type) => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const previous = store.getSnapshot().botInbox;
      const previousRoster = store.getSnapshot();
      store.setRoster(
        [
          {
            slug: 'ada',
            displayName: 'Ada Lovelace',
            roles: [],
            aggregateState: 'idle',
            workspaces: [],
            createdAt: item.createdAt,
          },
        ],
        [
          {
            id: 'group-team',
            createdAt: item.createdAt,
            updatedAt: item.createdAt,
            type,
            name: type === 'dm' ? 'ada' : 'Team',
            members: ['ada'],
            ...(type === 'dm' ? { botSlug: 'ada' } : {}),
          },
        ],
      );
      const sourceItem = { ...item, sourceChannelName: type === 'dm' ? 'ada' : 'Team' };
      const entry = createChannelSidebarBuiltins(zhTranslate).find(
        (candidate) => candidate.id === 'bot-inbox',
      );
      expect(entry).toBeDefined();
      store.setBotInbox({ status: 'ready', items: [], error: undefined });
      expect(entry?.visible?.(store.getSnapshot()) ?? true).toBe(true);
      store.setBotInbox({
        status: 'ready',
        items: [
          sourceItem,
          { ...sourceItem, id: 'source-2', state: 'handled', sourceMessageId: 'm2' },
          { ...sourceItem, id: 'source-3', state: 'ignored', sourceMessageId: 'm3' },
        ],
        error: undefined,
      });
      expect(entry?.visible?.(store.getSnapshot()) ?? true).toBe(true);
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      const openChannel = vi.fn(async () => undefined);
      const openAround = vi.fn(async () => undefined);
      try {
        await act(async () =>
          root.render(
            createElement(ChannelSidebarEntrySection, {
              entry: entry!,
              expanded: true,
              onToggle: () => undefined,
              entryProps: {
                scope: 'personabot',
                channelId: 'dm-ada',
                botSlug: 'ada',
                actions: { openChannel, openAround } as unknown as BridgeActions,
                t: zhTranslate,
              },
            }),
          ),
        );
        expect(document.body.querySelector('[data-inbox-group] > summary')?.textContent).toContain(
          type === 'dm' ? 'Ada Lovelace' : 'Team',
        );
        expect(document.body.textContent).toContain('待处理');
        expect(document.body.textContent).toContain('已忽略');
        const button = [
          ...document.body.querySelectorAll<HTMLButtonElement>('.bh-inbox-item'),
        ].find((node) => node.textContent?.includes('Please check this'));
        expect(button).toBeDefined();
        await act(async () => {
          button?.click();
          await Promise.resolve();
        });
        expect(openChannel).toHaveBeenCalledWith('group-team');
        expect(openAround).toHaveBeenCalledWith('group-team', 'm1');
        expect(store.getSnapshot().botInbox.items[0]?.state).toBe('pending');
      } finally {
        await act(async () => root.unmount());
        container.remove();
        store.setBotInbox(previous);
        store.setRoster(previousRoster.bots, previousRoster.channels);
      }
    },
  );

  it('shows an empty state and lets a failed Inbox refresh be retried', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot().botInbox;
    const entry = createChannelSidebarBuiltins(zhTranslate).find(
      (candidate) => candidate.id === 'bot-inbox',
    )!;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const refreshBotInbox = vi.fn(async () => undefined);
    try {
      store.setBotInbox({ status: 'ready', items: [], error: undefined });
      await act(async () =>
        root.render(
          createElement(entry.component, {
            scope: 'personabot',
            channelId: 'dm-ada',
            botSlug: 'ada',
            actions: { refreshBotInbox } as unknown as BridgeActions,
            t: zhTranslate,
            flush: true,
          }),
        ),
      );
      expect(document.body.querySelector('[data-panel-empty]')?.textContent).toContain(
        '此 Bot 还没有收件记录',
      );
      await act(async () => store.setBotInbox({ status: 'error', error: 'offline' }));
      expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('offline');
      await act(async () =>
        document.body.querySelector<HTMLButtonElement>('[role="alert"] button')!.click(),
      );
      expect(refreshBotInbox).toHaveBeenCalledWith('ada');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setBotInbox(previous);
    }
  });

  it('reveals newly active or escalated attention in an existing collapsed source group', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot().botInbox;
    const entry = createChannelSidebarBuiltins(zhTranslate).find(
      (candidate) => candidate.id === 'bot-inbox',
    )!;
    store.setBotInbox({
      status: 'ready',
      items: [{ ...item, state: 'handled' }],
      error: undefined,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const render = async (): Promise<void> => {
      await act(async () =>
        root.render(
          createElement(ChannelSidebarEntrySection, {
            entry,
            expanded: true,
            onToggle: () => undefined,
            entryProps: {
              scope: 'personabot',
              channelId: 'dm-ada',
              botSlug: 'ada',
              actions: {} as BridgeActions,
              t: zhTranslate,
            },
          }),
        ),
      );
    };
    try {
      await render();
      const group = document.body.querySelector<HTMLDetailsElement>('[data-inbox-group]')!;
      expect(group.open).toBe(false);
      await act(async () =>
        store.setBotInbox({
          status: 'ready',
          items: [
            { ...item, state: 'handled' },
            { ...item, id: 'source-2', state: 'pending' },
          ],
        }),
      );
      await render();
      expect(group.open).toBe(true);
      await act(async () => {
        group.open = false;
        group.dispatchEvent(new Event('toggle', { bubbles: true }));
      });
      await render();
      expect(group.open).toBe(false);
      await act(async () =>
        store.setBotInbox({
          status: 'ready',
          items: [
            { ...item, state: 'handled' },
            { ...item, id: 'source-2', state: 'needs-repair' },
          ],
        }),
      );
      await render();
      expect(group.open).toBe(true);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setBotInbox(previous);
    }
  });

  it('keeps an unavailable source readable without a broken action', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot().botInbox;
    store.setBotInbox({
      status: 'ready',
      items: [{ ...item, sourceAvailable: false }],
      error: undefined,
    });
    const entry = createChannelSidebarBuiltins(zhTranslate).find(
      (candidate) => candidate.id === 'bot-inbox',
    )!;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          createElement(ChannelSidebarEntrySection, {
            entry,
            expanded: true,
            onToggle: () => undefined,
            entryProps: {
              scope: 'personabot',
              channelId: 'dm-ada',
              botSlug: 'ada',
              actions: {} as BridgeActions,
              t: zhTranslate,
            },
          }),
        ),
      );
      expect(document.body.querySelector<HTMLButtonElement>('.bh-inbox-item')?.disabled).toBe(true);
      expect(document.body.textContent).toContain('来源不可打开');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setBotInbox(previous);
    }
  });
  it('opens an Assignment report in its native DSH Session', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot().botInbox;
    store.setBotInbox({
      status: 'ready',
      items: [
        {
          id: 'report-1',
          botSlug: 'ada',
          reason: 'assignment-report',
          state: 'handled',
          createdAt: '2026-09-26T00:00:00.000Z',
          sourceKind: 'assignment-report',
          assignmentSessionId: 'assignment-one',
          assignmentTitle: 'Investigate the issue',
          assignmentReportState: 'waiting-human',
          sourceAvailable: true,
          authorKind: 'system',
          summary: 'Need a Human decision',
        },
      ],
      error: undefined,
    });
    const entry = createChannelSidebarBuiltins(zhTranslate).find(
      (candidate) => candidate.id === 'bot-inbox',
    )!;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const openSession = vi.fn();
    try {
      await act(async () =>
        root.render(
          createElement(ChannelSidebarEntrySection, {
            entry,
            expanded: true,
            onToggle: () => undefined,
            entryProps: {
              scope: 'personabot',
              channelId: 'dm-ada',
              botSlug: 'ada',
              actions: { openSession } as unknown as BridgeActions,
              t: zhTranslate,
            },
          }),
        ),
      );
      expect(document.body.textContent).toContain('Investigate the issue');
      expect(document.body.textContent).toContain('等你处理');
      const button = document.body.querySelector<HTMLButtonElement>('.bh-inbox-item');
      expect(button?.disabled).toBe(false);
      await act(async () => {
        button?.click();
        await Promise.resolve();
      });
      expect(openSession).toHaveBeenCalledWith('assignment-one');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setBotInbox(previous);
    }
  });
});

it('lists every source newest first by default with a compact author, time and state head', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = store.getSnapshot().botInbox;
  store.setBotInbox({
    status: 'ready',
    items: [
      { ...item, id: 'older', state: 'handled', summary: 'Older handled note' },
      {
        ...item,
        id: 'newer',
        createdAt: '2026-09-27T00:00:00.000Z',
        sourceChannelId: 'group-other',
        sourceChannelName: 'Other',
        summary: 'Newer pending note',
      },
    ],
    error: undefined,
  });
  const entry = createChannelSidebarBuiltins(zhTranslate).find((e) => e.id === 'bot-inbox')!;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(ChannelSidebarEntrySection, {
          entry,
          expanded: true,
          onToggle: () => undefined,
          entryProps: {
            scope: 'personabot',
            channelId: 'dm-ada',
            botSlug: 'ada',
            actions: {} as BridgeActions,
            t: zhTranslate,
          },
        }),
      ),
    );
    expect(document.body.querySelector('[data-inbox-group]:not([data-section])')).toBeNull();
    const rows = [...document.body.querySelectorAll('.bh-card-row')];
    expect(rows.map((row) => row.querySelector('.bh-card-summary')?.textContent)).toEqual([
      'Newer pending note',
      'Older handled note',
    ]);
    expect(rows[0]?.querySelector('.bh-inbox-item-author')?.textContent).toBe('你 · Other');
    expect(rows[0]?.querySelector('.bh-card-badge')?.textContent).toBe('待处理');
    expect(rows[1]?.querySelector('.bh-card-badge')?.textContent).toBe('已处理');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.setBotInbox(previous);
  }
});

it('puts open items first, snoozed by return time next, and folds done items with their notes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = store.getSnapshot().botInbox;
  store.setBotInbox({
    status: 'ready',
    items: [
      {
        ...item,
        id: 'done',
        state: 'handled',
        createdAt: '2026-09-28T00:00:00.000Z',
        summary: 'Done item',
        resolutionNote: 'Shipped the fix',
      },
      {
        ...item,
        id: 'later',
        state: 'snoozed',
        summary: 'Later item',
        snoozedUntil: '2026-10-02T00:00:00.000Z',
      },
      {
        ...item,
        id: 'sooner',
        state: 'snoozed',
        summary: 'Sooner item',
        snoozedUntil: '2026-10-01T00:00:00.000Z',
        snoozeNote: 'After the vendor replies',
      },
      { ...item, id: 'open', state: 'open', summary: 'Open item' },
      {
        ...item,
        id: 'lifecycle',
        state: 'open',
        summary: '',
        sourceKind: 'assignment-lifecycle',
        authorKind: 'system',
        assignmentSessionId: 'a-1',
        assignmentTitle: 'Ship the release notes',
        createdAt: '2026-09-25T00:00:00.000Z',
      },
    ],
    error: undefined,
  });
  const entries = createChannelSidebarBuiltins(zhTranslate);
  const entry = entries.find((e) => e.id === 'bot-inbox')!;
  const Badge = entry.badge!;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const entryProps = {
    scope: 'personabot' as const,
    channelId: 'dm-ada',
    botSlug: 'ada',
    actions: {} as BridgeActions,
    t: zhTranslate,
  };
  try {
    await act(async () =>
      root.render(
        createElement(
          'div',
          null,
          createElement('span', { className: 'badge' }, createElement(Badge, entryProps)),
          createElement(ChannelSidebarEntrySection, {
            entry,
            expanded: true,
            onToggle: () => undefined,
            entryProps,
          }),
        ),
      ),
    );
    expect(document.body.querySelector('.badge')?.textContent).toBe('2');
    const rows = [...document.body.querySelectorAll('.bh-card-row')].filter(
      (row) => !row.textContent?.includes('Ship the release notes'),
    );
    const lifecycle = [...document.body.querySelectorAll('.bh-card-row')].find((row) =>
      row.textContent?.includes('Ship the release notes'),
    );
    expect(lifecycle?.querySelector('.bh-inbox-item-author')?.textContent).toBe(
      zhTranslate('inbox.assignment') + ' · Ship the release notes',
    );
    expect(rows.map((row) => row.querySelector('.bh-card-summary')?.textContent)).toEqual([
      'Open item',
      'Sooner item',
      'Later item',
      'Done item',
    ]);
    const sections = [
      ...document.body.querySelectorAll<HTMLDetailsElement>('[data-inbox-group][data-section]'),
    ];
    expect(sections.map((section) => [section.dataset['section'], section.open])).toEqual([
      ['snoozed', true],
      ['done', false],
    ]);
    expect(rows[1]?.textContent).toContain('After the vendor replies');
    expect(rows[1]?.querySelector('.bh-inbox-item-return')?.textContent).toContain('回来');
    expect(rows[3]?.textContent).toContain('Shipped the fix');

    store.setBotInbox({
      status: 'ready',
      items: [{ ...item, id: 'only-snoozed', state: 'snoozed' }],
      error: undefined,
    });
    await act(async () => undefined);
    expect(document.body.querySelector('.badge')?.textContent).toBe('');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.setBotInbox(previous);
  }
});
