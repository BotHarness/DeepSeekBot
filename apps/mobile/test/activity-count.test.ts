import { describe, expect, it, vi } from 'vitest';

import {
  ACTIVITY_COUNT_KINDS,
  createActivityCountPreferences,
  observeActivityCount,
  readActivityCount,
} from '../src/host/activity-count';
import type { HumanAttentionItem, HumanAttentionPage } from '../src/host/wire';
import type { InboxSnapshot } from '../src/host/inbox';

const item = (id: string, kind = 'tool-approval'): HumanAttentionItem => ({
  id,
  kind,
  category: 'action',
  createdAt: '2026-10-18T00:00:00Z',
  botSlug: 'qa',
  summary: 'test',
});
const page = (items: HumanAttentionItem[], nextCursor?: string): HumanAttentionPage => ({
  queryVersion: 1,
  items,
  ...(nextCursor ? { nextCursor } : {}),
});
const preferences = () =>
  createActivityCountPreferences({ read: async () => undefined, write() {} });
const ready: InboxSnapshot = {
  status: 'ready',
  sections: { action: [], replies: [], unread: [], handled: [] },
};

describe('navigation Activity count', () => {
  it('defaults to four action kinds, preserves saved choices and permits icon-only across restart', async () => {
    let stored: unknown;
    const storage = {
      read: async () => stored,
      write(value: unknown) {
        stored = value;
      },
    };
    const first = createActivityCountPreferences(storage);
    await first.ready;
    expect(first.getSnapshot().kinds).toEqual([
      'approvals',
      'questions',
      'privateInput',
      'otherActions',
    ]);
    first.setKinds(['approvals']);
    const previousSelection = createActivityCountPreferences(storage);
    await previousSelection.ready;
    expect(previousSelection.getSnapshot().kinds).toEqual(['approvals']);
    first.setKinds(['questions', 'approvals', 'questions']);
    const second = createActivityCountPreferences(storage);
    await second.ready;
    expect(second.getSnapshot().kinds).toEqual(['approvals', 'questions']);
    second.setKinds([]);
    const third = createActivityCountPreferences(storage);
    await third.ready;
    expect(third.getSnapshot().kinds).toEqual([]);
  });

  it('retains a change made during hydration and reports a failed save until retry', async () => {
    let resolve: (value: unknown) => void = () => {};
    const write = vi.fn().mockImplementationOnce(() => {
      throw Error('full');
    });
    const state = createActivityCountPreferences({
      read: () =>
        new Promise((done) => {
          resolve = done;
        }),
      write,
    });
    state.setKinds(['privateInput']);
    resolve(['questions']);
    await state.ready;
    expect(state.getSnapshot()).toMatchObject({
      kinds: ['privateInput'],
      loaded: true,
      storageError: true,
    });
    state.setKinds(['privateInput']);
    expect(state.getSnapshot().storageError).toBe(false);
  });

  it('rejects corrupt stored categories instead of silently disabling the default', async () => {
    const state = createActivityCountPreferences({ read: async () => ['future'], write() {} });
    await state.ready;
    expect(state.getSnapshot().kinds).toEqual([
      'approvals',
      'questions',
      'privateInput',
      'otherActions',
    ]);
  });

  it('queries the selected kind and follows later pages beyond unrelated first-page items', async () => {
    const calls: Record<string, unknown>[] = [];
    const client = {
      call: async (_method: string, args: Record<string, unknown>) => {
        calls.push(args);
        return args.cursor
          ? page([item('real')])
          : page([item('question', 'user-question')], 'next');
      },
    };
    expect(await readActivityCount(client, ['approvals'])).toBe(1);
    expect(calls).toEqual([
      { category: 'action', queryVersion: 1, limit: 100 },
      { category: 'action', queryVersion: 1, limit: 100, cursor: 'next' },
    ]);
  });

  it('deduplicates categories, excludes handled replies and separates other actions', async () => {
    const client = {
      call: async (_method: string, args: Record<string, unknown>) => {
        if (args.category === 'replies') {
          expect(args.unreadOnly).toBe(true);
          return page([
            { ...item('seen', 'channel-reply'), isUnread: false },
            item('reply', 'channel-mention'),
          ]);
        }
        if (args.category === 'unread')
          return page([item('reply', 'channel-mention'), item('channel', 'channel-unread')]);
        return page([
          item('a'),
          item('q', 'user-question'),
          item('p', 'private-input'),
          item('g', 'workspace-grant-request'),
        ]);
      },
    };
    expect(await readActivityCount(client, ACTIVITY_COUNT_KINDS)).toBe(6);
    expect(await readActivityCount(client, ['otherActions'])).toBe(1);
  });

  it('stops requesting pages once the display saturates at99+ and rejects cursor loops', async () => {
    const call = vi.fn(async () =>
      page(
        Array.from({ length: 100 }, (_, i) => item(String(i))),
        'next',
      ),
    );
    expect(await readActivityCount({ call }, ['approvals', 'questions'])).toBe(100);
    expect(call).toHaveBeenCalledTimes(1);
    await expect(
      readActivityCount({ call: async () => page([], 'same') }, ['approvals']),
    ).rejects.toThrow('CURSOR_LOOP');
    await expect(
      readActivityCount({ call: async () => ({ items: [] }) }, ['approvals']),
    ).rejects.toThrow('HOST_VERSION');
  });

  it('keeps cached data on refresh failure, replaces stale selection and stops with its subscriber', async () => {
    const prefs = preferences();
    await prefs.ready;
    let changed = () => {};
    let fail = false;
    const stop = vi.fn();
    const client = {
      call: vi.fn(async (_method: string, args: Record<string, unknown>) => {
        if (fail) throw Error('offline');
        expect(args).not.toHaveProperty('kind');
        return page([item('a'), item('q', 'user-question'), item('q2', 'user-question')]);
      }),
    };
    const observer = observeActivityCount(
      client,
      {
        getSnapshot: () => ready,
        subscribe(listener) {
          changed = listener;
          return stop;
        },
      },
      prefs,
    );
    const off = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getSnapshot().count).toBe(3));
    fail = true;
    changed();
    await vi.waitFor(() => expect(observer.getSnapshot()).toEqual({ count: 3, stale: true }));
    prefs.setKinds(['questions']);
    await vi.waitFor(() =>
      expect(observer.getSnapshot()).toEqual({ count: undefined, stale: true }),
    );
    fail = false;
    changed();
    await vi.waitFor(() => expect(observer.getSnapshot().count).toBe(2));
    prefs.setKinds([]);
    await vi.waitFor(() => expect(observer.getSnapshot().count).toBe(0));
    off();
    expect(stop).toHaveBeenCalledOnce();
    const calls = client.call.mock.calls.length;
    prefs.setKinds(['approvals']);
    expect(client.call).toHaveBeenCalledTimes(calls);
  });

  it('discards an old response when categories change during a request', async () => {
    const prefs = preferences();
    await prefs.ready;
    let resolve: (page: HumanAttentionPage) => void = () => {};
    let calls = 0;
    const observer = observeActivityCount(
      {
        call: async () =>
          ++calls === 1
            ? new Promise((done) => {
                resolve = done;
              })
            : page([item('q', 'user-question')]),
      },
      { getSnapshot: () => ready, subscribe: () => () => {} },
      prefs,
    );
    const counts: (number | undefined)[] = [];
    const off = observer.subscribe(() => {
      counts.push(observer.getSnapshot().count);
    });
    prefs.setKinds(['questions']);
    resolve(page([item('a'), item('a2')]));
    await vi.waitFor(() => expect(observer.getSnapshot().count).toBe(1));
    expect(counts).not.toContain(2);
    off();
  });
});
