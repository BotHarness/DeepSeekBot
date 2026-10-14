import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DESKTOP_NOTIFICATIONS_KEY,
  DesktopNotificationPrefs,
  desktopNoticeKind,
  mountDesktopNotifications,
  noticeBody,
  type DesktopNotificationApi,
  type DesktopNotificationHandle,
} from '../src/client/desktop-notifications.js';
import type { HumanAttentionItem } from '../src/client/store.js';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

function fakeApi(permission: 'default' | 'granted' | 'denied', grant = permission) {
  const shown: { title: string; body: string; tag: string; handle: DesktopNotificationHandle }[] =
    [];
  let current: 'default' | 'granted' | 'denied' = permission;
  const api: DesktopNotificationApi = {
    permission: () => current,
    requestPermission: vi.fn(async () => {
      current = grant;
      return current;
    }),
    show(title, options) {
      const handle: DesktopNotificationHandle = { onclick: null, close: vi.fn() };
      shown.push({ title, body: options.body, tag: options.tag, handle });
      return handle;
    },
  };
  return { api, shown, deny: () => (current = 'denied') };
}

const item = (overrides: Partial<HumanAttentionItem>): HumanAttentionItem => ({
  id: 'approval:1',
  category: 'action',
  kind: 'tool-approval',
  createdAt: '2026-10-14T00:00:00.000Z',
  botSlug: 'ada',
  summary: 'Run git push',
  ...overrides,
});

const channels = [
  { id: 'dm-ada', type: 'dm' as const, botSlug: 'ada' },
  { id: 'group-1', type: 'group' as const },
];

