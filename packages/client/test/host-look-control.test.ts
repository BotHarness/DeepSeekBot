import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHostLooks } from '../../../apps/mobile/src/host/host-look.js';
import { shownHostName, type HostLook } from '../../../apps/mobile/src/ui/design/host-look.js';
import { controlHostLook } from '../src/client/host-look-control.js';

async function setup() {
  let stored: Record<string, HostLook> = {};
  const write = vi.fn((value: Record<string, HostLook>) => {
    stored = value;
  });
  const looks = createHostLooks({ read: async () => stored, write });
  await looks.ready;
  const abort = new AbortController();
  const request = { signal: abort.signal, expiresAt: Date.now() + 8000 };
  const available = (id: string) => id === 'host-b';
  const read = () => controlHostLook(looks, { hostId: 'host-b' }, undefined, request, available);
  return { looks, write, abort, request, available, read };
}

afterEach(() => vi.useRealTimers());

describe('Host look Client control', () => {
  it('writes the shared owner and persists the same normalized local name, icon and colour', async () => {
    const { looks, write, request, available, read } = await setup();
    const before = await read();
    const saved = await controlHostLook(
      looks,
      {
        hostId: 'host-b',
        patch: {
          name: '  Studio  ',
          icon: { kind: 'emoji', emoji: '🏠' },
          color: 'teal',
        },
      },
      before.revision,
      request,
      available,
    );
    expect(saved.look).toEqual({
      name: 'Studio',
      icon: { kind: 'emoji', emoji: '🏠' },
      color: 'teal',
    });
    expect(looks.look('host-b')).toEqual(saved.look);
    expect(write).toHaveBeenLastCalledWith({ 'host-b': saved.look }, expect.any(Function));
    expect(shownHostName(saved.look, 'system-hostname')).toBe('Studio');
    expect(looks.look('host-a')).toEqual(before.look);
    const reset = await controlHostLook(
      looks,
      { hostId: 'host-b', patch: { name: '', color: null } },
      saved.revision,
      request,
      available,
    );
    expect(reset.look).toEqual({ icon: saved.look.icon });
    expect(shownHostName(reset.look, 'system-hostname')).toBe('system-hostname');
  });

  it('refuses stale revisions and keeps the last known look after write failure', async () => {
    const { looks, write, request, available, read } = await setup();
    const before = await read();
    looks.set('host-b', { ...before.look, name: 'UI change' });
    await expect(
      controlHostLook(
        looks,
        { hostId: 'host-b', patch: { name: 'CLI change' } },
        before.revision,
        request,
        available,
      ),
    ).rejects.toThrow('host-look-revision-stale');
    const current = await read();
    write.mockImplementation(() => {
      throw new Error('quota');
    });
    await expect(
      controlHostLook(
        looks,
        { hostId: 'host-b', patch: { color: 'blue' } },
        current.revision,
        request,
        available,
      ),
    ).rejects.toThrow('host-look-storage-failed');
    expect(looks.look('host-b')).toEqual(current.look);
    await expect(read()).rejects.toThrow('host-look-storage-failed');
  });

  it.each(['expired', 'cancelled', 'removed', 'expires-before-write', 'removed-before-write'])(
    'does not persist a %s request',
    async (reason) => {
      const { write, looks, request, abort, read } = await setup();
      const before = await read();
      if (reason === 'expired') request.expiresAt = Date.now();
      if (reason === 'cancelled') abort.abort();
      let calls = 0;
      const available = () => {
        calls++;
        if (reason === 'expires-before-write') request.expiresAt = Date.now();
        return reason !== 'removed' && (reason !== 'removed-before-write' || calls === 1);
      };
      await expect(
        controlHostLook(
          looks,
          { hostId: 'host-b', patch: { name: 'late' } },
          before.revision,
          request,
          available,
        ),
      ).rejects.toThrow();
      expect(write).not.toHaveBeenCalled();
      expect(looks.look('host-b')).toBe(before.look);
    },
  );

  it.each([
    { name: 42 },
    { icon: { kind: 'symbol', id: 'unknown' } },
    { color: 'invalid' },
    { arbitrary: true },
    null,
    [],
  ])('rejects invalid input before storage: %j', async (patch) => {
    const { write, looks, request, available, read } = await setup();
    await expect(
      controlHostLook(
        looks,
        { hostId: 'host-b', patch },
        (await read()).revision,
        request,
        available,
      ),
    ).rejects.toThrow('host-look-invalid-input');
    expect(write).not.toHaveBeenCalled();
  });

  it('refuses reads and writes after failed hydration until an explicit refresh succeeds', async () => {
    const stored = { 'host-b': { name: 'Stored', icon: { kind: 'symbol', id: 'server' } } };
    const read = vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error('denied'));
    const write = vi.fn();
    const looks = createHostLooks({ read, write });
    await expect(looks.ready).resolves.toBeUndefined();
    const request = { signal: new AbortController().signal, expiresAt: Date.now() + 8000 };
    const control = (input: unknown, revision?: string) =>
      controlHostLook(looks, input, revision, request, () => true);
    await expect(control({ hostId: 'host-b' })).rejects.toMatchObject({
      code: 'host-look-storage-read-failed',
    });
    read.mockResolvedValue(stored);
    await expect(
      control(
        { hostId: 'host-b', patch: { name: 'Overwrite' } },
        JSON.stringify(looks.look('host-b')),
      ),
    ).rejects.toThrow('host-look-storage-read-failed');
    expect(write).not.toHaveBeenCalled();
    expect(await control({ hostId: 'host-b', refresh: true })).toMatchObject({
      look: stored['host-b'],
    });
    read.mockRejectedValue(new Error('locked read failed'));
    await expect(
      control({ hostId: 'host-b', patch: { name: 'Overwrite' } }, JSON.stringify(stored['host-b'])),
    ).rejects.toThrow('host-look-storage-read-failed');
    expect(looks.look('host-b')).toEqual(stored['host-b']);
    expect(write).not.toHaveBeenCalled();
  });

  it('checks wall time after waiting for a lock even when no timeout callback has run', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let hold = false;
    const write = vi.fn();
    const looks = createHostLooks({
      read: async () => ({}),
      write,
      transaction: async (work) => {
        if (hold) {
          entered();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        await work();
      },
    });
    await looks.ready;
    hold = true;
    const pending = controlHostLook(
      looks,
      { hostId: 'host-b', patch: { name: 'Late' } },
      JSON.stringify(looks.look('host-b')),
      { signal: new AbortController().signal, expiresAt: 1100 },
      () => true,
    );
    const refused = expect(pending).rejects.toThrow('appearance-request-stale');
    await waiting;
    vi.setSystemTime(1101);
    release();
    await refused;
    expect(write).not.toHaveBeenCalled();
  });
});
