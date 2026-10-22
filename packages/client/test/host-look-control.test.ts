import { describe, expect, it, vi } from 'vitest';
import { createHostLooks } from '../../../apps/mobile/src/host/host-look.js';
import { shownHostName } from '../../../apps/mobile/src/ui/design/host-look.js';
import { controlHostLook } from '../src/client/host-look-control.js';

async function setup() {
  const write = vi.fn();
  const looks = createHostLooks({ read: async () => ({}), write });
  await Promise.resolve();
  const abort = new AbortController();
  const request = { signal: abort.signal, expiresAt: Date.now() + 8000 };
  const available = (id: string) => id === 'host-b';
  const read = () => controlHostLook(looks, { hostId: 'host-b' }, undefined, request, available);
  return { looks, write, abort, request, available, read };
}

describe('Host look Client control', () => {
  it('writes the shared owner and persists the same normalized local name, icon and colour', async () => {
    const { looks, write, request, available, read } = await setup();
    const before = read();
    const saved = controlHostLook(looks, { hostId: 'host-b', patch: {
      name: '  Studio  ', icon: { kind: 'emoji', emoji: '🏠' }, color: 'teal',
    } }, before.revision, request, available);
    expect(saved.look).toEqual({ name: 'Studio', icon: { kind: 'emoji', emoji: '🏠' }, color: 'teal' });
    expect(looks.look('host-b')).toBe(saved.look);
    expect(write).toHaveBeenLastCalledWith({ 'host-b': saved.look });
    expect(shownHostName(saved.look, 'system-hostname')).toBe('Studio');
    expect(looks.look('host-a')).toEqual(before.look);
    const reset = controlHostLook(looks, { hostId: 'host-b', patch: { name: '', color: null } }, saved.revision, request, available);
    expect(reset.look).toEqual({ icon: saved.look.icon });
    expect(shownHostName(reset.look, 'system-hostname')).toBe('system-hostname');
  });

  it('refuses a stale UI revision and reports storage failure without publishing an unsaved look', async () => {
    const { looks, write, request, available, read } = await setup();
    const before = read();
    looks.set('host-b', { ...before.look, name: 'UI change' });
    expect(() => controlHostLook(looks, { hostId: 'host-b', patch: { name: 'CLI change' } }, before.revision, request, available))
      .toThrow('host-look-revision-stale');
    const current = read();
    const notify = vi.fn();
    looks.subscribe(notify);
    write.mockImplementation(() => { throw new Error('quota'); });
    expect(() => controlHostLook(looks, { hostId: 'host-b', patch: { color: 'blue' } }, current.revision, request, available))
      .toThrow('host-look-storage-failed');
    expect(read()).toEqual(current);
    expect(notify).not.toHaveBeenCalled();
  });

  it.each(['expired', 'cancelled', 'removed', 'expires-before-write', 'removed-before-write'])(
    'does not persist a %s request', async (reason) => {
      const { write, looks, request, abort, read } = await setup();
      const before = read();
      if (reason === 'expired') request.expiresAt = Date.now();
      if (reason === 'cancelled') abort.abort();
      let calls = 0;
      const available = () => {
        calls++;
        if (reason === 'expires-before-write') request.expiresAt = Date.now();
        return reason !== 'removed' && (reason !== 'removed-before-write' || calls === 1);
      };
      expect(() => controlHostLook(looks, { hostId: 'host-b', patch: { name: 'late' } }, before.revision, request, available)).toThrow();
      expect(write).not.toHaveBeenCalled();
      expect(looks.look('host-b')).toBe(before.look);
    },
  );

  it.each([{ name: 42 }, { icon: { kind: 'symbol', id: 'unknown' } }, { color: 'invalid' }, { arbitrary: true }, null, []])(
    'rejects invalid input before storage: %j', async (patch) => {
      const { write, looks, request, available, read } = await setup();
      expect(() => controlHostLook(looks, { hostId: 'host-b', patch }, read().revision, request, available)).toThrow('host-look-invalid-input');
      expect(write).not.toHaveBeenCalled();
    },
  );
});
