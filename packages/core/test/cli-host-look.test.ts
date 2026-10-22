import { expect, it, vi } from 'vitest';
import { runHostLook } from '../src/bots/cli-host-look.js';

it('targets exactly the selected Client and Host through the existing relay', async () => {
  const http = vi.fn(async () => ({ bytes: new TextEncoder().encode('{"hostId":"b","revision":"rev"}') }));
  const connect = async () => ({ http });
  const target = { 'client-id': 'browser-a', 'host-id': 'b' };
  expect(await runHostLook([], target, {}, connect)).toEqual({ hostId: 'b', revision: 'rev' });
  expect(http).toHaveBeenLastCalledWith('/api/botharness/appearance-control', {
    action: 'request', clientId: 'browser-a', hostLook: { hostId: 'b' },
  });
  const patch = { name: 'Studio', icon: { kind: 'symbol', id: 'server' }, color: 'orange' };
  await runHostLook([], { ...target, 'patch-stdin': true, 'expected-revision': 'rev' }, { readStdin: async () => JSON.stringify(patch) }, connect);
  expect(http).toHaveBeenLastCalledWith('/api/botharness/appearance-control', {
    action: 'request', clientId: 'browser-a', hostLook: { hostId: 'b', patch }, expectedRevision: 'rev',
  });
});

it('refuses missing targets, unguarded writes and malformed stdin before connecting', async () => {
  const connect = vi.fn();
  for (const values of [{}, { 'client-id': 'a' }, { 'host-id': 'b' }, { 'client-id': 'a', 'host-id': 'b', 'patch-stdin': true }])
    await expect(runHostLook([], values, {}, connect)).rejects.toMatchObject({ code: 'usage' });
  await expect(runHostLook([], { 'client-id': 'a', 'host-id': 'b', 'patch-stdin': true, 'expected-revision': 'rev' }, { readStdin: async () => '{bad' }, connect)).rejects.toMatchObject({ code: 'invalid-input' });
  expect(connect).not.toHaveBeenCalled();
});
