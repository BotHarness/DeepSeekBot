import { afterEach, expect, it, vi } from 'vitest';

import { secure, remotes } from './host-session-fixture';
import { FakeHost } from './fake-host';
vi.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, listener: (state: string) => void) => {
      lifecycle.push(listener);
      return { remove() {} };
    },
  },
  Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options['ios'] },
}));
const lifecycle: Array<(state: string) => void> = [];
let session: typeof import('../src/host/host-session').hostSession;
afterEach(async () => {
  for (const host of session?.getState().hosts ?? []) await session.unpair(host.hostId);
});

it('loads both paired Hosts without replacing the other connection when browsing changes', async () => {
  const a = new FakeHost('a');
  const b = new FakeHost('b');
  remotes.set('a.tailnet.ts.net', a);
  remotes.set('b.tailnet.ts.net', b);
  const hosts = ['a', 'b'].map((hostId) => ({
    hostId,
    hostName: hostId,
    routes: [`https://${hostId}.tailnet.ts.net`],
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
  const second = session.getHost('b')!.client;
  for (const listener of lifecycle) listener('background');
  a.up = false;
  b.methods.set('list', () => ({
    bots: [{ slug: 'missed', displayName: 'Caught up', roles: [], state: 'idle', paused: false }],
  }));
  for (const listener of lifecycle) listener('active');
  await vi.waitFor(() =>
    expect(second.getSnapshot().roster?.bots.some((bot) => bot.slug === 'missed')).toBe(true),
  );
  expect(session.getHost('b')?.client).toBe(second);
  await session.unpair('a');
  expect(session.getHost('a')).toBeUndefined();
  expect(session.getHost('b')?.client).toBe(second);
  expect(second.getSnapshot().connection.status).toBe('connected');
});
