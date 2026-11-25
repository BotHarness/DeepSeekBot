import type { RosterBot, RosterChannel, RosterView } from '@botharness/host-client/client';
import { describe, expect, it } from 'vitest';
import { computerEnvironmentKey } from '../src/host/conversation-environments';
import {
  createPinnedBindings,
  type PinnedBinding,
} from '../src/features/pinned-tab/pinned-binding';
import { pinnedHostId, resolvePinnedTarget } from '../src/features/pinned-tab/pinned-target';
import { tobSlug } from '../src/features/pinned-tab/tob';
import { defaultTabOrder, parseTabOrder, tabRoute, tabSlotOf } from '../src/ui/shell/tab-slots';

const bot = (slug: string, extra: Partial<RosterBot> = {}): RosterBot => ({
  slug,
  displayName: slug,
  roles: [],
  computerAccess: false,
  browserAccess: false,
  state: 'idle',
  paused: false,
  dmChannelId: `dm-${slug}`,
  ...extra,
});

const channel = (id: string): RosterChannel => ({ id, name: id, memberCount: 2, members: [] });

const roster = (extra: Partial<RosterView> = {}): RosterView =>
  ({
    bots: [bot('tob', { tob: true }), bot('ada')],
    channels: [channel('launch')],
    ...extra,
  }) as RosterView;

describe('tab order', () => {
  it('defaults to Chats, the Pinned tab, Activity, Sessions and Settings', () => {
    expect(defaultTabOrder).toEqual(['chats', 'pinned', 'activity', 'sessions', 'settings']);
    expect(parseTabOrder(undefined)).toBe(defaultTabOrder);
    expect(parseTabOrder(['chats', 'pinned', 'activity', 'sessions', 'settings'])).toBe(
      defaultTabOrder,
    );
  });

  it('keeps a stored order, drops unknown or repeated slots and appends missing ones', () => {
    expect(parseTabOrder(['settings', 'bogus', 'pinned', 'settings', 'chats'])).toEqual([
      'settings',
      'pinned',
      'chats',
      'activity',
      'sessions',
    ]);
  });

  it('maps each slot to its route and back', () => {
    for (const slot of defaultTabOrder) expect(tabSlotOf(tabRoute(slot))).toBe(slot);
    expect(tabSlotOf('(bot-creation)')).toBeUndefined();
  });
});

describe('Pinned binding store', () => {
  it('keeps one binding per Environment and restores it', async () => {
    let saved: unknown = { a: { kind: 'bot', slug: 'ada' }, b: { kind: 'nope' } };
    const storage = {
      read: async () => saved,
      write: (value: Record<string, PinnedBinding>) => {
        saved = value;
      },
    };
    const bindings = createPinnedBindings(storage);
    await Promise.resolve();
    await Promise.resolve();
    expect(bindings.binding('a')).toEqual({ kind: 'bot', slug: 'ada' });
    expect(bindings.binding('b')).toBeUndefined();
    bindings.bind('b', { kind: 'channel', id: 'launch' });
    const restored = createPinnedBindings(storage);
    await Promise.resolve();
    await Promise.resolve();
    expect(restored.binding('b')).toEqual({ kind: 'channel', id: 'launch' });
    restored.bind('a', undefined);
    expect(restored.binding('a')).toBeUndefined();
  });

  it('keeps a change made before the stored bindings load', async () => {
    let release: (value: unknown) => void = () => undefined;
    const writes: unknown[] = [];
    const bindings = createPinnedBindings({
      read: () => new Promise((resolve) => (release = resolve)),
      write: (value) => writes.push(value),
    });
    bindings.bind('a', { kind: 'channel', id: 'launch' });
    release({ a: { kind: 'bot', slug: 'ada' } });
    await Promise.resolve();
    await Promise.resolve();
    expect(bindings.binding('a')).toEqual({ kind: 'channel', id: 'launch' });
    expect(writes.at(-1)).toEqual({ a: { kind: 'channel', id: 'launch' } });
  });

  it('settles after a failed read without erasing saved bindings on the next change', async () => {
    const writes: unknown[] = [];
    let reads = 0;
    const bindings = createPinnedBindings({
      read: () => {
        reads += 1;
        return reads === 1
          ? Promise.reject(new Error('busy'))
          : Promise.resolve({ a: { kind: 'bot', slug: 'ada' } });
      },
      write: (value) => writes.push(value),
    });
    expect(bindings.settled()).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(bindings.settled()).toBe(true);
    bindings.bind('b', { kind: 'channel', id: 'launch' });
    expect(writes).toEqual([]);
    await Promise.resolve();
    await Promise.resolve();
    expect(writes.at(-1)).toEqual({
      a: { kind: 'bot', slug: 'ada' },
      b: { kind: 'channel', id: 'launch' },
    });
  });
});

