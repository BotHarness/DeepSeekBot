import type { PushDelivery } from './delivery.js';

export const DEVICE_PUSH_PATH = '/botharness-device/push';

export interface DevicePushRequest {
  method: string;
  path: string;
  deviceId: string;
  body: Record<string, unknown>;
}

export interface DevicePushAnswer {
  status: number;
  body: unknown;
}

export function createDevicePushHttp(
  delivery: PushDelivery,
): (request: DevicePushRequest) => Promise<DevicePushAnswer> {
  return async ({ method, path, deviceId, body }) => {
    if (method === 'GET' && path === DEVICE_PUSH_PATH)
      return { status: 200, body: delivery.settings(deviceId) };
    if (method !== 'POST') return { status: 404, body: { code: 'not-found' } };
    switch (path) {
      case `${DEVICE_PUSH_PATH}/register`: {
        const result = delivery.register(deviceId, {
          token: body['token'],
          platform: body['platform'],
          locale: body['locale'],
          render: body['render'],
        });
        return result.ok
          ? { status: 200, body: delivery.settings(deviceId) }
          : { status: 400, body: { code: result.code } };
      }
      case `${DEVICE_PUSH_PATH}/preferences`: {
        const settings = delivery.setPreferences(deviceId, body['preferences'], body['enabled']);
        return settings.registered
          ? { status: 200, body: settings }
          : { status: 409, body: { code: 'push-not-registered' } };
      }
      case `${DEVICE_PUSH_PATH}/quiet`: {
        const result = delivery.setQuiet(deviceId, {
          channelId: body['channelId'],
          quiet: body['quiet'],
        });
        if ('invalid' in result) return { status: 400, body: { code: 'invalid-input' } };
        return result.registered
          ? { status: 200, body: result }
          : { status: 409, body: { code: 'push-not-registered' } };
      }
      case `${DEVICE_PUSH_PATH}/test`: {
        const result = await delivery.test(deviceId);
        if (result === 'sent') return { status: 200, body: { sent: true } };
        return result === 'not-registered'
          ? { status: 409, body: { code: 'push-not-registered' } }
          : { status: 502, body: { code: 'push-send-failed' } };
      }
      case `${DEVICE_PUSH_PATH}/unregister`:
        delivery.unregister(deviceId);
        return { status: 200, body: { registered: false } };
      default:
        return { status: 404, body: { code: 'not-found' } };
    }
  };
}
