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

it.each(['retry', 'required removal'])(
  'does not restore removed-source drafts when %s recovers an unreadable initial snapshot',
  async (recovery) => {
    let unavailable = true;
    const removed = cloudDraftKey('removed-account', 'org', 'one');
    const retained = hostDraftKey('other-computer', 'channel', 'two');
    let disk: Record<string, string> = { [removed]: 'private', [retained]: 'keep' };
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
    drafts.removeWhere((key) => key === removed);
    unavailable = false;
    if (recovery === 'retry') await drafts.retrySave();
    else await drafts.removePersistedWhere((key) => key === 'another-removed-source');
    const reopened = createSourceDrafts(storage);
    await reopened.ready;
    expect([drafts.get(removed), reopened.get(removed), reopened.get(retained)]).toEqual([
      '',
      '',
      'keep',
    ]);
  },
);

it.each(['resolves', 'rejects'])(
  'keeps the newest saved snapshot after a stale recovery read %s',
  async (settlement) => {
    let settleRetry: (() => void) | undefined;
    let reads = 0;
    let disk: Record<string, string> = { removed: 'private', retained: 'keep' };
    const storage = {
      read: () => {
        if (reads++ === 0) return Promise.reject(new Error('initial read unavailable'));
        if (reads === 2)
          return new Promise((resolve, reject) => {
            const snapshot = { ...disk };
            settleRetry = () => {
              if (settlement === 'resolves') resolve(snapshot);
              else reject(new Error('stale read unavailable'));
            };
          });
        return Promise.resolve({ ...disk });
      },
      write: (next: Record<string, string>) => {
        disk = { ...next };
      },
    };
    const drafts = createSourceDrafts(storage);
    await drafts.ready;
    const retry = drafts.retrySave();
    disk.retained = 'Saved after retry started';
    await drafts.removePersistedWhere((key) => key === 'removed');
    settleRetry?.();
    await retry;
    expect(drafts.get('retained')).toBe('Saved after retry started');
    drafts.set('retained', 'newest');
    const reopened = createSourceDrafts(storage);
    await reopened.ready;
    expect([reopened.get('removed'), reopened.get('retained')]).toEqual(['', 'newest']);
    expect(drafts.getPersistence()).toEqual({ loaded: true, failed: false });
  },
);

describe('sending an unsent draft', () => {
  const disk = () => {
    let saved: Record<string, string> = {};
    return {
      read: async () => ({ ...saved }),
      write: (value: Record<string, string>) => {
        saved = { ...value };
      },
    };
  };

  it('takes the live text, so a second tap in the same render sends nothing', async () => {
    const drafts = createSourceDrafts(disk());
    await drafts.ready;
    drafts.set('channel', 'No too');
    drafts.set('channel', 'No tool');
    expect(drafts.take('channel')).toBe('No tool');
    expect(drafts.take('channel')).toBe('');
  });

  it('does not bring a sent message back from a late native echo, even after restart', async () => {
    let clock = 1000;
    const storage = disk();
    const drafts = createSourceDrafts(storage, { now: () => clock });
    await drafts.ready;
    drafts.set('channel', 'No too');
    expect(drafts.take('channel')).toBe('No too');
    clock += 40;
    drafts.set('channel', 'No tool');
    expect(drafts.get('channel')).toBe('l');
    clock += 40;
    drafts.set('channel', 'No too');
    expect(drafts.get('channel')).toBe('');

    const reopened = createSourceDrafts(storage);
    await reopened.ready;
    expect(reopened.get('channel')).toBe('');
  });

  it('arms the echo guard with the sent text when the draft changed since it was read', async () => {
    const drafts = createSourceDrafts(disk(), { now: () => 0 });
    await drafts.ready;
    drafts.set('channel', 'Hello ');
    drafts.take('channel', 'Hello there');
    drafts.set('channel', 'Hello there');
    expect(drafts.get('channel')).toBe('');
  });

  it('keeps new typing that does not repeat the sent text', async () => {
    const drafts = createSourceDrafts(disk(), { now: () => 0 });
    await drafts.ready;
    drafts.set('channel', 'ok');
    drafts.take('channel');
    drafts.set('channel', 'o');
    drafts.set('channel', 'ok');
    expect(drafts.get('channel')).toBe('ok');
  });

  it('lets the user type the same text again once the echo window has passed', async () => {
    let clock = 0;
    const drafts = createSourceDrafts(disk(), { now: () => clock });
    await drafts.ready;
    drafts.set('channel', 'again');
    drafts.take('channel');
    clock += 5000;
    drafts.set('channel', 'again');
    expect(drafts.get('channel')).toBe('again');
  });
});
