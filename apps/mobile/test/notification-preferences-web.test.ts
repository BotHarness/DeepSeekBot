// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../src/host/native-carrier', () => ({ nativeCarrier: () => ({}) }));
vi.mock('../src/host/push', async (original) => ({
  ...(await original<typeof import('../src/host/push')>()),
  createHostPush: () => ({ settings: vi.fn(), setPreferences: vi.fn() }),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  localStorage.clear();
});

it('persists actual device preferences across preview reloads', async () => {
  const { notificationPreferences: first } =
    await import('../scripts/web-preview/notification-preferences');
  await first.ready;
  await first.set({ reply: false, approval: true });
  vi.resetModules();
  const { notificationPreferences: second } =
    await import('../scripts/web-preview/notification-preferences');
  await second.ready;
  expect(second.getSnapshot().preferences).toEqual({
    reply: false,
    approval: true,
    question: true,
    'private-input': true,
  });
});

it('exposes denied storage instead of claiming a successful save', async () => {
  const { notificationPreferences } =
    await import('../scripts/web-preview/notification-preferences');
  await notificationPreferences.ready;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('denied');
  });
  await expect(notificationPreferences.set({ reply: false })).rejects.toThrow('denied');
  expect(notificationPreferences.getSnapshot().preferences).toBeUndefined();
});
