import { expect, it, vi } from 'vitest';
import type { NotificationsPort } from '../src/host/push-session';
type DevicePushToken = { type: 'android'; data: string };

const sdk = vi.hoisted(() => ({
  exchange: vi.fn(async (_options: { projectId: string; devicePushToken?: DevicePushToken }) => ({
    data: 'expo-token',
  })),
  listener: (_token: DevicePushToken) => {},
  remove: vi.fn(),
}));
vi.mock('expo-constants', () => ({ default: { easConfig: { projectId: 'test-project' } } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  setNotificationCategoryAsync: vi.fn(async () => {}),
  setNotificationChannelAsync: vi.fn(async () => {}),
  AndroidImportance: { HIGH: 4 },
  getExpoPushTokenAsync: sdk.exchange,
  addPushTokenListener: (listener: typeof sdk.listener) => {
    sdk.listener = listener;
    return { remove: sdk.remove };
  },
}));

it('exchanges the event-owned native token without requesting it again', async () => {
  const modulePath = '../src/host/native-notifications';
  const { nativeNotifications } = (await import(modulePath)) as {
    nativeNotifications: (channel: string, buttons: Record<string, string>) => NotificationsPort;
  };
  const port = nativeNotifications('requests', {
    always: 'Always',
    approve: 'Approve',
    reject: 'Reject',
    'remove-device': 'Remove',
  });
  await port.token();
  expect(sdk.exchange).toHaveBeenLastCalledWith({ projectId: 'test-project' });
  let conversion: (() => Promise<string>) | undefined;
  const off = port.onTokenChanged((resolveToken) => {
    conversion = resolveToken;
  });
  const token: DevicePushToken = { type: 'android', data: 'synthetic-device-token' };
  sdk.listener(token);
  expect(sdk.exchange).toHaveBeenCalledTimes(1);
  expect(conversion).toBeDefined();
  expect(await conversion?.()).toBe('expo-token');
  expect(sdk.exchange).toHaveBeenLastCalledWith({
    projectId: 'test-project',
    devicePushToken: token,
  });
  expect(sdk.exchange.mock.calls[1]?.[0].devicePushToken).toBe(token);
  off();
  expect(sdk.remove).toHaveBeenCalledOnce();
});
