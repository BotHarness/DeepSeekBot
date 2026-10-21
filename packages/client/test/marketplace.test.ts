// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: { children?: ReactNode; disabled?: boolean; onClick?: () => void }) =>
    createElement('button', { disabled: props.disabled, onClick: props.onClick }, props.children),
  Input: (props: Record<string, unknown>) => createElement('input', props),
  Tag: (props: { children?: ReactNode }) => createElement('span', null, props.children),
  MarkdownText: (props: { text: string }) =>
    createElement('div', { 'data-markdown': '' }, props.text),
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
  Modal: (props: {
    title: string;
    description?: string;
    children?: ReactNode;
    footer?: ReactNode;
  }) =>
    createElement(
      'section',
      null,
      createElement('h1', null, props.title),
      createElement('p', null, props.description),
      props.children,
      props.footer,
    ),
}));

vi.mock('../src/client/avatar.js', () => ({
  PersonaBotAvatar: (props: { name: string }) =>
    createElement('span', { 'data-avatar': props.name }),
}));

import type {
  MarketplaceDetail,
  MarketplaceEntry,
  MarketplacePage,
  MarketplaceQuery,
  MarketplaceTopic,
} from '../../core/src/marketplace/client.js';
import { createChallenge } from '../../core/src/marketplace/altcha.js';
import type { BridgeActions } from '../src/client/actions.js';
import { BridgeCallError } from '../src/client/bridge.js';
import { en, zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';
import { MarketplaceModal } from '../src/client/marketplace.js';

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
    topics: ['writing'],
    stars: 7,
    pushedAt: '2026-10-01T08:00:00Z',
    htmlUrl: `https://github.com/alice/${name}`,
    cloneUrl: `https://github.com/alice/${name}.git`,
    defaultBranch: 'main',
    headCommit: {
      sha: '0123456789abcdef0123456789abcdef01234567',
      committedAt: '2026-09-30T12:00:00Z',
    },
    ...overrides,
  };
}

interface Harness {
  host: HTMLDivElement;
  list: ReturnType<typeof vi.fn<(query?: MarketplaceQuery) => Promise<MarketplacePage>>>;
  submit: ReturnType<typeof vi.fn<(url: string, altcha: string) => Promise<MarketplaceEntry>>>;
  challenge: ReturnType<typeof vi.fn<() => ReturnType<typeof createChallenge>>>;
  report: ReturnType<typeof vi.fn<(id: string, altcha: string, reason?: string) => Promise<void>>>;
  createBot: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
  onInstalled: ReturnType<typeof vi.fn<() => void>>;
  translate: (t: BotHarnessTranslate) => Promise<void>;
}

function enTranslate(key: string): string {
  return (en as Record<string, string>)[key] ?? key;
}

async function withMarketplace(
  pages: (query?: MarketplaceQuery) => Promise<MarketplacePage>,
  test: (harness: Harness) => Promise<void>,
  submit: (url: string) => Promise<MarketplaceEntry> = async () => entry('pasted'),
  createBot: () => Promise<unknown> = async () => undefined,
  topics: () => Promise<MarketplaceTopic[]> = async () => [],
  detail: (id: string) => Promise<MarketplaceDetail> = async () => {
    throw new Error('unused');
  },
  report: (id: string, altcha: string, reason?: string) => Promise<void> = async () => undefined,
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const harness: Harness = {
    host,
    list: vi.fn(pages),
    submit: vi.fn(submit),
    challenge: vi.fn(() =>
      createChallenge({ key: 'client-test', tier: 'default', now: new Date(), number: 3 }),
    ),
    report: vi.fn(report),
    createBot: vi.fn(createBot),
    onInstalled: vi.fn(),
    translate: async (t) => {
      await act(async () => render(t));
    },
  };
  const render = (t: BotHarnessTranslate) =>
    root.render(
      createElement(MarketplaceModal, {
        actions: {
          marketplaceList: harness.list,
          marketplaceSubmit: harness.submit,
          marketplaceChallenge: harness.challenge,
          marketplaceReport: harness.report,
          marketplaceTopics: topics,
          marketplaceDetail: detail,
          createBot: harness.createBot,
        } as unknown as BridgeActions,
        t,
        onClose: vi.fn(),
        onInstalled: harness.onInstalled,
      }),
    );
  try {
    await harness.translate(zhTranslate);
    await test(harness);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((item) => item.textContent === label);
  if (found === undefined) throw new Error(`missing button ${label}`);
  return found;
}

async function click(host: HTMLElement, label: string, index = 0) {
  const matches = [...host.querySelectorAll('button')].filter((item) => item.textContent === label);
  await act(async () => matches[index]?.click());
}

async function until(check: () => boolean) {
  for (let attempt = 0; attempt < 100 && !check(); attempt += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  expect(check()).toBe(true);
}

async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function pressEnter(input: HTMLInputElement, options: { composing?: boolean } = {}) {
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
        isComposing: options.composing === true,
      }),
    );
  });
}

