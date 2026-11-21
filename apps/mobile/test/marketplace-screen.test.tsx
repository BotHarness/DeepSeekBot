// @vitest-environment jsdom
import { act, createElement, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ScrollViewProps } from 'react-native';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createBotCreationController,
  type CreationRecord,
} from '@botharness/host-client/bot-creation';
import { createHostClient, type HostClient } from '@botharness/host-client/client';
import { FakeHost } from '../../../packages/host-client/test/fake-host';

const fixture = vi.hoisted(() => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal('fetch', fetch);
  return {
    fetch,
    fontScale: 1,
    avatarsAvailable: false,
    platform: 'web',
    params: {} as Record<string, string>,
    push: vi.fn(),
    openURL: vi.fn(async () => {}),
    link: 'docs/setup.md',
    imageRenders: 0,
    listEvents: {} as Pick<ScrollViewProps, 'onScrollBeginDrag' | 'onScroll'> & {
      onEndReached?: () => void;
    },
  };
});
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    TextInput: (props: {
      testID?: string;
      value?: string;
      accessibilityLabel?: string;
      onChangeText?(value: string): void;
      onSubmitEditing?(event: { nativeEvent: { text: string } }): void;
    }) =>
      createElement('textarea', {
        'data-testid': props.testID,
        'aria-label': props.accessibilityLabel,
        value: props.value,
        onChange: (event: { currentTarget: HTMLTextAreaElement }) =>
          props.onChangeText?.(event.currentTarget.value),
        onKeyDown: (event: { key: string; currentTarget: HTMLTextAreaElement }) => {
          if (event.key === 'Enter')
            props.onSubmitEditing?.({ nativeEvent: { text: event.currentTarget.value } });
        },
      }),
    Platform: {
      ...shim.Platform,
      get OS() {
        return fixture.platform;
      },
    },
    useWindowDimensions: () => ({ ...shim.useWindowDimensions(), fontScale: fixture.fontScale }),
    Dimensions: {
      get: () => ({ ...shim.useWindowDimensions(), fontScale: fixture.fontScale }),
      addEventListener: (_event: string, _changed: () => void) => ({ remove() {} }),
    },
    Linking: { openURL: fixture.openURL },
    FlatList: (
      props: Parameters<typeof shim.FlatList>[0] & {
        renderScrollComponent?: (props: { children: ReactNode }) => ReactNode;
        onScrollBeginDrag?: ScrollViewProps['onScrollBeginDrag'];
        onScroll?: ScrollViewProps['onScroll'];
        onEndReached?: () => void;
      },
    ) => {
      if (props.testID === 'marketplace-list') fixture.listEvents = props;
      return props.renderScrollComponent
        ? props.renderScrollComponent({ children: shim.FlatList(props) })
        : shim.FlatList(props);
    },
  };
});
vi.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-keyboard-safe': true }, children),
  KeyboardAwareScrollView: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-keyboard-form': true }, children),
}));
vi.mock('expo-image', () => ({
  Image: ({ testID, source }: { testID?: string; source: { uri: string } }) => {
    fixture.imageRenders++;
    return createElement('img', { 'data-testid': testID, src: source.uri, alt: '' });
  },
}));
let avatarClient: HostClient | undefined;
let member = false;
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({
    client: avatarClient,
    saved: { hostId: 'A', ...(member ? { member: {} } : {}) },
  }),
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'draft-key' }));
vi.mock('../src/marketplace/available', () => ({
  get marketplaceAvatarsAvailable() {
    return fixture.avatarsAvailable;
  },
}));
vi.mock('../src/host/pick-avatar-image', () => ({
  MarketplaceAvatarTooSmall: Error,
  pickMarketplaceAvatarImage: async () => undefined,
  prepareMarketplaceAvatarImage: async () => undefined,
}));
vi.mock('../src/ui/bot-avatar', () => ({
  BotPortrait: ({
    bot,
  }: {
    bot: { slug: string; avatarSource?: { uri: string }; avatarUrl?: string };
  }) =>
    createElement('img', {
      'data-testid': `candidate-portrait-${bot.slug}`,
      src: bot.avatarSource?.uri ?? bot.avatarUrl,
    }),
}));
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34 }),
}));
vi.mock('react-native-svg', () => ({
  default: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
  Path: () => null,
  Circle: () => null,
  Defs: () => null,
  LinearGradient: () => null,
  Rect: () => null,
  Stop: () => null,
}));
vi.mock('react-native-enriched-markdown', () => ({
  EnrichedMarkdownText: ({
    markdown,
    onLinkPress,
  }: {
    markdown: string;
    onLinkPress(event: { url: string }): void;
  }) =>
    createElement(
      'article',
      null,
      markdown,
      createElement('button', { onClick: () => onLinkPress({ url: fixture.link }) }, 'Readme link'),
    ),
}));
vi.mock('expo-router', () => ({
  Stack: {
    Screen: ({
      options,
    }: {
      options: {
        unstable_headerRightItems?: () => { label: string; identifier: string; onPress(): void }[];
      };
    }) =>
      options.unstable_headerRightItems?.().map((item) =>
        createElement(
          'button',
          {
            key: item.identifier,
            'data-testid': item.identifier,
            'aria-label': item.label,
            onClick: item.onPress,
          },
          item.label,
        ),
      ) ?? null,
  },
  Redirect: ({ href }: { href: string }) => createElement('a', { href }),
  router: { push: fixture.push },
  useLocalSearchParams: () => fixture.params,
  useFocusEffect: (callback: () => () => void) => useLayoutEffect(callback, [callback]),
}));
let controller: ReturnType<typeof createBotCreationController>;
vi.mock('../src/host/native-bot-creation', () => ({
  get botCreation() {
    return controller;
  },
}));

