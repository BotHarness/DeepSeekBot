import { ConnectRefused, encryptedCarrier } from './encrypted-carrier';
import type { HostCarrier } from './carrier';
import type { SavedHost } from './hosts';
import { isConnectRoute } from './route';

export class ActivityRequestFailed extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export interface ActivityRegistration {
  clientActivityId: string;
  token: string;
  bundleIdentifier: string;
  channelId: string;
  messageId: string;
  locale: 'en' | 'zh';
}
export interface HostActivity {
  request(
    host: SavedHost,
    operation: 'capability' | 'prepare' | 'register' | 'stop',
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}
export function createHostActivity(carrier: HostCarrier): HostActivity {
  return {
    async request(host, operation, body) {
      const transport = encryptedCarrier({ raw: carrier, ...host });
      try {
        for (const route of host.routes) {
          try {
            const response = await transport.request(
              `${route}/botharness-device/activity${operation === 'capability' ? '' : `/${operation}`}`,
              {
                method: operation === 'capability' ? 'GET' : 'POST',
                headers: {
                  authorization: `Device ${host.credential}`,
                  'content-type': 'application/json',
                },
                signal: AbortSignal.timeout(15_000),
                ...(operation === 'capability' ? {} : { body: JSON.stringify(body ?? {}) }),
              },
            );
            const result: unknown = JSON.parse(await response.text());
            if (!result || typeof result !== 'object' || Array.isArray(result))
              throw new ActivityRequestFailed('activity-protocol-error');
            const value = result as Record<string, unknown>;
            if (response.status === 200) return value;
            throw new ActivityRequestFailed(
              typeof value['code'] === 'string' ? value['code'] : 'activity-unavailable',
            );
          } catch (error) {
            if (error instanceof ConnectRefused) throw new ActivityRequestFailed(error.code);
            if (error instanceof ActivityRequestFailed || isConnectRoute(route)) throw error;
          }
        }
        throw new ActivityRequestFailed('unreachable');
      } finally {
        transport.close?.();
      }
    },
  };
}
