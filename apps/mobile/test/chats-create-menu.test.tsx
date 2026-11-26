// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { creationTargets } from '../src/host/creation-targets';
import { computerEnvironmentKey } from '../src/host/conversation-environments';

const fixture = vi.hoisted(() => ({
  push: vi.fn(),
  haptic: vi.fn(),
  botCreation: true,
  peopleDm: false,
}));
vi.mock('react-native', async () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Rect: () => null }));
vi.mock('expo-router', () => ({ router: { push: fixture.push }, useFocusEffect: () => {} }));
vi.mock('../src/ui/haptics', () => ({ haptic: fixture.haptic }));
vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));
vi.mock('../src/ui/shell/header-action', () => ({ HeaderAction: () => null }));
vi.mock('../src/ui/primitives/app-dialog', () => ({ showAppDialog: () => {} }));
vi.mock('../src/cloud/native', () => ({ cloudClient: {} }));
vi.mock('../src/ui/shell/use-creation-targets', () => ({
  useCreationTargets: () =>
    creationTargets({ hostId: 'mac', name: 'Mac' }, []).map((target) => ({
      ...target,
      botCreation: fixture.botCreation,
      peopleDm: fixture.peopleDm,
    })),
}));
vi.mock('../src/host/host-session', () => ({
  useHostSession: (hostId?: string) => ({
    saved: hostId === undefined ? undefined : { hostId },
    client: { hostId },
  }),
}));
vi.mock('../src/ui/shell/message-person-sheet', () => ({
  MessagePersonSheet: ({
    client,
    onOpened,
  }: {
    client: { hostId: string } | undefined;
    onOpened(target: { channelId: string; name: string }): void;
  }) => (
    <button
      data-testid="message-person-sheet"
      data-client={client?.hostId}
      onClick={() => onOpened({ channelId: 'dm-humans-bob', name: 'Bob' })}
    />
  ),
}));
import { nativeCreateItem, useChatsCreate, type ChatsCreate } from '../src/ui/shell/chats-create';
import { ChatsHeaderActions } from '../src/ui/shell/chats-header-actions';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let latest: ChatsCreate | undefined;

function ChatsCreateHarness({ scope }: { scope: string }) {
  const create = useChatsCreate(scope);
  latest = create;
  return (
    <>
      <ChatsHeaderActions search={{ label: 'Search', onPress: () => {} }} create={create.button} />
      {create.sheet}
    </>
  );
}

async function withMenu(scope: string, check: (host: HTMLElement) => Promise<void>) {
  const host = document.createElement('div');
  const root = createRoot(host);
  fixture.push.mockClear();
  fixture.haptic.mockClear();
  try {
    await act(async () => root.render(<ChatsCreateHarness scope={scope} />));
    await check(host);
  } finally {
    act(() => root.unmount());
    fixture.botCreation = true;
    fixture.peopleDm = false;
  }
}

async function press(host: HTMLElement, id: string) {
  const button = host.querySelector<HTMLButtonElement>(`[data-testid="chats-create-${id}"]`)!;
  await act(async () => button.click());
}

it.each([undefined, 'mac'])('routes every Bot source with host %s', async (hostId) => {
  await withMenu(hostId ? computerEnvironmentKey(hostId) : 'all', async (host) => {
    for (const [source, pathname] of [
      ['blank', '/create-bot'],
      ['marketplace', '/marketplace'],
      ['zip', '/import-bot-zip'],
      ['git', '/import-bot-git'],
    ]) {
      await press(host, 'button');
      expect(host.querySelector('[data-testid="chats-create-menu"]')).not.toBeNull();
      await press(host, source!);
      expect(fixture.push).toHaveBeenLastCalledWith({
        pathname,
        params: hostId ? { entry: 'host', hostId } : { entry: 'all' },
      });
      expect(host.querySelector('[data-testid="chats-create-menu"]')).toBeNull();
    }
    expect(fixture.haptic).toHaveBeenCalledTimes(4);
  });
});

it('keeps New Group available on a Computer that denies Bot creation', async () => {
  fixture.botCreation = false;
  await withMenu(computerEnvironmentKey('mac'), async (host) => {
    await press(host, 'button');
    expect(host.querySelector('[data-testid="chats-create-blank"]')).toBeNull();
    expect(latest?.button?.bot).toBeUndefined();
    await press(host, 'group');
    expect(fixture.push).toHaveBeenCalledExactlyOnceWith({
      pathname: '/create-channel',
      params: { entry: 'host', hostId: 'mac' },
    });
  });
});

it('shows no header + when nothing can be created in the scope', async () => {
  await withMenu('another-source', async (host) => {
    expect(host.querySelector('[data-testid="chats-create-button"]')).toBeNull();
    expect(latest).toEqual({ button: undefined, nativeItem: undefined, sheet: null });
  });
});

it('builds the iOS bar button as a native menu with a Create Bot submenu', async () => {
  await withMenu(computerEnvironmentKey('mac'), async () => {
    const item = nativeCreateItem(latest!.button!);
    expect(item).toMatchObject({
      type: 'menu',
      identifier: 'chats-create-button',
      icon: { type: 'sfSymbol', name: 'plus' },
      sharesBackground: true,
    });
    if (item.type !== 'menu') throw new Error('expected a native menu');
    const [bot, ...rest] = item.menu.items;
    expect(bot).toMatchObject({ type: 'submenu' });
    if (bot?.type !== 'submenu') throw new Error('expected a Bot submenu');
    expect(bot.items.map((entry) => entry.icon)).toEqual([
      { type: 'sfSymbol', name: 'plus' },
      { type: 'sfSymbol', name: 'square.grid.2x2' },
      { type: 'sfSymbol', name: 'doc.zipper' },
      { type: 'sfSymbol', name: 'point.3.connected.trianglepath.dotted' },
    ]);
    expect(rest.map((entry) => entry.type)).toEqual(['action']);
    const group = rest[0];
    if (group?.type !== 'action') throw new Error('expected New Group');
    act(() => group.onPress());
    expect(fixture.push).toHaveBeenCalledExactlyOnceWith({
      pathname: '/create-channel',
      params: { entry: 'host', hostId: 'mac' },
    });
  });
});

it('opens Message a person in a sheet and lands in the picked DM', async () => {
  fixture.botCreation = false;
  fixture.peopleDm = true;
  await withMenu(computerEnvironmentKey('mac'), async (host) => {
    expect(host.querySelector('[data-testid="message-person-sheet"]')).toBeNull();
    await press(host, 'button');
    await press(host, 'person');
    const sheet = host.querySelector<HTMLButtonElement>('[data-testid="message-person-sheet"]')!;
    expect(sheet.dataset['client']).toBe('mac');
    await act(async () => sheet.click());
    expect(fixture.push).toHaveBeenCalledExactlyOnceWith({
      pathname: '/channel/[id]',
      params: { id: 'dm-humans-bob', hostId: 'mac', person: 'Bob' },
    });
    expect(host.querySelector('[data-testid="message-person-sheet"]')).toBeNull();
  });
});

it('hides Message a person without the people DM permission', async () => {
  fixture.botCreation = false;
  await withMenu(computerEnvironmentKey('mac'), async (host) => {
    await press(host, 'button');
    expect(host.querySelector('[data-testid="chats-create-person"]')).toBeNull();
    expect(latest?.button?.actions.map((entry) => entry.id)).toEqual(['group']);
  });
});
