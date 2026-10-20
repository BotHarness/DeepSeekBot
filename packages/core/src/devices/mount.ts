import type { Context } from '@deepseek-ai/cordis';
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { hostname } from 'node:os';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';

import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import { openLogDatabase, type LogDatabase } from '../logs/log-db.js';
import {
  createDeviceGateway,
  DEVICE_GATEWAY_PREFIX,
  type DeviceGateway,
  DEVICE_MUX_PATH,
  DEVICE_SIGNALING_PATHS,
  DEVICE_WEB_MUX_PATH,
} from './gateway.js';
import { createDeviceConnect } from './connect.js';
import { createDevicesHttp, DEVICES_PATH } from './http.js';
import { createDevicePairing, type DevicePairingEvent } from './pairing.js';
import { detectPhoneRoutes } from './routes.js';
import {
  createPushDelivery,
  type ExpoSender,
  type PushDelivery,
  type PushEvent,
  type PushSource,
} from '../push/delivery.js';
import { createExpoSender } from '../push/expo-sender.js';
import { createDevicePushHttp } from '../push/http.js';

const PUSH_SETTLE_MS = 500;
const PUSH_SWEEP_MS = 60_000;

export interface DevicePushOptions {
  source: PushSource;
  watch(changed: () => void): () => void;
  sender?: ExpoSender;
}

interface ConnectionLike {
  fetch: {
    register(route: {
      path: string;
      methods: readonly ('GET' | 'POST')[];
      requestBody: 'buffered' | 'streaming';
      fetch(request: Request): Promise<Response>;
    }): () => Promise<void>;
  };
  authenticatedUrl(baseUrl: string): string;
}

interface WebServerLike {
  readonly port: number;
  register(route: {
    kind: 'exact' | 'prefix';
    path: string;
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
  }): () => void;
  registerUpgrade(route: {
    path: string;
    handler: (request: IncomingMessage, socket: Duplex, head: Buffer) => void;
  }): () => void;
}

function detail(event: DevicePairingEvent): string {
  const parts = [`phase=${event.phase}`];
  if ('deviceId' in event && event.deviceId !== undefined) parts.push(`device=${event.deviceId}`);
  if ('code' in event) parts.push(`code=${event.code}`);
  if ('closedStreams' in event) parts.push(`closedStreams=${String(event.closedStreams)}`);
  return parts.join(' ');
}

function pushDetail(event: PushEvent): string {
  return Object.entries(event)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ');
}

export type DeviceWebUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => void;

export function mountDevicePairing(
  ctx: Context,
  options: {
    database: OperationalDatabaseOwner;
    dshHome: string;
    push?: DevicePushOptions;
    credentials?: () => CredentialProvider | undefined;
  },
): DeviceWebUpgrade | undefined {
  if (options.database.mode !== 'ready') return undefined;
  let live: DeviceGateway | undefined;
  let logs: LogDatabase | undefined;
  try {
    logs = openLogDatabase({ dir: join(options.dshHome, 'botharness') });
  } catch {
    logs = undefined;
  }
  ctx.effect(() => () => logs?.close(), 'botharness: device pairing logs');
  const write = (plugin: string, kind: string, message: string): void => {
    ctx.logger.info(message);
    try {
      logs?.write({ plugin, owner: 'profile-shared', kind, detail: message });
    } catch {}
  };
  let push: PushDelivery | undefined;
  const pairing = createDevicePairing({
    database: attachOperationalModule(options.database, 'device-pairing'),
    hostName: hostname().replace(/\.local$/u, ''),
    record: (event) => write('device-pairing', event.phase, `device-pairing ${detail(event)}`),
    onRevoked: (deviceId) => push?.unregister(deviceId),
  });
  if (options.push !== undefined) {
    const watched = options.push;
    const delivery = createPushDelivery({
      database: attachOperationalModule(options.database, 'push'),
      source: watched.source,
      sender: watched.sender ?? createExpoSender(),
      host: () => pairing.host(),
      deviceActive: (deviceId) =>
        pairing.list().some((device) => device.id === deviceId && device.revokedAt === undefined),
      record: (event) => write('push', event.phase, `push ${pushDetail(event)}`),
    });
    push = delivery;
    const reconcile = (): void => {
      void delivery
        .reconcile()
        .catch((error: unknown) =>
          ctx.logger.warn(`push phase=reconcile-failed error=${String(error)}`),
        );
    };
    let settle: ReturnType<typeof setTimeout> | undefined;
    ctx.effect(() => {
      const off = watched.watch(() => {
        clearTimeout(settle);
        settle = setTimeout(reconcile, PUSH_SETTLE_MS);
      });
      const sweep = setInterval(() => {
        reconcile();
        void delivery.checkReceipts();
      }, PUSH_SWEEP_MS);
      reconcile();
      return () => {
        off();
        clearTimeout(settle);
        clearInterval(sweep);
      };
    }, 'botharness: push delivery');
  }

  ctx.inject(['connection', 'webServer'], (webCtx) => {
    const connection = (webCtx as unknown as { connection: ConnectionLike }).connection;
    const webServer = (webCtx as unknown as { webServer: WebServerLike }).webServer;
    const connect = createDeviceConnect({
      credentials: options.credentials ?? (() => undefined),
      port: () => webServer.port,
      record: (phase, info) =>
        write('device-connect', phase, `device-connect phase=${phase}${info ? ` ${info}` : ''}`),
    });
    webCtx.effect(() => {
      void connect.start();
      return () => void connect.close();
    }, 'botharness: device connect tunnel');
    const routes = async () => {
      const status = await detectPhoneRoutes({ port: webServer.port });
      const tunnel = connect.route();
      if (tunnel === undefined) return status;
      const loopback = status.routes.filter((route) => route.kind === 'loopback');
      const others = status.routes.filter((route) => route.kind !== 'loopback');
      return { ...status, routes: [...others, tunnel, ...loopback] };
    };
    const http = createDevicesHttp({ pairing, routes, connect });
    for (const [path, methods] of [
      [DEVICES_PATH, ['GET']],
      [`${DEVICES_PATH}/offer`, ['POST']],
      [`${DEVICES_PATH}/revoke`, ['POST']],
      [`${DEVICES_PATH}/connect`, ['POST']],
    ] as const)
      webCtx.effect(
        () =>
          connection.fetch.register({
            path,
            methods,
            requestBody: 'buffered',
            fetch: http,
          }),
        `botharness: paired devices ${path}`,
      );

    const gateway = createDeviceGateway({
      pairing,
      port: () => webServer.port,
      authenticatedUrl: (base) => connection.authenticatedUrl(base),
      log: (message) => ctx.logger.info(message),
      ...(push === undefined ? {} : { push: createDevicePushHttp(push) }),
    });
    webCtx.effect(
      () =>
        webServer.register({
          kind: 'prefix',
          path: DEVICE_GATEWAY_PREFIX,
          handler: (request, response) => gateway.handle(request, response),
        }),
      'botharness: device gateway',
    );
    webCtx.effect(() => {
      live = gateway;
      return () => {
        live = undefined;
      };
    }, 'botharness: device gateway viewer streams');
    for (const path of [DEVICE_MUX_PATH, DEVICE_WEB_MUX_PATH, ...DEVICE_SIGNALING_PATHS])
      webCtx.effect(
        () =>
          webServer.registerUpgrade({
            path,
            handler: (request, socket, head) => void gateway.upgrade(request, socket, head),
          }),
        `botharness: device gateway stream ${path}`,
      );
  });
  return (request, socket, head) => {
    if (live === undefined) socket.destroy();
    else void live.upgrade(request, socket, head);
  };
}
