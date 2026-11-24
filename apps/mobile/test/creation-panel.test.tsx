// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { creationTargets } from '../src/host/creation-targets';
import { computerEnvironmentKey } from '../src/host/conversation-environments';

const fixture = vi.hoisted(() => ({ push: vi.fn(), haptic: vi.fn(), botCreation: true }));
vi.mock('react-native', async () => {
  const { useLayoutEffect } = await import('react');
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    Modal: ({
      visible,
      onShow,
      children,
    }: {
      visible: boolean;
      onShow(): void;
      children: ReactNode;
    }) => {
      useLayoutEffect(() => {
        if (visible) onShow();
      }, [visible]);
      return visible ? <section role="dialog">{children}</section> : null;
    },
    ScrollView: ({
      onLayout,
      ...props
    }: {
      onLayout(event: { nativeEvent: { layout: { height: number } } }): void;
      children: ReactNode;
    }) => {
      useLayoutEffect(() => onLayout({ nativeEvent: { layout: { height: 120 } } }), []);
      return <shim.View {...props} />;
    },
  };
});
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Rect: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-gesture-handler', () => {
  const pan = {
    enabled: () => pan,
    activeOffsetX: () => pan,
    failOffsetY: () => pan,
    onEnd: () => pan,
  };
  const Wrapper = ({ children }: { children: ReactNode }) => children;
  return { Gesture: { Pan: () => pan }, GestureDetector: Wrapper, GestureHandlerRootView: Wrapper };
});
vi.mock('react-native-reanimated', async () => {
  const { useRef } = await import('react');
  const { View } = await import('./react-native-shim');
  const animate = (value: number, _config: unknown, complete?: (finished: boolean) => void) => {
    complete?.(true);
    return value;
  };
  return {
    default: { View },
    useSharedValue: (value: number) => useRef({ value }).current,
    useAnimatedStyle: () => ({}),
    withTiming: animate,
    withSpring: animate,
    runOnJS: (handler: unknown) => handler,
    ReduceMotion: { Never: 'never' },
    Easing: { out: () => undefined },
  };
});
vi.mock('expo-router', () => ({ router: { push: fixture.push }, useFocusEffect: () => {} }));
vi.mock('../src/ui/haptics', () => ({ haptic: fixture.haptic }));
vi.mock('../src/ui/primitives/use-system-reduced-motion', () => ({
  useSystemReducedMotion: () => false,
}));
vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));
vi.mock('../src/ui/shell/header-action', () => ({ HeaderAction: () => null }));
vi.mock('../src/ui/primitives/drawer-material', () => ({ DrawerMaterial: () => null }));
vi.mock('../src/ui/primitives/app-dialog', () => ({ showAppDialog: () => {} }));
vi.mock('../src/cloud/native', () => ({ cloudClient: {} }));
vi.mock('../src/ui/shell/use-creation-targets', () => ({
  useCreationTargets: () =>
    creationTargets({ hostId: 'mac', name: 'Mac' }, []).map((target) => ({
      ...target,
      botCreation: fixture.botCreation,
    })),
}));
import { useChatsCreate } from '../src/ui/shell/chats-create';
import { ChatsHeaderActions } from '../src/ui/shell/chats-header-actions';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(HTMLElement.prototype, {
  measureInWindow(done: (x: number, y: number, width: number, height: number) => void) {
    done(330, 50, 44, 44);
  },
});

function ChatsCreate({ scope }: { scope: string }) {
  const create = useChatsCreate(scope);
  return (
    <>
      <ChatsHeaderActions search={{ label: 'Search', onPress: () => {} }} create={create.button} />
      {create.panel}
    </>
  );
}

async function withCard(
  scope: string,
  check: (host: HTMLElement, press: (id: string) => Promise<void>) => Promise<void>,
) {
  const host = document.createElement('div');
  const root = createRoot(host);
  const press = async (id: string) => {
    const button = host.querySelector<HTMLButtonElement>(`[data-testid="chats-create-${id}"]`)!;
    await act(async () => button.click());
  };
  fixture.push.mockClear();
  fixture.haptic.mockClear();
  try {
    await act(async () => root.render(<ChatsCreate scope={scope} />));
    await press('button');
    await check(host, press);
  } finally {
    act(() => root.unmount());
    fixture.botCreation = true;
  }
}

it.each([undefined, 'mac'])(
  'keeps the Bot sources inside the card and routes them with host %s',
  async (hostId) => {
    await withCard(hostId ? computerEnvironmentKey(hostId) : 'all', async (host, press) => {
      const dialog = () => host.querySelector('[role="dialog"]');
      const trigger = host.querySelector<HTMLButtonElement>('[data-testid="chats-create-button"]')!;
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(trigger.disabled).toBe(true);
      await press('bot');
      expect(dialog()?.querySelector('[data-testid="chats-create-sources-list"]')).not.toBeNull();
      expect(fixture.push).not.toHaveBeenCalled();
      await press('back');
      expect(dialog()?.querySelector('[data-testid="chats-create-actions-list"]')).not.toBeNull();
      expect(fixture.push).not.toHaveBeenCalled();

      for (const [source, pathname] of [
        ['blank', '/create-bot'],
        ['marketplace', '/marketplace'],
        ['zip', '/import-bot-zip'],
        ['git', '/import-bot-git'],
      ]) {
        if (!dialog()) await press('button');
        await press('bot');
        await press(source!);
        expect(fixture.push).toHaveBeenLastCalledWith({
          pathname,
          params: hostId ? { entry: 'host', hostId } : { entry: 'all' },
        });
        expect(dialog()).toBeNull();
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(trigger.disabled).toBe(false);
      }
    });
  },
);

it('keeps New Group available on a Computer that denies Bot creation', async () => {
  fixture.botCreation = false;
  await withCard(computerEnvironmentKey('mac'), async (host, press) => {
    expect(host.querySelector('[data-testid="chats-create-bot"]')).toBeNull();
    await press('group');
    expect(fixture.push).toHaveBeenCalledExactlyOnceWith({
      pathname: '/create-channel',
      params: { entry: 'host', hostId: 'mac' },
    });
  });
});

it('shows no header + when nothing can be created in the scope', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<ChatsCreate scope="another-source" />));
    expect(host.querySelector('[data-testid="chats-create-button"]')).toBeNull();
  } finally {
    act(() => root.unmount());
  }
});

it('grows the card from the measured header + and acknowledges the press once', async () => {
  await withCard('all', async (host, press) => {
    expect(fixture.haptic).toHaveBeenCalledExactlyOnceWith('menu');
    await press('button');
    expect(fixture.haptic).toHaveBeenCalledOnce();
    const card = host.querySelector<HTMLElement>('[data-testid="chats-create-card"]')!;
    expect(JSON.parse(card.dataset.style!)).toMatchObject({ top: 50, right: 16 });
  });
});
