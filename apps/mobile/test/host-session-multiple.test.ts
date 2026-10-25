import { afterEach, expect, it, vi } from 'vitest';

import { secure, remotes } from './host-session-fixture';
import { FakeHost } from './fake-host';
vi.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options['ios'] },
}));
let session: typeof import('../src/host/host-session').hostSession;
afterEach(async () => {
  for (const host of session?.getState().hosts ?? []) await session.unpair(host.hostId);
});

it('loads both paired Hosts without replacing the other connection when browsing changes', async () => {
  const a = new FakeHost();
  const b = new FakeHost();
  remotes.set('a.example', a);
  remotes.set('b.example', b);
  const hosts = ['a', 'b'].map((hostId) => ({
    hostId,
    hostName: hostId,
    routes: [`https://${hostId}.example`],
    deviceId: 'device-1',
    credential: a.credential,
  }));
  secure.set('deepseekbot.hosts.v3', JSON.stringify({ hosts, current: 'a' }));
  session = (await import('../src/host/host-session')).hostSession;
  await vi.waitFor(() => expect(a.requests.some((r) => r.includes('roster'))).toBe(true));
  await vi.waitFor(() => expect(b.requests.some((r) => r.includes('roster'))).toBe(true));
  const first = session.getState().client;
  await session.switchTo('b');
  expect(first?.getSnapshot().connection.status).toBe('connected');
  await session.switchTo('a');
  expect(session.getState().client).toBe(first);
});
