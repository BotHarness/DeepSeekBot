// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.resetModules();
});

it('restores each Bot display after a fresh Client load without changing legacy hidden actions', async () => {
  const first = await import('../src/client/dm-actions.js');
  first.toggleHiddenDmAction('memory-hidden', 'memory');
  first.toggleHiddenDmAction('memory-hidden', 'posts');
  first.setDmMemoryDisplay('memory-hidden', 'compact');
  first.setDmMemoryDisplay('memory-other', 'detailed');
  vi.resetModules();
  const fresh = await import('../src/client/dm-actions.js');
  expect(fresh.dmMemoryDisplaySnapshot('memory-hidden')).toBe('compact');
  expect(fresh.dmMemoryDisplaySnapshot('memory-other')).toBe('detailed');
  expect(fresh.dmMemoryDisplaySnapshot('memory-new')).toBe('detailed');
  expect(fresh.hiddenDmActionsSnapshot('memory-hidden')).toEqual(['posts', 'memory']);
});

it.each(['{broken', '[]', '{"memory-fallback":"future-style"}', '{"memory-fallback":null}'])(
  'uses the existing detailed display when saved data is invalid: %s',
  async (data) => {
    const first = await import('../src/client/dm-actions.js');
    first.setDmMemoryDisplay('memory-fallback', 'compact');
    const displayKey = localStorage.key(0)!;
    localStorage.setItem(displayKey, data);
    vi.resetModules();
    const fresh = await import('../src/client/dm-actions.js');
    expect(fresh.dmMemoryDisplaySnapshot('memory-fallback')).toBe('detailed');
  },
);

it('keeps the selected display for this page when browser storage refuses writes', async () => {
  const actions = await import('../src/client/dm-actions.js');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Storage blocked');
  });
  expect(() => actions.setDmMemoryDisplay('memory-private-window', 'compact')).not.toThrow();
  expect(actions.dmMemoryDisplaySnapshot('memory-private-window')).toBe('compact');
  expect(actions.hiddenDmActionsSnapshot('memory-private-window')).toEqual([]);
});
