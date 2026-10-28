// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => localStorage.clear());

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  relativeTime: (at: number, now: number) => ({
    unit: 'days',
    n: Math.floor((now - at) / 86_400_000),
  }),
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
  Checkbox: (props: { checked: boolean; onChange(checked: boolean): void; label?: ReactNode }) =>
    createElement(
      'label',
      null,
      createElement('input', {
        type: 'checkbox',
        checked: props.checked,
        onChange: (event: { target: { checked: boolean } }) => props.onChange(event.target.checked),
      }),
      props.label,
    ),
  IconChevronDownOutlineRegular: () => null,
  IconChevronLeftOutlineRegular: () => null,
  Menu: (props: {
    open: boolean;
    items: readonly { id: string; label: ReactNode }[];
    selectedId?: string;
    onSelect(id: string): void;
  }) =>
    createElement(
      'span',
      { role: 'menu' },
      props.open
        ? props.items.map((item) =>
            createElement(
              'button',
              {
                key: item.id,
                role: 'menuitemradio',
                'aria-checked': item.id === props.selectedId,
                onClick: () => props.onSelect(item.id),
              },
              item.label,
            ),
          )
        : null,
    ),
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
  PersonaBotAvatar: (props: { name: string; src?: string; appearance?: { recipe: unknown } }) =>
    createElement('span', {
      'data-avatar': props.name,
      'data-src': props.src,
      'data-recipe':
        props.appearance === undefined ? undefined : JSON.stringify(props.appearance.recipe),
    }),
}));

import { DEFAULT_ILLUSTRATED_RECIPE } from '../../core/src/bots/avatar-appearance.js';
import type { MarketplaceEntry, MarketplacePage } from '../../core/src/marketplace/client.js';
import type { BridgeActions } from '../src/client/actions.js';
import { CHANNEL_BODY_PANEL } from '../src/client/channel-dock-layout.js';
import type { DockPanelRegistry } from '../src/client/dock-panels.js';
import { zhTranslate } from '../src/client/locale.js';
import { MarketPanelView, createMarketPanel, MARKET_PANEL } from '../src/client/market-panel.js';
import { MarketUploadDialog } from '../src/client/market-upload.js';
import { store, type BotSummary } from '../src/client/store.js';
import { CSS } from '../src/client/styles.js';

function entry(name: string, overrides: Partial<MarketplaceEntry> = {}): MarketplaceEntry {
  return {
    id: `R_${name}`,
    owner: 'alice',
    name,
    fullName: `alice/${name}`,
    displayName: null,
    banner: null,
    avatar: null,
    roles: [],
    description: `${name} description`,
    descriptionGenerated: false,
    topics: [],
    stars: 7,
    installs: 0,
    pushedAt: '2026-10-01T08:00:00Z',
    createdAt: '2026-03-05T08:00:00Z',
    htmlUrl: `https://github.com/alice/${name}`,
    cloneUrl: `https://github.com/alice/${name}.git`,
    defaultBranch: 'main',
    headCommit: null,
    source: 'github',
    author: null,
    ...overrides,
  };
}

