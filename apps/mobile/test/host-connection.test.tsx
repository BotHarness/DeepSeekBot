// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
import type { HostSnapshot } from '../src/host/client';
import type { SavedHost } from '../src/host/hosts';

const clipboard = vi.hoisted(() => ({ setStringAsync: vi.fn(async () => true) }));
const testRoute = vi.hoisted(() => vi.fn(async () => true));
const navigation = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
const connection = vi.hoisted(() => {
  const host: SavedHost = {
    hostId: 'mac',
    hostName: 'Studio Mac',
    routes: [],
    deviceId: 'phone',
    credential: 'test-credential',
  };
  const snapshot: HostSnapshot = { connection: { status: 'stopped', route: '' } };
  return { host, snapshot };
});
vi.mock('expo-router', () => ({
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({ hostId: 'mac' }),
  useRouter: () => navigation,
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
      saved: connection.host,
      client,
      hosts: [connection.host],
    }),
    useHostSnapshot: () => connection.snapshot,
  };
});
import HostConnectionScreen from '../app/host-connection';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeEach(() => {
  connection.host.routes = [];
  delete connection.host.encryption;
  connection.snapshot = {
    connection: { status: 'connected', route: 'http://192.168.1.4:50490' },
    routes: [
      { url: 'http://192.168.1.4:50490', status: 'verified' },
      { url: 'https://mac.tail.ts.net', status: 'unreachable' },
      { url: 'http://localhost:50490', status: 'unchecked' },
    ],
  };
  vi.clearAllMocks();
});

it('does not offer the Host loopback address as a route to the paired computer', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<HostConnectionScreen />));
    expect(host.textContent).toContain('http://192.168.1.4:50490');
    expect(host.textContent).not.toContain('http://localhost:50490');
  } finally {
    await act(async () => root.unmount());
  }
});

it.each([
  'http://localhost:50490',
  'http://127.0.0.1:50490',
  'http://127.2.3.4:50490',
  'http://[::1]:50490',
])('hides cached remote-Host loopback %s without replacing its saved pairing', async (loopback) => {
  const routes = ['https://studio.deepseekbot.dev', loopback];
  connection.host.routes = routes;
  connection.snapshot = { connection: { status: 'stopped', route: '' } };
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<HostConnectionScreen />));
    expect(host.textContent).toContain('https://studio.deepseekbot.dev');
    expect(host.textContent).not.toContain(loopback);
    expect(connection.host.routes).toBe(routes);
    expect(connection.host).toMatchObject({
      hostId: 'mac',
      deviceId: 'phone',
      credential: 'test-credential',
    });
  } finally {
    await act(async () => root.unmount());
  }
});

it('keeps newly learned routes and actual active status instead of choosing the first cached address', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<HostConnectionScreen />));
    connection.snapshot = {
      connection: { status: 'connected', route: 'https://studio.deepseekbot.dev' },
      routes: [
        { url: 'http://127.0.0.1:50490', status: 'verified' },
        { url: 'http://192.168.1.4:50490', status: 'unreachable' },
        { url: 'https://mac.tail.ts.net', status: 'unchecked' },
        { url: 'https://studio.deepseekbot.dev', status: 'verified' },
      ],
    };
    await act(async () => root.render(<HostConnectionScreen />));
    expect(host.textContent).not.toContain('127.0.0.1');
    expect(host.textContent).toContain('Local networkUnreachablehttp://192.168.1.4:50490');
    expect(host.textContent).toContain('ConnectIn usehttps://studio.deepseekbot.dev');
    const test = host.querySelector<HTMLElement>('[data-testid="connection-test-1"]');
    if (!test) throw new Error('missing Tailscale test action');
    await act(async () => test.click());
    expect(testRoute).toHaveBeenCalledWith('https://mac.tail.ts.net');
  } finally {
    await act(async () => root.unmount());
  }
});

it('keeps the explicitly pinned encrypted SSH loopback route visible and testable', async () => {
  connection.host.encryption = {
    protocol: 'connect-noise-xk-v1',
    loopback: 'encrypted',
    hostKey: 'ab'.repeat(32),
    deviceKey: 'cd'.repeat(32),
  };
  connection.snapshot = {
    connection: { status: 'connected', route: 'http://127.0.0.1:32451' },
    routes: [{ url: 'http://127.0.0.1:32451', status: 'verified' }],
  };
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<HostConnectionScreen />));
    expect(host.textContent).toContain('http://127.0.0.1:32451');
    expect(host.textContent).toContain('SSH tunnel');
    const test = host.querySelector<HTMLElement>('[data-testid="connection-test-0"]');
    if (!test) throw new Error('missing SSH test action');
    await act(async () => test.click());
    expect(testRoute).toHaveBeenCalledWith('http://127.0.0.1:32451');
  } finally {
    await act(async () => root.unmount());
  }
});

it('identifies an active Tailscale IP as a remote address instead of this device', async () => {
  connection.snapshot = {
    connection: { status: 'connected', route: 'https://100.64.0.2' },
    routes: [{ url: 'https://100.64.0.2', status: 'verified' }],
  };
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<HostConnectionScreen />));
    expect(host.textContent).toContain('TailscaleIn usehttps://100.64.0.2');
    expect(host.textContent).not.toContain('This device');
  } finally {
    await act(async () => root.unmount());
  }
});

it.each([
  { routes: [] },
  { routes: [{ url: 'https://studio.deepseekbot.dev', status: 'unchecked' as const }] },
])(
  'explains an active cached loopback and keeps address recovery available with other routes %j',
  async ({ routes }) => {
    connection.snapshot = {
      connection: { status: 'connected', route: 'http://127.0.0.1:50490' },
      routes: [{ url: 'http://127.0.0.1:50490', status: 'verified' }, ...routes],
    };
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      await act(async () => root.render(<HostConnectionScreen />));
      expect(host.textContent).not.toContain('127.0.0.1');
      expect(host.textContent).not.toContain('This device');
      expect(host.textContent).toContain('Connected through a local-only address');
      expect(host.textContent).not.toContain('In use');
      const scan = host.querySelector<HTMLElement>('[data-testid="connection-scan-update"]');
      if (!scan) throw new Error('missing address recovery action');
      await act(async () => scan.click());
      expect(navigation.push).toHaveBeenCalledWith('/pair/tailscale');
    } finally {
      await act(async () => root.unmount());
    }
  },
);

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

    vi.useFakeTimers();
    const copy = host.querySelector<HTMLElement>('[data-testid="connection-copy-1"]')!;
    await act(async () => copy.click());
    expect(clipboard.setStringAsync).toHaveBeenCalledWith('https://mac.tail.ts.net');
    expect(copy.textContent).toContain('Address copied');
    await act(async () => vi.advanceTimersByTime(1000));
    await act(async () => copy.click());
    await act(async () => vi.advanceTimersByTime(1000));
    expect(copy.textContent).toContain('Address copied');
    await act(async () => vi.advanceTimersByTime(600));
    expect(copy.textContent).not.toContain('Address copied');
    vi.useRealTimers();

    const probe = host.querySelector<HTMLElement>('[data-testid="connection-test-0"]')!;
    await act(async () => probe.click());
    expect(testRoute).toHaveBeenCalledWith('http://192.168.1.4:50490');
  } finally {
    await act(async () => root.unmount());
  }
});
