import { describe, expect, it } from 'vitest';

import { DEFAULT_HOST_LOOK } from '../../../apps/mobile/src/ui/design/host-look.js';
import {
  HOST_LOOKS_STORAGE_KEY,
  browserHostLooks,
  unusedHostLook,
} from '../src/client/host-looks.js';

describe('unusedHostLook', () => {
  it('gives each newly paired Host a symbol and colour no other Host uses', () => {
    const first = unusedHostLook([DEFAULT_HOST_LOOK]);
    const second = unusedHostLook([DEFAULT_HOST_LOOK, first]);
    expect(first).toEqual({ icon: { kind: 'symbol', id: 'laptop' }, color: 'blue' });
    expect(second.icon).not.toEqual(first.icon);
    expect(second.color).not.toBe(first.color);
  });

  it('skips looks the user already chose', () => {
    const look = unusedHostLook([{ icon: { kind: 'symbol', id: 'laptop' }, color: 'blue' }]);
    expect(look).toEqual({ icon: { kind: 'symbol', id: 'server' }, color: 'orange' });
  });
});

describe('browserHostLooks', () => {
  it('stores looks in this browser only', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    } as unknown as Storage;
    const looks = browserHostLooks(storage);
    await Promise.resolve();
    looks.set('host-b', { icon: { kind: 'emoji', emoji: '🏠' }, color: 'green' });
    expect(looks.look('host-b')).toEqual({ icon: { kind: 'emoji', emoji: '🏠' }, color: 'green' });
    expect(JSON.parse(values.get(HOST_LOOKS_STORAGE_KEY) ?? '{}')).toHaveProperty('host-b');
  });
});
