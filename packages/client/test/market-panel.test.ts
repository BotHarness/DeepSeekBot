// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: Record<string, unknown> & { children?: ReactNode }) =>
    createElement(
      'button',
      {
        disabled: props['disabled'],
        onClick: props['onClick'],
        'aria-label': props['aria-label'],
      },
      props.children,
    ),
  Input: (props: Record<string, unknown>) => createElement('input', props),
  Tag: (props: { children?: ReactNode }) => createElement('span', null, props.children),
  MarkdownText: (props: { text: string }) => createElement('div', null, props.text),
  SegmentedControl: (props: {
    value: string;
    disabled?: boolean;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
  }) =>
    createElement(
      'div',
      { role: 'tablist' },
      props.options.map((option) =>
        createElement(
          'button',
          {
            key: option.value,
            role: 'tab',
            'aria-selected': option.value === props.value,
            disabled: props.disabled,
            onClick: () => props.onChange(option.value),
          },
          option.label,
        ),
      ),
    ),
  Modal: (props: { title: string; children?: ReactNode; footer?: ReactNode }) =>
    createElement(
      'section',
      { 'data-dialog': props.title },
      createElement('h1', null, props.title),
      props.children,
      props.footer,
    ),
}));

vi.mock('../src/client/avatar.js', () => ({
  PersonaBotAvatar: (props: { name: string }) =>
    createElement('span', { 'data-avatar': props.name }),
}));

const drafts = vi.hoisted(() => ({ appended: [] as [string, string][] }));
vi.mock('../src/client/conversation-draft.js', () => ({
  conversationDraftKey: () => 'dm-scope',
  appendConversationDraft: (scope: string, text: string) => drafts.appended.push([scope, text]),
}));

import type { MarketplaceEntry, MarketplacePage } from '../../core/src/marketplace/client.js';
import type { BridgeActions } from '../src/client/actions.js';
import { CHANNEL_BODY_PANEL } from '../src/client/channel-dock-layout.js';
import type { DockPanelRegistry } from '../src/client/dock-panels.js';
import { zhTranslate } from '../src/client/locale.js';
import { MarketPanelView, createMarketPanel, MARKET_PANEL } from '../src/client/market-panel.js';
import { MARKET_SHARE_PROMPT } from '../src/client/market-share-prompt.js';
import { store, type BotSummary } from '../src/client/store.js';

function entry(name: string, overrides: Partial<MarketplaceEntry> = {}): MarketplaceEntry {
  return {
    id: `R_${name}`,
    owner: 'alice',
    name,
    fullName: `alice/${name}`,
    displayName: null,
    banner: null,
    roles: [],
    description: `${name} description`,
    descriptionGenerated: false,
    topics: [],
    stars: 7,
    pushedAt: '2026-10-01T08:00:00Z',
    createdAt: '2026-03-05T08:00:00Z',
    htmlUrl: `https://github.com/alice/${name}`,
    cloneUrl: `https://github.com/alice/${name}.git`,
    defaultBranch: 'main',
    headCommit: null,
    ...overrides,
  };
}

