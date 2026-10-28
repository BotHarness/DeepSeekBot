// @vitest-environment jsdom
import { act, createElement, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBotCreationController } from '../src/host/bot-creation';

const fixture = vi.hoisted(() => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal('fetch', fetch);
  return { fetch, params: {} as Record<string, string>, push: vi.fn() };
});
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    Dimensions: {
      get: () => shim.useWindowDimensions(),
      addEventListener: (_event: string, _changed: () => void) => ({ remove() {} }),
    },
  };
});
vi.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
}));
vi.mock('expo-image', () => ({
  Image: ({ testID, source }: { testID?: string; source: { uri: string } }) =>
    createElement('img', { 'data-testid': testID, src: source.uri, alt: '' }),
}));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34 }),
}));
vi.mock('react-native-svg', () => ({
  default: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
  Path: () => null,
  Circle: () => null,
}));
vi.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options: { title?: string } }) =>
      createElement('h1', { 'data-testid': 'screen-title' }, options.title),
  },
  router: { push: fixture.push, back: () => {} },
  useLocalSearchParams: () => fixture.params,
  useFocusEffect: (callback: () => () => void) => useLayoutEffect(callback, [callback]),
}));
let controller: ReturnType<typeof createBotCreationController>;
vi.mock('../src/host/native-bot-creation', () => ({
  get botCreation() {
    return controller;
  },
}));

import { digestCoverLayout } from '../src/marketplace/digest';
import { setFeatureSink } from '../src/telemetry/features';
import { DigestCover } from '../src/ui/shell/marketplace-cover';
import { MarketplaceDigestScreen } from '../src/ui/shell/marketplace-digest-screen';
import { MarketplacePastPicksScreen } from '../src/ui/shell/marketplace-past-picks-screen';
import { MarketplaceRankingScreen } from '../src/ui/shell/marketplace-ranking-screen';
import { MarketplaceScreen } from '../src/ui/shell/marketplace-screen';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const bot = (id: string) => ({
  id,
  owner: 'example',
  name: id,
  fullName: `example/${id}`,
  displayName: `Bot ${id}`,
  description: `${id} helps with writing`,
  topics: ['writing'],
  stars: 3,
  installs: 7,
  pushedAt: '2026-10-23',
  htmlUrl: `https://github.com/example/${id}`,
  cloneUrl: `https://github.com/example/${id}.git`,
  defaultBranch: 'main',
  headCommit: { sha: 'a'.repeat(40), committedAt: '2026-10-23' },
  roles: [],
});
const pick = (id: string) => ({ id, displayName: `Bot ${id}`, banner: null, avatar: null });
const ids = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
const today = {
  day: '2026-10-28',
  lang: 'en',
  title: 'Writers week',
  lede: 'Bots that help you write.',
  picks: ids('pick', 3).map(pick),
};
const yesterday = {
  day: '2026-10-27',
  lang: 'en',
  title: 'Quiet day',
  lede: 'Nothing new.',
  picks: [],
};
const article = {
  ...today,
  sections: [
    { heading: 'Draft faster', body: 'Start with an outline.', bot: bot('draft') },
    { heading: 'Edit calmly', body: 'Read it aloud.', bot: bot('edit') },
    { heading: 'Closing', body: 'See you tomorrow.', bot: null },
  ],
};

let root: Root;
let element: HTMLElement;
const features = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  fixture.params = { entry: 'all' };
  setFeatureSink(features);
  fixture.fetch.mockImplementation(async (url) => {
    const path = new URL(String(url)).pathname;
    const section = /^\/v1\/sections\/(hot|new|rising)$/u.exec(path)?.[1];
    if (section)
      return Response.json({
        section,
        day: '2026-10-28',
        entries: ids(section, 5).map((id, index) => ({ bot: bot(id), score: 10 - index })),
      });
    if (path === '/v1/topics') return Response.json({ topics: [{ topic: 'writing', count: 9 }] });
    if (path === '/v1/bots') return Response.json({ bots: [bot('listed')] });
    if (path === '/v1/digests') return Response.json({ digests: [today, yesterday] });
    if (path === '/v1/digests/2026-10-28') return Response.json({ digest: article });
    return Response.json({
      bot: bot(path.split('/').at(-1)!),
      readme: '# README',
      readmeLanguage: 'en',
      commitSha: 'a'.repeat(40),
    });
  });
  let disk: Parameters<Parameters<typeof createBotCreationController>[0]['storage']['write']>[0];
  controller = createBotCreationController({
    key: () => 'market-home-1',
    storage: {
      read: async () => disk,
      write: async (record) => {
        disk = record;
      },
    },
    port: {
      deviceId: () => undefined,
      lookup: async () => null,
      create: async () => {
        throw new Error('No Host is paired');
      },
    },
  });
  element = document.createElement('div');
  document.body.append(element);
  root = createRoot(element);
});
afterEach(() => {
  act(() => root.unmount());
  element.remove();
  setFeatureSink(undefined);
});
const byTestId = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const testIds = () =>
  [...element.querySelectorAll<HTMLElement>('[data-testid]')].map((node) => node.dataset.testid);
