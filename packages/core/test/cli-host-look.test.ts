import { expect, it, vi } from 'vitest';
import { CliLiveError } from '../src/bots/cli-live-error.js';
import { runHostLook } from '../src/bots/cli-host-look.js';

it('targets exactly the selected Client and Host through the existing relay', async () => {
  const http = vi.fn(async () => ({ bytes: new TextEncoder().encode('{"hostId":"b","revision":"rev"}') }));
  const connect = async () => ({ http });
  const expiresAt = Date.now() + 8000;
  const target = { 'client-id': 'browser-a', 'host-id': 'b' };
  expect(await runHostLook([], target, {}, connect, expiresAt)).toEqual({ hostId: 'b', revision: 'rev' });
  expect(http).toHaveBeenLastCalledWith('/api/botharness/appearance-control', {
    action: 'request', clientId: 'browser-a', expiresAt, hostLook: { hostId: 'b' },
  });
  const patch = { name: 'Studio', icon: { kind: 'symbol', id: 'server' }, color: 'orange' };
  await runHostLook([], { ...target, 'patch-stdin': true, 'expected-revision': 'rev' }, { readStdin: async () => JSON.stringify(patch) }, connect, expiresAt);
  expect(http).toHaveBeenLastCalledWith('/api/botharness/appearance-control', {
    action: 'request', clientId: 'browser-a', expiresAt, hostLook: { hostId: 'b', patch }, expectedRevision: 'rev',
  });
});

it('refuses missing targets, unguarded writes and malformed stdin before connecting', async () => {
  const connect = vi.fn();
  const expiresAt = Date.now() + 8000;
  for (const values of [{}, { 'client-id': 'a' }, { 'host-id': 'b' }, { 'client-id': 'a', 'host-id': 'b', 'patch-stdin': true }])
    await expect(runHostLook([], values, {}, connect, expiresAt)).rejects.toMatchObject({ code: 'usage' });
  await expect(runHostLook([], { 'client-id': 'a', 'host-id': 'b', 'patch-stdin': true, 'expected-revision': 'rev' }, { readStdin: async () => '{bad' }, connect, expiresAt)).rejects.toMatchObject({ code: 'invalid-input' });
  expect(connect).not.toHaveBeenCalled();
});

it('forwards explicit recovery and refuses a deadline spent reading stdin', async () => {
  const http = vi.fn(async () => ({ bytes: new TextEncoder().encode('{}') }));
  const connect = vi.fn(async () => ({ http }));
  const values = { 'client-id': 'a', 'host-id': 'b' };
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    await runHostLook([], { ...values, refresh: true }, {}, connect, 2000);
    expect(http).toHaveBeenCalledWith('/api/botharness/appearance-control', { action: 'request', clientId: 'a', expiresAt: 2000, hostLook: { hostId: 'b', refresh: true } });
    connect.mockClear();
    await expect(runHostLook([], { ...values, 'patch-stdin': true, 'expected-revision': 'rev' }, { readStdin: async () => { now.mockReturnValue(2001); return '{"name":"Late"}'; } }, connect, 2000)).rejects.toMatchObject({ code: 'appearance-request-stale' });
    expect(connect).not.toHaveBeenCalled();
  } finally { now.mockRestore(); }
});

it.each(['host-unreachable', 'appearance-client-timeout', 'appearance-client-stale'])(
  'reports %s after submission as unknown outcome, not cancellation', async (code) => {
    const connect = async () => ({ http: async () => { throw new CliLiveError(code, code); } });
    await expect(runHostLook([], { 'client-id': 'a', 'host-id': 'b', 'patch-stdin': true, 'expected-revision': 'rev' }, { readStdin: async () => '{"name":"Studio"}' }, connect, Date.now() + 8000)).rejects.toMatchObject({ code: 'host-look-outcome-unknown', message: expect.stringContaining('Read the same Client and Host') });
  },
);
