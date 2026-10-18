// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const Tag = ({ children }: PropsWithChildren) => createElement('span', null, children);
  return {
    IconCodeOutlineRegular: () => null,
    IconBranchOutlineRegular: () => null,
    Button: stub,
    IconAgentPresetOutlineRegular: stub,
    IconCheckOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconCloseFill14: stub,
    IconCopyOutlineRegular: stub,
    IconCloseOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconSettingsOutlineRegular: stub,
    IconUserOutlineRegular: stub,
    IconFolderCloseRegular: stub,
    IconFolderOpenRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconNewChatOutlineRegular: stub,
    IconPanelLeftOutlineRegular: stub,
    IconPaperclipOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconRefreshOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    IconPinFillRegular: stub,
    IconPinOutlineRegular: stub,
    IconTrashOutlineRegular: stub,
    HoverCard: ({ anchor }: PropsWithChildren<{ anchor: unknown }>) =>
      createElement('span', { 'data-hover-card': 'author' }, anchor as never),
    fileSizeText: (size: number) => `${size} B`,
    FileTypeIcon: stub,
    ImageLightbox: stub,
    Input: stub,
    Menu: ({
      items,
      onSelect,
    }: {
      items: readonly { id: string; label?: string; icon?: React.ReactNode }[];
      onSelect(id: string): void;
    }) =>
      createElement(
        'div',
        { role: 'menu' },
        items
          .filter((item) => item.label !== undefined)
          .map((item) =>
            createElement(
              'button',
              { key: item.id, type: 'button', role: 'menuitem', onClick: () => onSelect(item.id) },
              item.icon === undefined
                ? null
                : createElement('span', { 'data-menu-icon': '' }, item.icon),
              item.label,
            ),
          ),
      ),
    MenuItemButton: stub,
    MarkdownText: stub,
    Modal: stub,
    SegmentedControl: stub,
    StateDot: stub,
    Tag,
    Tooltip: ({ children }: PropsWithChildren) => children,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotMain } from '../src/client/bot-main.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { zhTranslate } from '../src/client/locale.js';
import { readRichMentionDraft, richSelectionOffsets } from '../src/client/rich-mention-editor.js';
import { store } from '../src/client/store.js';
import { inertSubmissionActions } from './inert-submissions.js';

const at = '2026-10-14T00:00:00.000Z';
const ada = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  aggregateState: 'idle' as const,
  workspaces: [],
  createdAt: at,
};
const group = {
  id: 'group-design',
  type: 'group' as const,
  name: '设计组',
  members: ['ada'],
  createdAt: at,
  updatedAt: at,
};
const previous = store.getSnapshot();

afterEach(() => {
  store.setRoster(previous.bots, previous.channels);
  store.select(previous.selection);
  store.setConversation(previous.conversation);
  store.setSessions(previous.sessions);
  store.setComposerIdentity(previous.composerIdentity);
  localStorage.clear();
  document.body.replaceChildren();
});

async function renderGroup(openBot = vi.fn(async () => undefined)) {
  store.setComposerIdentity({ hostId: 'host', profileId: 'avatar-menu', humanId: 'human' });
  store.setRoster([ada], [group]);
  store.select({ kind: 'channel', channelId: group.id });
  store.setConversation({
    status: 'ready',
    channel: group,
    sending: false,
    messages: [{ id: 'b1', at, author: { kind: 'bot', slug: 'ada' }, body: '你好' }],
  });
  store.setSessions({ status: 'ready', items: [], error: undefined });
  const registry = createChannelSidebarRegistry();
  for (const entry of createChannelSidebarBuiltins(zhTranslate)) registry.register(entry);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  await act(() =>
    root.render(
      createElement(BotMain, {
        actions: new Proxy(
          {
            ...inertSubmissionActions,
            openBot,
            listWorkspaceGrants: async () => [],
            channelAssignments: async () => [],
          },
          {
            get: (target, key) =>
              Reflect.get(target, key) ?? (() => Promise.reject(new Error('inert Host'))),
          },
        ) as unknown as BridgeActions,
        channelSidebar: registry,
      }),
    ),
  );
  const avatar = node.querySelector<HTMLButtonElement>('.bh-message-group-avatar-link')!;
  const openMenu = () =>
    act(() => {
      avatar.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 60,
        }),
      );
    });
  const item = (label: string) =>
    Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-pointer-menu] [role="menuitem"]'),
    ).find((button) => button.textContent === label);
  return { node, root, avatar, openMenu, item, openBot };
}

