// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    Toast: stub,
    IconCodeOutlineRegular: () => null,
    HoverCard: ({ anchor }: { anchor: unknown }) => anchor,
    Button: ({
      children,
      variant: _variant,
      size: _size,
      ...props
    }: ButtonHTMLAttributes<HTMLButtonElement> & {
      variant?: string;
      size?: string;
    }) => createElement('button', props, children),
    IconAgentPresetOutline16: stub,
    IconAgentPresetOutlineRegular: stub,
    IconCheckOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconBranchOutlineRegular: stub,
    IconChevronLeftOutlineRegular: stub,
    IconChevronRightOutlineRegular: stub,
    IconChevronDownOutline14: stub,
    IconChevronDownOutlineRegular: stub,
    IconCloseFill14: stub,
    IconCopyOutline16: stub,
    IconCopyOutlineRegular: stub,
    IconCloseOutline16: stub,
    IconEllipsisOutline16: stub,
    IconEllipsisOutlineRegular: stub,
    IconSettingsOutlineRegular: stub,
    IconTrashOutlineRegular: stub,
    IconUserOutlineRegular: stub,
    IconFolderCloseRegular: stub,
    IconFolderOpenRegular: stub,
    IconFolderOpenOutline16: stub,
    IconNewChatOutline16: stub,
    IconPanelLeftOutline16: stub,
    IconPanelLeftOutlineRegular: stub,
    IconPaperclipOutlineRegular: stub,
    IconPlusOutline16: stub,
    IconRefreshOutlineRegular: stub,
    IconSearchOutline16: stub,
    IconSendOutline16: stub,
    IconSendOutlineRegular: stub,
    IconStopFillRegular: stub,
    IconTrashOutline16: stub,
    FileTypeIcon: stub,
    ImageLightbox: stub,
    Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
    Menu: ({
      anchor,
      open,
      items = [],
      onSelect,
      children,
    }: {
      anchor: ReactNode;
      open: boolean;
      items?: { id: string; label: string }[];
      onSelect?: (id: string) => void;
      children?: ReactNode;
    }) =>
      createElement(
        'span',
        null,
        anchor,
        open
          ? createElement(
              'div',
              { role: 'menu' },
              ...items.map((item) =>
                createElement(
                  'button',
                  { key: item.id, role: 'menuitem', onClick: () => onSelect?.(item.id) },
                  item.label,
                ),
              ),
              children,
            )
          : null,
      ),
    MenuSurface: ({ children }: { children: ReactNode }) =>
      createElement('div', { role: 'menu' }, children),
    MenuItemButton: ({ children, onSelect }: { children: ReactNode; onSelect: () => void }) =>
      createElement('button', { role: 'menuitem', onClick: onSelect }, children),
    MarkdownText: stub,
    Modal: stub,
    StateDot: stub,
    Tag: stub,
    Tooltip: ({ children }: { children: ReactNode }) => children,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotMain } from '../src/client/bot-main.js';
import { BotModePrefs } from '../src/client/bot-mode-prefs.js';
import { WindowCompanions } from '../src/client/window-companions.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { store, type BotSummary, type ChannelSummary } from '../src/client/store.js';
import { inertSubmissionActions } from './inert-submissions.js';

const AT = '2026-10-09T00:00:00Z';
let container: HTMLDivElement;
let root: Root;

const bot = (slug: string, name: string, aggregateState = 'idle'): BotSummary => ({
  slug,
  displayName: name,
  roles: [],
  aggregateState,
  workspaces: [],
  createdAt: AT,
});
const dm: ChannelSummary = {
  id: 'dm-mira',
  type: 'dm',
  name: 'Mira',
  members: ['mira'],
  botSlug: 'mira',
  createdAt: AT,
  updatedAt: AT,
};
const group: ChannelSummary = {
  id: 'group-crew',
  type: 'group',
  name: 'Launch crew',
  members: ['mira', 'nova', 'kai'],
  createdAt: AT,
  updatedAt: AT,
};
const actions = new Proxy(
  { ...inertSubmissionActions, listWorkspaceGrants: vi.fn(async () => []) },
  { get: (target, key) => Reflect.get(target, key) ?? vi.fn(async () => undefined) },
) as unknown as BridgeActions;

async function open(
  channel: ChannelSummary,
  bots: BotSummary[],
  from: 'bot' | 'channel' = 'bot',
  companion?: WindowCompanions,
  prefs?: BotModePrefs,
): Promise<HTMLElement> {
  await act(async () => {
    store.setRoster(bots, [channel]);
    if (channel.type === 'dm' && from === 'bot')
      store.select({ kind: 'bot', slug: channel.botSlug! });
    else store.select({ kind: 'channel', channelId: channel.id });
    store.setConversation({
      status: 'ready',
      channel,
      messages: [{ id: 'm-1', at: AT, author: { kind: 'human' }, body: 'Please look this up' }],
      drafts: [],
      error: undefined,
      sending: false,
    });
    store.setSessions({ status: 'ready', items: [], error: undefined });
    root.render(
      createElement(BotMain, {
        actions,
        channelSidebar: createChannelSidebarRegistry(),
        companion,
        prefs,
      }),
    );
  });
  return container.querySelector<HTMLElement>('.bh-chat-body')!;
}

