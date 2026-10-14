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
    IconFolderOpenOutlineRegular: stub,
    IconDownloadOutlineRegular: stub,
    IconSettingsOutlineRegular: stub,
    IconCloseFill14: stub,
    IconCopyOutline16: stub,
    IconCopyOutlineRegular: stub,
    IconCloseOutline16: stub,
    IconEllipsisOutline16: stub,
    IconEllipsisOutlineRegular: stub,
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
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { toggleHiddenDmAction } from '../src/client/dm-actions.js';
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
const group: ChannelSummary = {
  id: 'group-crew',
  type: 'group',
  name: 'Launch crew',
  members: ['mira', 'nova', 'kai'],
  createdAt: AT,
  updatedAt: AT,
};

beforeEach(() => {
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class {
      observe(): void {}
      disconnect(): void {}
    },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('Channel Notices in a Group', () => {
  it('renders a Bot DM notice as a muted line that opens the sent message', async () => {
    const openChannel = vi.fn(async () => undefined);
    const openAround = vi.fn(async () => undefined);
    const noticeActions = new Proxy(
      {
        ...inertSubmissionActions,
        fileOpenPreferences: {
          ready: async () => {},
          get: () => undefined,
          set: () => {},
          clear: () => {},
          subscribe: () => () => {},
        },
        memoryFileTarget: vi.fn(async (_slug: string, path: string) => ({
          path: '/host/memory/' + path,
          relativePath: path,
          kind: 'file' as const,
        })),
        memoryFileApplications: vi.fn(async () => ({ available: false, applications: [] })),
        openChannel,
        openAround,
        listWorkspaceGrants: vi.fn(async () => []),
      },
      {
        get: (target, key: string) => Reflect.get(target, key) ?? vi.fn(async () => undefined),
      },
    ) as unknown as BridgeActions;
    await act(async () => {
      store.setRoster([bot('mira', 'Mira'), bot('nova', 'Nova')], [group]);
      store.select({ kind: 'channel', channelId: group.id });
      store.setConversation({
        status: 'ready',
        channel: group,
        messages: [
          { id: 'm-1', at: AT, author: { kind: 'human' }, body: '@Mira ask Nova' },
          {
            id: 'bot-dm-action-x',
            at: AT,
            author: { kind: 'bot', slug: 'mira' },
            body: '',
            botDmAction: {
              channelId: 'dm-bot-mira-nova',
              messageId: 'x',
              recipientBotSlug: 'nova',
            },
          },
        ],
        drafts: [],
        error: undefined,
        sending: false,
      });
      store.setSessions({ status: 'ready', items: [], error: undefined });
      root.render(
        createElement(BotMain, {
          actions: noticeActions,
          channelSidebar: createChannelSidebarRegistry(),
        }),
      );
    });
    const notice = container.querySelector<HTMLButtonElement>('.bh-bot-dm-action');
    expect(notice?.textContent).toBe('Mira 向 Nova 发送了私聊消息');
    expect(notice?.dataset['messageId']).toBe('bot-dm-action-x');
    expect(
      Array.from(notice?.querySelectorAll('.bh-bot-dm-action-bot') ?? []).map((chip) => [
        chip.querySelector('[aria-hidden="true"] .bh-persona-avatar') !== null,
        chip.textContent,
      ]),
    ).toEqual([
      [true, 'Mira'],
      [true, 'Nova'],
    ]);
    await act(async () => notice?.click());
    expect(openChannel).toHaveBeenCalledWith('dm-bot-mira-nova');
    expect(openAround).toHaveBeenCalledWith('dm-bot-mira-nova', 'x');
  });

  const commit = {
    botSlug: 'mira',
    sha: 'a'.repeat(40),
    subject: 'Remember the launch date',
    authorName: 'Mira',
    authoredAt: AT,
    files: [
      { path: 'MEMORY.md', added: 1, deleted: 0 },
      { path: 'launch.md', added: 5, deleted: 2 },
    ],
    moreFiles: 1,
  };
  const mira: ChannelSummary = {
    id: 'dm-mira',
    type: 'dm',
    name: 'Mira',
    members: ['mira'],
    botSlug: 'mira',
    createdAt: AT,
    updatedAt: AT,
  };
  const commitLine = {
    id: 'memory-commit-1',
    at: AT,
    author: { kind: 'system' as const },
    body: '',
    memoryCommit: commit,
  };

  async function show(channel: ChannelSummary, noticeActions: BridgeActions): Promise<void> {
    await act(async () => {
      store.setRoster([bot('mira', 'Mira')], [group, mira]);
      store.select(
        channel.type === 'dm'
          ? { kind: 'bot', slug: 'mira' }
          : { kind: 'channel', channelId: channel.id },
      );
      store.setConversation({
        status: 'ready',
        channel,
        messages: [commitLine],
        drafts: [],
        error: undefined,
        sending: false,
      });
      store.setSessions({ status: 'ready', items: [], error: undefined });
      root.render(
        createElement(BotMain, {
          actions: noticeActions,
          channelSidebar: createChannelSidebarRegistry(),
        }),
      );
    });
  }

  function proxyActions(overrides: Record<string, unknown>): BridgeActions {
    return new Proxy(
      {
        ...inertSubmissionActions,
        fileOpenPreferences: {
          ready: async () => {},
          get: () => undefined,
          set: () => {},
          clear: () => {},
          subscribe: () => () => {},
        },
        memoryFileTarget: vi.fn(async (_slug: string, path: string) => ({
          path: '/host/memory/' + path,
          relativePath: path,
          kind: 'file' as const,
        })),
        memoryFileApplications: vi.fn(async () => ({ available: false, applications: [] })),
        listWorkspaceGrants: vi.fn(async () => []),
        ...overrides,
      },
      {
        get: (target, key: string) => Reflect.get(target, key) ?? vi.fn(async () => undefined),
      },
    ) as unknown as BridgeActions;
  }

  it('renders a Memory commit line and sends a Group click to the Bot DM commit', async () => {
    const openBot = vi.fn(async () => undefined);
    await show(group, proxyActions({ openBot }));
    const line = container.querySelector<HTMLButtonElement>('.bh-memory-commit-line');
    expect(line?.textContent).toBe(
      'Mira更新了记忆Remember the launch dateaaaaaaalaunch.md +5 −2 · 另有 2 个文件',
    );
    expect(line?.title).toBe(`${commit.sha} · Git 作者：Mira\nlaunch.md +5 −2 · 另有 2 个文件`);
    expect(line?.querySelector('svg')).not.toBeNull();
    await act(async () => line?.click());
    expect(store.getSnapshot().memoryCommitIntent).toEqual({
      channelId: 'dm-mira',
      sha: commit.sha,
    });
    expect(openBot).toHaveBeenCalledWith('mira');
    await act(async () => store.setMemoryCommitIntent(undefined));
  });

  it('shows what the Bot did elsewhere in its DM and hides each kind on request', async () => {
    window.localStorage.clear();
    const openChannel = vi.fn(async () => undefined);
    const openAround = vi.fn(async () => undefined);
    const botDm: ChannelSummary = {
      id: 'dm-mira-nova',
      type: 'dm',
      name: 'Mira ↔ Nova',
      members: ['mira', 'nova'],
      createdAt: AT,
      updatedAt: AT,
    };
    const post = (id: string, preview: string | null, channelId = group.id) => ({
      id: `bot-channel-post-${id}`,
      at: AT,
      author: { kind: 'bot' as const, slug: 'mira' },
      body: '',
      botChannelPost: { channelId, messageId: id },
      botChannelPostPreview: preview,
    });
    await act(async () => {
      store.setRoster([bot('mira', 'Mira'), bot('nova', 'Nova')], [group, mira, botDm]);
      store.select({ kind: 'bot', slug: 'mira' });
      store.setConversation({
        status: 'ready',
        channel: mira,
        messages: [
          { id: 'hi', at: AT, author: { kind: 'human' }, body: '你好' },
          post('g-1', '收到'),
          post('g-2', '已整理好需求清单'),
          { ...commitLine, noticeOrigin: { channelId: group.id } },
          post('b-1', '能负责这次 QA 吗？', botDm.id),
          { ...commitLine, id: 'commit-dm', noticeOrigin: { channelId: botDm.id } },
        ],
        drafts: [],
        error: undefined,
        sending: false,
      });
      store.setSessions({ status: 'ready', items: [], error: undefined });
      root.render(
        createElement(BotMain, {
          actions: proxyActions({ openChannel, openAround }),
          channelSidebar: createChannelSidebarRegistry(),
        }),
      );
    });
    const trace = container.querySelectorAll<HTMLButtonElement>('.bh-dm-trace-line');
    expect(trace).toHaveLength(2);
    expect(trace[0]?.textContent).toBe('Mira在 #Launch crew 发言 2 条，最新：已整理好需求清单');
    expect(trace[1]?.textContent).toBe('Mira私信 Nova：能负责这次 QA 吗？');
    const memory = container.querySelectorAll('.bh-memory-commit-line:not(.bh-dm-trace-line)');
    expect(memory[0]?.textContent).toContain('在 #Launch crew 更新了记忆');
    expect(memory[1]?.textContent).toContain('和 Nova 私信时更新了记忆');
    await act(async () => trace[0]?.click());
    expect(openChannel).toHaveBeenCalledWith(group.id);
    expect(openAround).toHaveBeenCalledWith(group.id, 'g-2');

    await act(async () => toggleHiddenDmAction('mira', 'posts'));
    expect(container.querySelector('.bh-dm-trace-line')).toBeNull();
    expect(container.querySelector('.bh-memory-commit-line')).not.toBeNull();
    expect(JSON.parse(window.localStorage.getItem('botharness.dm-actions.hidden.v1')!)).toEqual({
      mira: ['posts'],
    });
    await act(async () => toggleHiddenDmAction('mira', 'posts'));
    expect(container.querySelector('.bh-dm-trace-line')).not.toBeNull();
    window.localStorage.clear();
  });

  it('opens the commit view in the Bot DM from a pending intent', async () => {
    const memoryGitCommitDiff = vi.fn(async () => ({
      sha: commit.sha,
      files: [{ path: 'launch.md', status: 'A' }],
      diff: '@@ -0,0 +1 @@\n+Launch is Friday',
    }));
    store.setMemoryCommitIntent({ channelId: 'dm-mira', sha: commit.sha });
    await show(mira, proxyActions({ memoryGitCommitDiff }));
    expect(container.querySelector('.bh-memory-commit-view')).not.toBeNull();
    expect(memoryGitCommitDiff).toHaveBeenCalledWith('dm-mira', commit.sha);
    await act(async () => store.setMemoryCommitIntent(undefined));
  });
});
