// @vitest-environment jsdom
import { button, click, entry, withPanel } from './market-panel-fixtures.js';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ILLUSTRATED_RECIPE } from '../../core/src/bots/avatar-appearance.js';
import type { MarketplaceEntry } from '../../core/src/marketplace/client.js';
import type { BridgeActions } from '../src/client/actions.js';
import type { DockPanelRegistry } from '../src/client/dock-panels.js';
import { zhTranslate } from '../src/client/locale.js';
import { createMarketPanel, MARKET_PANEL } from '../src/client/market-panel.js';

describe('Market panel', () => {
  it.each(['owner', 'member'] as const)(
    'routes the header actions for an Avatar %s',
    async (kind) => {
      const t = zhTranslate;
      const marketplaceAccount = vi.fn(async () => ({ signedIn: false, author: null }));
      await withPanel(
        async () => ({ bots: [] }),
        async ({ host }) => {
          const tabs = host.querySelector('[role="tablist"][aria-label="市场"]');
          expect(tabs?.closest('[data-market-panel]')).not.toBeNull();
          expect(tabs?.closest('header')).toBeNull();
          expect(button(host, t('market.panel.upload')).closest('header')).not.toBeNull();
          expect(button(host, t('market.mine.open'))).toBeTruthy();
          await click(host, t('market.avatar.title'));
          expect(
            host.querySelector('#bh-market-section-avatars')?.getAttribute('aria-selected'),
          ).toBe('true');
          expect(host.querySelector(`button[aria-label="${t('market.mine.open')}"]`)).toBeNull();
          expect(host.querySelector(`button[aria-label="${t('market.panel.upload')}"]`)).toBeNull();
          expect(host.querySelector('#bh-market-section-avatars-panel')?.textContent).not.toContain(
            t('market.avatar.publish'),
          );
          if (kind === 'owner') {
            expect(button(host, t('market.avatar.publish')).closest('header')).not.toBeNull();
            await click(host, t('market.avatar.publish'));
            expect(document.querySelector('[data-market-avatar-publish="account"]')).not.toBeNull();
            expect(
              host.querySelector('#bh-market-section-avatars')?.getAttribute('aria-selected'),
            ).toBe('true');
            expect(marketplaceAccount).toHaveBeenCalledTimes(1);
          } else {
            expect(
              host.querySelector(`button[aria-label="${t('market.avatar.publish')}"]`),
            ).toBeNull();
            expect(marketplaceAccount).not.toHaveBeenCalled();
          }
        },
        {
          marketplaceAccount,
          marketplaceAvatarList: vi.fn(async () => ({ avatars: [], nextCursor: null })),
          teamCall: vi.fn(async () => ({
            ok: true,
            value: {
              enabled: true,
              activeMembers: 2,
              ownerPasswordSet: true,
              insecureHttpAllowed: false,
              memberUrls: [],
              isolation: 'trial',
              viewer: {
                humanId: 'market-test-human',
                kind,
                displayName: 'Market test Human',
                mustChangePassword: false,
                models: { all: true },
                owner: kind === 'owner',
                permissions: [],
                roleIds: [],
              },
            },
          })),
        },
      );
    },
  );

  it('fetches Avatars only when opened and keeps the Bots results mounted', async () => {
    const avatars = vi.fn(async () => ({ avatars: [], nextCursor: null }));
    await withPanel(
      async () => ({ bots: [entry('writer')] }),
      async ({ host, list }) => {
        expect(list).toHaveBeenCalledTimes(1);
        expect(avatars).not.toHaveBeenCalled();
        await click(host, zhTranslate('market.avatar.title'));
        expect(avatars).toHaveBeenCalledTimes(1);
        expect(host.textContent).toContain(zhTranslate('market.avatar.empty'));
        await click(host, zhTranslate('market.avatar.bots'));
        expect(list).toHaveBeenCalledTimes(1);
        expect(host.textContent).toContain('writer');
      },
      { marketplaceAvatarList: avatars },
    );
  });

  it('shows the Daily Picks row with a cover per pick count and at most seven days', async () => {
    const pick = (name: string) => ({
      id: `R_${name}`,
      displayName: name,
      banner: null,
      avatar: null,
    });
    const picks = (count: number) =>
      Array.from({ length: count }, (_, index) => pick(`bot${index}`));
    const counts = [1, 2, 3, 4, 5, 0, 1, 2];
    const digests = vi.fn(async () =>
      counts.map((count, index) => ({
        day: `2026-10-${String(28 - index).padStart(2, '0')}`,
        lang: 'zh',
        title: `第 ${index} 天`,
        lede: '',
        picks: picks(Math.min(count, 4)),
      })),
    );
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host, actions }) => {
        expect(digests).toHaveBeenCalledWith('zh');
        const row = document.body.querySelector<HTMLElement>('[data-market-daily-picks]')!;
        expect(row.hidden).toBe(false);
        const cards = [...row.querySelectorAll('[data-market-digest-day]')];
        expect(cards).toHaveLength(7);
        expect(
          cards.map((card) =>
            card.querySelector('[data-digest-cover]')!.getAttribute('data-digest-cover'),
          ),
        ).toEqual(['one', 'two', 'three', 'four', 'four', 'date', 'one']);
        expect(
          cards.map((card) => card.querySelectorAll('[data-digest-cover-pick]').length),
        ).toEqual([1, 2, 3, 4, 4, 0, 1]);
        expect(
          row.lastElementChild!.lastElementChild!.querySelector('[data-market-past-picks]'),
        ).not.toBeNull();
        const order = [
          ...document.body.querySelectorAll('[data-market-daily-picks], .bh-market-sections'),
        ];
        expect(order[0]).toBe(row);
        expect(actions['telemetryEvent']).toHaveBeenCalledWith('marketplace:digest_view');
      },
      { marketplaceDigests: digests },
    );
  });

  it('opens a digest and past picks as panel pages and walks back one page at a time', async () => {
    const today = {
      day: '2026-10-28',
      lang: 'zh',
      title: '今天值得一试的 Bot',
      lede: '一位写作伙伴。',
      picks: [],
      sections: [
        { heading: '写作伙伴', body: '它帮你整理想法。', bot: entry('writer') },
        { heading: '已下架', body: '这位已经不在市场里。', bot: null },
      ],
    };
    const yesterday = { ...today, day: '2026-10-27', title: '昨天的精选', sections: [] };
    const digest = vi.fn(async (day?: string) => (day === '2026-10-27' ? yesterday : today));
    const digests = vi.fn(async () => [
      { day: today.day, lang: 'zh', title: today.title, lede: today.lede, picks: [] },
      { day: yesterday.day, lang: 'zh', title: yesterday.title, lede: yesterday.lede, picks: [] },
    ]);
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host, actions }) => {
        const home = document.body.querySelector<HTMLElement>('.bh-market-page')!;
        await click(host, '阅读每日精选：今天值得一试的 Bot');
        expect(digest).toHaveBeenCalledWith('2026-10-28', 'zh');
        expect(home.hidden).toBe(true);
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
        const article = document.body.querySelector('[data-market-digest="2026-10-28"]')!;
        expect(article.textContent).toContain('它帮你整理想法。');
        expect(
          article.querySelector('[data-digest-cover]')!.getAttribute('data-digest-cover'),
        ).toBe('one');
        expect(article.querySelectorAll('[data-market-bot]')).toHaveLength(1);
        expect([...article.querySelectorAll('h3')].map((node) => node.textContent)).toEqual([
          '写作伙伴',
          '已下架',
        ]);

        await act(async () =>
          article.querySelector<HTMLButtonElement>('[data-market-past-picks]')!.click(),
        );
        const archive = document.body.querySelector('[data-market-digest="archive"]')!;
        const days = [...archive.querySelectorAll<HTMLButtonElement>('[data-market-digest-day]')];
        expect(days.map((node) => node.getAttribute('data-market-digest-day'))).toEqual([
          '2026-10-28',
          '2026-10-27',
        ]);
        await act(async () => days[1]!.click());
        expect(digest).toHaveBeenLastCalledWith('2026-10-27', 'zh');
        const visible = () =>
          [...document.body.querySelectorAll<HTMLElement>('[data-market-page]')]
            .filter((page) => !page.hasAttribute('aria-hidden'))
            .map((page) => page.getAttribute('data-market-page'));
        expect(visible()).toEqual(['digest:2026-10-27']);

        await click(host, '返回');
        expect(visible()).toEqual(['past-picks']);
        await click(host, '返回');
        expect(visible()).toEqual(['digest:2026-10-28']);
        await act(async () =>
          article.querySelector<HTMLButtonElement>('.bh-market-tile-open')!.click(),
        );
        expect(visible()).toEqual(['bot']);
        await click(host, '返回');
        expect(visible()).toEqual(['digest:2026-10-28']);
        await click(host, '返回');
        expect(visible()).toEqual([]);
        expect(home.hidden).toBe(false);
        expect(actions['telemetryEvent']!.mock.calls).toEqual([
          ['marketplace:digest_view'],
          ['marketplace:digest_open', { entry: 'hero' }],
          ['marketplace:digest_archive_open'],
          ['marketplace:digest_open', { entry: 'archive' }],
          ['marketplace:bot_open', { entry: 'digest', step: 'detail' }],
        ]);
      },
      {
        marketplaceDigest: digest,
        marketplaceDigests: digests,
        marketplaceDetail: vi.fn(async () => ({
          bot: entry('writer'),
          readme: null,
          readmeLanguage: null,
          commitSha: null,
          files: [],
        })),
      },
    );
  });

  it('hides the Daily Picks row while searching', async () => {
    const digests = vi.fn(async () => [
      { day: '2026-10-28', lang: 'zh', title: '今天', lede: '', picks: [] },
    ]);
    await withPanel(
      async () => ({ bots: [entry('translator')] }),
      async ({ host }) => {
        expect(document.body.querySelector('[data-market-daily-picks]')).not.toBeNull();
        const search = document.body.querySelector<HTMLInputElement>('input[type="search"]')!;
        await act(async () => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
            search,
            'translator',
          );
          search.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => {
          search.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
          );
        });
        expect(document.body.querySelector('[data-market-daily-picks]')).toBeNull();
      },
      { marketplaceDigests: digests },
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
      async ({ host, actions }) => {
        expect(sections).toHaveBeenCalledWith('zh');
        const rows = [...document.body.querySelectorAll('[data-market-section]')];
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
        expect(
          [...rows[0]!.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].at(-1)
            ?.textContent,
        ).toBe('导入');
        expect(actions['telemetryEvent']!.mock.calls).toEqual([['marketplace:section_view']]);
      },
      { marketplaceSections: sections },
    );
  });

  it('shows Hot as banner posters and New and Rising as compact cards', async () => {
    const author = { name: 'Alice', id: 'k3x9q2', avatar: null };
    const sections = vi.fn(async () => [
      {
        section: 'hot',
        day: '2026-10-28',
        entries: [
          {
            bot: entry('popular', {
              installs: 1200,
              banner: { recipe: { scene: 'sea', seed: 1 } },
            } as Partial<MarketplaceEntry>),
            score: 4,
          },
          { bot: entry('plain'), score: 2 },
        ],
      },
      {
        section: 'new',
        day: '2026-10-28',
        entries: [
          {
            bot: entry('fresh', {
              id: 'U_fresh',
              displayName: 'Fresh',
              fullName: 'Alice/Fresh',
              source: 'upload',
              author,
              installs: 3,
            }),
            score: 1,
          },
        ],
      },
      { section: 'rising', day: '2026-10-28', entries: [{ bot: entry('climber'), score: 3 }] },
    ]);
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host }) => {
        const row = (name: string) =>
          document.body.querySelector(`[data-market-section="${name}"]`)!;
        const cards = (name: string) =>
          [...row(name).querySelectorAll('[data-market-card]')].map((card) =>
            card.getAttribute('data-market-card'),
          );
        expect(cards('hot')).toEqual(['poster', 'poster']);
        expect(cards('new')).toEqual(['compact']);
        expect(cards('rising')).toEqual(['compact']);

        const poster = row('hot').querySelector('[data-market-bot="alice/popular"]')!;
        expect(
          poster.querySelector('[data-market-banner]')?.getAttribute('data-market-banner'),
        ).toBe('shown');
        expect(poster.querySelector('[data-market-avatar]')).not.toBeNull();
        expect(
          poster.querySelector('[data-market-installs]')?.getAttribute('data-market-installs'),
        ).toBe('1200');
        expect(poster.textContent).not.toContain('popular description');
        expect(
          row('hot')
            .querySelector('[data-market-bot="alice/plain"] [data-market-banner]')
            ?.getAttribute('data-market-banner'),
        ).toBe('none');

        const compact = row('new').querySelector('[data-market-bot="Alice/Fresh"]')!;
        expect(compact.querySelector('[data-market-author]')?.textContent).toBe('Alice #k3x9q2');
        expect(compact.textContent).toContain('fresh description');
        expect(
          compact.querySelector('[data-market-installs]')?.getAttribute('data-market-installs'),
        ).toBe('3');
        expect(compact.querySelector('[data-market-banner]')).toBeNull();
        expect(row('rising').querySelector('[data-market-author]')?.textContent).toBe(
          'alice/climber',
        );
        expect(
          [...document.body.querySelectorAll('[data-market-see-all]')].map(
            (link) => link.textContent,
          ),
        ).toEqual(['查看全部', '查看全部', '查看全部']);
      },
      { marketplaceSections: sections },
    );
  });

  it('opens every entry of a ranking from See all and goes back to the home', async () => {
    const climbers = ['climber', 'sprinter', 'jumper'].map((name, index) => ({
      bot: entry(name),
      score: 3 - index,
    }));
    const sections = vi.fn(async () => [
      { section: 'hot', day: '2026-10-28', entries: [] },
      { section: 'new', day: '2026-10-28', entries: [{ bot: entry('fresh'), score: 1 }] },
      { section: 'rising', day: '2026-10-28', entries: climbers },
    ]);
    await withPanel(
      async () => ({ bots: [entry('helper')] }),
      async ({ host, actions }) => {
        expect(document.body.querySelector('[data-market-section="hot"]')).toBeNull();
        const home = document.body.querySelector<HTMLElement>('.bh-market-page')!;
        const rising = document.body.querySelector('[data-market-section="rising"]')!;
        await act(async () =>
          rising.querySelector<HTMLButtonElement>('[data-market-see-all="rising"]')!.click(),
        );
        const page = document.body.querySelector<HTMLElement>('[data-market-page="ranking"]')!;
        expect(page.getAttribute('aria-label')).toBe('上升最快');
        expect(home.hidden).toBe(true);
        const grid = page.querySelector('.bh-market-grid[data-market-ranking="rising"]')!;
        expect(
          [...grid.querySelectorAll('[data-market-bot]')].map((tile) =>
            tile.getAttribute('data-market-bot'),
          ),
        ).toEqual(['alice/climber', 'alice/sprinter', 'alice/jumper']);

        await act(async () => button(page, '查看 alice/sprinter 详情').click());
        expect(actions['telemetryEvent']).toHaveBeenLastCalledWith('marketplace:bot_open', {
          entry: 'rising',
          step: 'detail',
        });
        const botPage = document.body.querySelector<HTMLElement>('[data-market-page="bot"]')!;
        const github = botPage.querySelector<HTMLAnchorElement>('a[aria-label="在 GitHub 查看"]')!;
        expect(github.getAttribute('href')).toBe('https://github.com/alice/sprinter');
        expect(github.textContent).toBe('');
        expect(botPage.querySelector('.bh-market-row-head .bh-market-name')).toBeNull();
        expect(botPage.querySelector('.bh-market-hero-name')?.textContent).toContain('sprinter');
        expect(page.getAttribute('aria-hidden')).toBe('true');
        await act(async () =>
          button(
            document.body.querySelector<HTMLElement>('[data-market-page="bot"]')!,
            '返回',
          ).click(),
        );
        expect(document.body.querySelector('[data-market-page="bot"]')).toBeNull();
        expect(document.body.querySelector('[data-market-page="ranking"]')).toBe(page);

        const imports = [...grid.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].filter(
          (item) => item.textContent === '导入',
        );
        await act(async () => imports[2]!.click());
        expect(actions['telemetryEvent']).toHaveBeenLastCalledWith('marketplace:bot_open', {
          entry: 'rising',
          step: 'install',
        });
        expect(document.body.querySelector('[role="dialog"] h2')?.textContent).toBe('安装 jumper');
        await act(async () =>
          button(document.body.querySelector('[data-dialog]')!, '返回').click(),
        );

        await act(async () => button(page, '返回').click());
        expect(document.body.querySelector('[data-market-page="ranking"]')).toBeNull();
        expect(home.hidden).toBe(false);
        expect(document.body.querySelector('.bh-market-page')).toBe(home);
        expect(home.querySelector('[data-market-section="rising"]')).toBe(rising);
      },
      {
        marketplaceSections: sections,
        marketplaceInstallReview: vi.fn(() => new Promise(() => undefined)),
        marketplaceDetail: vi.fn(async () => ({
          bot: climbers[1]!.bot,
          readme: null,
          readmeLanguage: null,
          commitSha: null,
          files: [],
        })),
      },
    );
  });

  it('sends the ranking name when a Bot is opened or imported from a home row', async () => {
    const sections = vi.fn(async () => [
      { section: 'hot', day: '2026-10-28', entries: [{ bot: entry('popular'), score: 4 }] },
      { section: 'new', day: '2026-10-28', entries: [{ bot: entry('fresh'), score: 1 }] },
    ]);
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host, actions }) => {
        const hot = document.body.querySelector<HTMLElement>('[data-market-section="hot"]')!;
        await act(async () => button(hot, '导入').click());
        expect(actions['telemetryEvent']).toHaveBeenLastCalledWith('marketplace:bot_open', {
          entry: 'hot',
          step: 'install',
        });
        await act(async () =>
          button(document.body.querySelector('[data-dialog]')!, '返回').click(),
        );
        const fresh = document.body.querySelector<HTMLElement>('[data-market-section="new"]')!;
        await act(async () => button(fresh, '查看 alice/fresh 详情').click());
        expect(actions['telemetryEvent']).toHaveBeenLastCalledWith('marketplace:bot_open', {
          entry: 'new',
          step: 'detail',
        });
        expect(document.body.querySelector('[data-market-page="bot"]')).not.toBeNull();
      },
      {
        marketplaceSections: sections,
        marketplaceInstallReview: vi.fn(() => new Promise(() => undefined)),
        marketplaceDetail: vi.fn(() => new Promise(() => undefined)),
      },
    );
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
        const banners = document.body.querySelectorAll(
          '.bh-market-tile-open .bh-market-tile-banner',
        );
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
        const avatars = [...document.body.querySelectorAll('.bh-market-tile [data-market-avatar]')];
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
      title: '市场',
      icon: 'store',
      scope: 'global',
    });
    expect(panel.headerAction).toBeDefined();
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
        expect(document.body.querySelectorAll('.bh-market-grid [role="listitem"]')).toHaveLength(1);
        expect(document.body.textContent).toContain('更新于 3 天前');

        await click(host, '最新创建');

        expect(list).toHaveBeenLastCalledWith({
          sort: 'created',
          lang: 'zh',
          includeUploads: true,
        });
        expect(
          [...document.body.querySelectorAll('[data-market-bot]')].map((tile) =>
            tile.getAttribute('data-market-bot'),
          ),
        ).toEqual(['alice/newest', 'alice/older']);
        expect(document.body.textContent).toContain('创建于 213 天前');

        const search = document.body.querySelector<HTMLInputElement>('input[type="search"]')!;
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
        expect(document.body.textContent).toContain('translator description');
      },
    );
  });
});