const button = (name: string) =>
  [...element.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === name || item.textContent === name,
  )!;

describe('Digest Cover', () => {
  it('chooses the layout by pick count', () => {
    expect([0, 1, 2, 3, 4, 5].map(digestCoverLayout)).toEqual([
      'date',
      'one',
      'two',
      'three',
      'four',
      'four',
    ]);
  });

  it.each([
    [0, 'date'],
    [1, 'one'],
    [2, 'two'],
    [3, 'three'],
    [4, 'four'],
    [5, 'four'],
  ])('draws %i picks as the %s cover', async (count, layout) => {
    await act(async () =>
      root.render(
        <DigestCover
          day="2026-10-08"
          title="Today"
          picks={ids('p', count).map(pick)}
          lang="en"
          art={{ height: 100 }}
        />,
      ),
    );
    expect(byTestId(`digest-cover-${layout}`)).not.toBeNull();
    expect(element.querySelectorAll('[data-testid^="digest-cover-pick-"]')).toHaveLength(
      Math.min(count, 4),
    );
    expect(element.querySelectorAll('[data-testid="marketplace-avatar"]')).toHaveLength(
      Math.min(count, 4),
    );
    if (count === 0) {
      expect(byTestId('digest-cover-banner')?.getAttribute('src')).toMatch(/^data:image\/svg/u);
      expect(byTestId('digest-cover-day')?.textContent).toBe('Oct8');
    } else expect(byTestId('digest-cover-day')).toBeNull();
    expect(element.textContent).toContain('Oct 8');
    expect(element.textContent).toContain('Today');
  });
});

describe('Marketplace home', () => {
  it('shows Daily picks, Hot, New and Rising above the list in that order', async () => {
    await act(async () => root.render(<MarketplaceScreen />));
    const order = testIds();
    const at = (id: string) => order.indexOf(id);
    expect(at('marketplace-daily-picks')).toBeGreaterThanOrEqual(0);
    expect(at('marketplace-daily-picks')).toBeLessThan(at('marketplace-section-hot'));
    expect(at('marketplace-section-hot')).toBeLessThan(at('marketplace-section-new'));
    expect(at('marketplace-section-new')).toBeLessThan(at('marketplace-section-rising'));
    expect(at('marketplace-section-rising')).toBeLessThan(at('marketplace-sort'));
    expect(at('marketplace-sort')).toBeLessThan(at('marketplace-bot-listed'));
    expect(element.querySelectorAll('[data-testid^="marketplace-digest-2026"]')).toHaveLength(1);
    expect(byTestId('digest-cover-three')).not.toBeNull();
    expect(element.querySelectorAll('[data-testid^="marketplace-poster-hot"]')).toHaveLength(5);
    expect(element.querySelectorAll('[data-testid^="marketplace-compact-new"]')).toHaveLength(3);
    expect(element.querySelectorAll('[data-testid^="marketplace-compact-rising"]')).toHaveLength(3);
    expect(byTestId('marketplace-compact-new1')?.textContent).toContain(t.marketplace.installs(7));
    expect(features).toHaveBeenCalledWith('marketplace:digest_view', {});
    expect(features).toHaveBeenCalledWith('marketplace:section_view', {});
  });

  it('shows only results for a topic', async () => {
    await act(async () => root.render(<MarketplaceScreen />));
    await act(async () => byTestId('marketplace-featured-writing')!.click());
    expect(byTestId('marketplace-home')).toBeNull();
    expect(byTestId('marketplace-bot-listed')).not.toBeNull();
  });

  it('pushes the article, past picks, rankings and Bot detail with their telemetry', async () => {
    fixture.params = { entry: 'host', hostId: 'A' };
    await act(async () => root.render(<MarketplaceScreen />));
    await act(async () => button(t.marketplace.readDigest('Writers week')).click());
    expect(fixture.push).toHaveBeenLastCalledWith({
      pathname: '/marketplace-digest',
      params: { day: '2026-10-28', entry: 'host', hostId: 'A' },
    });
    expect(features).toHaveBeenCalledWith('marketplace:digest_open', { entry: 'hero' });
    await act(async () => byTestId('marketplace-past-picks')!.click());
    expect(fixture.push).toHaveBeenLastCalledWith({
      pathname: '/marketplace-past-picks',
      params: { entry: 'host', hostId: 'A' },
    });
    expect(features).toHaveBeenCalledWith('marketplace:digest_archive_open', {});
    await act(async () => byTestId('marketplace-see-all-rising')!.click());
    expect(fixture.push).toHaveBeenLastCalledWith({
      pathname: '/marketplace-ranking',
      params: { section: 'rising', entry: 'host', hostId: 'A' },
    });
    await act(async () => byTestId('marketplace-compact-new2')!.click());
    expect(fixture.push).toHaveBeenLastCalledWith({
      pathname: '/marketplace-bot',
      params: { id: 'new2', entry: 'host', hostId: 'A' },
    });
    expect(features).toHaveBeenCalledWith('marketplace:bot_open', { entry: 'new', step: 'detail' });
    await act(async () => button('Bot listed, example/listed').click());
    expect(features).toHaveBeenLastCalledWith('marketplace:bot_open', {
      entry: 'list',
      step: 'detail',
    });
  });

  it('imports a Hot Bot straight into the creation flow', async () => {
    await act(async () => root.render(<MarketplaceScreen />));
    await act(async () => byTestId('marketplace-poster-import-hot2')!.click());
    expect(features).toHaveBeenCalledWith('marketplace:bot_open', {
      entry: 'hot',
      step: 'install',
    });
    expect(controller.getSnapshot().record).toMatchObject({
      kind: 'draft',
      draft: { source: { listingId: 'hot2', expectedCommit: 'a'.repeat(40) } },
    });
    expect(fixture.push).toHaveBeenLastCalledWith({
      pathname: '/create-bot',
      params: { entry: 'resume' },
    });
  });
});

