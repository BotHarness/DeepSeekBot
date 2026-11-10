import { afterEach, expect, it, vi } from 'vitest';
import { secure, remotes } from './host-session-fixture';
import { FakeHost } from './fake-host';

interface Reconciled {
  inApp?: boolean;
  pending: string[];
  alerts: Array<{ data: { itemId: string } }>;
}
const native = vi.hoisted(() => ({ snapshots: [] as unknown[] }));
vi.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options['ios'] },
}));
vi.mock('../src/host/native-connection-mode', () => ({
  connectionMode: {
    supported: false,
    updateSummary() {
      throw new Error('No connection summary on iOS');
    },
    getSnapshot: () => ({ enabled: false, running: false, error: null }),
    subscribe: () => () => {},
    onApproval: () => () => {},
    resume: async () => {},
    syncHosts: async () => {},
    reconcile: async (snapshot: unknown) => {
      native.snapshots.push(snapshot);
    },
    forget: async () => {},
    reportAlertFailure() {},
  },
}));
let session: typeof import('../src/host/host-session').hostSession;
afterEach(async () => {
  for (const host of session?.getState().hosts ?? []) await session.unpair(host.hostId);
});

it('feeds in-app only banners on iOS, where there is no background connection mode', async () => {
  const host = new FakeHost('a');
  const approval = {
    id: 'approval:1',
    category: 'action',
    kind: 'tool-approval',
    botSlug: 'ada',
    channelId: 'dm:ada',
    channelName: 'Ada',
    summary: 'Run tests',
    messageId: 'm1',
    createdAt: '2026-11-10T00:00:00.000Z',
  };
  host.methods.set('humanAttention', (args) =>
    args['notifications'] === true
      ? { notificationVersion: 1, items: [approval] }
      : { queryVersion: 1, items: args['category'] === 'action' ? [approval] : [] },
  );
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
  module.setHostDelivery('a', 'in-app');
  module.setHostNotificationsEnabled('a', true);
  await vi.waitFor(() =>
    expect(
      (native.snapshots as Reconciled[]).some(
        (snapshot) =>
          snapshot.inApp === true &&
          snapshot.pending.includes('approval:1') &&
          snapshot.alerts.some((alert) => alert.data.itemId === 'approval:1'),
      ),
    ).toBe(true),
  );
});
