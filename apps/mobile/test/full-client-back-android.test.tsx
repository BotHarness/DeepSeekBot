// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({
  prevent: false,
  onPrevent: undefined as undefined | ((event: { data: { action: unknown } }) => void),
  dispatched: [] as unknown[],
  back: vi.fn(),
  goBack: vi.fn(),
  canGoBack: undefined as undefined | ((value: boolean) => void),
  exit: undefined as undefined | (() => void),
}));

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'android' },
  View: ({ children }: { children?: ReactNode }) => createElement('div', {}, children),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ canGoBack: () => true, back: nav.back, replace: vi.fn() }),
  useNavigation: () => ({ dispatch: (action: unknown) => nav.dispatched.push(action) }),
  usePreventRemove: (
    prevent: boolean,
    callback: (event: { data: { action: unknown } }) => void,
  ) => {
    nav.prevent = prevent;
    nav.onPrevent = callback;
  },
}));
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({
    saved: { hostId: 'h', routes: ['https://host.example'], credential: 'c' },
    client: undefined,
  }),
  useHostSnapshot: () => ({ connection: { route: 'https://host.example', status: 'online' } }),
}));
vi.mock('../src/ui/floating-exit', () => ({
  FloatingExit: ({ onExit }: { onExit(): void }) => {
    nav.exit = onExit;
    return null;
  },
}));
vi.mock('../src/ui/full-client-view', () => ({
  FullClientView: (props: { ref: { current: unknown }; onCanGoBack(value: boolean): void }) => {
    props.ref.current = { goBack: nav.goBack };
    nav.canGoBack = props.onCanGoBack;
    return null;
  },
}));
vi.mock('../src/ui/theme', () => ({ useTheme: () => ({ background: '#fff', ink: '#000' }) }));
vi.mock('../src/ui/primitives/system-text', () => ({ Text: () => null }));

import FullClientScreen from '../app/full-client';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => act(() => root?.unmount()));

it('steps back through web history on Android Back, and the exit button still leaves', async () => {
  const host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root!.render(<FullClientScreen />));
  expect(nav.prevent).toBe(false);

  await act(async () => nav.canGoBack!(true));
  expect(nav.prevent).toBe(true);
  const action = { type: 'GO_BACK' };
  nav.onPrevent!({ data: { action } });
  expect(nav.goBack).toHaveBeenCalledTimes(1);
  expect(nav.dispatched).toEqual([]);

  nav.exit!();
  expect(nav.back).toHaveBeenCalledTimes(1);
  nav.onPrevent!({ data: { action } });
  expect(nav.dispatched).toEqual([action]);
  expect(nav.goBack).toHaveBeenCalledTimes(1);
});
