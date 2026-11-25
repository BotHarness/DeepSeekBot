// @vitest-environment jsdom
import { act, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { HostClient } from '@botharness/host-client/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Circle: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 83, left: 0, right: 0 }),
}));
vi.mock('../src/ui/shell/window-insets', () => ({
  useWindowInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
vi.mock('react-native-keyboard-controller', () => ({
  KeyboardStickyView: ({
    children,
    offset,
  }: {
    children: ReactNode;
    offset: { closed: number; opened: number };
  }) => (
    <div data-testid="keyboard-sticky" data-opened={offset.opened}>
      {children}
    </div>
  ),
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (work: () => void | (() => void)) => useLayoutEffect(work, [work]),
}));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('../src/ui/shell/tab-chrome', () => ({ useHideChromeOnScroll: () => undefined }));
vi.mock('../src/ui/shell/icons', () => import('./shell-icons-shim'));
vi.mock('../src/ui/bot-avatar', () => ({ BotPortrait: () => null }));
vi.mock('../src/ui/chat/model-brand-icon', () => ({ ModelBrandIcon: () => null }));
vi.mock('../src/ui/chat/row-status-glyph', () => ({
  RowStatusGlyph: ({ status }: { status: string }) => <span data-status={status} />,
}));
vi.mock('../src/ui/chat/source-name', () => ({ SourceMark: () => <span data-host-glyph="" /> }));
vi.mock('../src/host/native-host-look', () => ({
  useHostLook: () => ({ icon: { kind: 'symbol', id: 'desktop' } }),
}));
vi.mock('../src/ui/primitives/drawer-material', () => ({
  DrawerMaterial: () => null,
  useLiquidGlass: () => false,
}));

import { SessionDrawerPanel } from '../src/features/sessions/session-drawer-panel';
import { interfacePreferences } from '../src/ui/interface-preferences';
import { sessionQueries } from '../src/features/sessions/session-list-query';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  sessionQueries.clear();
});

const now = Date.now();
function client(call: ReturnType<typeof vi.fn>): HostClient {
  return {
    call,
    subscribe: () => () => {},
    getSnapshot: () => ({ connection: { status: 'connected' } }),
    resource: () => ({ uri: '' }),
  } as unknown as HostClient;
}

async function render(
  props: {
    onOpen?(): void;
    onNew?(): void;
    canCreate?: boolean;
    second?: boolean;
    variant?: 'drawer' | 'page';
  } = {},
) {
  const call = vi.fn(async (_method: string, args: { search?: string }) => ({
    queryVersion: 1,
    sources: [{ kind: 'native' }],
    sessions: [
      {
        sessionId: 'fresh',
        title: 'Fresh work',
        folderName: 'botharness',
        model: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
        source: { kind: 'native' },
        running: true,
        lastPromptAt: now,
        updatedAt: now,
      },
      {
        sessionId: 'old',
        title: 'Old research',
        folderName: '笔记',
        source: { kind: 'native' },
        waiting: true,
        running: false,
        lastPromptAt: now - 5 * 86_400_000,
        updatedAt: now - 5 * 86_400_000,
      },
    ].filter((row) => !args.search || row.title.toLowerCase().includes(args.search)),
  }));
  const view = document.createElement('div');
  root = createRoot(view);
  const other = vi.fn(async () => ({
    queryVersion: 1,
    sources: [{ kind: 'bot', botSlug: 'ada', displayName: 'Ada' }],
    sessions: [
      {
        sessionId: 'remote',
        title: 'Remote review',
        folderName: 'deploy-tools',
        source: { kind: 'bot', botSlug: 'ada', displayName: 'Ada' },
        running: false,
        lastPromptAt: now - 60_000,
        updatedAt: now - 60_000,
        sortedAt: now - 60_000,
      },
      {
        sessionId: 'loose',
        title: 'Loose ask',
        source: { kind: 'native' },
        status: 'needs-you',
        attention: 'approval',
        running: false,
        lastPromptAt: now - 6 * 86_400_000,
        updatedAt: now - 6 * 86_400_000,
      },
    ],
  }));
  await act(async () =>
    root!.render(
      <SessionDrawerPanel
        hosts={[
          { hostId: 'studio', hostName: 'Studio', client: client(call) },
          ...(props.second
            ? [{ hostId: 'laptop', hostName: 'Laptop', client: client(other) }]
            : []),
        ]}
        title={props.second ? 'All environments' : 'Studio'}
        showHost={props.second === true}
        active
        selected={{ hostId: 'studio', sessionId: 'old' }}
        canCreate={props.canCreate ?? true}
        onOpen={props.onOpen ?? (() => {})}
        onNew={props.onNew ?? (() => {})}
        {...(props.variant === undefined ? {} : { variant: props.variant })}
      />,
    ),
  );
  await settle();
  return { view, call, other };
}

async function settle() {
  for (let tick = 0; tick < 3; tick += 1)
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

it('lists Sessions by day with the open one highlighted under the Environment name', async () => {
  const onOpen = vi.fn();
  const { view, call } = await render({ onOpen });
  expect(view.querySelector('[data-testid="session-drawer-environment"]')?.textContent).toBe(
    'Studio',
  );
  expect(call).toHaveBeenCalledWith(
    'sessionList',
    { search: '', sort: 'last-human-turn', source: 'all', limit: 50, queryVersion: 1 },
    expect.anything(),
  );
  const sections = [...view.querySelectorAll('section')].map((section) => section.textContent);
  expect(sections[0]).toContain('Today');
  expect(sections[0]).toContain('Fresh work');
  expect(sections[1]).toContain('Earlier');
  expect(sections[1]).toContain('Old research');
  const old = view.querySelector<HTMLElement>('[data-testid="host-session-old"]')!;
  expect(old.getAttribute('aria-selected')).toBe('true');
  expect(
    view.querySelector('[data-testid="host-session-fresh"]')?.getAttribute('aria-selected'),
  ).toBe('false');
  await act(async () => old.click());
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'old' }));
});