import { MarketplaceScreen } from '../src/ui/shell/marketplace-screen';
import { BotAvatarChooser } from '../src/ui/chat/bot-avatar-chooser';
import MarketplaceAvatarScreen from '../app/marketplace-avatars';
import MarketplaceAvatarDetailScreen from '../app/marketplace-avatar';
import MarketplaceAvatarEditorScreen from '../app/marketplace-avatar-editor';
import MarketplaceAvatarMineScreen from '../app/marketplace-avatar-mine';
import { MarketplaceBotScreen } from '../src/ui/shell/marketplace-bot-screen';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const bot = {
  id: 'screen-writer',
  owner: 'example',
  name: 'writer',
  fullName: 'example/writer',
  displayName: 'Writer',
  description: 'Writing helper',
  topics: ['writing'],
  stars: 12,
  pushedAt: '2026-10-23',
  htmlUrl: 'https://github.com/example/writer',
  cloneUrl: 'https://github.com/example/writer.git',
  defaultBranch: 'main',
  headCommit: { sha: 'a'.repeat(40), committedAt: '2026-10-23' },
  roles: ['writing'],
};
let root: Root;
let element: HTMLElement;
beforeEach(() => {
  vi.clearAllMocks();
  fixture.fontScale = 1;
  fixture.avatarsAvailable = false;
  fixture.platform = 'web';
  fixture.params = { entry: 'all' };
  fixture.listEvents = {};
  fixture.imageRenders = 0;
  fixture.fetch.mockImplementation(async (url) => {
    const path = new URL(String(url)).pathname;
    return Response.json(
      path === '/v1/topics'
        ? { topics: [{ topic: 'writing', count: 12 }] }
        : path === '/v1/bots'
          ? { bots: [bot] }
          : {
              bot: { ...bot, id: path.split('/').at(-1) },
              readme: '# Writer README',
              readmeLanguage: 'en',
              commitSha: 'a'.repeat(40),
            },
    );
  });
  let disk: CreationRecord | undefined;
  controller = createBotCreationController({
    key: () => 'market-screen-1',
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
  avatarClient?.stop();
  avatarClient = undefined;
  member = false;
});
const button = (name: string) =>
  [...element.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === name || item.textContent === name,
  )!;

it('browses without a Host, changes sort and topics, then carries All to the detail page', async () => {
  await act(async () => root.render(<MarketplaceScreen />));
  expect(element.querySelectorAll('[data-keyboard-safe]')).toHaveLength(0);
  expect(element.querySelector('[data-testid="marketplace-search-button"]')).not.toBeNull();
  expect(element.querySelectorAll('[data-testid="marketplace-banner"]')).toHaveLength(1);
  expect(element.querySelectorAll('[data-testid="marketplace-avatar"]')).toHaveLength(1);
  expect(element.textContent).toContain('Writer');
  await act(async () => button(t.marketplace.popular).click());
  expect(fixture.fetch.mock.calls.some(([url]) => String(url).includes('sort=stars'))).toBe(true);
  await act(async () => button(t.marketplace.topics).click());
  await act(async () =>
    (
      element.querySelector('[data-testid="marketplace-topic-writing"]') as HTMLButtonElement
    ).click(),
  );
  expect(element.querySelector('[role="dialog"]')).toBeNull();
  expect(fixture.fetch.mock.calls.some(([url]) => String(url).includes('topic=writing'))).toBe(
    true,
  );
  await act(async () => button('Writer, example/writer').click());
  expect(fixture.push).toHaveBeenCalledWith({
    pathname: '/marketplace-bot',
    params: { id: 'screen-writer', entry: 'all' },
  });
  expect(controller.getSnapshot().record).toMatchObject({ draft: { displayName: '' } });
});

it('shows a native README and retains the chosen listing for pairing at confirmation', async () => {
  fixture.params = { id: 'screen-detail', entry: 'host', hostId: 'A' };
  await act(async () => root.render(<MarketplaceBotScreen />));
  expect(element.querySelector('article')?.textContent).toContain('# Writer README');
  await act(async () => button(t.marketplace.import).click());
  expect(controller.getSnapshot().record).toMatchObject({
    kind: 'draft',
    draft: {
      hostId: 'A',
      displayName: 'Writer',
      source: { listingId: 'screen-detail', expectedCommit: 'a'.repeat(40) },
    },
  });
  expect(fixture.push).toHaveBeenCalledWith({
    pathname: '/create-bot',
    params: { entry: 'resume' },
  });
});

it('keeps cached detail visible but disables import when a refresh says the listing is gone', async () => {
  fixture.params = { id: 'screen-gone' };
  await act(async () => root.render(<MarketplaceBotScreen />));
  fixture.fetch.mockResolvedValueOnce(
    Response.json({ error: { code: 'bot-not-found' } }, { status: 404 }),
  );
  await act(async () => button(t.marketplace.refreshListing).click());
  expect(element.textContent).toContain(t.marketplace.missing);
  expect(element.querySelector('article')?.textContent).toContain('# Writer README');
  expect(button(t.marketplace.import).disabled).toBe(true);
  expect(fixture.push).not.toHaveBeenCalled();
});

it('opens relative README links at the reviewed revision and ignores unsupported schemes', async () => {
  fixture.params = { id: 'screen-links' };
  await act(async () => root.render(<MarketplaceBotScreen />));
  fixture.link = 'docs/setup.md';
  await act(async () => button('Readme link').click());
  expect(fixture.openURL).toHaveBeenCalledWith(
    `https://github.com/example/writer/blob/${'a'.repeat(40)}/docs/setup.md`,
  );
  fixture.link = 'deepseekbot://pair';
  await act(async () => button('Readme link').click());
  expect(fixture.openURL).toHaveBeenCalledTimes(1);
});

it('exposes topic shortcuts and refreshes only after explicit search submission, including the same query', async () => {
  await act(async () => root.render(<MarketplaceScreen />));
  expect(element.querySelector('[data-testid="marketplace-sort"]')).not.toBeNull();
  await act(async () =>
    (
      element.querySelector('[data-testid="marketplace-featured-writing"]') as HTMLButtonElement
    ).click(),
  );
  expect(fixture.fetch.mock.calls.some(([url]) => String(url).includes('topic=writing'))).toBe(
    true,
  );
  await act(async () =>
    (
      element.querySelector('[data-testid="marketplace-search-button"]') as HTMLButtonElement
    ).click(),
  );
  const input = element.querySelector('[data-testid="marketplace-search"]') as HTMLTextAreaElement;
  const before = fixture.fetch.mock.calls.length;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      '  Writer  ',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(fixture.fetch.mock.calls).toHaveLength(before);
  const submit = () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await act(async () => submit());
  expect(fixture.fetch.mock.calls.some(([url]) => String(url).includes('q=Writer'))).toBe(true);
  const submitted = fixture.fetch.mock.calls.length;
  await act(async () => submit());
  expect(fixture.fetch.mock.calls).toHaveLength(submitted + 1);
  await act(async () => button(t.closeSearch).click());
  expect(element.querySelector('[data-testid="marketplace-search"]')).toBeNull();
  expect(new URL(String(fixture.fetch.mock.calls.at(-1)![0])).searchParams.get('q')).toBe('');
});

it('keeps all sorting choices operable at large text while preserving the topic', async () => {
  fixture.fontScale = 3;
  fixture.platform = 'ios';
  await act(async () => root.render(<MarketplaceScreen />));
  await act(async () =>
    (
      element.querySelector('[data-testid="marketplace-featured-writing"]') as HTMLButtonElement
    ).click(),
  );
  await act(async () => button(t.marketplace.newest).click());
  const last = new URL(String(fixture.fetch.mock.calls.at(-1)![0]));
  expect(button(t.marketplace.newest).getAttribute('aria-checked')).toBe('true');
  expect(last.searchParams.get('sort')).toBe('created');
  expect(last.searchParams.get('topic')).toBe('writing');
});

it('searches from the iOS header and restores the native header on close', async () => {
  fixture.platform = 'ios';
  await act(async () => root.render(<MarketplaceScreen />));
  expect(element.querySelector('[data-testid="marketplace-search"]')).toBeNull();
  await act(async () =>
    element.querySelector<HTMLButtonElement>('[data-testid="marketplace-search-button"]')!.click(),
  );
  expect(element.querySelector('[data-testid="marketplace-search-button"]')).toBeNull();
  const input = element.querySelector<HTMLTextAreaElement>('[data-testid="marketplace-search"]')!;
  input.value = 'writer';
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
  expect(new URL(String(fixture.fetch.mock.calls.at(-1)![0])).searchParams.get('q')).toBe('writer');
  expect(element.querySelector('[data-testid="marketplace-home"]')).toBeNull();
  await act(async () => button(t.closeSearch).click());
  expect(element.querySelector('[data-testid="marketplace-search"]')).toBeNull();
  expect(element.querySelector('[data-testid="marketplace-search-button"]')).not.toBeNull();
  expect(element.querySelector('[data-testid="marketplace-home"]')).not.toBeNull();
});

it('submits the native text when its last edit has not reached React state', async () => {
  await act(async () => root.render(<MarketplaceScreen />));
  await act(async () =>
    element.querySelector<HTMLButtonElement>('[data-testid="marketplace-search-button"]')!.click(),
  );
  const input = element.querySelector<HTMLTextAreaElement>('[data-testid="marketplace-search"]')!;
  input.value = '  native submit complete  ';
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
  expect(
    fixture.fetch.mock.calls.some(
      ([url]) => new URL(String(url)).searchParams.get('q') === 'native submit complete',
    ),
  ).toBe(true);
});

it('pages only after a scroll, coalesces end events and retries a failed page explicitly', async () => {
  const catalogueCalls: string[] = [];
  let finishPage!: (response: Response) => void;
  fixture.fetch.mockImplementation(async (url) => {
    const request = new URL(String(url));
    if (request.pathname !== '/v1/bots') return Response.json({ topics: [] });
    catalogueCalls.push(request.search);
    if (!request.searchParams.has('cursor'))
      return Response.json({ bots: [{ ...bot, id: 'page-one' }], nextCursor: 'page-two' });
    return new Promise<Response>((resolve) => {
      finishPage = resolve;
    });
  });
  await act(async () => root.render(<MarketplaceScreen />));
  const firstPageCalls = catalogueCalls.length;
  await act(async () => fixture.listEvents.onEndReached?.());
  expect(catalogueCalls).toHaveLength(firstPageCalls);
  const scroll = {
    nativeEvent: {
      contentOffset: { x: 0, y: 500 },
      contentSize: { width: 390, height: 1000 },
      layoutMeasurement: { width: 390, height: 600 },
      contentInset: { top: 0, bottom: 0, left: 0, right: 0 },
      zoomScale: 1,
    },
  };
  await act(async () => {
    fixture.listEvents.onScrollBeginDrag?.(
      scroll as Parameters<NonNullable<ScrollViewProps['onScrollBeginDrag']>>[0],
    );
    fixture.listEvents.onEndReached?.();
    fixture.listEvents.onEndReached?.();
  });
  expect(catalogueCalls).toHaveLength(firstPageCalls + 1);
  expect(element.querySelector('[data-testid="marketplace-page-loading"]')).not.toBeNull();
  await act(async () => finishPage(Response.json({}, { status: 503 })));
  expect(element.querySelector('[data-testid="marketplace-bot-page-one"]')).not.toBeNull();
  await act(async () => {
    fixture.listEvents.onScrollBeginDrag?.(
      scroll as Parameters<NonNullable<ScrollViewProps['onScrollBeginDrag']>>[0],
    );
    fixture.listEvents.onEndReached?.();
  });
  expect(catalogueCalls).toHaveLength(firstPageCalls + 1);
  await act(async () =>
    element.querySelector<HTMLButtonElement>('[data-testid="marketplace-page-retry"]')!.click(),
  );
  expect(catalogueCalls).toHaveLength(firstPageCalls + 2);
  expect(catalogueCalls.at(-1)).toBe(catalogueCalls.at(-2));
  await act(async () =>
    finishPage(
      Response.json({
        bots: [
          { ...bot, id: 'page-one' },
          { ...bot, id: 'page-two' },
        ],
        nextCursor: 'page-three',
      }),
    ),
  );
  expect(element.querySelectorAll('[data-testid="marketplace-bot-page-one"]')).toHaveLength(1);
  expect(element.querySelector('[data-testid="marketplace-bot-page-two"]')).not.toBeNull();
  await act(async () => fixture.listEvents.onEndReached?.());
  expect(catalogueCalls).toHaveLength(firstPageCalls + 2);
  await act(async () =>
    fixture.listEvents.onScrollBeginDrag?.(
      scroll as Parameters<NonNullable<ScrollViewProps['onScrollBeginDrag']>>[0],
    ),
  );
  expect(catalogueCalls).toHaveLength(firstPageCalls + 3);
  await act(async () => finishPage(Response.json({ bots: [{ ...bot, id: 'page-three' }] })));
  await act(async () => {
    fixture.listEvents.onScrollBeginDrag?.(
      scroll as Parameters<NonNullable<ScrollViewProps['onScrollBeginDrag']>>[0],
    );
    fixture.listEvents.onEndReached?.();
  });
  expect(catalogueCalls).toHaveLength(firstPageCalls + 3);
});

it('keeps loaded catalogue artwork out of search-open and draft-edit renders', async () => {
  await act(async () => root.render(<MarketplaceScreen />));
  const row = element.querySelector('[data-testid="marketplace-bot-screen-writer"]');
  const rendered = fixture.imageRenders;
  await act(async () => button(t.marketplace.search).click());
  expect(fixture.imageRenders).toBe(rendered);
  const input = element.querySelector<HTMLTextAreaElement>('[data-testid="marketplace-search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      'writer',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(fixture.imageRenders).toBe(rendered);
  expect(element.querySelector('[data-testid="marketplace-bot-screen-writer"]')).toBe(row);
  await act(async () => button(t.closeSearch).click());
  expect(fixture.imageRenders).toBe(rendered);
});

it('loads another page through the accessible action without a touch scroll', async () => {
  const requests: string[] = [];
  fixture.fetch.mockImplementation(async (url) => {
    const request = new URL(String(url));
    if (request.pathname !== '/v1/bots') return Response.json({ topics: [] });
    requests.push(request.search);
    return Response.json(
      request.searchParams.has('cursor')
        ? { bots: [{ ...bot, id: 'accessible-second' }] }
        : { bots: [{ ...bot, id: 'accessible-first' }], nextCursor: 'accessible-next' },
    );
  });
  await act(async () => root.render(<MarketplaceScreen />));
  const more = element.querySelector<HTMLButtonElement>('[data-testid="marketplace-more"]');
  expect(more).not.toBeNull();
  expect(more?.getAttribute('aria-label') ?? more?.textContent).toBe(t.marketplace.more);
  const before = requests.length;
  await act(async () => more!.click());
  expect(requests).toHaveLength(before + 1);
  expect(requests.at(-1)).toContain('cursor=accessible-next');
  expect(element.querySelector('[data-testid="marketplace-bot-accessible-first"]')).not.toBeNull();
  expect(element.querySelector('[data-testid="marketplace-bot-accessible-second"]')).not.toBeNull();
  expect(element.querySelector('[data-testid="marketplace-more"]')).toBeNull();
});

function avatarHost() {
  const host = new FakeHost();
  avatarClient = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
  });
  avatarClient.start();
  const avatar = {
    id: 'blue',
    imageUrl: 'https://market.example.test/blue.webp',
    name: 'Ocean Blue',
    description: 'A test Avatar',
    tags: ['ocean'],
    author: { name: 'Ada', id: 'abc234' },
    applyCount: 2,
  };
  host.methods.set('marketplaceAvatarList', () => ({ avatars: [avatar], nextCursor: null }));
  host.methods.set('marketplaceAvatarDetail', () => avatar);
  return host;
}

it('opens Avatars from Bots on the same paired Host and hides owner controls from members', async () => {
  fixture.avatarsAvailable = true;
  fixture.params = { entry: 'host', hostId: 'A' };
  const host = avatarHost();
  await act(async () => root.render(<MarketplaceScreen />));
  expect(host.calls.some(({ method }) => method.startsWith('marketplaceAvatar'))).toBe(false);
  await act(async () => button(t.marketplaceAvatars.title).click());
  expect(fixture.push).toHaveBeenCalledWith({
    pathname: '/marketplace-avatars',
    params: { hostId: 'A' },
  });

  await act(async () => root.render(<MarketplaceAvatarScreen />));
  expect(element.textContent).toContain('Ocean Blue');
  expect(element.querySelector('[role="header"]')?.textContent).toBe(t.marketplaceAvatars.browse);
  expect(element.querySelector('[data-testid="marketplace-avatar-more"]')).not.toBeNull();
  await act(async () => button(t.marketplaceAvatars.moreActions).click());
  expect(button(t.marketplaceAvatars.mine)).toBeDefined();
  await act(async () => button(t.marketplaceAvatars.publish).click());
  expect(fixture.push).toHaveBeenLastCalledWith({
    pathname: '/marketplace-avatar-editor',
    params: { hostId: 'A' },
  });
  member = true;
  await act(async () => root.render(<MarketplaceAvatarScreen />));
  expect(element.querySelector('[data-testid="marketplace-avatar-more"]')).toBeNull();
  expect(element.textContent).toContain('Ocean Blue');
});

it('offers the full built-in Bot Avatar galleries and saves a preset without Photos', async () => {
  const pick = vi.fn(async () => undefined);
  const save = vi.fn(async () => undefined);
  const saveRecipe = vi.fn(async () => undefined);
  const onClose = vi.fn();
  const onMarketplace = vi.fn();
  await act(async () =>
    root.render(
      <BotAvatarChooser
        actions={{ pick, save, saveRecipe }}
        onClose={onClose}
        onMarketplace={onMarketplace}
      />,
    ),
  );
  expect(element.querySelectorAll('[data-testid^="illustrated-avatar-"]').length).toBeGreaterThan(
    24,
  );
  await act(async () => button(t.avatarEditor.line).click());
  expect(element.querySelector('[data-testid="line-avatar-1"]')).not.toBeNull();
  await act(async () => button(t.avatarEditor.tilties).click());
  expect(element.querySelectorAll('[data-testid^="tilties-avatar-"]')).toHaveLength(36);
  await act(async () => button(t.marketplaceAvatars.choose).click());
  expect(onMarketplace).toHaveBeenCalledOnce();
  await act(async () =>
    element
      .querySelector<HTMLButtonElement>('[data-testid="tilties-avatar-frost-archivist"]')!
      .click(),
  );
  expect(save).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/webp;base64,/u));
  expect(onClose).toHaveBeenCalledOnce();
  expect(pick).not.toHaveBeenCalled();
});