function bot(slug: string, overrides: Partial<BotSummary> = {}): BotSummary {
  return {
    slug,
    displayName: slug,
    roles: [],
    aggregateState: 'idle',
    workspaces: [],
    createdAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

async function withPanel(
  pages: (query?: { sort?: string; q?: string }) => Promise<MarketplacePage>,
  test: (harness: {
    host: HTMLElement;
    list: ReturnType<typeof vi.fn>;
    actions: Record<string, ReturnType<typeof vi.fn>>;
    registry: { open: ReturnType<typeof vi.fn> };
  }) => Promise<void>,
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const list = vi.fn(pages);
  const actions = {
    marketplaceList: list,
    marketplaceTopics: vi.fn(async () => []),
    marketplaceDetail: vi.fn(async () => {
      throw new Error('unused');
    }),
    createBot: vi.fn(async () => undefined),
    openBot: vi.fn(async () => undefined),
  };
  const registry = { open: vi.fn() };
  try {
    await act(async () =>
      root.render(
        createElement(MarketPanelView, {
          actions: actions as unknown as BridgeActions,
          registry: registry as unknown as DockPanelRegistry,
          t: zhTranslate,
        }),
      ),
    );
    await test({ host, list, actions, registry });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(
    (item) => item.textContent === label || item.getAttribute('aria-label') === label,
  );
  if (found === undefined) throw new Error(`missing button ${label}`);
  return found;
}

async function click(host: HTMLElement, label: string) {
  await act(async () => button(host, label).click());
}

describe('Market panel', () => {
  it('registers as a global dock panel', () => {
    const panel = createMarketPanel({} as BridgeActions, {} as DockPanelRegistry, zhTranslate);
    expect(panel).toMatchObject({
      id: MARKET_PANEL,
      title: 'Bot 市场',
      icon: 'store',
      scope: 'global',
    });
  });

  it('shows a flat grid, sorts by creation time and searches only on Enter', async () => {
    await withPanel(
      async (query) =>
        query?.q !== undefined
          ? { bots: [entry('translator')] }
          : query?.sort === 'created'
            ? { bots: [entry('newest'), entry('older')] }
            : { bots: [entry('fresh')] },
      async ({ host, list }) => {
        expect(host.querySelectorAll('.bh-market-grid [role="listitem"]')).toHaveLength(1);
        expect(host.textContent).toContain('更新于 2026-10-01');

        await click(host, '最新创建');

        expect(list).toHaveBeenLastCalledWith({ sort: 'created', lang: 'zh' });
        expect(
          [...host.querySelectorAll('[data-market-bot]')].map((tile) =>
            tile.getAttribute('data-market-bot'),
          ),
        ).toEqual(['alice/newest', 'alice/older']);
        expect(host.textContent).toContain('创建于 2026-03-05');

        const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
        await act(async () => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
            search,
            'translator',
          );
          search.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(list).toHaveBeenCalledTimes(2);

        await act(async () => {
          search.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
          );
        });

        expect(list).toHaveBeenLastCalledWith({ sort: 'created', lang: 'zh', q: 'translator' });
        expect(host.textContent).toContain('translator description');
      },
    );
  });

  it('imports a Bot through the install confirmation and shows its conversation', async () => {
    await withPanel(
      async () => ({ bots: [entry('helper')] }),
      async ({ host, actions, registry }) => {
        await click(host, '导入');
        expect(host.querySelector('h1')?.textContent).toBe('安装 helper');
        expect(host.textContent).toContain('这是第三方仓库');

        await click(host, '确认安装');

        expect(actions['createBot']).toHaveBeenCalledWith({
          displayName: 'helper',
          gitUrl: 'https://github.com/alice/helper.git',
          roles: [],
          origin: 'marketplace',
          description: 'helper description',
        });
        expect(registry.open).toHaveBeenCalledWith(CHANNEL_BODY_PANEL);
        expect(host.querySelector('h1')).toBeNull();
        expect(host.querySelector('[data-market-panel]')).not.toBeNull();
      },
    );
  });

  it('hands publishing to the chosen Bot by drafting the share prompt into its DM', async () => {
    drafts.appended.length = 0;
    store.setRoster(
      [
        bot('writer', { displayName: 'Writer' }),
        bot('tob', { tob: { defaultName: true, defaultAvatar: true } }),
        bot('gone', { deleted: true }),
      ],
      [],
    );
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host, actions, registry }) => {
        await click(host, '上传 Bot');
        const rows = [...host.querySelectorAll('.bh-market-upload-bot')];
        expect(rows.map((row) => row.textContent)).toEqual(['Writer交给它发布']);

        await click(host, '让 Writer 发布到市场');

        expect(actions['openBot']).toHaveBeenCalledWith('writer');
        expect(drafts.appended).toEqual([['dm-scope', MARKET_SHARE_PROMPT.zh]]);
        expect(registry.open).toHaveBeenCalledWith(CHANNEL_BODY_PANEL);
        expect(host.querySelector('[data-market-upload]')).toBeNull();
      },
    );
  });
});

describe('Market share prompt', () => {
  it('is the prompt the Share a Bot guide publishes', () => {
    const block = (path: string) =>
      /```text\n([\s\S]*?)\n```/u.exec(readFileSync(new URL(path, import.meta.url), 'utf8'))?.[1];
    expect(MARKET_SHARE_PROMPT.zh).toBe(block('../../../docs/share-bot.zh.md'));
    expect(MARKET_SHARE_PROMPT.en).toBe(block('../../../docs/share-bot.md'));
  });
});
