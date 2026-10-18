import { expect, it, vi } from 'vitest';
import { createHostTransitions } from '../src/host/host-transitions';
import { selectHost, type SavedHosts } from '../src/host/hosts';

it('cancels obsolete Computer selection before saving and restores a selection cancelled during persistence', async () => {
  let state: SavedHosts = {
    hosts: ['a', 'b'].map((hostId) => ({
      hostId,
      hostName: hostId,
      deviceId: hostId,
      routes: [],
      credential: 'test',
    })),
    current: 'a',
  };
  let disk = state;
  let valid = false;
  let release!: () => void;
  let wait: Promise<void> | undefined;
  const save = vi.fn(async (next: SavedHosts) => {
    disk = next;
    await wait;
  });
  const adopt = vi.fn((next: SavedHosts) => {
    state = next;
  });
  const commit = createHostTransitions({ read: () => state, save, adopt });
  expect(
    await commit(
      (current) => selectHost(current, 'b'),
      'switch',
      () => valid,
    ),
  ).toBe(false);
  expect(save).not.toHaveBeenCalled();
  valid = true;
  wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = commit(
    (current) => selectHost(current, 'b'),
    'switch',
    () => valid,
  );
  await Promise.resolve();
  expect(disk.current).toBe('b');
  valid = false;
  release();
  expect(await pending).toBe(false);
  expect(disk.current).toBe('a');
  expect(adopt).not.toHaveBeenCalled();
  expect(await commit((current) => selectHost(current, 'b'), 'switch')).toBe(true);
  expect(state.current).toBe('b');
});

it('serializes changes against the latest state instead of reviving detached hosts', async () => {
  let state: SavedHosts = { hosts: [], current: 'a' };
  const commit = createHostTransitions({
    read: () => state,
    save: async () => {},
    adopt: (next) => {
      state = next;
    },
  });
  const first = commit((current) => ({ ...current, current: 'b' }), 'first');
  const second = commit((current) => {
    expect(current.current).toBe('b');
    return { hosts: [] };
  }, 'second');
  await Promise.all([first, second]);
  expect(state).toEqual({ hosts: [] });
});