it('confirms and applies a Marketplace Avatar to the originating Bot instead of showing the candidate picker', async () => {
  fixture.avatarsAvailable = true;
  fixture.params = { id: 'blue', hostId: 'A', targetBot: 'ada' };
  const host = avatarHost();
  host.methods.set('marketplaceAvatarApplyCandidates', () => ({
    bots: [
      { slug: 'plain', displayName: 'Plain Bot', hasAppearance: false },
      { slug: 'ada', displayName: 'Ada Bot', hasAppearance: true },
    ],
  }));
  host.methods.set('marketplaceAvatarApply', () => ({ applied: true }));
  await act(async () => root.render(<MarketplaceAvatarDetailScreen />));
  await act(async () => button(t.marketplaceAvatars.apply).click());
  expect(element.textContent).toContain(t.marketplaceAvatars.applyTo('Ada Bot'));
  expect(element.textContent).toContain(t.marketplaceAvatars.applyWarning);
  expect(element.querySelectorAll('[data-testid^="marketplace-avatar-target-"]')).toHaveLength(0);
  expect(host.calls.some(({ method }) => method === 'marketplaceAvatarApply')).toBe(false);
  await act(async () => button(t.marketplaceAvatars.apply).click());
  expect(host.calls.find(({ method }) => method === 'marketplaceAvatarApply')?.args).toEqual({
    id: 'blue',
    bot: 'ada',
  });
});