describe('group Channel Bot avatar menu', () => {
  it('offers Send message, @ TA and View profile on right-click', async () => {
    const view = await renderGroup();
    expect(view.avatar.getAttribute('aria-haspopup')).toBe('menu');
    await view.openMenu();
    const labels = Array.from(
      document.querySelectorAll('[data-pointer-menu] [role="menuitem"]'),
    ).map((button) => button.textContent);
    expect(labels).toEqual(['发送消息', '@ TA', '查看资料']);

    await act(() => view.item('发送消息')!.click());
    expect(view.openBot).toHaveBeenLastCalledWith('ada');
    expect(document.querySelector('[data-pointer-menu]')).toBeNull();

    await view.openMenu();
    await act(() => view.item('查看资料')!.click());
    expect(view.openBot).toHaveBeenLastCalledWith('ada', 'profile');
    await act(() => view.root.unmount());
  });

  it('inserts a mention chip for the Bot into the composer with @ TA', async () => {
    const view = await renderGroup();
    await view.openMenu();
    await act(() => view.item('@ TA')!.click());
    const editor = view.node.querySelector<HTMLElement>('.bh-composer-rich-input')!;
    const chip = editor.querySelector<HTMLElement>('[data-bot-id]');
    expect(chip?.dataset.botId).toBe('ada');
    expect(readRichMentionDraft(editor)).toMatchObject({
      value: '@Ada ',
      mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
    });
    expect(view.openBot).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(editor);
    expect(richSelectionOffsets(editor)?.end).toBe(5);

    await view.openMenu();
    await act(() => view.item('@ TA')!.click());
    expect(editor.querySelectorAll('[data-bot-id]')).toHaveLength(1);
    await act(() => view.root.unmount());
  });
});

describe('Channel sidebar member menu', () => {
  it.each(['contextmenu', 'ellipsis', 'keyboard'])(
    'inserts a structured mention via %s and keeps the draft',
    async (entry) => {
      const view = await renderGroup();
      await act(() => {
        Array.from(view.node.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
          .find(
            (tab) => tab.getAttribute('aria-label') === '成员' || tab.textContent?.includes('成员'),
          )!
          .click();
      });
      const editor = view.node.querySelector<HTMLElement>('.bh-composer-rich-input')!;
      await act(() => {
        editor.textContent = 'Please review';
        editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
      });
      const row = view.node.querySelector<HTMLElement>('.bh-member-row')!;
      const open = () =>
        act(() => {
          if (entry === 'ellipsis')
            row.querySelector<HTMLButtonElement>('.bh-member-menu-button')!.click();
          else if (entry === 'keyboard')
            row.querySelector('button')!.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'F10',
                shiftKey: true,
                bubbles: true,
                cancelable: true,
              }),
            );
          else
            row.dispatchEvent(
              new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: 40,
                clientY: 60,
              }),
            );
        });
      await open();
      const items = Array.from(document.querySelectorAll('[data-pointer-menu] [role="menuitem"]'));
      expect(items.map((item) => item.textContent)).toEqual([
        '打开私聊',
        '@ TA',
        '消息提醒设置',
        '移出群聊',
      ]);
      expect(items.every((item) => item.querySelector('[data-menu-icon]') !== null)).toBe(true);
      await act(() => view.item('@ TA')!.click());
      expect(readRichMentionDraft(editor)).toMatchObject({
        value: 'Please review @Ada ',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 14, end: 18 }],
      });
      expect(document.activeElement).toBe(editor);
      expect(richSelectionOffsets(editor)?.end).toBe(19);
      expect(view.openBot).not.toHaveBeenCalled();
      expect(document.querySelector('[data-pointer-menu]')).toBeNull();
      await open();
      await act(() => view.item('@ TA')!.click());
      expect(editor.querySelectorAll('[data-bot-id]')).toHaveLength(1);
      await act(() => view.root.unmount());
    },
  );
});