it('expands the Search pill into a field only when tapped, and starts a New Session', async () => {
  const onNew = vi.fn();
  const { view, call } = await render({ onNew });
  expect(view.querySelector('[data-testid="session-drawer-search-field"]')).toBeNull();
  await act(async () =>
    view.querySelector<HTMLElement>('[data-testid="session-drawer-new"]')!.click(),
  );
  expect(onNew).toHaveBeenCalledOnce();
  await act(async () =>
    view.querySelector<HTMLElement>('[data-testid="session-drawer-search"]')!.click(),
  );
  const field = view.querySelector<HTMLTextAreaElement>(
    '[data-testid="session-drawer-search-field"]',
  )!;
  expect(field).not.toBeNull();
  expect(view.querySelector('[data-testid="session-drawer-new"]')).toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(field, 'old');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
  expect(call).toHaveBeenLastCalledWith(
    'sessionList',
    expect.objectContaining({ search: 'old' }),
    expect.anything(),
  );
  await act(async () =>
    view.querySelector<HTMLElement>('[data-testid="session-drawer-search-close"]')!.click(),
  );
  expect(view.querySelector('[data-testid="session-drawer-search-field"]')).toBeNull();
});

it('keeps Search and New Session at the window bottom inset, not the tab bar’s', async () => {
  const { view } = await render();
  const footer = view.querySelector<HTMLElement>('[data-testid="session-drawer-footer"]')!;
  expect(JSON.parse(footer.getAttribute('data-style')!)).toMatchObject({ paddingBottom: 34 });
  expect(view.querySelector('[data-testid="keyboard-sticky"]')!.getAttribute('data-opened')).toBe(
    '34',
  );
});

it('hides New Session from a member', async () => {
  const { view } = await render({ canCreate: false });
  expect(view.querySelector('[data-testid="session-drawer-new"]')).toBeNull();
});

