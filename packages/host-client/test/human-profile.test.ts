import { describe, expect, it, vi } from 'vitest';
import {
  createHumanAvatarCache,
  parseHumanAvatars,
  parseHumanIdentity,
} from '../src/human-profile';

const avatar = 'data:image/webp;base64,UklGRg==';

describe('Human profile parsers', () => {
  it('reads an identity with and without an avatar version', () => {
    expect(
      parseHumanIdentity({
        humanId: 'mia',
        defaultDisplayName: null,
        displayName: 'Mia',
        avatarVersion: '0123456789abcdef',
      }),
    ).toEqual({
      humanId: 'mia',
      defaultDisplayName: null,
      displayName: 'Mia',
      avatarVersion: '0123456789abcdef',
    });
    expect(() =>
      parseHumanIdentity({
        humanId: 'mia',
        defaultDisplayName: null,
        displayName: 'Mia',
        avatarVersion: 'x',
      }),
    ).toThrow();
  });

  it('reads a pending first sign-in profile prompt and ignores other values', () => {
    const base = { humanId: 'mia', defaultDisplayName: null, displayName: 'Mia' };
    expect(parseHumanIdentity({ ...base, profileSetup: 'pending' })).toEqual({
      ...base,
      profileSetup: 'pending',
    });
    expect(parseHumanIdentity({ ...base, profileSetup: 'done' })).toEqual(base);
  });

  it('drops avatars that are not bounded image data URLs', () => {
    expect(
      parseHumanAvatars({
        avatars: [
          { humanId: 'a', version: '0123456789abcdef', avatar },
          { humanId: 'b', version: '0123456789abcdef', avatar: 'https://example.com/b.png' },
        ],
      }),
    ).toEqual([{ humanId: 'a', version: '0123456789abcdef', avatar }]);
  });
});

describe('Human avatar cache', () => {
  it('batches one call per tick, keys by version and never asks twice', async () => {
    const calls: string[][] = [];
    const cache = createHumanAvatarCache(async (ids) => {
      calls.push(ids);
      return { avatars: [{ humanId: 'a', version: '0123456789abcdef', avatar }] };
    });
    let published = 0;
    cache.subscribe(() => (published += 1));
    cache.want('a', '0123456789abcdef');
    cache.want('b', 'fedcba9876543210');
    cache.want('a', '0123456789abcdef');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual([['a', 'b']]);
    expect(cache.get('a', '0123456789abcdef')).toBe(avatar);
    expect(cache.get('a', '1111111111111111')).toBeUndefined();
    expect(cache.get('b', 'fedcba9876543210')).toBeUndefined();
    expect(published).toBe(1);
    cache.want('b', 'fedcba9876543210');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toHaveLength(1);
  });
  it('asks again after a failed load and for a version a newer one displaced', async () => {
    const calls: string[][] = [];
    let fail = true;
    const cache = createHumanAvatarCache(async (ids) => {
      calls.push(ids);
      if (fail) throw new Error('offline');
      return { avatars: [{ humanId: 'a', version: '0123456789abcdef', avatar }] };
    });
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    cache.want('a', '0123456789abcdef');
    await tick();
    fail = false;
    cache.want('a', '0123456789abcdef');
    await tick();
    expect(calls).toEqual([['a'], ['a']]);
    expect(cache.get('a', '0123456789abcdef')).toBe(avatar);
    cache.want('b', '1111111111111111');
    cache.want('b', '2222222222222222');
    await tick();
    cache.want('b', '1111111111111111');
    await tick();
    expect(calls.slice(2)).toEqual([['b'], ['b']]);
  });

  it('loads a restored photo for a consumer that asks on every change, without a remount', async () => {
    vi.useFakeTimers();
    try {
      const calls: string[][] = [];
      const replies: unknown[] = [
        { avatars: [] },
        { avatars: [{ humanId: 'a', version: '1111111111111111', avatar }] },
      ];
      const cache = createHumanAvatarCache(async (ids) => {
        calls.push(ids);
        return replies.shift();
      });
      const render = () => cache.want('a', '1111111111111111');
      cache.subscribe(render);
      render();
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toEqual([['a']]);
      expect(cache.get('a', '1111111111111111')).toBeUndefined();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(calls).toEqual([['a'], ['a']]);
      expect(cache.get('a', '1111111111111111')).toBe(avatar);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks again after a malformed reply, and retries a missing version once after a pause', async () => {
    vi.useFakeTimers();
    try {
      const calls: string[][] = [];
      const replies: unknown[] = [
        { avatars: 'broken' },
        { avatars: [{ humanId: 'a', version: '2222222222222222', avatar }] },
        { avatars: [] },
        { avatars: [{ humanId: 'a', version: '1111111111111111', avatar }] },
      ];
      const cache = createHumanAvatarCache(async (ids) => {
        calls.push(ids);
        return replies.shift();
      });
      const tick = () => vi.advanceTimersByTimeAsync(0);
      cache.want('a', '1111111111111111');
      await tick();
      cache.want('a', '1111111111111111');
      await tick();
      cache.want('a', '1111111111111111');
      cache.want('a', '1111111111111111');
      await tick();
      expect(calls).toEqual([['a'], ['a']]);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(calls).toEqual([['a'], ['a'], ['a']]);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(calls).toEqual([['a'], ['a'], ['a']]);
      cache.want('a', '1111111111111111');
      await vi.advanceTimersByTimeAsync(30_000);
      expect(calls).toEqual([['a'], ['a'], ['a'], ['a']]);
      expect(cache.get('a', '1111111111111111')).toBe(avatar);
    } finally {
      vi.useRealTimers();
    }
  });
});
