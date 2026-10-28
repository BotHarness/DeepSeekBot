// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const clipboard = vi.hoisted(() => ({ setStringAsync: vi.fn(async () => true) }));
const testRoute = vi.hoisted(() => vi.fn(async () => true));
vi.mock('expo-router', () => ({
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({ hostId: 'mac' }),
  useRouter: () => ({ back() {}, push() {} }),
}));
vi.mock('expo-clipboard', () => clipboard);
vi.mock('../src/ui/chat/sheet', () => ({ SHEET_GROUP: 'raised' }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-symbols', () => ({ SymbolView: () => <i data-rn-symbol /> }));
vi.mock('../src/host/native-carrier', () => ({ nativeCarrier: () => ({}) }));
vi.mock('../src/host/client', () => ({ createHostClient: () => undefined }));
vi.mock('../src/host/host-session', () => {
  const client = { testRoute };
  return {
    useHostSession: () => ({
      saved: { hostId: 'mac' },
      client,
      hosts: [{ hostId: 'mac', hostName: 'Studio Mac', routes: [] }],
    }),
    useHostSnapshot: () => ({
      connection: { status: 'connected', route: 'http://192.168.1.4:50490' },
      routes: [
        { url: 'http://192.168.1.4:50490', status: 'verified' },
        { url: 'https://mac.tail.ts.net', status: 'unreachable' },
      ],
    }),
  };
});
import HostConnectionScreen from '../app/host-connection';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('groups each route as a settings section with native copy and test rows', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<HostConnectionScreen />));
    const text = host.textContent ?? '';
    expect(text).toContain('Studio Mac');
    expect(text).toContain('Tailscale');
    expect(host.querySelector('[data-testid="host-connection"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="connection-scan-update"]')).toBeNull();
    expect(host.querySelectorAll('[data-rn-symbol]').length).toBeGreaterThanOrEqual(5);

    const copy = host.querySelector<HTMLElement>('[data-testid="connection-copy-1"]')!;
    await act(async () => copy.click());
    expect(clipboard.setStringAsync).toHaveBeenCalledWith('https://mac.tail.ts.net');

    const probe = host.querySelector<HTMLElement>('[data-testid="connection-test-0"]')!;
    await act(async () => probe.click());
    expect(testRoute).toHaveBeenCalledWith('http://192.168.1.4:50490');
  } finally {
    await act(async () => root.unmount());
  }
});