function draftView(state: 'reviewing' | 'ready') {
  return {
    slug: 'writer',
    id: 'draft-1',
    state,
    createdAt: '2026-10-27T00:00:00Z',
    updatedAt: '2026-10-27T00:00:00Z',
    files: [],
    skipped: [],
    summary: {
      slug: 'writer',
      id: 'draft-1',
      state,
      total: 4,
      pending: state === 'ready' ? 0 : 1,
      kept: 2,
      rewritten: state === 'ready' ? 1 : 0,
      dropped: 1,
      flagged: 2,
      updatedAt: '2026-10-27T00:00:00Z',
    },
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
  extra: Record<string, ReturnType<typeof vi.fn>> = {},
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const list = vi.fn(pages);
  const actions = {
    marketplaceList: list,
    marketplaceTopics: vi.fn(async () => []),
    marketplaceSections: vi.fn(async () => []),
    marketplaceDigest: vi.fn(async () => {
      throw new Error('digest-not-found');
    }),
    marketplaceDetail: vi.fn(async () => {
      throw new Error('unused');
    }),
    createBot: vi.fn(async () => undefined),
    openBot: vi.fn(async () => undefined),
    marketplaceAccount: vi.fn(async () => ({ signedIn: false, author: null })),
    ...extra,
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Market panel', () => {
  it('opens the latest daily picks with install cards and lists past days', async () => {
    const today = {
      day: '2026-10-28',
      lang: 'zh',
      title: '今天值得一试的 Bot',
      lede: '一位写作伙伴。',
      sections: [
        { heading: '写作伙伴', body: '它帮你整理想法。', bot: entry('writer') },
        { heading: '已下架', body: '这位已经不在市场里。', bot: null },
      ],
    };
    const yesterday = { ...today, day: '2026-10-27', title: '昨天的精选', sections: [] };
    const digest = vi.fn(async (day?: string) => (day === '2026-10-27' ? yesterday : today));
    const digests = vi.fn(async () => [
      { day: '2026-10-28', lang: 'zh', title: today.title, lede: today.lede },
      { day: '2026-10-27', lang: 'zh', title: yesterday.title, lede: yesterday.lede },
    ]);
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host }) => {
        expect(digest).toHaveBeenCalledWith(undefined, 'zh');
        await click(host, '阅读每日精选：今天值得一试的 Bot');
        const dialog = document.querySelector('[data-market-digest="2026-10-28"]');
        expect(dialog?.textContent).toContain('它帮你整理想法。');
        expect(dialog?.querySelectorAll('[data-market-bot]')).toHaveLength(1);
        expect([...(dialog?.querySelectorAll('h3') ?? [])].map((node) => node.textContent)).toEqual(
          ['写作伙伴', '已下架'],
        );

        await act(async () => button(document.body, '往期精选').click());
        expect(digests).toHaveBeenCalledWith('zh');
        const days = [...document.querySelectorAll('[data-market-digest-day]')];
        expect(days.map((node) => node.getAttribute('data-market-digest-day'))).toEqual([
          '2026-10-28',
          '2026-10-27',
        ]);
        await act(async () => (days[1] as HTMLButtonElement).click());
        expect(digest).toHaveBeenLastCalledWith('2026-10-27', 'zh');
        expect(document.querySelector('[data-market-digest="2026-10-27"]')).not.toBeNull();
      },
      { marketplaceDigest: digest, marketplaceDigests: digests },
    );
  });

  it('opens on the Hot, New and Rising rows and hides an empty row', async () => {
    const sections = vi.fn(async () => [
      { section: 'hot', day: '2026-10-28', entries: [{ bot: entry('popular'), score: 4 }] },
      { section: 'new', day: '2026-10-28', entries: [] },
      { section: 'rising', day: '2026-10-28', entries: [{ bot: entry('climber'), score: 3 }] },
    ]);
    await withPanel(
      async () => ({ bots: [entry('helper')] }),
      async ({ host }) => {
        expect(sections).toHaveBeenCalledWith('zh');
        const rows = [...host.querySelectorAll('[data-market-section]')];
        expect(rows.map((row) => row.getAttribute('data-market-section'))).toEqual([
          'hot',
          'rising',
        ]);
        expect(rows.map((row) => row.querySelector('h3')?.textContent)).toEqual([
          '热门',
          '上升最快',
        ]);
        expect(rows[0]!.querySelector('[data-market-bot]')?.getAttribute('data-market-bot')).toBe(
          'alice/popular',
        );
        expect([...rows[0]!.querySelectorAll('button')].at(-1)?.textContent).toBe('导入');
      },
      { marketplaceSections: sections },
    );
  });

  it('defaults to stars and remembers each explicit sort after reopening', async () => {
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host, list }) => {
        expect(list).toHaveBeenLastCalledWith({ sort: 'stars', lang: 'zh', includeUploads: true });
        expect(button(host, '最多 Star').getAttribute('aria-selected')).toBe('true');
        await click(host, '最新创建');
      },
    );
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host, list }) => {
        expect(list).toHaveBeenLastCalledWith({
          sort: 'created',
          lang: 'zh',
          includeUploads: true,
        });
        await click(host, '最近更新');
      },
    );
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host, list }) => {
        expect(list).toHaveBeenLastCalledWith({
          sort: 'updated',
          lang: 'zh',
          includeUploads: true,
        });
        await click(host, '最多 Star');
      },
    );
    await withPanel(
      async () => ({ bots: [] }),
      async ({ list }) => {
        expect(list).toHaveBeenLastCalledWith({ sort: 'stars', lang: 'zh', includeUploads: true });
      },
    );
  });

  it('keeps every sort reachable from a menu when the panel is too narrow for the tabs', async () => {
    expect(CSS).toMatch(
      /@container bh-market \(max-width: 380px\) \{\s*\.bh-market-sort > \[role='tablist'\] \{ display: none; \}\s*\.bh-market-sort-menu \{ display: flex; \}/u,
    );
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host, list }) => {
        const menu = host.querySelector<HTMLButtonElement>(
          '.bh-market-sort-menu > button[aria-label="排序"]',
        )!;
        expect(menu.textContent).toBe('最多 Star');
        await act(async () => menu.click());
        const items = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
        expect(items.map((item) => item.textContent)).toEqual([
          '最新创建',
          '最近更新',
          '最多 Star',
        ]);
        expect(items[2]?.getAttribute('aria-checked')).toBe('true');
        await act(async () => items[1]!.click());
        expect(list).toHaveBeenLastCalledWith({
          sort: 'updated',
          lang: 'zh',
          includeUploads: true,
        });
        expect(menu.textContent).toBe('最近更新');
        expect(button(host, '最近更新').getAttribute('aria-selected')).toBe('true');
      },
    );
  });

  it('ignores invalid saved sorts and works when storage is unavailable', async () => {
    localStorage.setItem('botharness.marketplace.sort', 'obsolete');
    await withPanel(
      async () => ({ bots: [] }),
      async ({ list }) => {
        expect(list).toHaveBeenLastCalledWith({ sort: 'stars', lang: 'zh', includeUploads: true });
      },
    );
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    try {
      await withPanel(
        async () => ({ bots: [] }),
        async ({ host, list }) => {
          expect(list).toHaveBeenLastCalledWith({
            sort: 'stars',
            lang: 'zh',
            includeUploads: true,
          });
          await click(host, '最新创建');
          expect(list).toHaveBeenLastCalledWith({
            sort: 'created',
            lang: 'zh',
            includeUploads: true,
          });
        },
      );
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });

  it('shows recipe, uploaded and absent banners in the card detail target', async () => {
    await withPanel(
      async () => ({
        bots: [
          entry('scene', { banner: { recipe: { scene: 'mountain', seed: 12 } } }),
          entry('image', {
            banner: {
              image: 'https://raw.githubusercontent.com/alice/image/main/.botharness/banner.png',
            },
          }),
          entry('none'),
        ],
      }),
      async ({ host }) => {
        const banners = host.querySelectorAll('.bh-market-tile-open .bh-market-tile-banner');
        expect(banners).toHaveLength(3);
        expect(banners[0]?.querySelector('canvas')).not.toBeNull();
        expect(banners[1]?.querySelector('img')?.src).toContain('/.botharness/banner.png');
        expect(banners[2]?.getAttribute('data-market-banner')).toBe('none');
      },
    );
  });

  it('shows the avatar each Bot shares instead of one seeded from its name', async () => {
    const image = 'https://raw.githubusercontent.com/alice/photo/main/.botharness/avatar.png';
    await withPanel(
      async () => ({
        bots: [
          entry('photo', { avatar: { image } }),
          entry('drawn', { avatar: { recipe: DEFAULT_ILLUSTRATED_RECIPE } }),
          entry('none'),
        ],
      }),
      async ({ host }) => {
        const avatars = [...host.querySelectorAll('.bh-market-tile [data-market-avatar]')];
        expect(avatars.map((avatar) => avatar.getAttribute('data-market-avatar'))).toEqual([
          'image',
          'recipe',
          'seeded',
        ]);
        expect(avatars[0]?.querySelector('[data-src]')?.getAttribute('data-src')).toBe(image);
        expect(avatars[1]?.querySelector('[data-recipe]')?.getAttribute('data-recipe')).toBe(
          JSON.stringify(DEFAULT_ILLUSTRATED_RECIPE),
        );
        expect(avatars[2]?.querySelector('[data-src]')).toBeNull();
      },
    );
  });

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
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-04T08:00:00Z'));
    await withPanel(
      async (query) =>
        query?.q !== undefined
          ? { bots: [entry('translator')] }
          : query?.sort === 'created'
            ? { bots: [entry('newest'), entry('older')] }
            : { bots: [entry('fresh')] },
      async ({ host, list }) => {
        expect(host.querySelectorAll('.bh-market-grid [role="listitem"]')).toHaveLength(1);
        expect(host.textContent).toContain('更新于 3 天前');

        await click(host, '最新创建');

        expect(list).toHaveBeenLastCalledWith({
          sort: 'created',
          lang: 'zh',
          includeUploads: true,
        });
        expect(
          [...host.querySelectorAll('[data-market-bot]')].map((tile) =>
            tile.getAttribute('data-market-bot'),
          ),
        ).toEqual(['alice/newest', 'alice/older']);
        expect(host.textContent).toContain('创建于 213 天前');

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

        expect(list).toHaveBeenLastCalledWith({
          sort: 'created',
          lang: 'zh',
          includeUploads: true,
          q: 'translator',
        });
        expect(host.textContent).toContain('translator description');
      },
    );
  });

  it('shows what Tob found before installing, and installs only after the Human continues', async () => {
    const review = vi.fn(async () => ({
      reviewId: 'review-1',
      listing: entry('helper'),
      review: {
        status: 'reviewed',
        findings: [
          {
            kind: 'exfiltration',
            path: 'SOUL.md',
            note: '让 Bot 把 ~/.ssh 发到外部邮箱。',
          },
          { kind: 'script', path: 'tools/run.sh' },
        ],
        files: 3,
        read: 2,
        partial: false,
      },
    }));
    const install = vi.fn(async () => bot('helper'));
    await withPanel(
      async () => ({ bots: [entry('helper')] }),
      async ({ host, actions, registry }) => {
        await click(host, '导入');
        expect(host.querySelector('h1')?.textContent).toBe('安装 helper');
        expect(review).toHaveBeenCalledWith('R_helper', 'zh');
        expect(host.textContent).toContain('Tob 发现 2 处需要留意');
        const findings = [...host.querySelectorAll('[data-market-finding]')];
        expect(findings.map((item) => item.getAttribute('data-market-finding'))).toEqual([
          'exfiltration',
          'script',
        ]);
        expect(findings[0]!.textContent).toContain(
          '外发数据SOUL.md让 Bot 把 ~/.ssh 发到外部邮箱。',
        );

        await click(host, '仍然安装');

        expect(install).toHaveBeenCalledWith('R_helper', 'review-1');
        expect(actions['createBot']).not.toHaveBeenCalled();
        expect(registry.open).toHaveBeenCalledWith(CHANNEL_BODY_PANEL);
        expect(host.querySelector('h1')).toBeNull();
        expect(host.querySelector('[data-market-panel]')).not.toBeNull();
      },
      { marketplaceInstallReview: review, marketplaceInstall: install },
    );
  });

  it('leaves no Bot behind when the Human goes back from the review', async () => {
    const install = vi.fn(async () => bot('helper'));
    await withPanel(
      async () => ({ bots: [entry('helper')] }),
      async ({ host }) => {
        await click(host, '导入');
        await click(host, '返回');
        expect(install).not.toHaveBeenCalled();
        expect(host.querySelector('[data-market-panel]')).not.toBeNull();
      },
      {
        marketplaceInstallReview: vi.fn(async () => ({
          reviewId: 'review-1',
          listing: entry('helper'),
          review: {
            status: 'reviewed',
            findings: [{ kind: 'prompt-injection', path: 'SOUL.md' }],
            files: 1,
            read: 1,
            partial: false,
          },
        })),
        marketplaceInstall: install,
      },
    );
  });

  it('says when Tob could not review and lets the Human install anyway', async () => {
    const install = vi.fn(async () => bot('helper'));
    await withPanel(
      async () => ({ bots: [entry('helper')] }),
      async ({ host }) => {
        await click(host, '导入');
        expect(host.querySelector('[data-market-review]')?.getAttribute('data-market-review')).toBe(
          'unavailable',
        );
        expect(host.textContent).toContain('Tob 没能检查这个 Bot');
        await click(host, '不检查直接安装');
        expect(install).toHaveBeenCalledWith('R_helper', 'review-3');
      },
      {
        marketplaceInstallReview: vi.fn(async () => ({
          reviewId: 'review-3',
          listing: entry('helper'),
          review: { status: 'unavailable', reason: 'no-model', findings: [], files: 1 },
        })),
        marketplaceInstall: install,
      },
    );
  });

  it('hands the Share Draft check to Tob in its DM', async () => {
    store.setRoster(
      [
        bot('writer', { displayName: 'Writer' }),
        bot('tob', { tob: { defaultName: true, defaultAvatar: true } }),
        bot('gone', { deleted: true }),
      ],
      [],
    );
    const start = vi.fn(async () => draftView('reviewing'));
    const sendHome = vi.fn(async () => undefined);
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host, registry }) => {
        await click(host, '上传 Bot');
        await click(host, '分享 Bot');
        const choices = [...host.querySelectorAll('[role="listitem"] button')];
        expect(choices.map((choice) => choice.getAttribute('aria-label'))).toEqual(['Writer']);
        await click(host, 'Writer');
        expect(host.querySelector('[data-market-draft-meta]')?.textContent).toBe(
          'Tob 会逐个文件问你，原文件不会改动。',
        );
        await click(host, '让 Tob 检查');
        expect(start).toHaveBeenCalledWith('writer');
        expect(sendHome).toHaveBeenCalledWith(
          'tob-dm',
          expect.stringContaining('（Bot ID：writer）'),
          expect.stringMatching(/^human-/u),
        );
        expect(registry.open).toHaveBeenCalledWith(CHANNEL_BODY_PANEL);
        expect(host.querySelector('[data-market-upload]')).toBeNull();
      },
      {
        shareDraftGet: vi.fn(async () => undefined),
        shareDraftStart: start,
        tobHome: vi.fn(async () => ({ botSlug: 'tob', channelId: 'tob-dm' })),
        sendHome,
      },
    );
  });
});

