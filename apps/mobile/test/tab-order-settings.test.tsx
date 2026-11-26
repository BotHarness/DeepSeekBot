// @vitest-environment jsdom
import type { RosterBot, RosterChannel, RosterView } from '@botharness/host-client/client';
import { act, createElement, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  roster: undefined as RosterView | undefined,
  push: vi.fn(),
  back: vi.fn(),
}));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
vi.mock('expo-symbols', () => ({
  SymbolView: ({ name }: { name: { ios: string } }) =>
    createElement('i', { 'data-symbol': name.ios }),
}));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: fixture.push, back: fixture.back, canGoBack: () => true }),
}));
vi.mock('../src/host/native-host-look', () => ({ useHostLook: () => ({}) }));
vi.mock('../src/ui/chat/sheet', () => ({ SHEET_GROUP: 'raised' }));
vi.mock('../src/features/pinned-tab/pinned-avatar', () => ({
  PinnedAvatar: ({ conversation }: { conversation?: { key: string } }) =>
    createElement('i', { 'data-avatar': conversation?.key ?? 'none' }),
}));
vi.mock('../src/features/pinned-tab/native-pinned-binding', async () => {
  const { createPinnedBindings } = await import('../src/features/pinned-tab/pinned-binding');
  const pinnedBindings = createPinnedBindings({ read: async () => undefined, write: () => {} });
  return {
    pinnedBindings,
    usePinnedBinding: (hostId: string | undefined) =>
      useSyncExternalStore(pinnedBindings.subscribe, () =>
        hostId === undefined ? undefined : pinnedBindings.binding(hostId),
      ),
  };
});
vi.mock('../src/features/pinned-tab/use-pinned-tab', async () => {
  const { resolvePinnedTarget } = await import('../src/features/pinned-tab/pinned-target');
  const { usePinnedBinding } = await import('../src/features/pinned-tab/native-pinned-binding');
  const { titleOf } = await import('../src/ui/chat/conversations');
  const usePinnedHost = () => {
    const pinned = { hostId: 'h1', roster: fixture.roster };
    return {
      hostId: 'h1',
      host: { saved: { hostId: 'h1', hostName: 'Studio Mac' } },
      pinned,
    };
  };
  return {
    usePinnedHost,
    usePinnedTab: () => {
      const binding = usePinnedBinding('h1');
      const target = resolvePinnedTarget({ hostId: 'h1', roster: fixture.roster }, binding);
      return target === undefined
        ? undefined
        : { conversation: target.conversation, name: titleOf(target.conversation) };
    },
  };
});
vi.mock('../src/ui/primitives/tab-order-list', () => ({
  TabOrderList: ({
    items,
    footer,
    onMove,
  }: {
    items: { key: string; label: string; avatar?: ReactNode }[];
    footer: string;
    onMove(from: number, destination: number): void;
  }) =>
    createElement(
      'section',
      { 'data-testid': 'tab-order-list' },
      createElement('p', null, footer),
      ...items.map((item, index) =>
        createElement(
          'div',
          { key: item.key, 'data-testid': `tab-order-${item.key}` },
          item.label,
          item.avatar ?? null,
          createElement('button', {
            'data-testid': `down-${item.key}`,
            onClick: () => onMove(index, index + 2),
          }),
          createElement('button', {
            'data-testid': `first-${item.key}`,
            onClick: () => onMove(index, 0),
          }),
        ),
      ),
    ),
}));

import { pinnedBindings } from '../src/features/pinned-tab/native-pinned-binding';
import { PinnedConversationSettings } from '../src/features/pinned-tab/pinned-conversation-settings';
import { TabBarLink, TabBarSettings } from '../src/features/pinned-tab/tab-bar-settings';
import { interfacePreferences } from '../src/ui/interface-preferences';
import { defaultTabOrder } from '../src/ui/shell/tab-slots';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const bot = (slug: string, extra: Partial<RosterBot> = {}): RosterBot => ({
  slug,
  displayName: slug === 'tob' ? 'Tob' : slug,
  roles: [],
  computerAccess: false,
  browserAccess: false,
  state: 'idle',
  paused: false,
  dmChannelId: `dm-${slug}`,
  ...extra,
});
const channel = (id: string): RosterChannel => ({ id, name: id, memberCount: 2, members: [] });

let saved: unknown;
beforeAll(async () => {
  await interfacePreferences.restore({
    read: async () => undefined,
    write: (value) => {
      saved = structuredClone(value);
    },
  });
  interfacePreferences.setLanguage('en');
});

