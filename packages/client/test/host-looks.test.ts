import { afterEach, describe, expect, it, vi } from 'vitest';

import { controlHostLook } from '../src/client/host-look-control.js';
import {
  DEFAULT_HOST_LOOK,
  withHostColor,
  withHostIcon,
  withHostName,
} from '../../../apps/mobile/src/ui/design/host-look.js';
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

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    clear: () => values.clear(),
    removeItem: (key: string) => values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

function lockManager() {
  let tail = Promise.resolve();
  const request = vi.fn((_name: string, _options: unknown, work: () => Promise<void>) => {
    const result = tail.then(work);
    tail = result.catch(() => {});
    return result;
  });
  vi.stubGlobal('navigator', { locks: { request } });
  return request;
}

afterEach(() => vi.unstubAllGlobals());

describe('browserHostLooks', () => {
  it('uses the same Web Lock across owners and merges only the selected Host against persisted data', async () => {
    const locks = lockManager();
    const storage = memoryStorage();
    const a = browserHostLooks(storage);
    const b = browserHostLooks(storage);
    await Promise.all([a.ready, b.ready]);
    const request = { signal: new AbortController().signal, expiresAt: Date.now() + 8000 };
    const before = await controlHostLook(b, { hostId: 'b' }, undefined, request, () => true);
    await a.update('b', (current) => withHostName(current, 'Tab A'));
    await expect(
      controlHostLook(
        b,
        { hostId: 'b', patch: { name: 'Tab B' } },
        before.revision,
        request,
        () => true,
      ),
    ).rejects.toThrow('host-look-revision-stale');
    await a.update('a', (current) => withHostName(current, 'Other Host'));
    await b.update('b', (current) => withHostColor(current, 'teal'));
    await Promise.all([
      a.update('b', (current) => withHostIcon(current, { kind: 'emoji', emoji: '🏠' })),
      b.update('b', (current) => withHostName(current, 'Latest')),
    ]);
    const stored = JSON.parse(storage.getItem(HOST_LOOKS_STORAGE_KEY) ?? '{}');
    expect(stored.a.name).toBe('Other Host');
    expect(stored.b).toEqual({
      name: 'Latest',
      icon: { kind: 'emoji', emoji: '🏠' },
      color: 'teal',
    });
    expect(
      locks.mock.calls.every(
        ([name, options]) =>
          name === HOST_LOOKS_STORAGE_KEY && JSON.stringify(options) === '{"mode":"exclusive"}',
      ),
    ).toBe(true);
  });

  it('refuses unavailable Web Locks without reading or writing storage', async () => {
    vi.stubGlobal('navigator', {});
    const storage = memoryStorage();
    const looks = browserHostLooks(storage);
    await looks.ready;
    await expect(looks.read('b')).rejects.toThrow('host-look-lock-unavailable');
    await expect(looks.update('b', (current) => withHostName(current, 'Unsafe'))).rejects.toThrow(
      'host-look-lock-unavailable',
    );
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('keeps known state and blocks writes after corrupt storage until explicit recovery', async () => {
    lockManager();
    const storage = memoryStorage();
    const looks = browserHostLooks(storage);
    await looks.update('b', (current) => withHostName(current, 'Known'));
    const known = looks.look('b');
    storage.setItem(HOST_LOOKS_STORAGE_KEY, '{bad');
    await expect(looks.read('b')).rejects.toThrow('host-look-storage-read-failed');
    expect(looks.look('b')).toBe(known);
    storage.setItem.mockClear();
    await expect(looks.update('b', (current) => withHostName(current, 'Unsafe'))).rejects.toThrow(
      'host-look-storage-read-failed',
    );
    expect(storage.setItem).not.toHaveBeenCalled();
    storage.setItem(HOST_LOOKS_STORAGE_KEY, JSON.stringify({ b: known, a: DEFAULT_HOST_LOOK }));
    await looks.refresh();
    await looks.update('b', (current) => withHostColor(current, 'blue'));
    expect(JSON.parse(storage.getItem(HOST_LOOKS_STORAGE_KEY) ?? '{}')).toEqual({
      b: { ...known, color: 'blue' },
      a: DEFAULT_HOST_LOOK,
    });
  });

  it('checks expiry immediately before localStorage setItem', async () => {
    lockManager();
    const storage = memoryStorage();
    const looks = browserHostLooks(storage);
    await looks.ready;
    let expired = false;
    const stringify = JSON.stringify;
    vi.spyOn(JSON, 'stringify').mockImplementation((value) => {
      const result = stringify(value);
      expired = true;
      return result;
    });
    try {
      await expect(
        looks.update(
          'b',
          (current) => withHostName(current, 'Late'),
          () => {
            if (expired) throw new Error('appearance-request-stale');
          },
        ),
      ).rejects.toThrow('appearance-request-stale');
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(looks.error()).toBeUndefined();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