it('shows the Appearance warning before confirming the chosen Bot', async () => {
  fixture.avatarsAvailable = true;
  fixture.params = { id: 'blue', hostId: 'A' };
  const host = avatarHost();
  host.methods.set('marketplaceAvatarApplyCandidates', () => ({
    bots: [
      {
        slug: 'ada',
        displayName: 'Ada Bot',
        avatar: '/api/botharness/bot-avatar?slug=ada',
        hasAppearance: true,
      },
      { slug: 'plain', displayName: 'Plain Bot', hasAppearance: false },
    ],
  }));
  host.methods.set('marketplaceAvatarApply', () => ({ applied: true }));
  await act(async () => root.render(<MarketplaceAvatarDetailScreen />));
  expect(element.textContent).toContain('Ada #abc234');
  await act(async () => button(t.marketplaceAvatars.apply).click());
  expect(button(t.marketplaceAvatars.apply).disabled).toBe(true);
  expect(element.textContent).not.toContain(t.marketplaceAvatars.applyWarning);
  expect(
    element.querySelector('[data-testid="candidate-portrait-ada"]')?.getAttribute('src'),
  ).toContain('/botharness-device/api/botharness/bot-avatar?slug=ada');
  expect(element.querySelector('[data-testid="candidate-portrait-plain"]')).not.toBeNull();
  await act(async () => button('Plain Bot').click());
  expect(button('Plain Bot').getAttribute('aria-selected')).toBe('true');
  expect(button(t.marketplaceAvatars.apply).disabled).toBe(false);
  expect(element.textContent).not.toContain(t.marketplaceAvatars.applyWarning);
  await act(async () => button('Ada Bot').click());
  expect(button('Ada Bot').getAttribute('aria-selected')).toBe('true');
  expect(button('Plain Bot').getAttribute('aria-selected')).toBe('false');
  expect(element.textContent).toContain(t.marketplaceAvatars.applyWarning);
  expect(host.calls.some(({ method }) => method === 'marketplaceAvatarApply')).toBe(false);
  await act(async () => button(t.marketplaceAvatars.apply).click());
  expect(host.calls.find(({ method }) => method === 'marketplaceAvatarApply')?.args).toEqual({
    id: 'blue',
    bot: 'ada',
  });
  expect(element.textContent).toContain(t.marketplaceAvatars.applied('Ada Bot'));
});