async function setBots(bots: BotSummary[], channel: ChannelSummary): Promise<void> {
  await act(async () => store.setRoster(bots, [channel]));
}

function layout(element: HTMLElement, scrollHeight: number, clientHeight = 400): void {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: clientHeight });
}

const rowNames = (): string[] =>
  Array.from(
    container.querySelectorAll<HTMLElement>('.bh-topbar .bh-header-working .bh-persona-avatar'),
  ).map((avatar) => (avatar.getAttribute('title') ?? '').split(' · ')[0]!.toLowerCase());

const headerTitle = (): string =>
  container.querySelector('.bh-topbar [data-conversation-title]')?.textContent ?? '';

beforeEach(() => {
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  store.applyActivity({ generation: crypto.randomUUID(), revision: 0, bots: [] });
  await act(async () => root.unmount());
  container.remove();
});

describe('Bot working status in the Channel header', () => {
  it('replaces the Bot name in the DM header while the Bot works, outside the message list', async () => {
    const chat = await open(dm, [bot('mira', 'Mira', 'working')]);
    const summary = container.querySelector('.bh-topbar .bh-header-working-summary');
    expect(summary?.getAttribute('aria-hidden')).toBe('true');
    expect(headerTitle()).not.toContain('Mira');
    expect(headerTitle()).toContain('...');
    expect(chat.querySelector('.bh-header-working-summary, .bh-timeline-working')).toBeNull();
    expect(container.querySelectorAll('.bh-composer-activity-summary[aria-live]')).toHaveLength(1);
    expect(container.querySelector('.bh-stop-btn')?.getAttribute('aria-label')).toBe('停止 Mira');

    await setBots([bot('mira', 'Mira', 'idle')], dm);
    expect(headerTitle()).toBe('Mira');
    expect(container.querySelector('.bh-stop-btn')).toBeNull();
  });

  it('shows the working status when the DM is opened from the Channel list', async () => {
    await open(dm, [bot('mira', 'Mira', 'working')], 'channel');
    expect(container.querySelector('.bh-topbar .bh-header-working-summary')).not.toBeNull();
  });

  it('stacks the active Bots of a Group in one row and skips waiting Bots', async () => {
    await open(group, [
      bot('mira', 'Mira', 'working'),
      bot('nova', 'Nova', 'thinking'),
      bot('kai', 'Kai', 'waiting'),
    ]);
    expect(rowNames()).toEqual(['mira', 'nova']);
    expect(container.querySelector('.bh-stop-btn')?.getAttribute('aria-label')).toBe(
      '停止 2 个 Bot',
    );
    expect(container.querySelectorAll('.bh-group-channel-header .bh-header-working')).toHaveLength(
      1,
    );
  });

  it('keeps the Bot in the row and hides its draft until the reply is complete', async () => {
    const chat = await open(group, [
      bot('mira', 'Mira', 'working'),
      bot('nova', 'Nova', 'working'),
    ]);
    await act(async () =>
      store.setConversation({
        drafts: [
          {
            channelId: group.id,
            draftId: 'draft-mira',
            attemptId: 'attempt-1',
            revision: 1,
            botSlug: 'mira',
            body: 'Found three sources',
          },
        ],
      }),
    );
    expect(rowNames()).toEqual(['mira', 'nova']);
    expect(chat.querySelector('[data-message-id="draft-mira"]')).toBeNull();
  });

  it('replaces the row with the Bot streaming draft when streaming is on', async () => {
    const prefs = new BotModePrefs();
    prefs.setStreamReplies(true);
    const chat = await open(
      group,
      [bot('mira', 'Mira', 'working'), bot('nova', 'Nova', 'working')],
      'bot',
      undefined,
      prefs,
    );
    await act(async () =>
      store.setConversation({
        drafts: [
          {
            channelId: group.id,
            draftId: 'draft-mira',
            attemptId: 'attempt-1',
            revision: 1,
            botSlug: 'mira',
            body: 'Found three sources',
          },
        ],
      }),
    );
    expect(rowNames()).toEqual(['nova']);
    expect(chat.querySelector('[data-message-id="draft-mira"]')).not.toBeNull();
  });

  it('leaves the message list and its scroll position alone when Bots start working', async () => {
    const nova = bot('nova', 'Nova', 'working');
    const chat = await open(group, [bot('mira', 'Mira', 'idle'), nova]);
    layout(chat, 1000);
    chat.scrollTop = 600;
    await act(async () => chat.dispatchEvent(new Event('scroll')));
    const children = chat.childElementCount;
    await setBots([bot('mira', 'Mira', 'working'), nova], group);
    expect(rowNames()).toEqual(['mira', 'nova']);
    expect(chat.childElementCount).toBe(children);
    expect(chat.scrollTop).toBe(600);
  });

  it('keeps latest content clear of companions without moving history or waiting for transitions', async () => {
    const companion = new WindowCompanions({
      context: async () => ({ profileId: 'reading-space' }),
      source: () => ({ addEventListener() {}, close() {} }),
      update: async () => {},
    });
    await companion.start();
    document.documentElement.dataset['botharnessMotion'] = 'reduce';
    try {
      const chat = await open(dm, [bot('mira', 'Mira', 'working')], 'bot', companion);
      const pane = chat.closest<HTMLElement>('.bh-chat-pane')!;
      expect(pane.style.getPropertyValue('--bh-companion-read-inset')).toBe('');
      layout(chat, 1000);
      chat.scrollTop = 600;
      await act(async () => chat.dispatchEvent(new Event('scroll')));
      layout(chat, 1112);
      await act(async () => companion.select('mira'));
      expect(pane.style.getPropertyValue('--bh-companion-read-inset')).toBe('112px');
      expect(chat.scrollTop).toBe(1112);
      expect(pane.dataset['activityConcealed']).toBe('true');
      await setBots([bot('mira', 'Mira', 'idle')], dm);
      expect(pane.style.getPropertyValue('--bh-companion-read-inset')).toBe('112px');
      await act(async () => companion.select('nova'));
      expect(pane.style.getPropertyValue('--bh-companion-read-inset')).toBe('112px');
      chat.scrollTop = 100;
      await act(async () => chat.dispatchEvent(new Event('scroll')));
      await act(async () => {
        companion.remove('mira');
        companion.remove('nova');
      });
      expect(pane.style.getPropertyValue('--bh-companion-read-inset')).toBe('');
      expect(chat.scrollTop).toBe(100);
      await act(async () => companion.select('mira'));
      expect(chat.scrollTop).toBe(100);
    } finally {
      companion.dispose();
      delete document.documentElement.dataset['botharnessMotion'];
    }
  });

  it('conceals the composer status while the header shows the work, even when scrolled up', async () => {
    const chat = await open(dm, [bot('mira', 'Mira', 'working')]);
    const status = (): HTMLElement | null =>
      container.querySelector<HTMLElement>('.bh-composer-activity-status');
    expect(status()?.dataset['concealed']).toBe('true');
    expect(status()?.querySelector('[aria-live]')).not.toBeNull();

    layout(chat, 1000);
    chat.scrollTop = 100;
    await act(async () => chat.dispatchEvent(new Event('scroll')));
    expect(status()?.dataset['concealed']).toBe('true');
  });

  it('keeps the composer status visible when a Bot waits on a card', async () => {
    await open(group, [bot('mira', 'Mira', 'working'), bot('nova', 'Nova', 'working')]);
    await act(async () =>
      store.applyActivity({
        generation: 'approval-test',
        revision: 1,
        bots: [
          { slug: 'mira', state: 'working' },
          { slug: 'nova', state: 'working', attention: { approvalCount: 1 } },
        ],
      }),
    );
    expect(rowNames()).toEqual(['mira']);
    expect(
      container.querySelector<HTMLElement>('.bh-composer-activity-status')?.dataset['concealed'],
    ).toBeUndefined();
  });

  it('hides the thinking status right after the Bot replies', async () => {
    const chat = await open(dm, [bot('mira', 'Mira', 'thinking')]);
    expect(headerTitle()).not.toBe('Mira');
    await act(async () =>
      store.setConversation({
        messages: [
          ...store.getSnapshot().conversation.messages,
          { id: 'm-2', at: AT, author: { kind: 'bot', slug: 'mira' }, body: 'Done.' },
        ],
        revision: store.getSnapshot().conversation.revision + 1,
      }),
    );
    expect(headerTitle()).toBe('Mira');
    expect(
      container.querySelector<HTMLElement>('.bh-composer-activity-status')?.dataset['concealed'],
    ).toBeUndefined();
    expect(chat.querySelector('[data-message-id="m-2"]')).not.toBeNull();
  });

  it('counts one unseen message in the singular', async () => {
    const chat = await open(dm, [bot('mira', 'Mira', 'idle')]);
    layout(chat, 1000);
    chat.scrollTop = 100;
    await act(async () => chat.dispatchEvent(new Event('scroll')));
    await act(async () =>
      store.setConversation({
        messages: [
          ...store.getSnapshot().conversation.messages,
          { id: 'm-3', at: AT, author: { kind: 'bot', slug: 'mira' }, body: 'Hi' },
        ],
        revision: store.getSnapshot().conversation.revision + 1,
      }),
    );
    expect(container.querySelector('.bh-timeline-new-count')?.textContent).toBe('1');
    expect(container.querySelector('.bh-timeline-new')?.getAttribute('aria-description')).toBe(
      '1 条新消息 · 跳到最新',
    );
  });
});