async function typeReason(host: HTMLElement, value: string) {
  const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      textarea,
      value,
    );
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function typeUrl(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('Bot Marketplace modal', () => {
  it('lists indexed repositories and loads the next page with the cursor', async () => {
    await withMarketplace(
      async (query) =>
        query?.cursor === undefined
          ? { bots: [entry('first')], nextCursor: 'page-2' }
          : { bots: [entry('second', { descriptionGenerated: true })] },
      async ({ host, list }) => {
        expect(host.textContent).toContain('Bot 市场');
        expect(host.textContent).toContain('first description');
        expect(host.querySelector('.bh-market-generated')).toBeNull();
        expect(host.textContent).toContain('★ 7');
        expect(host.textContent).toContain('更新于 2026-10-01');
        expect(host.textContent).not.toContain('writing');
        expect(host.querySelector('.bh-market-row .bh-market-avatar [data-avatar]')).not.toBeNull();

        await click(host, '加载更多');

        expect(list).toHaveBeenLastCalledWith({ sort: 'updated', lang: 'zh', cursor: 'page-2' });
        expect(
          [...host.querySelectorAll('[data-market-bot]')].map((row) =>
            row.getAttribute('data-market-bot'),
          ),
        ).toEqual(['alice/first', 'alice/second']);
        expect(
          [...host.querySelectorAll('.bh-market-description')].map((node) => node.textContent),
        ).toEqual(['first description', 'second descriptionAI 摘要']);
        expect(host.querySelector('.bh-market-generated')?.getAttribute('title')).toBe(
          '作者没写中文简介，这句由 AI 根据 README 生成',
        );
        expect(host.textContent).not.toContain('加载更多');
      },
    );
  });

  it('shows each banner beside its row and a neutral header without one', async () => {
    await withMarketplace(
      async () => ({
        bots: [
          entry('photo', {
            banner: {
              image: 'https://raw.githubusercontent.com/alice/photo/abc/.botharness/banner.png',
            },
          }),
          entry('plain'),
        ],
      }),
      async ({ host }) => {
        const banners = [...host.querySelectorAll('.bh-market-banner-thumb')];
        expect(banners.map((banner) => banner.getAttribute('data-market-banner'))).toEqual([
          'shown',
          'none',
        ]);
        expect(banners[0]?.querySelector('img')?.getAttribute('src')).toBe(
          'https://raw.githubusercontent.com/alice/photo/abc/.botharness/banner.png',
        );
        await act(async () => banners[0]?.querySelector('img')?.dispatchEvent(new Event('error')));
        expect(banners[0]?.querySelector('img')).toBeNull();
        expect(banners[0]?.querySelector('[data-banner-failed]')).not.toBeNull();
      },
    );
  });

  it('shows an empty state and lists a pasted repository at the top', async () => {
    await withMarketplace(
      async () => ({ bots: [] }),
      async ({ host, submit }) => {
        expect(host.textContent).toContain('还没有收录的 Bot');

        await typeUrl(host, ' https://github.com/alice/pasted ');
        await click(host, '收录');
        expect(button(host, '正在验证…').disabled).toBe(true);
        await until(() => submit.mock.calls.length > 0);

        expect(submit).toHaveBeenCalledWith('https://github.com/alice/pasted', expect.any(String));
        expect(JSON.parse(atob(submit.mock.calls[0]![1]))).toMatchObject({ number: 3 });
        await until(() => host.textContent?.includes('已收录 alice/pasted') === true);
        expect(host.textContent).toContain('已收录 alice/pasted');
        expect(host.querySelector('[data-market-bot]')?.getAttribute('data-market-bot')).toBe(
          'alice/pasted',
        );
      },
    );
  });

  it('explains why a pasted repository was refused', async () => {
    await withMarketplace(
      async () => ({ bots: [] }),
      async ({ host }) => {
        await typeUrl(host, 'https://github.com/alice/plain');
        await click(host, '收录');
        await until(() => host.querySelector('[role="alert"]') !== null);

        expect(host.querySelector('[role="alert"]')?.textContent).toContain('botharness-bot 话题');
      },
      async () => {
        throw new BridgeCallError('repository-missing-topic', 'repository-missing-topic');
      },
    );
  });

  it('explains a rate limit on paste', async () => {
    await withMarketplace(
      async () => ({ bots: [] }),
      async ({ host }) => {
        await typeUrl(host, 'https://github.com/alice/plain');
        await click(host, '收录');
        await until(() => host.querySelector('[role="alert"]') !== null);

        expect(host.querySelector('[role="alert"]')?.textContent).toBe(
          '这个仓库刚刚收录过，5 分钟后才能再次收录。',
        );
        expect(button(host, '收录').disabled).toBe(false);
      },
      async () => {
        throw new BridgeCallError('repository-rate-limited', 'repository-rate-limited');
      },
    );
  });

  it('reports a Bot from its detail view with an optional reason', async () => {
    const detail = async () => ({
      bot: entry('spammy'),
      readme: null,
      readmeLanguage: null,
      commitSha: null,
    });
    let fail = true;
    await withMarketplace(
      async () => ({ bots: [entry('spammy')] }),
      async ({ host, report }) => {
        await act(async () =>
          host.querySelector<HTMLButtonElement>('[aria-label="查看 alice/spammy 详情"]')!.click(),
        );
        await click(host, '举报');
        expect(host.querySelector('[data-market-report="open"]')?.textContent).toContain(
          '不需要账号',
        );

        await typeReason(host, '  垃圾内容  ');
        await click(host, '提交举报');
        await until(() => host.querySelector('[role="alert"]') !== null);
        expect(host.querySelector('[role="alert"]')?.textContent).toBe(
          '人机验证没有通过或已过期，请重试。',
        );
        expect(host.querySelector('textarea')?.value).toBe('  垃圾内容  ');

        await click(host, '提交举报');
        await until(() => host.querySelector('[data-market-report="done"]') !== null);

        expect(report).toHaveBeenLastCalledWith('R_spammy', expect.any(String), '垃圾内容');
        expect(host.textContent).toContain('已收到举报');
        expect([...host.querySelectorAll('button')].map((item) => item.textContent)).not.toContain(
          '举报',
        );
        await click(host, '返回');
        await act(async () =>
          host.querySelector<HTMLButtonElement>('[aria-label="查看 alice/spammy 详情"]')!.click(),
        );
        await click(host, '举报');
        await click(host, '取消');
        expect(host.querySelector('[data-market-report]')).toBeNull();
      },
      undefined,
      undefined,
      undefined,
      detail,
      async () => {
        if (fail) {
          fail = false;
          throw new BridgeCallError('challenge-replayed', 'challenge-replayed');
        }
      },
    );
  });

  it('offers retry when the Marketplace is unreachable', async () => {
    let calls = 0;
    await withMarketplace(
      async () => {
        calls += 1;
        if (calls === 1) throw new BridgeCallError('marketplace-unavailable', 'offline');
        return { bots: [entry('back')] };
      },
      async ({ host }) => {
        expect(host.textContent).toContain('Bot 市场暂时无法访问');

        await click(host, '重试');

        expect(host.textContent).toContain('back description');
      },
    );
  });

  it('confirms with commit time, short SHA and the risk notice before installing through Git', async () => {
    await withMarketplace(
      async () => ({ bots: [entry('helper')] }),
      async ({ host, createBot, onInstalled }) => {
        await click(host, '安装');

        expect(host.querySelector('h1')?.textContent).toBe('安装 helper');
        expect(host.querySelector('[data-market-commit]')?.textContent).toBe(
          '0123456 · 2026-09-30',
        );
        expect(host.textContent).toContain('这是第三方仓库');
        expect(host.textContent).toContain('只安装你信任的仓库');
        expect(createBot).not.toHaveBeenCalled();

        await click(host, '确认安装');

        expect(createBot).toHaveBeenCalledWith({
          displayName: 'helper',
          gitUrl: 'https://github.com/alice/helper.git',
          roles: [],
          origin: 'marketplace',
          description: 'helper description',
        });
        expect(onInstalled).toHaveBeenCalledOnce();
      },
    );
  });

  it('keeps the confirmation open with the clone error when install fails', async () => {
    await withMarketplace(
      async () => ({ bots: [entry('helper', { description: null, headCommit: null })] }),
      async ({ host, createBot, onInstalled }) => {
        await click(host, '安装');
        expect(host.querySelector('[data-market-commit]')?.textContent).toBe('未知');

        await click(host, '确认安装');

        expect(createBot).toHaveBeenCalledWith({
          displayName: 'helper',
          gitUrl: 'https://github.com/alice/helper.git',
          roles: [],
          origin: 'marketplace',
        });
        expect(onInstalled).not.toHaveBeenCalled();
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('克隆失败');

        await click(host, '返回');
        expect(button(host, '安装')).toBeDefined();
      },
      undefined,
      async () => {
        throw new BridgeCallError('git-clone-failed', 'secret detail');
      },
    );
  });

  it('switches sort and restarts from the first page', async () => {
    await withMarketplace(
      async (query) =>
        query?.sort === 'stars' ? { bots: [entry('popular')] } : { bots: [entry('fresh')] },
      async ({ host, list }) => {
        expect(host.textContent).toContain('fresh description');

        await click(host, '最多 Star');

        expect(list).toHaveBeenLastCalledWith({ sort: 'stars', lang: 'zh' });
        expect(host.textContent).toContain('popular description');
        expect(host.textContent).not.toContain('fresh description');

        await click(host, '最新创建');

        expect(list).toHaveBeenLastCalledWith({ sort: 'created', lang: 'zh' });
      },
    );
  });

  it('searches only on Enter, orders by relevance and pages with the search cursor', async () => {
    await withMarketplace(
      async (query) =>
        query?.q === undefined
          ? { bots: [entry('fresh')] }
          : query.cursor === undefined
            ? { bots: [entry('translator')], nextCursor: 'search-2' }
            : { bots: [entry('notes')] },
      async ({ host, list }) => {
        const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
        await typeInto(search, ' transl');
        await typeInto(search, ' translator ');
        await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
        expect(list).toHaveBeenCalledTimes(1);

        await pressEnter(search, { composing: true });
        expect(list).toHaveBeenCalledTimes(1);

        await pressEnter(search);

        expect(list).toHaveBeenCalledTimes(2);
        expect(list).toHaveBeenLastCalledWith({ sort: 'updated', lang: 'zh', q: 'translator' });
        expect(host.textContent).toContain('搜索结果按相关度排序');
        expect(button(host, '最近更新').disabled).toBe(true);

        await click(host, '加载更多');

        expect(list).toHaveBeenLastCalledWith({
          sort: 'updated',
          lang: 'zh',
          q: 'translator',
          cursor: 'search-2',
        });
        expect(host.textContent).toContain('translator description');
        expect(host.textContent).toContain('notes description');

        await typeInto(search, '');
        await pressEnter(search);
        expect(list).toHaveBeenLastCalledWith({ sort: 'updated', lang: 'zh' });
      },
    );
  });

  it('filters by a topic chip and clears it with 全部', async () => {
    await withMarketplace(
      async (query) => (query?.topic === 'research' ? { bots: [] } : { bots: [entry('fresh')] }),
      async ({ host, list }) => {
        const chip = host.querySelector<HTMLButtonElement>('[data-market-topic="research"]')!;
        expect(chip.textContent).toBe('research4');

        await act(async () => chip.click());

        expect(list).toHaveBeenLastCalledWith({ sort: 'updated', lang: 'zh', topic: 'research' });
        expect(chip.getAttribute('aria-pressed')).toBe('true');
        expect(host.textContent).toContain('没有符合条件的 Bot');

        await click(host, '全部');

        expect(list).toHaveBeenLastCalledWith({ sort: 'updated', lang: 'zh' });
        expect(host.textContent).toContain('fresh description');
      },
      undefined,
      undefined,
      async () => [
        { topic: 'research', count: 4 },
        { topic: 'writing', count: 2 },
      ],
    );
  });

  it('hides topic chips when topics fail to load', async () => {
    await withMarketplace(
      async () => ({ bots: [entry('fresh')] }),
      async ({ host }) => {
        expect(host.querySelector('[data-market-topic]')).toBeNull();
        expect(host.textContent).toContain('fresh description');
      },
      undefined,
      undefined,
      async () => {
        throw new BridgeCallError('marketplace-unavailable', 'down');
      },
    );
  });

  it('opens a detail view with the README and installs from it', async () => {
    const detail = vi.fn(async (id: string) => ({
      bot: entry('helper', { stars: 9 }),
      readme: '# Helper\n\nReads your notes.',
      readmeLanguage: null,
      commitSha: id === 'R_helper' ? '0123456789abcdef0123456789abcdef01234567' : null,
    }));
    await withMarketplace(
      async () => ({ bots: [entry('helper')] }),
      async ({ host, createBot }) => {
        await act(async () =>
          host.querySelector<HTMLButtonElement>('[aria-label="查看 alice/helper 详情"]')!.click(),
        );

        expect(detail).toHaveBeenCalledWith('R_helper', 'zh');
        expect(host.querySelector('h1')?.textContent).toBe('helper');
        expect(host.querySelector('[data-markdown]')?.textContent).toBe(
          '# Helper\n\nReads your notes.',
        );
        expect(host.textContent).toContain('★ 9');
        expect(
          [...host.querySelectorAll('a')].find((link) => link.textContent === '在 GitHub 查看')
            ?.href,
        ).toBe('https://github.com/alice/helper');

        await click(host, '安装');
        expect(host.querySelector('[data-market-commit]')?.textContent).toBe(
          '0123456 · 2026-09-30',
        );
        await click(host, '返回');
        expect(host.querySelector('[data-markdown]')).not.toBeNull();

        await click(host, '安装');
        await click(host, '确认安装');
        expect(createBot).toHaveBeenCalledWith(
          expect.objectContaining({ gitUrl: 'https://github.com/alice/helper.git' }),
        );
      },
      undefined,
      undefined,
      undefined,
      detail,
    );
  });

  it('reloads the list and an open detail in the new interface language', async () => {
    const detail = vi.fn(async () => ({
      bot: entry('helper'),
      readme: '# Helper',
      readmeLanguage: null,
      commitSha: null,
    }));
    await withMarketplace(
      async () => ({ bots: [entry('helper')] }),
      async ({ host, list, translate }) => {
        await act(async () =>
          host.querySelector<HTMLButtonElement>('[aria-label="查看 alice/helper 详情"]')!.click(),
        );
        expect(detail).toHaveBeenLastCalledWith('R_helper', 'zh');

        await translate(enTranslate as BotHarnessTranslate);
        expect(detail).toHaveBeenCalledTimes(2);
        expect(detail).toHaveBeenLastCalledWith('R_helper', 'en');

        await click(host, 'Back');
        expect(list).toHaveBeenLastCalledWith({ sort: 'updated', lang: 'en' });
        expect(detail).toHaveBeenCalledTimes(2);
      },
      undefined,
      undefined,
      undefined,
      detail,
    );
  });

  it('shows a missing README and retries a failed detail load', async () => {
    let attempts = 0;
    await withMarketplace(
      async () => ({ bots: [entry('helper')] }),
      async ({ host }) => {
        await act(async () =>
          host.querySelector<HTMLButtonElement>('[aria-label="查看 alice/helper 详情"]')!.click(),
        );
        expect(host.querySelector('[role="alert"]')?.textContent).toContain(
          'README 加载失败：Bot 市场暂时无法访问',
        );

        await click(host, '重试');

        expect(host.textContent).toContain('这个仓库没有 README。');
        await click(host, '返回');
        expect(host.querySelector('[data-market-bot="alice/helper"]')).not.toBeNull();
      },
      undefined,
      undefined,
      undefined,
      async () => {
        attempts += 1;
        if (attempts === 1) throw new BridgeCallError('marketplace-unavailable', 'down');
        return { bot: entry('helper'), readme: null, readmeLanguage: null, commitSha: null };
      },
    );
  });

  it('shows the shared name and role badges and installs with them', async () => {
    await withMarketplace(
      async () => ({
        bots: [entry('helper-bot', { displayName: 'Helper', roles: ['writer', 'editor'] })],
      }),
      async ({ host, createBot }) => {
        const row = host.querySelector('[data-market-bot="alice/helper-bot"]')!;
        expect(row.textContent).toContain('Helper');
        expect(row.textContent).toContain('alice/helper-bot');
        expect(row.textContent).toContain('writer');
        expect(row.textContent).toContain('editor');

        await click(host, '安装');
        expect(host.querySelector('h1')?.textContent).toBe('安装 Helper');
        await click(host, '确认安装');

        expect(createBot).toHaveBeenCalledWith({
          displayName: 'Helper',
          gitUrl: 'https://github.com/alice/helper-bot.git',
          roles: ['writer', 'editor'],
          origin: 'marketplace',
          description: 'helper-bot description',
        });
      },
    );
  });
});
