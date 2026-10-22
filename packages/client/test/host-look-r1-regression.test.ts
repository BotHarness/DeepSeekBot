import { expect, it, vi } from 'vitest';
import { createHostLooks } from '../../../apps/mobile/src/host/host-look.js';
import { DEFAULT_HOST_LOOK, type HostLook } from '../../../apps/mobile/src/ui/design/host-look.js';
import { runHostLook } from '../../core/src/bots/cli-host-look.js';
import { controlHostLook } from '../src/client/host-look-control.js';

it('R1 P2-1 rejects a stale persisted revision across independent owners', async () => {
  let stored: Record<string, HostLook> = {};
  let tail = Promise.resolve();
  const storage = {
    read: async () => stored,
    write: (value: Record<string, HostLook>) => { stored = value; },
    transaction: (work: () => Promise<void>) => {
      const pending = tail.then(work);
      tail = pending.catch(() => {});
      return pending;
    },
  };
  const a = createHostLooks(storage);
  const b = createHostLooks(storage);
  await Promise.all([a.ready, b.ready]);
  const request = { signal: new AbortController().signal, expiresAt: Date.now() + 8000 };
  const before = await controlHostLook(b, { hostId: 'b' }, undefined, request, () => true);
  await controlHostLook(a, { hostId: 'b', patch: { name: 'A saved' } }, before.revision, request, () => true);
  await expect(Promise.resolve().then(() => controlHostLook(b, { hostId: 'b', patch: { name: 'B stale' } }, before.revision, request, () => true))).rejects.toThrow('host-look-revision-stale');
  expect(stored.b?.name).toBe('A saved');
});

it('R1 P2-2 does not submit a write after its CLI expiry is spent on stdin', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const http = vi.fn(async () => ({ bytes: new TextEncoder().encode('{}') }));
  const connect = vi.fn(async () => ({ http }));
  try {
    await expect(runHostLook([], { 'client-id': 'a', 'host-id': 'b', 'patch-stdin': true, 'expected-revision': 'rev' }, {
      readStdin: async () => { now.mockReturnValue(1101); return '{"name":"Late"}'; },
    }, connect, 1100)).rejects.toMatchObject({ code: 'appearance-request-stale' });
    expect(connect).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
  } finally { now.mockRestore(); }
});

it('R1 P2-3 refuses a default read and overwrite after failed initial storage read', async () => {
  const write = vi.fn();
  const looks = createHostLooks({ read: async () => { throw new Error('read denied'); }, write });
  await looks.ready;
  const request = { signal: new AbortController().signal, expiresAt: Date.now() + 8000 };
  await expect(Promise.resolve().then(() => controlHostLook(looks, { hostId: 'b' }, undefined, request, () => true))).rejects.toThrow('host-look-storage-read-failed');
  await expect(Promise.resolve().then(() => controlHostLook(looks, { hostId: 'b', patch: { name: 'Unsafe' } }, JSON.stringify(DEFAULT_HOST_LOOK), request, () => true))).rejects.toThrow('host-look-storage-read-failed');
  expect(write).not.toHaveBeenCalled();
});
