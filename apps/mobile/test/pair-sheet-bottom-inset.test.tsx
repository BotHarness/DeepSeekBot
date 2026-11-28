// @vitest-environment jsdom
import { act, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Circle: () => null, Path: () => null }));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
const scroll = vi.hoisted(() => ({ content: undefined as unknown }));
vi.mock('../src/ui/primitives/keyboard-form', () => ({
  KeyboardFormScroll: (props: { contentContainerStyle?: unknown; children?: ReactNode }) => {
    scroll.content = props.contentContainerStyle;
    return <div data-testid="pair-scroll">{props.children}</div>;
  },
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 48, left: 0 }),
}));
vi.mock('expo-camera', () => ({
  Camera: { scanFromURLAsync: vi.fn() },
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false }, vi.fn()],
}));
vi.mock('expo-application', () => ({
  nativeApplicationVersion: '1.6.1',
  nativeBuildVersion: '42',
}));
vi.mock('expo-device', () => ({ osVersion: '16' }));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn(async () => true) }));
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (focus: () => void | (() => void)) => useLayoutEffect(focus, [focus]),
}));
vi.mock('../src/ui/shell/use-pairing', () => ({
  usePairing: () => ({
    busy: false,
    error: undefined,
    method: 'qr',
    canRetry: false,
    connectionName: '',
    setConnectionName: vi.fn(),
    pair: vi.fn(),
    abort: vi.fn(),
    forget: vi.fn(),
  }),
}));
vi.mock('../src/ui/shell/pairing-verification', () => ({ PairingVerification: () => null }));
vi.mock('expo-secure-store', () => ({}));

import PairScreen from '../app/pair/tailscale';
import { space } from '../src/ui/design/tokens';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('__DEV__', false);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function paddingBottom(style: unknown): number | undefined {
  const flat = [style].flat(Infinity).filter(Boolean) as Record<string, number>[];
  return flat.reduce<number | undefined>(
    (bottom, item) => item['paddingBottom'] ?? item['paddingVertical'] ?? item['padding'] ?? bottom,
    undefined,
  );
}

it('ends the pairing sheet scroll above the navigation bar and home indicator', async () => {
  await act(async () => root!.render(<PairScreen />));
  expect(host.querySelector('[data-testid="pair-scroll"]')).not.toBeNull();
  expect(paddingBottom(scroll.content)).toBe(48 + space.x5);
});
