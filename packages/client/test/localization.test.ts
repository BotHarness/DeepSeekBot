import { createElement, type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

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
    IconCloseOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconNewChatOutlineRegular: stub,
    IconPaperclipOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    IconTrashOutlineRegular: stub,
    FileTypeIcon: stub,
    ImageLightbox: stub,
    Input: stub,
    Menu: stub,
    MarkdownText: stub,
    Modal: stub,
    SegmentedControl: stub,
    StateDot: stub,
    Tag,
    Tooltip: Tag,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotMain } from '../src/client/bot-main.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { ChannelSidebarEntrySection } from '../src/client/channel-sidebar-view.js';
import { en, zh, type BotHarnessTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';

const tEn = ((key: string, params?: Record<string, unknown>): string => {
  let text = (en as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replace(`{${name}}`, String(value));
  }
  return text;
}) as unknown as BotHarnessTranslate;

describe('localization coverage', () => {
  it('mirrors every Chinese key in the English dictionary', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    for (const value of Object.values(en)) {
      expect(value.trim()).not.toBe('');
    }
  });

  it('renders Channel sidebar entries in English', () => {
    const entry = createChannelSidebarBuiltins(tEn).find(
      (candidate) => candidate.id === 'sessions',
    );
    expect(entry).toBeDefined();
    const markup = renderToStaticMarkup(
      createElement(ChannelSidebarEntrySection, {
        entry: entry!,
        expanded: true,
        onToggle: () => undefined,
        entryProps: {
          scope: 'personabot',
          channelId: 'dm-ada',
          botSlug: 'ada',
          actions: {} as BridgeActions,
          t: tEn,
        },
      }),
    );
    expect(markup).toContain('Sessions');
  });

  it('keeps the Members roster separate from Group management actions', () => {
    const group = {
      id: 'group-team',
      type: 'group' as const,
      name: 'Team',
      members: ['ada', 'bea'],
      ownerBotSlug: 'ada',
      invitations: [
        {
          id: 'invite-bea',
          inviterBotSlug: 'ada',
          targetBotSlug: 'bea',
          status: 'accepted' as const,
          createdAt: '2026-09-25T00:00:00.000Z',
        },
        {
          id: 'invite-cee',
          inviterBotSlug: 'ada',
          targetBotSlug: 'cee',
          status: 'pending' as const,
          createdAt: '2026-09-25T00:00:00.000Z',
        },
      ],
      joinRequests: [
        {
          id: 'join-cee',
          requesterBotSlug: 'cee',
          status: 'pending' as const,
          createdAt: '2026-09-25T00:00:00.000Z',
        },
      ],
      createdAt: '2026-09-25T00:00:00.000Z',
      updatedAt: '2026-09-25T00:00:00.000Z',
    };
    store.setRoster([], [group]);
    store.select({ kind: 'channel', channelId: group.id });
    store.setConversation({ status: 'ready', channel: group });
    const entries = createChannelSidebarBuiltins(tEn);
    const renderEntry = (id: string) =>
      renderToStaticMarkup(
        createElement(entries.find((entry) => entry.id === id)!.component, {
          scope: 'channel',
          channelId: group.id,
          botSlug: undefined,
          actions: {} as BridgeActions,
          t: tEn,
        }),
      );
    const members = renderEntry('members');
    expect(members).toContain('Creator');
    expect(members).toContain('Manage ada');
    expect(members).not.toContain('Join requests');
    expect(members).not.toContain('Remove from Group');
    const header = renderToStaticMarkup(
      createElement(entries.find((entry) => entry.id === 'members')!.headerAction!, {
        scope: 'channel',
        channelId: group.id,
        botSlug: undefined,
        actions: {} as BridgeActions,
        t: tEn,
      }),
    );
    expect(header).toContain('Invite member');
    expect(header).toContain('Invitations and join requests, 2 pending');
    const management = renderEntry('group-management');
    expect(management).toContain('Group avatar');
    expect(management).toContain('Group name');
    expect(management).not.toContain('Invite member');
    expect(management).not.toContain('Join requests');
    expect(management).not.toContain('Remove from Group');
    expect(management).not.toContain('Disband Group');
  });

  it('renders the empty conversation state in English', () => {
    const registry = createChannelSidebarRegistry();
    for (const builtin of createChannelSidebarBuiltins(tEn)) registry.register(builtin);
    store.setRoster([], []);
    store.select(undefined);
    store.setMode('bot');
    const markup = renderToStaticMarkup(
      createElement(BotMain, {
        actions: {} as BridgeActions,
        channelSidebar: registry,
        t: tEn,
      }),
    );
    expect(markup).toContain('role="status"');
    expect(markup).toContain('No Bots yet');
    expect(markup).not.toContain('main.welcome.empty');
  });
});
