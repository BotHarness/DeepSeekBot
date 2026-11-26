import { afterEach, expect, it, vi } from 'vitest';
import { closeServers, host, invoke } from './cli-inbox-fixture.js';

afterEach(async () => {
  vi.restoreAllMocks();
  await closeServers();
});

it('reads native Session requests in Activity with --source and refuses an older Host', async () => {
  const native = {
    id: 'native-session:event-1',
    category: 'action',
    kind: 'native-session-input',
    createdAt: '2026-11-25T10:00:00.000Z',
    botSlug: '',
    summary: 'bash',
    requestId: 'event-1',
    nativeSession: { sessionId: 'native-1', input: 'approval' },
  };
  const live = await host((method, args) =>
    method === 'humanAttentionStatus'
      ? { ok: true, value: { unreadCount: 0, hasAction: true } }
      : {
          ok: true,
          value: {
            items: [native],
            ...(args['source'] ? { source: args['source'] } : {}),
            ...(args['notifications'] ? { notificationVersion: 1 } : {}),
          },
        },
  );
  expect((await invoke(['activity', '--source', 'native'], live.url)).json.items).toEqual([native]);
  expect((await invoke(['activity-status', '--source', 'all'], live.url)).json).toEqual({
    unreadCount: 0,
    hasAction: true,
  });
  expect(
    (await invoke(['activity', '--notifications', '--source', 'all'], live.url)).json.items,
  ).toEqual([native]);
  for (const argv of [
    ['activity', '--source', 'bots'],
    ['activity', '--notifications', '--search', 'x'],
    ['activity-status', '--source', 'everything'],
  ])
    expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
  expect(live.calls).toEqual([
    { method: 'humanAttention', args: { source: 'native' } },
    { method: 'humanAttentionStatus', args: { messageCounts: true, source: 'all' } },
    { method: 'humanAttention', args: { notifications: true, source: 'all' } },
  ]);
  const older = await host(() => ({ ok: true, value: { items: [] } }));
  expect((await invoke(['activity', '--source', 'all'], older.url)).json.error.code).toBe(
    'host-query-unsupported',
  );
  const refusing = await host(() => ({
    ok: false,
    error: { code: 'gateway/arguments-invalid', message: 'unexpected "source"' },
  }));
  for (const argv of [
    ['activity', '--source', 'all'],
    ['activity-status', '--source', 'all'],
  ])
    expect((await invoke(argv, refusing.url)).json.error.code).toBe('host-query-unsupported');
});