afterEach(() => {
  interfacePreferences.setTabOrder(defaultTabOrder);
  interfacePreferences.setSessionsTab(false);
  pinnedBindings.bind('h1', undefined);
  fixture.push.mockReset();
  fixture.back.mockReset();
  fixture.roster = undefined;
});

async function mount(node: ReactNode) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  const press = (id: string) =>
    act(async () => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click());
  const rows = () =>
    [...host.querySelectorAll('[data-testid^="tab-order-"]')]
      .map((node) => node.getAttribute('data-testid')!.slice('tab-order-'.length))
      .filter((key) => key !== 'list' && key !== 'reset');
  return {
    host,
    press,
    rows,
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it('opens the Tab bar page from Settings', async () => {
  const view = await mount(<TabBarLink />);
  try {
    expect(view.host.textContent).toContain(t.tabBarSettings.title);
    await view.press('settings-tab-bar');
    expect(fixture.push).toHaveBeenCalledWith('/settings/tab-bar');
  } finally {
    await view.unmount();
  }
});

it('reorders the visible tabs, keeps hidden Sessions in place and restores the default', async () => {
  fixture.roster = { bots: [bot('tob', { tob: true })], channels: [] } as unknown as RosterView;
  const view = await mount(<TabBarSettings />);
  try {
    expect(view.rows()).toEqual(['chats', 'pinned', 'activity', 'settings']);
    expect(view.host.textContent).toContain(t.tabBarSettings.orderFooterSessions);
    expect(view.host.querySelector('[data-testid="tab-order-pinned"]')!.textContent).toContain(
      'Tob',
    );
    expect(view.host.querySelector('[data-avatar="bot:tob"]')).not.toBeNull();
    expect(view.host.querySelector('[data-testid="tab-order-reset"]')).toBeNull();
    await view.press('down-chats');
    expect(view.rows()).toEqual(['pinned', 'chats', 'activity', 'settings']);
    await view.press('first-settings');
    expect(view.rows()).toEqual(['settings', 'pinned', 'chats', 'activity']);
    expect(interfacePreferences.getSnapshot().tabOrder).toEqual([
      'settings',
      'pinned',
      'chats',
      'sessions',
      'activity',
    ]);
    expect(saved).toEqual(
      expect.objectContaining({
        tabOrder: ['settings', 'pinned', 'chats', 'sessions', 'activity'],
      }),
    );
    await act(async () => interfacePreferences.setSessionsTab(true));
    expect(view.rows()).toEqual(['settings', 'pinned', 'chats', 'sessions', 'activity']);
    expect(view.host.textContent).toContain(t.tabBarSettings.orderFooter);
    await view.press('tab-order-reset');
    expect(view.rows()).toEqual([...defaultTabOrder]);
    expect(view.host.querySelector('[data-testid="tab-order-reset"]')).toBeNull();
  } finally {
    await view.unmount();
  }
});

it('binds the Pinned tab to a chosen conversation and back to the default', async () => {
  fixture.roster = {
    bots: [bot('tob', { tob: true }), bot('ada')],
    channels: [channel('launch')],
  } as unknown as RosterView;
  const settings = await mount(<TabBarSettings />);
  const picker = await mount(<PinnedConversationSettings />);
  try {
    expect(settings.host.textContent).toContain(t.tabBarSettings.pinnedFooter('Studio Mac'));
    await settings.press('settings-pinned-conversation');
    expect(fixture.push).toHaveBeenCalledWith('/settings/pinned-conversation');
    const checked = () =>
      [...picker.host.querySelectorAll('[data-testid^="pinned-choice-"]')]
        .filter((node) => node.querySelector('[data-symbol="checkmark"]') !== null)
        .map((node) => node.getAttribute('data-testid'));
    expect(checked()).toEqual(['pinned-choice-default']);
    expect(picker.host.textContent).toContain(t.tabBarSettings.defaultDetail('Tob'));
    await picker.press('pinned-choice-channel:launch');
    expect(pinnedBindings.binding('h1')).toEqual({ kind: 'channel', id: 'launch' });
    expect(fixture.back).toHaveBeenCalledTimes(1);
    expect(checked()).toEqual(['pinned-choice-channel:launch']);
    expect(settings.host.querySelector('[data-testid="tab-order-pinned"]')!.textContent).toContain(
      'launch',
    );
    await picker.press('pinned-choice-default');
    expect(pinnedBindings.binding('h1')).toBeUndefined();
    expect(checked()).toEqual(['pinned-choice-default']);
  } finally {
    await picker.unmount();
    await settings.unmount();
  }
});