it('keeps the Bots catalogue and redirects every direct Avatar route while disabled', async () => {
  const host = avatarHost();
  fixture.params = { id: 'blue', hostId: 'A', bot: 'ada' };
  await act(async () => root.render(<MarketplaceScreen />));
  expect(element.textContent).toContain('Writer');
  expect(element.querySelector('[role="tablist"][aria-label="Marketplace"]')).toBeNull();

  for (const Route of [
    MarketplaceAvatarScreen,
    MarketplaceAvatarDetailScreen,
    MarketplaceAvatarEditorScreen,
    MarketplaceAvatarMineScreen,
  ]) {
    await act(async () => root.render(<Route />));
    expect(element.firstElementChild?.getAttribute('href')).toBe('/marketplace');
  }
  expect(host.calls.some(({ method }) => method.startsWith('marketplace'))).toBe(false);
});

it('opens the owner editor and My Avatars routes while enabled', async () => {
  fixture.avatarsAvailable = true;
  fixture.params = { hostId: 'A' };
  const host = avatarHost();
  host.methods.set('marketplaceAccount', () => ({
    signedIn: true,
    author: { name: 'Ada', id: 'abc234', avatar: null, termsAcceptedAt: '2026-11-21' },
  }));
  host.methods.set('marketplaceAvatarMine', () => ({ avatars: [] }));
  await act(async () => root.render(<MarketplaceAvatarEditorScreen />));
  expect(element.textContent).toContain(t.marketplaceAvatars.publishAs('Ada', 'abc234'));
  expect(element.querySelector('[data-testid="marketplace-avatar-choose-image"]')).not.toBeNull();
  await act(async () => root.render(<MarketplaceAvatarMineScreen />));
  expect(element.textContent).toContain(t.marketplaceAvatars.mineEmpty);
});

it('uses the header to search Avatars and open the tag sheet', async () => {
  fixture.avatarsAvailable = true;
  const host = avatarHost();
  host.methods.set('marketplaceAvatarTags', () => [{ tag: 'ocean', count: 1 }]);
  await act(async () => root.render(<MarketplaceAvatarScreen />));
  await act(async () => button(t.marketplaceAvatars.search).click());
  const search = element.querySelector<HTMLTextAreaElement>(
    '[data-testid="marketplace-avatar-search"]',
  );
  expect(search).not.toBeNull();
  search!.value = 'ocean';
  await act(async () =>
    search!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
  expect(host.calls).toContainEqual({ method: 'marketplaceAvatarList', args: { q: 'ocean' } });
  await act(async () => button(t.closeSearch).click());
  await act(async () => button(t.marketplaceAvatars.tags).click());
  expect(
    element.querySelector('[data-testid="marketplace-avatar-tag-ocean"]')?.textContent,
  ).toContain('ocean (1)');
});
