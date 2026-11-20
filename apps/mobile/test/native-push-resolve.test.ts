import { beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => {
  const task: { run?: (input: { data?: unknown; error: unknown }) => Promise<void> } = {};
  return {
    os: 'android',
    task,
    presented: [
      {
        request: {
          identifier: 'reply-a',
          content: { data: { v: 1, hostId: 'a', itemId: 'reply:1' } },
        },
      },
      {
        request: {
          identifier: 'reply-b',
          content: { data: { v: 1, hostId: 'b', itemId: 'reply:1' } },
        },
      },
    ],
    badge: vi.fn(async (_count: number) => true),
    dismiss: vi.fn(async (_id: string) => undefined),
  };
});

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return native.os;
    },
  },
}));
vi.mock('expo-notifications', () => ({
  getPresentedNotificationsAsync: async () => native.presented,
  dismissNotificationAsync: native.dismiss,
  setBadgeCountAsync: native.badge,
  registerTaskAsync: async () => undefined,
}));
vi.mock('expo-task-manager', () => ({
  defineTask: (_name: string, task: NonNullable<typeof native.task.run>) => {
    native.task.run = task;
  },
}));

import '../src/host/native-push-resolve';

beforeEach(() => {
  vi.clearAllMocks();
});

async function deliver(data: unknown) {
  if (!native.task.run) throw new Error('Background task not registered');
  await native.task.run({ data, error: null });
}

it.each([0, 3])(
  'does not apply Android background badge %i to pending notifications',
  async (badge) => {
    native.os = 'android';
    await deliver({ data: { v: 1, hostId: 'a', badge } });
    expect(native.badge).not.toHaveBeenCalled();
    expect(native.dismiss).not.toHaveBeenCalled();
  },
);

it.each([0, 3])('preserves iOS background badge %i', async (badge) => {
  native.os = 'ios';
  await deliver({ data: { v: 1, hostId: 'a', badge } });
  expect(native.badge).toHaveBeenCalledExactlyOnceWith(badge);
});

it.each(['android', 'ios'])('still resolves only the matching Host item on %s', async (os) => {
  native.os = os;
  await deliver({ data: { v: 1, hostId: 'a', resolved: ['reply:1'], badge: 0 } });
  expect(native.dismiss).toHaveBeenCalledExactlyOnceWith('reply-a');
  if (os === 'android') expect(native.badge).not.toHaveBeenCalled();
  else expect(native.badge).toHaveBeenCalledExactlyOnceWith(0);
});
