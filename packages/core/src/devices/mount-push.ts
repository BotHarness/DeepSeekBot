import type { Context } from '@deepseek-ai/cordis';
import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import {
  createPushDelivery,
  type ExpoSender,
  type PushDelivery,
  type PushEvent,
  type PushSource,
} from '../push/delivery.js';
import { createExpoSender } from '../push/expo-sender.js';
import { coalesce } from '../runtime/coalesce.js';
import { pairedDeviceHuman } from '../team/device-audience.js';
import type { createDevicePairing } from './pairing.js';

export const PUSH_SETTLE_MS = 500;
export const SETTLE_MAX_WAIT_MS = 2_000;
const PUSH_SWEEP_MS = 60_000;

export interface DevicePushOptions {
  source: PushSource;
  watch(changed: () => void): () => void;
  held?: (human: import('../humans/context.js').HumanContext) => boolean;
  sender?: ExpoSender;
}

function pushDetail(event: PushEvent): string {
  return Object.entries(event)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ');
}

export function mountDevicePush(
  ctx: Context,
  options: { database: OperationalDatabaseOwner },
  watched: DevicePushOptions,
  pairing: ReturnType<typeof createDevicePairing>,
  write: (plugin: string, kind: string, message: string) => void,
  publish: (delivery: PushDelivery) => void,
): void {
  const delivery = createPushDelivery({
    database: attachOperationalModule(options.database, 'push'),
    source: watched.source,
    deviceHuman: (deviceId) =>
      pairedDeviceHuman(attachOperationalModule(options.database, 'push'), deviceId),
    sender: watched.sender ?? createExpoSender(),
    host: () => pairing.host(),
    deviceActive: (deviceId) =>
      pairing.list().some((device) => device.id === deviceId && device.revokedAt === undefined),
    ...(watched.held === undefined ? {} : { held: watched.held }),
    record: (event) => write('push', event.phase, `push ${pushDetail(event)}`),
  });
  publish(delivery);
  const reconcile = (): void => {
    void delivery
      .reconcile()
      .catch((error: unknown) =>
        ctx.logger.warn(`push phase=reconcile-failed error=${String(error)}`),
      );
  };
  const settle = coalesce(reconcile, { delayMs: PUSH_SETTLE_MS, maxWaitMs: SETTLE_MAX_WAIT_MS });
  ctx.effect(() => {
    const off = watched.watch(settle.schedule);
    const sweep = setInterval(() => {
      reconcile();
      void delivery.checkReceipts();
    }, PUSH_SWEEP_MS);
    reconcile();
    return () => {
      off();
      settle.cancel();
      clearInterval(sweep);
    };
  }, 'botharness: push delivery');
}
