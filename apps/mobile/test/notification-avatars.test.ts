import { describe, expect, it, vi } from 'vitest';

import type { RosterBot, RosterChannel, RosterView } from '../src/host/client';
import {
  avatarFile,
  avatarInputs,
  createNotificationAvatars,
  notificationAvatars,
  type AvatarImage,
} from '../src/host/notification-avatars';

const bot = (slug: string, extra: Partial<RosterBot> = {}): RosterBot => ({
  slug,
  displayName: slug.toUpperCase(),
  roles: [],
  computerAccess: false,
  browserAccess: false,
  state: 'idle',
  paused: false,
  ...extra,
});

const channel = (id: string, avatar?: string): RosterChannel => ({
  id,
  name: id,
  memberCount: 1,
  members: [],
  ...(avatar === undefined ? {} : { avatar }),
});

const roster = (bots: RosterBot[], channels: RosterChannel[] = []): RosterView => ({
  bots,
  channels,
});

function memoryStore() {
  const files = new Map<string, Record<string, string>>();
  const rendered: string[] = [];
  const removed: string[] = [];
  const reports: Record<string, string>[] = [];
  const aborted: AbortSignal[] = [];
  let fail = new Set<string>();
  let hang = new Set<string>();
  return {
    rendered,
    removed,
    reports,
    files,
    aborted,
    hangOn(file: string) {
      hang = new Set([file]);
    },
    failOn(file: string) {
      fail = new Set([file]);
    },
    store: {
      async read(host: string) {
        return { ...files.get(host) };
      },
      async render(host: string, file: string, _image: AvatarImage, signal: AbortSignal) {
        if (fail.has(file)) throw Error('render-failed');
        if (hang.has(file)) {
          aborted.push(signal);
          return new Promise<void>(() => {});
        }
        rendered.push(`${host}/${file}`);
      },
      remove(host: string, file: string) {
        removed.push(`${host}/${file}`);
      },
      write(host: string, index: Record<string, string>) {
        files.set(host, { ...index });
      },
      report(_host: string, errors: Record<string, string>) {
        reports.push(errors);
      },
    },
  };
}

describe('notification avatars', () => {
  it('gives up on a render that never settles and keeps the others', async () => {
    vi.useFakeTimers();
    try {
      const memory = memoryStore();
      const avatars = createNotificationAvatars(memory.store);
      memory.hangOn('bot-ada.png');
      const done = avatars.sync(
        'h',
        roster([bot('ada')], [channel('g1', 'data:image/png;base64,AAAA')]),
      );
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await done).toBe(false);
      expect(memory.rendered).toEqual(['h/channel-g1.png']);
      expect(Object.keys(memory.files.get('h') ?? {})).toEqual(['channel-g1.png']);
      expect(memory.reports).toEqual([{ 'bot-ada.png': 'render-timeout' }]);
      expect(memory.aborted.map((signal) => signal.aborted)).toEqual([true]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a store that cannot be opened', async () => {
    const memory = memoryStore();
    const avatars = createNotificationAvatars({
      ...memory.store,
      read: () => Promise.reject(Error('notification-avatars-unavailable')),
    });
    expect(await avatars.sync('h', roster([bot('ada')]))).toBe(false);
    expect(memory.reports).toEqual([{ '*': 'notification-avatars-unavailable' }]);
  });

  it('names files the way the native notification code reads them', () => {
    expect(avatarFile('bot', 'ada')).toBe('bot-ada.png');
    expect(avatarFile('channel', 'g/1 x')).toBe('channel-g_1_x.png');
  });

  it('caches uploaded and generated Bot avatars and group Channel pictures', () => {
    const entries = notificationAvatars(
      roster(
        [
          bot('ada', {
            avatarUrl: 'https://host/api/botharness/bot-avatar?slug=ada&v=1',
            avatarHeaders: { authorization: 'Bearer t' },
          }),
          bot('bo'),
        ],
        [channel('g1', 'data:image/png;base64,AAAA'), channel('g2')],
      ),
    );
    expect(entries.map((entry) => entry.file)).toEqual([
      'bot-ada.png',
      'bot-bo.png',
      'channel-g1.png',
    ]);
    expect(entries[0]?.image).toEqual({
      uri: 'https://host/api/botharness/bot-avatar?slug=ada&v=1',
      headers: { authorization: 'Bearer t' },
    });
    expect(entries[1]?.image.uri).toMatch(/^data:image\/svg\+xml;base64,/u);
    expect(entries[2]?.image.uri).toBe('data:image/png;base64,AAAA');
  });

  it('renders only what changed and removes avatars that are gone', async () => {
    const memory = memoryStore();
    const avatars = createNotificationAvatars(memory.store);
    await avatars.sync('h', roster([bot('ada')], [channel('g1', 'data:image/png;base64,AAAA')]));
    expect(memory.rendered).toEqual(['h/bot-ada.png', 'h/channel-g1.png']);

    await avatars.sync('h', roster([bot('ada')], [channel('g1', 'data:image/png;base64,BBBB')]));
    expect(memory.rendered).toEqual(['h/bot-ada.png', 'h/channel-g1.png', 'h/channel-g1.png']);

    await avatars.sync('h', roster([bot('ada')]));
    expect(memory.removed).toEqual(['h/channel-g1.png']);
  });

  it('retries an avatar that failed to render on the next sync', async () => {
    const memory = memoryStore();
    const avatars = createNotificationAvatars(memory.store);
    memory.failOn('bot-ada.png');
    expect(await avatars.sync('h', roster([bot('ada')]))).toBe(false);
    expect(memory.removed).toEqual(['h/bot-ada.png']);
    memory.failOn('');
    expect(await avatars.sync('h', roster([bot('ada')]))).toBe(true);
    expect(memory.rendered).toEqual(['h/bot-ada.png']);
  });

  it('ignores live roster changes that cannot change an avatar', () => {
    const before = roster([bot('ada')]);
    const after = roster([bot('ada', { state: 'working', preview: 'hi' })]);
    expect(avatarInputs(after)).toBe(avatarInputs(before));
    expect(avatarInputs(roster([bot('ada', { displayName: 'Ada L' })]))).not.toBe(
      avatarInputs(before),
    );
  });
});