describe('Pinned tab target', () => {
  it('follows the Environment Scope and uses the most recently used Computer under All', () => {
    const hosts = ['h1', 'h2', 'h3'];
    expect(pinnedHostId(computerEnvironmentKey('h2'), hosts, ['h3'], 'h1')).toBe('h2');
    expect(pinnedHostId('all', hosts, ['gone', 'h3', 'h1'], 'h1')).toBe('h3');
    expect(pinnedHostId('all', hosts, [], 'h2')).toBe('h2');
    expect(pinnedHostId('all', hosts, [], undefined)).toBe('h1');
    expect(pinnedHostId('all', [], ['h1'], 'h1')).toBeUndefined();
    expect(pinnedHostId(computerEnvironmentKey('gone'), hosts, ['h3'], 'h1')).toBeUndefined();
  });

  it("defaults to Tob's DM", () => {
    const target = resolvePinnedTarget({ hostId: 'h1', roster: roster() }, undefined);
    expect(target?.conversation.key).toBe('bot:tob');
    expect(target?.fallback).toBe(false);
  });

  it('opens a bound Channel or Bot DM with its unread count', () => {
    const target = resolvePinnedTarget(
      { hostId: 'h1', roster: roster(), unread: { launch: 3 } },
      { kind: 'channel', id: 'launch' },
    );
    expect(target?.conversation.key).toBe('channel:launch');
    expect(target?.conversation.unread).toBe(3);
    expect(
      resolvePinnedTarget({ hostId: 'h1', roster: roster() }, { kind: 'bot', slug: 'ada' })
        ?.conversation.key,
    ).toBe('bot:ada');
  });

  it('keeps a bound conversation that Chats hides', () => {
    const hidden = roster({ arrangement: { hidden: ['launch'] } } as Partial<RosterView>);
    expect(
      resolvePinnedTarget({ hostId: 'h1', roster: hidden }, { kind: 'channel', id: 'launch' })
        ?.conversation.key,
    ).toBe('channel:launch');
  });

  it("falls back to Tob's DM when the bound conversation is gone", () => {
    const target = resolvePinnedTarget(
      { hostId: 'h1', roster: roster() },
      { kind: 'channel', id: 'deleted' },
    );
    expect(target?.conversation.key).toBe('bot:tob');
    expect(target?.fallback).toBe(true);
  });

  it('waits for the roster and opens the most recent conversation without Tob', () => {
    expect(resolvePinnedTarget({ hostId: 'h1', roster: undefined }, undefined)).toBeUndefined();
    expect(
      resolvePinnedTarget(
        { hostId: 'h1', roster: roster({ bots: [bot('ada')], channels: [] }) },
        undefined,
      )?.conversation.key,
    ).toBe('bot:ada');
    expect(
      resolvePinnedTarget({ hostId: 'h1', roster: roster({ bots: [], channels: [] }) }, undefined),
    ).toBeUndefined();
  });

  it('resolves Tob through one function', () => {
    expect(tobSlug(undefined)).toBeUndefined();
    expect(tobSlug(roster())).toBe('tob');
    expect(tobSlug({ bots: [bot('ada')] })).toBeNull();
  });
});
