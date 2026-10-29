// @vitest-environment jsdom
import { act, createElement, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ScrollViewProps } from 'react-native';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createBotCreationController, type CreationRecord } from '../src/host/bot-creation';

const fixture = vi.hoisted(() => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal('fetch', fetch);
  return {
    fetch,
    fontScale: 1,
    platform: 'web',
    params: {} as Record<string, string>,
    push: vi.fn(),
    openURL: vi.fn(async () => {}),
    link: 'docs/setup.md',
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
  fixture.platform = 'web';
  fixture.params = { entry: 'all' };
  fixture.listEvents = {};
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