it('merges every Computer’s Sessions under All with folder, Bot, status and environment lines', async () => {
  const { view, other } = await render({ second: true });
  expect(other).toHaveBeenCalledOnce();
  const ids = [...view.querySelectorAll('[data-testid^="host-session-"]')].map((row) =>
    row.getAttribute('data-testid'),
  );
  expect(ids).toEqual([
    'host-session-fresh',
    'host-session-remote',
    'host-session-old',
    'host-session-loose',
  ]);
  const remote = view.querySelector('[data-testid="host-session-remote"]')!;
  const top = remote.querySelector('[data-testid="session-top-line-remote"]')!;
  expect(top.querySelector('[data-testid="session-folder-remote"]')?.textContent).toBe(
    'deploy-tools',
  );
  expect(top.querySelector('[data-testid="session-bot-remote"]')).not.toBeNull();
  expect(top.textContent).not.toContain('Ada');
  expect(top.querySelector('[data-host-glyph]')).toBeNull();
  expect(remote.querySelector('[data-testid="session-title-remote"]')?.textContent).toBe(
    'Remote review',
  );
  const host = remote.querySelector('[data-testid="session-host-remote"]')!;
  expect(host.textContent).toBe('Laptop');
  expect(host.querySelector('[data-host-glyph]')).not.toBeNull();
  expect(remote.getAttribute('aria-label')).toContain('Ada');
  expect(remote.getAttribute('aria-label')).toContain('Laptop');
  expect(view.querySelector('[data-testid="session-bot-fresh"]')).toBeNull();
  expect(view.querySelector('[data-testid="session-host-fresh"]')?.textContent).toBe('Studio');
  const status = (id: string) =>
    view
      .querySelector(`[data-testid="session-status-${id}"] [data-status]`)
      ?.getAttribute('data-status');
  expect(status('fresh')).toBe('working');
  expect(status('old')).toBe('needs-you');
  expect(status('remote')).toBe('done');
  expect(view.querySelector('[data-testid="session-status-old"]')?.textContent).toBe('Needs you');
  expect(view.querySelector('[data-testid="session-status-loose"]')?.textContent).toBe(
    'Needs approval',
  );
  expect(view.querySelector('[data-testid="session-folder-loose"]')).toBeNull();
  expect(view.querySelector('[data-testid="session-model-fresh"]')).not.toBeNull();
  expect(view.querySelector('[data-testid="session-model-old"]')).toBeNull();
});

it('puts folder, model and status above the name and drops the environment line in one environment', async () => {
  const { view } = await render();
  const top = view.querySelector('[data-testid="session-top-line-fresh"]')!;
  expect(top.querySelector('[data-testid="session-folder-fresh"]')?.textContent).toBe('botharness');
  expect(top.querySelector('[data-testid="session-model-fresh"]')).not.toBeNull();
  expect(top.querySelector('[data-testid="session-status-fresh"]')).not.toBeNull();
  expect(top.textContent).not.toContain('Fresh work');
  expect(view.querySelector('[data-testid="session-title-fresh"]')?.textContent).toBe('Fresh work');
  expect(view.querySelector('[data-testid^="session-host-"]')).toBeNull();
  expect(view.querySelector('[data-host-glyph]')).toBeNull();
});

it('hides Bot Sessions when the device preference says so and keeps native ones', async () => {
  await act(async () => interfacePreferences.setHideBotSessions(true));
  try {
    const { view } = await render({ second: true });
    const ids = [...view.querySelectorAll('[data-testid^="host-session-"]')].map((row) =>
      row.getAttribute('data-testid'),
    );
    expect(ids).toEqual(['host-session-fresh', 'host-session-old', 'host-session-loose']);
  } finally {
    await act(async () => interfacePreferences.setHideBotSessions(false));
  }
});

