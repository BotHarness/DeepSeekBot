import { afterEach, expect, it, vi } from 'vitest';
import { secure, remotes } from './host-session-fixture';
import { FakeHost } from './fake-host';

const native = vi.hoisted(() => ({
  running: true,
  listeners: new Set<() => void>(),
  forgotten: [] as string[],
  lifecycle: [] as Array<(state: string) => void>,
}));
vi.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, listener: (state: string) => void) => {
      native.lifecycle.push(listener);
      return { remove() {} };
    },
  },
  Platform: { OS: 'android', select: (options: Record<string, unknown>) => options['android'] },
}));
vi.mock('../src/host/native-connection-mode', () => ({
  connectionMode: {
    supported: true,
    updateSummary() {},
    getSnapshot: () => ({ enabled: native.running, running: native.running, error: null }),
    subscribe: (listener: () => void) => {
      native.listeners.add(listener);
      return () => native.listeners.delete(listener);
    },
    onApproval: () => () => {},
    resume: async () => {},
    syncHosts: async () => {},
    reconcile: async () => {},
    forget: async (id: string) => {
      native.forgotten.push(id);
    },
    reportAlertFailure() {},
  },
}));
let session: typeof import('../src/host/host-session').hostSession;
afterEach(async () => {
  for (const host of session?.getState().hosts ?? []) await session.unpair(host.hostId);
});

it('isolates background opt-out, refusal and unpairing across two shared Host clients', async () => {
  const a = new FakeHost('a');
  const b = new FakeHost('b');
  remotes.set('a.tailnet.ts.net', a);
  remotes.set('b.tailnet.ts.net', b);
  const hosts = ['a', 'b'].map((hostId) => ({
    hostId,
    hostName: 'Same name',
    routes: [`https://${hostId}.tailnet.ts.net`],
    deviceId: 'device-1',
    credential: a.credential,
  }));
  secure.set('deepseekbot.hosts.v3', JSON.stringify({ hosts, current: 'a' }));
  const module = await import('../src/host/host-session');
  session = module.hostSession;
  await vi.waitFor(() =>
    expect(session.getHost('a')?.snapshot.connection.status).toBe('connected'),
  );
  await vi.waitFor(() =>
    expect(session.getHost('b')?.snapshot.connection.status).toBe('connected'),
  );
  const first = session.getHost('a')!.client;
  const second = session.getHost('b')!.client;
  module.setHostNotificationsEnabled('a', true);
  module.setHostNotificationsEnabled('b', true);
  await session.switchTo('b');
  for (const listener of native.lifecycle) listener('background');
  expect(first.getSnapshot().connection.status).toBe('connected');
  expect(second.getSnapshot().connection.status).toBe('connected');
  module.setHostNotificationsEnabled('a', false);
  expect(first.getSnapshot().connection.status).toBe('stopped');
  expect(second.getSnapshot().connection.status).toBe('connected');
  for (const listener of native.lifecycle) listener('active');
  await vi.waitFor(() => expect(first.getSnapshot().connection.status).toBe('connected'));
  a.revoke();
  await vi.waitFor(() => expect(first.getSnapshot().connection.status).toBe('refused'));
  await vi.waitFor(() => expect(native.forgotten).toContain('a'));
  const attempts = a.requests.length;
  for (const listener of native.lifecycle) listener('background');
  for (const listener of native.lifecycle) listener('active');
  expect(first.getSnapshot().connection.status).toBe('refused');
  expect(a.requests.length).toBe(attempts);
  expect(native.forgotten).not.toContain('b');
  await session.unpair('a');
  expect(session.getHost('b')!.client).toBe(second);
  await vi.waitFor(() => expect(second.getSnapshot().connection.status).toBe('connected'));
  native.running = false;
  for (const listener of native.listeners) listener();
  expect(second.getSnapshot().connection.status).toBe('connected');
  for (const listener of native.lifecycle) listener('background');
  expect(second.getSnapshot().connection.status).toBe('stopped');
});
