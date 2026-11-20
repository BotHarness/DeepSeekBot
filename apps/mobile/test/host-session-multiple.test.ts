import { afterEach, expect, it, vi } from 'vitest';

import {
  secure,
  remotes,
  refreshNotificationPermission,
  preferenceSync,
  preferenceRetry,
} from './host-session-fixture';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';
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
  refreshNotificationPermission.mockClear();
  for (const listener of lifecycle) listener('background');
  expect(refreshNotificationPermission).not.toHaveBeenCalled();
  a.up = false;
  b.methods.set('list', () => ({
    bots: [{ slug: 'missed', displayName: 'Caught up', roles: [], state: 'idle', paused: false }],
  }));
  for (const listener of lifecycle) listener('active');
  expect(refreshNotificationPermission).toHaveBeenCalledOnce();
  await vi.waitFor(() =>
    expect(second.getSnapshot().roster?.bots.some((bot) => bot.slug === 'missed')).toBe(true),
  );
  expect(session.getHost('b')?.client).toBe(second);
  await session.unpair('a');
  expect(session.getHost('a')).toBeUndefined();
  expect(session.getHost('b')?.client).toBe(second);
  expect(second.getSnapshot().connection.status).toBe('connected');
});

it('retries preferences for the Host that connected and stops syncing a refused Host', async () => {
  const a = new FakeHost('a');
  const b = new FakeHost('b');
  b.revoked = true;
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
  vi.resetModules();
  preferenceSync.mockClear();
  preferenceRetry.mockClear();
  session = (await import('../src/host/host-session')).hostSession;
  await vi.waitFor(() =>
    expect(session.getHost('b')?.client.getSnapshot().connection.status).toBe('refused'),
  );
  await vi.waitFor(() =>
    expect(preferenceSync.mock.calls.at(-1)?.[0].map((host) => host.hostId)).toEqual(['a']),
  );
  await vi.waitFor(() => expect(preferenceRetry).toHaveBeenCalled());
  expect(preferenceRetry.mock.calls.map(([host]) => host?.hostId)).toEqual(['a']);
});

it('revokes the replaced member grant on the Host after a confirmed identity switch', async () => {
  const host = new FakeHost('m');
  remotes.set('m.tailnet.ts.net', host);
  const member = (humanId: string, credential: string) => ({
    hostId: 'm',
    hostName: 'm',
    routes: ['https://m.tailnet.ts.net'],
    deviceId: `device-${humanId}`,
    credential,
    member: {
      humanId,
      displayName: humanId,
      username: humanId,
      fingerprint: 'a'.repeat(64),
      mustChangePassword: false,
    },
  });
  session = (await import('../src/host/host-session')).hostSession;
  expect(await session.pairMember(member('alice', host.credential))).toMatchObject({ ok: true });
  expect(session.getState().saved?.member?.humanId).toBe('alice');
  const bob = member('bob', 'member.bob');
  expect(await session.pairMember(bob)).toEqual({ ok: false, code: 'identity-switch-required' });
  expect(host.requests.some((r) => r.endsWith('/botharness-device/unpair'))).toBe(false);
  expect(await session.pairMember(bob, { confirmedIdentitySwitch: true })).toMatchObject({
    ok: true,
  });
  expect(session.getState().saved?.member?.humanId).toBe('bob');
  await vi.waitFor(() =>
    expect(host.requests).toContain('POST https://m.tailnet.ts.net/botharness-device/unpair'),
  );
});