describe('Uploaded Bots in the Market panel', () => {
  const author = { name: 'Alice', id: 'k3x9q2', termsAcceptedAt: '2026-10-27T00:00:00Z' };
  const uploaded = entry('helper', {
    id: 'U_helper',
    owner: 'Alice',
    displayName: 'Helper',
    fullName: 'Alice/Helper',
    htmlUrl: 'https://market.botharness.ai/v1/bots/U_helper',
    cloneUrl: '',
    stars: 0,
    source: 'upload',
    author: { name: 'Alice', id: 'k3x9q2' },
  });

  it('uploads a checked draft after the author signs up', async () => {
    store.setRoster(
      [bot('writer', { displayName: 'Writer', description: 'Writes', roles: ['writing'] })],
      [],
    );
    const account = vi.fn(async () => ({ signedIn: true, email: 'a@example.com', author: null }));
    const save = vi.fn(async () => ({ ...author, name: '爱丽丝' }));
    const plan = vi.fn(async () => ({
      files: [{ path: 'SOUL.md', size: 10, kind: 'text' }],
      skipped: [{ path: 'tool.exe', reason: 'file-type-refused' }],
      totalBytes: 10,
    }));
    const upload = vi.fn(async () => ({ bot: uploaded, skipped: [] }));
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host }) => {
        await click(host, '上传 Bot');
        await click(host, '分享 Bot');
        await click(host, 'Writer');
        expect(host.querySelector('[data-market-draft-meta]')?.textContent).toBe(
          '保留 2 · 改写 1 · 删除 1',
        );
        await click(host, '下一步');
        expect(host.querySelector('[aria-current="step"]')?.textContent).toBe('3去向');
        await click(host, 'Tobs 市场');
        const nameInput = host.querySelector<HTMLInputElement>(
          '[data-market-direct="account"] input',
        )!;
        await act(async () => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
          setter.call(nameInput, '爱丽丝');
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(button(host, '继续').disabled).toBe(true);
        await act(async () =>
          host
            .querySelector<HTMLElement>('[data-market-direct="account"] input[type="checkbox"]')!
            .click(),
        );
        await click(host, '继续');
        expect(save).toHaveBeenCalledWith('爱丽丝', true);
        const form = host.querySelector('[data-market-direct="details"]')!;
        const values = [
          ...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
        ].map((field) => field.value);
        expect(values).toEqual(['Writer', 'Writes', 'writing']);
        await click(host, '下一步');
        const review = host.querySelector('[data-market-direct="review"]')!;
        expect(review.textContent).toContain('爱丽丝 #k3x9q2 · 1 个文件，10 B');
        expect(review.textContent).toContain('不会上传：tool.exe');
        await click(host, '上传');
        expect(upload).toHaveBeenCalledWith('writer', {
          displayName: 'Writer',
          bio: 'Writes',
          tags: ['writing'],
        });
        expect(host.querySelector('[data-market-upload]')).toBeNull();
        expect(host.querySelector('[data-market-bot="Alice/Helper"]')?.textContent).toContain(
          'Alice #k3x9q2',
        );
      },
      {
        shareDraftGet: vi.fn(async () => draftView('ready')),
        marketplaceAccount: account,
        marketplaceAuthorSave: save,
        marketplaceUploadPlan: plan,
        marketplaceUpload: upload,
      },
    );
  });

  it('opens on the check step for a preselected Bot', async () => {
    store.setRoster([bot('writer', { displayName: 'Writer' })], []);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const get = vi.fn(async () => draftView('reviewing'));
    const actions = {
      marketplaceAccount: vi.fn(async () => ({ signedIn: true, author })),
      shareDraftGet: get,
    };
    try {
      await act(async () =>
        root.render(
          createElement(MarketUploadDialog, {
            actions: actions as unknown as BridgeActions,
            registry: { open: vi.fn() } as unknown as DockPanelRegistry,
            t: zhTranslate,
            onListed: vi.fn(),
            onClose: vi.fn(),
            initialSlug: 'writer',
          }),
        ),
      );
      expect(host.querySelector('[data-market-direct]')?.getAttribute('data-market-direct')).toBe(
        'draft',
      );
      expect(host.querySelector('[aria-current="step"]')?.textContent).toBe('2检查');
      expect(get).toHaveBeenCalledWith('writer');
      expect(host.querySelector('[data-market-draft-meta]')?.textContent).toBe('已检查 3/4');
      expect(button(host, '回到 Tob')).toBeDefined();
      await click(host, '返回');
      expect(host.querySelector('[data-market-direct]')).toBeNull();
      expect(button(host, '分享 Bot')).toBeDefined();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('lists my uploads, updates one through the upload steps and deletes another after a confirm', async () => {
    store.setRoster([bot('writer', { displayName: 'Writer' })], []);
    const other = entry('notes', { ...uploaded, id: 'U_notes', displayName: 'Notes' });
    const mine = vi.fn(async () => [
      { bot: uploaded, files: 3, bytes: 2048, blocked: false },
      { bot: other, files: 1, bytes: 10, blocked: true },
    ]);
    const plan = vi.fn(async () => ({
      files: [{ path: 'SOUL.md', size: 10, kind: 'text' }],
      skipped: [],
      totalBytes: 10,
    }));
    const replaced = { ...uploaded, displayName: 'Helper', pushedAt: '2026-10-27T09:00:00Z' };
    const upload = vi.fn(async () => ({ bot: replaced, skipped: [] }));
    const remove = vi.fn(async () => undefined);
    await withPanel(
      async () => ({ bots: [uploaded, other] }),
      async ({ host }) => {
        await click(host, '我上传的');
        const rows = [...host.querySelectorAll('[data-market-mine-bot]')];
        expect(rows.map((row) => row.getAttribute('data-market-mine-bot'))).toEqual([
          'U_helper',
          'U_notes',
        ]);
        expect(rows[0]?.textContent).toContain('3 个文件 · 2.0 KB · 2026-10-01');
        expect(rows[1]?.textContent).toContain('已下架');

        await click(host, '更新 Helper');
        expect(document.body.textContent).toContain('更新 Helper');
        expect(host.querySelector('[aria-current="step"]')?.textContent).toBe('1选择 Bot');
        expect(host.querySelectorAll('[aria-label="上传步骤"] li')).toHaveLength(5);
        await click(host, 'Writer');
        expect(host.querySelector('[data-market-direct="draft"]')).not.toBeNull();
        await click(host, '下一步');
        expect(plan).toHaveBeenCalledWith('writer');
        const values = [
          ...host
            .querySelector('[data-market-direct="details"]')!
            .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
        ].map((field) => field.value);
        expect(values).toEqual(['Helper', 'helper description', '']);
        await click(host, '下一步');
        const review = host.querySelector('[data-market-direct="review"]')!;
        expect(review.textContent).toContain('1 个文件，10 B');
        await click(host, '替换全部文件');
        expect(upload).toHaveBeenCalledWith('writer', {
          displayName: 'Helper',
          bio: 'helper description',
          tags: [],
          replaces: 'U_helper',
        });
        expect(host.querySelector('[data-market-upload]')).toBeNull();
        expect(host.querySelector('[data-market-mine="list"]')).not.toBeNull();

        await click(host, '删除 Notes');
        expect(host.textContent).toContain('已安装的副本不受影响');
        await act(async () => host.querySelector('form')!.requestSubmit());
        expect(remove).toHaveBeenCalledWith('U_notes');
        expect(host.querySelector('[data-market-mine-bot="U_notes"]')).toBeNull();
        expect(host.querySelector('[data-market-bot="Alice/Notes"]')).toBeNull();
      },
      {
        marketplaceAccount: vi.fn(async () => ({ signedIn: true, author })),
        marketplaceMine: mine,
        shareDraftGet: vi.fn(async () => draftView('ready')),
        marketplaceUploadPlan: plan,
        marketplaceUpload: upload,
        marketplaceDelete: remove,
      },
    );
  });

  it('marks an installed Uploaded Bot whose author updated it', async () => {
    await withPanel(
      async () => ({
        bots: [{ ...uploaded, installed: { bots: ['helper-copy'], authorUpdated: true } }],
      }),
      async ({ host }) => {
        const tile = host.querySelector('[data-market-bot="Alice/Helper"]')!;
        expect(tile.querySelector('[data-market-author-updated]')?.textContent).toBe('作者已更新');
      },
    );
  });

  it('asks a signed-out user to register before sharing a preselected Bot', async () => {
    store.setRoster([bot('writer', { displayName: 'Writer' })], []);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const actions = {
      marketplaceAccount: vi.fn(async () => ({ signedIn: false, author: null })),
      marketplaceUploadPlan: vi.fn(async () => ({ files: [], skipped: [], totalBytes: 0 })),
      shareDraftGet: vi.fn(async () => draftView('ready')),
    };
    try {
      await act(async () =>
        root.render(
          createElement(MarketUploadDialog, {
            actions: actions as unknown as BridgeActions,
            registry: { open: vi.fn() } as unknown as DockPanelRegistry,
            t: zhTranslate,
            onListed: vi.fn(),
            onClose: vi.fn(),
            initialSlug: 'writer',
          }),
        ),
      );
      await click(host, '下一步');
      await click(host, 'Tobs 市场');
      expect(host.querySelector('[data-market-direct]')?.getAttribute('data-market-direct')).toBe(
        'account',
      );
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('hands a ready draft to Tob for a GitHub push', async () => {
    store.setRoster([bot('writer', { displayName: 'Writer' })], []);
    const exported = vi.fn(async () => ({ path: '/tob/share-exports/writer', files: 3 }));
    const sendHome = vi.fn(async () => undefined);
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host }) => {
        await click(host, '上传 Bot');
        await click(host, '分享 Bot');
        await click(host, 'Writer');
        await click(host, '下一步');
        await click(host, '我的 GitHub');
        expect(host.querySelector('[aria-current="step"]')?.textContent).toBe('4GitHub');
        await click(host, '让 Tob 推送');
        expect(exported).toHaveBeenCalledWith('writer');
        expect(sendHome).toHaveBeenCalledWith(
          'tob-dm',
          expect.stringContaining('/tob/share-exports/writer'),
          expect.stringMatching(/^human-/u),
        );
        expect(host.querySelector('[data-market-upload]')).toBeNull();
      },
      {
        shareDraftGet: vi.fn(async () => draftView('ready')),
        shareDraftExport: exported,
        tobHome: vi.fn(async () => ({ botSlug: 'tob', channelId: 'tob-dm' })),
        sendHome,
      },
    );
  });

  it('shows the author and folder tree, and installs an Uploaded Bot through the Host', async () => {
    const install = vi.fn(async () => bot('helper-copy'));
    await withPanel(
      async () => ({ bots: [uploaded] }),
      async ({ host, actions, registry }) => {
        const tile = host.querySelector('[data-market-bot="Alice/Helper"]')!;
        expect(tile.textContent).toContain('Alice #k3x9q2');
        expect(tile.textContent).not.toContain('★');
        await click(host, '查看 Alice/Helper 详情');
        const files = host.querySelector('[data-market-files]')!;
        expect(files.getAttribute('data-market-files')).toBe('3');
        expect(files.querySelector('[data-market-folder="tools"]')?.textContent).toContain(
          'run.sh',
        );
        expect(files.textContent).toContain('脚本');
        expect(host.querySelector('.bh-market-github')).toBeNull();
        await click(host, '安装');
        expect(host.querySelector('[data-market-author]')?.textContent).toBe('Alice #k3x9q2');
        expect(host.textContent).toContain('Tob 没发现风险');
        await click(host, '确认安装');
        expect(install).toHaveBeenCalledWith('U_helper', 'review-2');
        expect(actions['createBot']).not.toHaveBeenCalled();
        expect(registry.open).toHaveBeenCalledWith(CHANNEL_BODY_PANEL);
      },
      {
        marketplaceInstall: install,
        marketplaceInstallReview: vi.fn(async () => ({
          reviewId: 'review-2',
          listing: uploaded,
          review: { status: 'reviewed', findings: [], files: 3, read: 2, partial: false },
        })),
        marketplaceDetail: vi.fn(async () => ({
          bot: uploaded,
          readme: null,
          readmeLanguage: null,
          commitSha: null,
          files: [
            { path: 'SOUL.md', size: 20, kind: 'text' },
            { path: 'tools/run.sh', size: 8, kind: 'script' },
            { path: '.botharness/avatar.png', size: 2048, kind: 'image' },
          ],
        })),
      },
    );
  });

  it('shows the file breakdown and reads text files, scripts never as Markdown', async () => {
    const file = vi.fn(async (_id: string, path: string) =>
      path === 'SOUL.md'
        ? { path, size: 20, type: 'markdown', text: '# Soul\n\nI help.' }
        : { path, size: 8, type: 'script', text: '# echo\n**not bold**' },
    );
    await withPanel(
      async () => ({ bots: [uploaded] }),
      async ({ host }) => {
        await click(host, '查看 Alice/Helper 详情');
        const breakdown = host.querySelector('[data-market-breakdown]')!;
        expect(
          [...breakdown.querySelectorAll('[data-market-type]')].map((item) => item.textContent),
        ).toEqual(['图片12.0 KB', 'Markdown120 B', '脚本18 B']);
        expect(
          host.querySelector('[data-market-scripts]')?.getAttribute('data-market-scripts'),
        ).toBe('1');
        expect(host.querySelector('[aria-label="查看 .botharness/avatar.png"]')).toBeNull();

        await click(host, '查看 tools/run.sh');
        await act(async () => {});
        expect(file).toHaveBeenCalledWith('U_helper', 'tools/run.sh');
        const script = host.querySelector('[data-market-reader-body="script"]')!;
        expect(script.tagName).toBe('PRE');
        expect(script.textContent).toBe('# echo\n**not bold**');
        expect(host.querySelector('[data-market-files]')).toBeNull();

        await click(host, '返回文件列表');
        await click(host, '查看 SOUL.md');
        await act(async () => {});
        const markdown = host.querySelector('[data-market-reader-body="markdown"]')!;
        expect(markdown.tagName).toBe('DIV');
        expect(markdown.textContent).toBe('# Soul\n\nI help.');
      },
      {
        marketplaceFile: file,
        marketplaceDetail: vi.fn(async () => ({
          bot: uploaded,
          readme: null,
          readmeLanguage: null,
          commitSha: null,
          files: [
            { path: 'SOUL.md', size: 20, kind: 'text' },
            { path: 'tools/run.sh', size: 8, kind: 'script' },
            { path: '.botharness/avatar.png', size: 2048, kind: 'image' },
          ],
          fileSummary: {
            count: 3,
            size: 2076,
            types: [
              { type: 'image', count: 1, size: 2048 },
              { type: 'markdown', count: 1, size: 20 },
              { type: 'script', count: 1, size: 8 },
            ],
          },
        })),
      },
    );
  });
});
