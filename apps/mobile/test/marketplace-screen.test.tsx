// @vitest-environment jsdom
import { act, createElement, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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
  };
});
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    Platform: {
      ...shim.Platform,
      get OS() {
        return fixture.platform;
      },
    },
    useWindowDimensions: () => ({ ...shim.useWindowDimensions(), fontScale: fixture.fontScale }),
    Linking: { openURL: fixture.openURL },
    FlatList: (
      props: Parameters<typeof shim.FlatList>[0] & {
        renderScrollComponent?: (props: { children: ReactNode }) => ReactNode;
      },
    ) =>
      props.renderScrollComponent
        ? props.renderScrollComponent({ children: shim.FlatList(props) })
        : shim.FlatList(props),
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
      options
        .unstable_headerRightItems?.()
        .map((item) =>
          createElement(
            'button',
            { key: item.identifier, 'aria-label': item.label, onClick: item.onPress },
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
  expect(element.querySelectorAll('[data-keyboard-safe]')).toHaveLength(1);
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
    (
      element.querySelector('[data-testid="marketplace-search-submit"]') as HTMLButtonElement
    ).click();
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
