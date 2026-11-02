import { expect, it, vi } from 'vitest';
import { runBrowserNotifications } from '../src/bots/cli-browser-notifications.js';

it('targets the selected live Client and Host with a revision, without requesting OS permission', async () => {
  const http = vi.fn(async () => ({ bytes: new TextEncoder().encode('{"enabled":false}') }));
  const connect = async () => ({ http });
  await runBrowserNotifications('browser-notification-clients', [], {}, {}, connect);
  expect(http).toHaveBeenLastCalledWith('/api/botharness/appearance-control', undefined);
  const target = { 'client-id': 'browser-a', 'remote-host-id': 'host-b' };
  const patch = {
    enabled: false,
    preferences: { approval: false, question: true, 'private-input': true, reply: true },
  };
  await runBrowserNotifications(
    'browser-notifications',
    [],
    { ...target, 'patch-stdin': true, 'expected-revision': 'rev' },
    { readStdin: async () => JSON.stringify(patch) },
    connect,
  );
  expect(http).toHaveBeenLastCalledWith('/api/botharness/appearance-control', {
    action: 'request',
    clientId: 'browser-a',
    notifications: { hostId: 'host-b', patch },
    expectedRevision: 'rev',
  });
  await expect(
    runBrowserNotifications(
      'browser-notifications',
      [],
      { ...target, 'patch-stdin': true },
      {},
      connect,
    ),
  ).rejects.toMatchObject({ code: 'usage' });
});