it('renders the Stacked-style Session list with ✎ in the header and Search above the rows', async () => {
  const onNew = vi.fn();
  const onOpen = vi.fn();
  const { view } = await render({ variant: 'page', onNew, onOpen });
  expect(view.querySelector('[data-testid="session-list"]')).not.toBeNull();
  expect(view.querySelector('[data-testid="session-drawer"]')).toBeNull();
  expect(view.querySelector('[data-testid="session-drawer-new"]')).toBeNull();
  const search = view.querySelector('[data-testid="session-drawer-search"]')!;
  const list = view.querySelector('[data-testid="host-session-fresh"]')!;
  expect(search.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await act(async () =>
    view.querySelector<HTMLElement>('[data-testid="session-list-new"]')!.click(),
  );
  expect(onNew).toHaveBeenCalledOnce();
  await act(async () =>
    view.querySelector<HTMLElement>('[data-testid="host-session-fresh"]')!.click(),
  );
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'fresh' }));
});

it('hides ✎ from a member on the Stacked-style Session list', async () => {
  const { view } = await render({ variant: 'page', canCreate: false });
  expect(view.querySelector('[data-testid="session-list-new"]')).toBeNull();
});

it('takes the Host’s needs-you rule for list status and falls back for an older Host', async () => {
  const { sessionRowStatus } = await import('../src/features/sessions/session-drawer-row');
  const { readHostSessionList } = await import('@botharness/host-client/host-sessions');
  const read = await readHostSessionList(
    client(
      vi.fn(async () => ({
        queryVersion: 1,
        sources: [{ kind: 'native' }],
        sessions: [
          {
            sessionId: 'failed',
            source: { kind: 'native' },
            running: false,
            status: 'needs-you',
            attention: 'failed',
            updatedAt: now,
          },
          {
            sessionId: 'odd',
            source: { kind: 'native' },
            running: true,
            status: 'later',
            attention: 'maybe',
            updatedAt: now,
          },
        ],
      })),
    ),
    {},
  );
  const [failed, odd] = read.sessions;
  expect(failed).toMatchObject({ status: 'needs-you', attention: 'failed' });
  expect(odd).not.toHaveProperty('status');
  expect(odd).not.toHaveProperty('attention');
  expect(sessionRowStatus(failed!)).toBe('needs-you');
  expect(sessionRowStatus(odd!)).toBe('working');
  expect(sessionRowStatus({ running: true, status: 'idle' })).toBe('done');
  expect(sessionRowStatus({ running: false, status: 'running' })).toBe('working');
  expect(sessionRowStatus({ running: false, attention: 'question' })).toBe('needs-you');
  expect(sessionRowStatus({ running: false, waiting: true })).toBe('needs-you');
  expect(sessionRowStatus({ running: false })).toBe('done');
});

it('shows the cached Sessions at once when the drawer opens again, and refreshes them in the background', async () => {
  const { view, call } = await render();
  expect(view.textContent).toContain('Fresh work');
  act(() => root?.unmount());
  let answer: (value: unknown) => void = () => undefined;
  call.mockImplementation(
    () =>
      new Promise<never>((resolve) => {
        answer = resolve as (value: unknown) => void;
      }),
  );
  const again = document.createElement('div');
  root = createRoot(again);
  await act(async () =>
    root!.render(
      <SessionDrawerPanel
        hosts={[{ hostId: 'studio', hostName: 'Studio', client: client(call) }]}
        title="Studio"
        showHost={false}
        active
        canCreate
        onOpen={() => {}}
        onNew={() => {}}
      />,
    ),
  );
  expect(again.textContent).toContain('Fresh work');
  expect(again.textContent).toContain('Old research');
  expect(call).toHaveBeenCalledTimes(2);
  await act(async () =>
    answer({
      queryVersion: 1,
      sources: [{ kind: 'native' }],
      sessions: [
        {
          sessionId: 'newer',
          title: 'Newer work',
          source: { kind: 'native' },
          running: false,
          lastPromptAt: now,
          updatedAt: now,
        },
      ],
    }),
  );
  await settle();
  expect(again.textContent).toContain('Newer work');
  expect(again.textContent).not.toContain('Old research');
});
