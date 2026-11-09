import { afterEach, expect, it, vi } from 'vitest';
import { secure, remotes } from './host-session-fixture';
import { FakeHost } from './fake-host';

const native = vi.hoisted(() => ({ lifecycle: [] as Array<(state: string) => void> }));
vi.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, listener: (state: string) => void) => {
      native.lifecycle.push(listener);
      return { remove() {} };
    },
  },
  Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options['ios'] },
}));
vi.mock('../src/host/native-connection-mode', () => ({
  connectionMode: {
    supported: false,
    updateSummary() {},
    getSnapshot: () => ({ enabled: false, running: false, error: null }),
    subscribe: () => () => {},
    onApproval: () => () => {},
    resume: async () => {},
    syncHosts: async () => {},
    reconcile: async () => {},
    forget: async () => {},
    reportAlertFailure() {},
  },
}));
let session: typeof import('../src/host/host-session').hostSession;
afterEach(async () => {
  for (const host of session?.getState().hosts ?? []) await session.unpair(host.hostId);
});

it('keeps a call’s Host connection on foreground resume where the connection mode is unsupported', async () => {
  const host = new FakeHost('a');
  remotes.set('a.tailnet.ts.net', host);
  secure.set(
    'deepseekbot.hosts.v3',
    JSON.stringify({
      hosts: [
        {
          hostId: 'a',
          hostName: 'Mac',
          routes: ['https://a.tailnet.ts.net'],
          deviceId: 'device-1',
          credential: host.credential,
        },
      ],
      current: 'a',
    }),
  );
  const module = await import('../src/host/host-session');
  session = module.hostSession;
  await vi.waitFor(() =>
    expect(session.getHost('a')?.snapshot.connection.status).toBe('connected'),
  );
  const client = session.getHost('a')!.client;
  const retry = vi.spyOn(client, 'retryNow');
  const resume = () => {
    for (const listener of native.lifecycle) listener('background');
    for (const listener of native.lifecycle) listener('active');
  };

  const release = module.retainHostConnection(client);
  resume();
  expect(retry).toHaveBeenLastCalledWith('resume', { preserveConnected: true });

  release();
  release();
  resume();
  expect(retry).toHaveBeenLastCalledWith('resume', { preserveConnected: false });
});
