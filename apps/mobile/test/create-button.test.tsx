// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { push, platform, showActionSheetWithOptions, alert } = vi.hoisted(() => ({
  push: vi.fn(),
  platform: { OS: 'ios' },
  showActionSheetWithOptions: vi.fn(),
  alert: vi.fn(),
}));

vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: platform,
  ActionSheetIOS: { showActionSheetWithOptions },
  Alert: { alert },
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('expo-router', () => {
  const Stack = () => null;
  Stack.Screen = () => null;
  return {
    Redirect: () => null,
    Stack,
    router: { push },
    useIsFocused: () => true,
    useRouter: () => ({ push }),
  };
});
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({
    saved: { hostId: 'h1', hostName: 'studio' },
    client: undefined,
    inbox: undefined,
  }),
  useHostSnapshot: () => ({
    connection: { status: 'connected', route: '' },
    roster: { bots: [], channels: [] },
  }),
  useInbox: () => ({ status: 'loading' }),
}));
vi.mock('../src/host/native-section-collapse', () => ({
  sectionCollapse: { toggle: () => {} },
  useCollapsedSections: () => new Set(),
}));
vi.mock('../src/host/native-host-look', () => ({
  useHostLook: () => ({ avatar: { kind: 'initial' }, banner: { kind: 'accent' } }),
}));
vi.mock('../src/ui/shell/home-header', () => ({
  HomeHeader: ({ actions, children }: { actions: ReactNode; children: ReactNode }) => (
    <>
      <header>{actions}</header>
      {children}
    </>
  ),
}));
vi.mock('../src/ui/shell/host-drawer', () => ({
  HostDrawerEdge: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/shell/human-avatar', () => ({ HumanAvatarButton: () => null }));
vi.mock('../src/ui/connection-banner', () => ({ ConnectionBanner: () => null }));

import HomeScreen from '../app/(tabs)/(home)/index';
import { t } from '../src/ui/strings';
import { appDialogs } from '../src/ui/primitives/dialog-state';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  push.mockReset();
  showActionSheetWithOptions.mockReset();
  alert.mockReset();
  appDialogs.dismiss();
});

async function home(os: 'ios' | 'android'): Promise<HTMLElement> {
  platform.OS = os;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<HomeScreen />));
  return host;
}

const createButton = (view: HTMLElement) =>
  view.querySelector<HTMLButtonElement>(`button[aria-label="${t.cloudJoin.newOrJoin}"]`);

describe('Create from Chats', () => {
  it('iOS: the search + button opens a menu whose choices open their create flow', async () => {
    const view = await home('ios');
    expect(view.querySelector('header')!.contains(createButton(view))).toBe(false);
    expect(createButton(view)!.parentElement!.querySelector('textarea')).not.toBeNull();

    const pick = async (index: number) => {
      await act(async () => createButton(view)!.click());
      const [options, choose] = showActionSheetWithOptions.mock.lastCall!;
      expect(options).toEqual({
        options: [t.newPersonaBot, t.newChannel, t.cloudJoin.title, t.cancel],
        cancelButtonIndex: 3,
      });
      await act(async () => choose(index));
    };

    await pick(0);
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/full-client',
      params: { target: 'new-bot' },
    });
    await pick(1);
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/full-client',
      params: { target: 'new-channel' },
    });
    await pick(2);
    expect(push).toHaveBeenLastCalledWith('/cloud-join');
    await pick(3);
    expect(push).toHaveBeenCalledTimes(3);
  });

  it('Android: the same search + button opens the same choices', async () => {
    const view = await home('android');
    const button = createButton(view)!;
    expect(view.querySelector('header')!.contains(button)).toBe(false);
    expect(button.parentElement!.querySelector('textarea')).not.toBeNull();

    const pick = async (index: number) => {
      await act(async () => button.click());
      const dialog = appDialogs.getSnapshot()!;
      expect(alert).not.toHaveBeenCalled();
      expect(dialog.title).toBe(t.cloudJoin.newOrJoin);
      expect(dialog.message).toBeUndefined();
      expect(dialog.actions.map((choice) => choice.text)).toEqual([
        t.cancel,
        t.cloudJoin.title,
        t.newPersonaBot,
        t.newChannel,
      ]);
      await act(async () => appDialogs.choose(index, dialog.id));
    };
    await pick(1);
    expect(push).toHaveBeenLastCalledWith('/cloud-join');
    await pick(2);
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/full-client',
      params: { target: 'new-bot' },
    });
    await pick(3);
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/full-client',
      params: { target: 'new-channel' },
    });
    await pick(0);
    expect(push).toHaveBeenCalledTimes(3);
    expect(appDialogs.getSnapshot()).toBeUndefined();
  });
});
