import { describe, it, expect } from 'vitest';
import { createSourceDrafts, hostDraftKey, cloudDraftKey } from '../src/host/source-drafts';
describe('unsent source drafts', () => {
  it('keeps colliding channel IDs and accounts separate across reload without transport', async () => {
    let disk: Record<string, string> = {};
    const storage = {
      read: async () => disk,
      write: (value: Record<string, string>) => {
        disk = { ...value };
      },
    };
    const drafts = createSourceDrafts(storage);
    await drafts.ready;
    const a = hostDraftKey('host-a', 'channel', 'same');
    const b = hostDraftKey('host-b', 'channel', 'same');
    const c = cloudDraftKey('account-a', 'org_a', 'same');
    drafts.set(a, 'Unsent A');
    drafts.set(b, 'Unsent B');
    drafts.set(c, 'Cloud');
    const reopened = createSourceDrafts(storage);
    await reopened.ready;
    expect([reopened.get(a), reopened.get(b), reopened.get(c)]).toEqual([
      'Unsent A',
      'Unsent B',
      'Cloud',
    ]);
    expect(reopened.get(cloudDraftKey('account-b', 'org_a', 'same'))).toBe('');
    reopened.set(a, '');
    expect(reopened.get(b)).toBe('Unsent B');
  });
  it('never overwrites input typed while storage is loading', async () => {
    let release: ((raw: unknown) => void) | undefined;
    const drafts = createSourceDrafts({
      read: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      write() {},
    });
    drafts.set('channel', 'New input');
    release?.({ channel: 'Old input' });
    await drafts.ready;
    expect(drafts.get('channel')).toBe('New input');
  });
  it('preserves other saved sources when editing after an unreadable initial snapshot', async () => {
    let unavailable = true;
    let disk: Record<string, string> = { other: 'Keep this saved draft' };
    const storage = {
      read: async () => {
        if (unavailable) throw new Error('read unavailable');
        return { ...disk };
      },
      write: (next: Record<string, string>) => {
        disk = { ...next };
      },
    };
    const drafts = createSourceDrafts(storage);
    await drafts.ready;
    drafts.set('active', 'New input');
    unavailable = false;
    const reopened = createSourceDrafts(storage);
    await reopened.ready;
    expect(reopened.get('other')).toBe('Keep this saved draft');
    expect(drafts.get('active')).toBe('New input');
  });
  it('retries unreadable storage without replacing input typed while retrying', async () => {
    let release: ((value: unknown) => void) | undefined;
    let reads = 0;
    let disk: Record<string, string> = { active: 'Old input', other: 'Keep' };
    const storage = {
      read: () => {
        if (reads++ === 0) return Promise.reject(new Error('read unavailable'));
        return new Promise((resolve) => {
          release = resolve;
        });
      },
      write: (next: Record<string, string>) => {
        disk = { ...next };
      },
    };
    const drafts = createSourceDrafts(storage);
    await drafts.ready;
    drafts.set('active', 'Before retry');
    expect(drafts.getPersistence()).toEqual({ loaded: false, failed: true });
    const retry = drafts.retrySave();
    drafts.set('active', 'Newest input');
    release?.({ ...disk });
    await expect(retry).resolves.toBe(true);
    const reopened = createSourceDrafts({ ...storage, read: async () => ({ ...disk }) });
    await reopened.ready;
    expect([reopened.get('active'), reopened.get('other')]).toEqual(['Newest input', 'Keep']);
    expect(drafts.getPersistence()).toEqual({ loaded: true, failed: false });
  });
  it('retains current input after a failed write and saves the latest text on retry', async () => {
    let unavailable = false;
    let disk: Record<string, string> = { active: 'Old input', other: 'Keep' };
    const storage = {
      read: async () => ({ ...disk }),
      write: (next: Record<string, string>) => {
        if (unavailable) throw new Error('write unavailable');
        disk = { ...next };
      },
    };
    const drafts = createSourceDrafts(storage);
    await drafts.ready;
    unavailable = true;
    drafts.set('active', 'Latest input');
    expect(drafts.get('active')).toBe('Latest input');
    expect(drafts.getPersistence()).toEqual({ loaded: true, failed: true });
    await expect(drafts.retrySave()).resolves.toBe(false);
    unavailable = false;
    await expect(drafts.retrySave()).resolves.toBe(true);
    const reopened = createSourceDrafts(storage);
    await reopened.ready;
    expect([reopened.get('active'), reopened.get('other')]).toEqual(['Latest input', 'Keep']);
    expect(drafts.getPersistence()).toEqual({ loaded: true, failed: false });
  });
});

it('keeps required draft removal retryable after a disk write or read failure', async () => {
  const own = hostDraftKey('a', 'channel', 'one');
  const other = hostDraftKey('b', 'channel', 'two');
  let disk: Record<string, string> = { [own]: 'private draft', [other]: 'keep' };
  let failed = true;
  const drafts = createSourceDrafts({
    read: async () => ({ ...disk }),
    write: (next, required) => {
      if (required && failed) throw new Error('disk full');
      disk = { ...next };
    },
  });
  await drafts.ready;
  await expect(drafts.removePersistedWhere((key) => key === own)).rejects.toThrow('disk full');
  expect(drafts.get(own)).toBe('private draft');
  expect(disk[own]).toBe('private draft');
  failed = false;
  await drafts.removePersistedWhere((key) => key === own);
  expect(disk).toEqual({ [other]: 'keep' });
  expect(drafts.get(own)).toBe('');
});

it('does not discard persisted drafts when initial hydration failed', async () => {
  let unavailable = true;
  let disk: Record<string, string> = { own: 'private', other: 'keep' };
  const drafts = createSourceDrafts({
    read: async () => {
      if (unavailable) throw new Error('read unavailable');
      return { ...disk };
    },
    write: (next) => {
      disk = { ...next };
    },
  });
  await drafts.ready;
  await expect(drafts.removePersistedWhere((key) => key === 'own')).rejects.toThrow(
    'read unavailable',
  );
  unavailable = false;
  await drafts.removePersistedWhere((key) => key === 'own');
  expect(disk).toEqual({ other: 'keep' });
});