describe('desktop notice selection', () => {
  it('notifies approvals, questions, mentions, replies and Bot DM replies only', () => {
    expect(desktopNoticeKind(item({}), channels)).toBe('approval');
    expect(desktopNoticeKind(item({ kind: 'workspace-grant-request' }), channels)).toBe('approval');
    expect(desktopNoticeKind(item({ kind: 'user-question' }), channels)).toBe('question');
    expect(desktopNoticeKind(item({ kind: 'private-input' }), channels)).toBe('private-input');
    expect(desktopNoticeKind(item({ kind: 'assignment-waiting-human' }), channels)).toBe('waiting');
    expect(desktopNoticeKind(item({ kind: 'channel-mention' }), channels)).toBe('mention');
    expect(desktopNoticeKind(item({ kind: 'channel-reply' }), channels)).toBe('reply');
    expect(
      desktopNoticeKind(item({ kind: 'channel-reply', isUnread: false }), channels),
    ).toBeUndefined();
    expect(desktopNoticeKind(item({ kind: 'channel-unread', channelId: 'dm-ada' }), channels)).toBe(
      'bot-reply',
    );
    expect(
      desktopNoticeKind(item({ kind: 'channel-unread', channelId: 'group-1' }), channels),
    ).toBeUndefined();
    expect(desktopNoticeKind(item({ kind: 'assignment-report' }), channels)).toBeUndefined();
    expect(desktopNoticeKind(item({ kind: 'group-join-request' }), channels)).toBeUndefined();
  });

  it('flattens and shortens the body', () => {
    expect(noticeBody('a\n\n  b')).toBe('a b');
    expect(noticeBody('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

describe('desktop notification preference', () => {
  it('asks for permission when turned on and remembers the choice per browser', async () => {
    const storage = memoryStorage();
    const { api } = fakeApi('default', 'granted');
    const prefs = new DesktopNotificationPrefs(storage, api);
    expect(prefs.getSnapshot()).toEqual({ enabled: false, permission: 'default' });
    await prefs.setEnabled(true);
    expect(api.requestPermission).toHaveBeenCalledOnce();
    expect(prefs.getSnapshot()).toEqual({ enabled: true, permission: 'granted' });
    expect(storage.values.get(DESKTOP_NOTIFICATIONS_KEY)).toBe('on');
    expect(prefs.active()).toBe(true);

    await prefs.setEnabled(false);
    expect(prefs.active()).toBe(false);
    expect(new DesktopNotificationPrefs(storage, api).getSnapshot().enabled).toBe(false);
  });

  it('stays off when the browser refuses or has no Notification API', async () => {
    const storage = memoryStorage();
    const prefs = new DesktopNotificationPrefs(storage, fakeApi('default', 'denied').api);
    await prefs.setEnabled(true);
    expect(prefs.getSnapshot()).toEqual({ enabled: false, permission: 'denied' });

    const unsupported = new DesktopNotificationPrefs(storage, undefined);
    await unsupported.setEnabled(true);
    expect(unsupported.getSnapshot()).toEqual({ enabled: false, permission: 'unsupported' });
  });

  it('stops notifying when permission is revoked later', () => {
    const fake = fakeApi('granted');
    const prefs = new DesktopNotificationPrefs(
      memoryStorage({ [DESKTOP_NOTIFICATIONS_KEY]: 'on' }),
      fake.api,
    );
    expect(prefs.active()).toBe(true);
    fake.deny();
    expect(prefs.active()).toBe(false);
    expect(prefs.getSnapshot().permission).toBe('denied');
  });
});

describe('desktop notifier', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(initial: HumanAttentionItem[] = []) {
    const fake = fakeApi('granted');
    const prefs = new DesktopNotificationPrefs(
      memoryStorage({ [DESKTOP_NOTIFICATIONS_KEY]: 'on' }),
      fake.api,
    );
    let items = initial;
    let attentive = false;
    let notify = (): void => {};
    const open = vi.fn();
    const load = vi.fn(async () => items);
    const dispose = mountDesktopNotifications({
      prefs,
      load,
      channels: () => channels,
      attentive: () => attentive,
      subscribe: (listener) => {
        notify = listener;
        return () => {
          notify = () => {};
        };
      },
      title: (kind, source) => `${kind}:${source.botSlug}`,
      open,
      intervalMs: 1_000,
    });
    return {
      fake,
      prefs,
      load,
      open,
      dispose,
      setItems: (next: HumanAttentionItem[]) => (items = next),
      setAttentive: (next: boolean) => (attentive = next),
      fire: async () => {
        notify();
        await vi.advanceTimersByTimeAsync(0);
      },
    };
  }

  it('treats items present when the Human looks away as seen, then notifies new ones', async () => {
    const env = setup([item({ id: 'approval:old' })]);
    await env.fire();
    expect(env.fake.shown).toHaveLength(0);

    env.setItems([
      item({ id: 'approval:old' }),
      item({ id: 'approval:new', summary: 'Delete build/' }),
      item({
        id: 'unread:dm-ada',
        kind: 'channel-unread',
        channelId: 'dm-ada',
        sourceEventId: 'e1',
      }),
    ]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(env.fake.shown.map((entry) => entry.title)).toEqual(['approval:ada', 'bot-reply:ada']);
    expect(env.fake.shown[0]?.body).toBe('Delete build/');
    expect(env.fake.shown[0]?.tag).toBe('botharness:approval:new');

    env.setItems([
      item({
        id: 'unread:dm-ada',
        kind: 'channel-unread',
        channelId: 'dm-ada',
        sourceEventId: 'e2',
      }),
    ]);
    await env.fire();
    expect(env.fake.shown.map((entry) => entry.title)).toEqual([
      'approval:ada',
      'bot-reply:ada',
      'bot-reply:ada',
    ]);
    env.dispose();
  });

  it('does not load or notify while the Human is looking, and closes shown notifications', async () => {
    const env = setup();
    env.setItems([]);
    await env.fire();
    env.setItems([item({ id: 'approval:a' })]);
    await env.fire();
    expect(env.fake.shown).toHaveLength(1);

    env.setAttentive(true);
    env.load.mockClear();
    await env.fire();
    expect(env.load).not.toHaveBeenCalled();
    expect(env.fake.shown[0]?.handle.close).toHaveBeenCalled();

    env.setItems([item({ id: 'approval:a' }), item({ id: 'approval:b' })]);
    env.setAttentive(false);
    await env.fire();
    expect(env.fake.shown).toHaveLength(1);
    env.dispose();
  });

  it('opens the source item when the notification is clicked', async () => {
    const env = setup();
    await env.fire();
    const approval = item({ id: 'approval:click', channelId: 'dm-ada', messageId: 'm1' });
    env.setItems([approval]);
    await env.fire();
    const shown = env.fake.shown[0]!;
    const event = { preventDefault: vi.fn() } as unknown as Event;
    vi.stubGlobal('window', { focus: vi.fn() });
    shown.handle.onclick?.(event);
    vi.unstubAllGlobals();
    expect(env.open).toHaveBeenCalledWith(approval);
    expect(shown.handle.close).toHaveBeenCalled();
    env.dispose();
  });

  it('stays quiet when turned off', async () => {
    const env = setup();
    await env.fire();
    await env.prefs.setEnabled(false);
    env.load.mockClear();
    env.setItems([item({ id: 'approval:x' })]);
    await env.fire();
    await env.fire();
    expect(env.load).not.toHaveBeenCalled();
    expect(env.fake.shown).toHaveLength(0);
    env.dispose();
  });
});
