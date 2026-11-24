// @vitest-environment jsdom
import { act, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { HostClient } from '@botharness/host-client/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Circle: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-keyboard-controller', () => ({
  KeyboardStickyView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (work: () => void | (() => void)) => useLayoutEffect(work, [work]),
}));
vi.mock('../src/ui/shell/icons', () => import('./shell-icons-shim'));
vi.mock('../src/ui/bot-avatar', () => ({ BotPortrait: () => null }));
vi.mock('../src/ui/chat/model-brand-icon', () => ({ ModelBrandIcon: () => null }));
vi.mock('../src/ui/chat/row-status-glyph', () => ({
  RowStatusGlyph: ({ status }: { status: string }) => <span data-status={status} />,
}));
vi.mock('../src/ui/shell/host-tile', () => ({ HostGlyph: () => <span data-host-glyph="" /> }));
vi.mock('../src/host/native-host-look', () => ({
  useHostLook: () => ({ icon: { kind: 'symbol', id: 'desktop' } }),
}));
vi.mock('../src/ui/primitives/drawer-material', () => ({
  DrawerMaterial: () => null,
  useLiquidGlass: () => false,
}));

import { SessionDrawerPanel } from '../src/features/sessions/session-drawer-panel';
import { interfacePreferences } from '../src/ui/interface-preferences';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
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
  props: { onOpen?(): void; onNew?(): void; canCreate?: boolean; second?: boolean } = {},
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
      />,
    ),
  );
  return { view, call, other };
}

it('lists Sessions by day with the open one highlighted under the Environment name', async () => {
  const onOpen = vi.fn();
  const { view, call } = await render({ onOpen });
  expect(view.querySelector('[data-testid="session-drawer-environment"]')?.textContent).toBe(
    'Studio',
  );
  expect(call).toHaveBeenCalledWith(
    'sessionList',
    { search: '', sort: 'last-human-turn', source: 'all', queryVersion: 1 },
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
    view.querySelector<HTMLElement>('[data-testid="session-drawer-search-cancel"]')!.click(),
  );
  expect(view.querySelector('[data-testid="session-drawer-search-field"]')).toBeNull();
});

it('hides New Session from a member', async () => {
  const { view } = await render({ canCreate: false });
  expect(view.querySelector('[data-testid="session-drawer-new"]')).toBeNull();
});

it('merges every Computer’s Sessions under All with the three-column rows', async () => {
  const { view, other } = await render({ second: true });
  expect(other).toHaveBeenCalledOnce();
  const ids = [...view.querySelectorAll('[data-testid^="host-session-"]')].map((row) =>
    row.getAttribute('data-testid'),
  );
  expect(ids).toEqual(['host-session-fresh', 'host-session-remote', 'host-session-old']);
  const remote = view.querySelector('[data-testid="host-session-remote"]')!;
  const place = remote.querySelector('[data-testid="session-place-remote"]')!;
  expect(place.textContent).toBe('Laptop · deploy-tools');
  expect(place.querySelector('[data-host-glyph]')).not.toBeNull();
  expect(remote.querySelector('[data-testid="session-bot-remote"]')).not.toBeNull();
  expect(view.querySelector('[data-testid="session-monogram-fresh"]')?.textContent).toBe('BO');
  expect(view.querySelector('[data-testid="session-monogram-old"]')?.textContent).toBe('笔');
  const status = (id: string) =>
    view
      .querySelector(`[data-testid="session-status-${id}"] [data-status]`)
      ?.getAttribute('data-status');
  expect(status('fresh')).toBe('working');
  expect(status('old')).toBe('needs-you');
  expect(status('remote')).toBe('done');
  expect(view.querySelector('[data-testid="session-model-fresh"]')).not.toBeNull();
  expect(view.querySelector('[data-testid="session-model-old"]')).toBeNull();
});

it('hides Bot Sessions when the device preference says so and keeps native ones', async () => {
  await act(async () => interfacePreferences.setHideBotSessions(true));
  try {
    const { view } = await render({ second: true });
    const ids = [...view.querySelectorAll('[data-testid^="host-session-"]')].map((row) =>
      row.getAttribute('data-testid'),
    );
    expect(ids).toEqual(['host-session-fresh', 'host-session-old']);
  } finally {
    await act(async () => interfacePreferences.setHideBotSessions(false));
  }
});
