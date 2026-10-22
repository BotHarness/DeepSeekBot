import { expect, it, vi } from 'vitest';
import { createHostLooks } from '../../../apps/mobile/src/host/host-look.js';
import { DEFAULT_HOST_LOOK } from '../../../apps/mobile/src/ui/design/host-look.js';

it('preserves the native synchronous set and one-time legacy migration contracts', async () => {
  const write = vi.fn();
  const forgetLegacyImages = vi.fn();
  const looks = createHostLooks({
    read: async () => ({ a: { name: 'Phone', banner: { kind: 'color', color: '#2f80ed' } } }),
    write,
    forgetLegacyImages,
  });
  await looks.ready;
  expect(looks.look('a')).toEqual({ name: 'Phone', icon: DEFAULT_HOST_LOOK.icon, color: 'blue' });
  expect(forgetLegacyImages).toHaveBeenCalledOnce();
  const result = looks.set('b', { ...DEFAULT_HOST_LOOK, name: 'Native edit' });
  expect(result).toBeUndefined();
  expect(looks.look('b').name).toBe('Native edit');
  expect(write).toHaveBeenLastCalledWith({ a: looks.look('a'), b: looks.look('b') });
});

it('settles native readiness after a failed read without permitting a default-map overwrite', async () => {
  const read = vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error('disk unavailable'));
  const write = vi.fn();
  const looks = createHostLooks({ read, write });
  await expect(looks.ready).resolves.toBeUndefined();
  expect(() => looks.set('b', { ...DEFAULT_HOST_LOOK, name: 'Unsafe' })).not.toThrow();
  expect(write).not.toHaveBeenCalled();
  await expect(looks.read('b')).rejects.toThrow('host-look-storage-read-failed');
  read.mockResolvedValue({ a: { ...DEFAULT_HOST_LOOK, name: 'Existing' } });
  await looks.refresh();
  looks.set('b', { ...DEFAULT_HOST_LOOK, name: 'Recovered' });
  expect(write).toHaveBeenLastCalledWith({
    a: { ...DEFAULT_HOST_LOOK, name: 'Existing' },
    b: { ...DEFAULT_HOST_LOOK, name: 'Recovered' },
  });
});
