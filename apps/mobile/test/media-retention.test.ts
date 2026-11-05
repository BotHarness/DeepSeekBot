import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  autoCleanupEnabled,
  cachedMediaUri,
  clearHostMedia,
  evictMedia,
  installMediaStore,
  mediaUsage,
  runAutoCleanup,
  setAutoCleanup,
  type MediaStore,
} from '../src/host/media-cache';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 5);

function memoryStore(files: Record<string, { size: number; modified: number }>, settings?: string) {
  const disk = new Map(Object.entries(files));
  let saved = settings;
  const store: MediaStore = {
    uri: (key) => (disk.has(key) ? `file:///${key}` : undefined),
    write: async (key, bytes) => {
      disk.set(key, { size: bytes.length, modified: Date.now() });
      return `file:///${key}`;
    },
    download: async (key) => `file:///${key}`,
    forget: (prefixes) => {
      for (const key of [...disk.keys()])
        if (prefixes.some((prefix) => key.startsWith(prefix))) disk.delete(key);
    },
    entries: () => [...disk].map(([key, file]) => ({ key, ...file })),
    remove: (keys) => keys.forEach((key) => disk.delete(key)),
    readSettings: () => saved,
    writeSettings: (text) => {
      saved = text;
    },
  };
  return { store, disk, saved: () => saved };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

it('deletes media not opened for 30 days and keeps media opened recently', () => {
  const { store, disk } = memoryStore({
    'mac-a/file:old:v1': { size: 100, modified: NOW - 40 * DAY },
    'mac-a/file:seen:v1': { size: 200, modified: NOW - 40 * DAY },
    'mac-a/file:new:v1': { size: 300, modified: NOW - 2 * DAY },
  });
  installMediaStore(store);
  vi.setSystemTime(NOW - 5 * DAY);
  expect(cachedMediaUri('mac-a/file:seen:v1')).toBeDefined();
  vi.setSystemTime(NOW);
  expect(autoCleanupEnabled()).toBe(true);
  expect(runAutoCleanup(NOW)).toBe(1);
  expect([...disk.keys()].sort()).toEqual(['mac-a/file:new:v1', 'mac-a/file:seen:v1']);
});

it('keeps everything when automatic cleanup is off, and remembers the choice', () => {
  const files = { 'mac-a/file:old:v1': { size: 100, modified: NOW - 400 * DAY } };
  const first = memoryStore(files);
  installMediaStore(first.store);
  setAutoCleanup(false);
  vi.advanceTimersByTime(3000);
  const restarted = memoryStore(files, first.saved());
  installMediaStore(restarted.store);
  expect(autoCleanupEnabled()).toBe(false);
  expect(runAutoCleanup(NOW)).toBe(0);
  expect(restarted.disk.size).toBe(1);
});

it('remembers when media was last opened across restarts', () => {
  const files = { 'mac-a/file:seen:v1': { size: 1, modified: NOW - 90 * DAY } };
  const first = memoryStore(files);
  installMediaStore(first.store);
  cachedMediaUri('mac-a/file:seen:v1');
  vi.advanceTimersByTime(3000);
  const restarted = memoryStore(files, first.saved());
  installMediaStore(restarted.store);
  expect(runAutoCleanup(NOW + DAY)).toBe(0);
});

it('measures and clears one Computer without touching another', () => {
  const { store, disk } = memoryStore({
    'mac-a/file:x:v1': { size: 100, modified: NOW - 200 * DAY },
    'mac-a/file:y:v1': { size: 50, modified: NOW },
    'mac-b/file:x:v1': { size: 70, modified: NOW - 200 * DAY },
  });
  installMediaStore(store);
  expect(mediaUsage('mac-a')).toBe(150);
  expect(mediaUsage('mac-b')).toBe(70);
  expect(evictMedia({ hostId: 'mac-a', olderThan: NOW - 180 * DAY })).toBe(1);
  expect(mediaUsage('mac-a')).toBe(50);
  clearHostMedia('mac-a');
  expect([...disk.keys()]).toEqual(['mac-b/file:x:v1']);
});