describe('Marketplace pushed screens', () => {
  it('reads a digest article and opens its Bots and past picks', async () => {
    fixture.params = { day: '2026-10-28', entry: 'all' };
    await act(async () => root.render(<MarketplaceDigestScreen />));
    expect(byTestId('screen-title')?.textContent).toBe('Writers week');
    expect(byTestId('digest-cover-two')).not.toBeNull();
    expect(element.textContent).toContain('Wednesday, October 28');
    expect(element.textContent).toContain('Bots that help you write.');
    expect(byTestId('marketplace-digest-section-2')?.textContent).toBe('ClosingSee you tomorrow.');
    await act(async () => button('Bot edit, example/edit').click());
    expect(fixture.push).toHaveBeenLastCalledWith({
      pathname: '/marketplace-bot',
      params: { id: 'edit', entry: 'all' },
    });
    expect(features).toHaveBeenCalledWith('marketplace:bot_open', {
      entry: 'digest',
      step: 'detail',
    });
    await act(async () => byTestId('marketplace-digest-past-picks')!.click());
    expect(fixture.push).toHaveBeenLastCalledWith({
      pathname: '/marketplace-past-picks',
      params: { entry: 'all' },
    });
  });

  it('lists past picks as covers that open their day', async () => {
    await act(async () => root.render(<MarketplacePastPicksScreen />));
    expect(byTestId('screen-title')?.textContent).toBe(t.marketplace.pastPicks);
    expect(byTestId('digest-cover-three')).not.toBeNull();
    expect(byTestId('digest-cover-date')).not.toBeNull();
    await act(async () => byTestId('marketplace-digest-2026-10-27')!.click());
    expect(fixture.push).toHaveBeenLastCalledWith({
      pathname: '/marketplace-digest',
      params: { day: '2026-10-27', entry: 'all' },
    });
    expect(features).toHaveBeenCalledWith('marketplace:digest_open', { entry: 'archive' });
  });

  it('shows every ranked Bot in See all', async () => {
    fixture.params = { section: 'rising', entry: 'all' };
    await act(async () => root.render(<MarketplaceRankingScreen />));
    expect(byTestId('screen-title')?.textContent).toBe(t.marketplace.rising);
    expect(element.querySelectorAll('[data-testid^="marketplace-bot-rising"]')).toHaveLength(5);
    await act(async () => byTestId('marketplace-bot-rising5')!.click());
    expect(features).toHaveBeenLastCalledWith('marketplace:bot_open', {
      entry: 'rising',
      step: 'detail',
    });
  });
});
