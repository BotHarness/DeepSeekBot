import { type MarketplacePage } from '../../core/src/marketplace/client.js';
import { type BotSummary } from '../src/client/store.js';
import { queryMenuItem } from './primitive-mocks.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, vi } from 'vitest';
import type { MarketplaceEntry } from '../../core/src/marketplace/client.js';
import type { BridgeActions } from '../src/client/actions.js';
import type { DockPanelRegistry } from '../src/client/dock-panels.js';
import { zhTranslate } from '../src/client/locale.js';
import { createMarketPanel } from '../src/client/market-panel.js';

beforeEach(() => localStorage.clear());

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  relativeTime: (at: number, now: number) => ({
    unit: 'days',
    n: Math.floor((now - at) / 86_400_000),
  }),

  MarkdownText: (props: { text: string }) => createElement('div', null, props.text),
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

export function entry(name: string, overrides: Partial<MarketplaceEntry> = {}): MarketplaceEntry {
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

export function draftView(state: 'reviewing' | 'ready') {
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

export function bot(slug: string, overrides: Partial<BotSummary> = {}): BotSummary {
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

export async function withPanel(
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
    marketplaceDigests: vi.fn(async () => []),
    marketplaceDetail: vi.fn(async () => {
      throw new Error('unused');
    }),
    createBot: vi.fn(async () => undefined),
    openBot: vi.fn(async () => undefined),
    marketplaceAccount: vi.fn(async () => ({ signedIn: false, author: null })),
    telemetryEvent: vi.fn(),
    ...extra,
  };
  const registry = { open: vi.fn() };
  const panel = createMarketPanel(
    actions as unknown as BridgeActions,
    registry as unknown as DockPanelRegistry,
    zhTranslate,
  );
  const Header = panel.headerAction;
  if (Header === undefined) throw new Error('Missing Marketplace header');
  try {
    await act(async () =>
      root.render(
        createElement(
          'div',
          null,
          createElement('header', null, createElement(Header, { channel: undefined })),
          createElement(panel.component, { channel: undefined }),
        ),
      ),
    );
    await test({ host, list, actions, registry });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
}

export function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent === label || item.getAttribute('aria-label') === label,
  );
  if (found === undefined) throw new Error(`missing button ${label}`);
  return found;
}

export async function click(host: HTMLElement, label: string) {
  await act(async () => (queryMenuItem(label) ?? button(host, label)).click());
}

afterEach(() => {
  vi.restoreAllMocks();
});
