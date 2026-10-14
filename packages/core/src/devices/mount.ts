import type { Context } from '@deepseek-ai/cordis';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { hostname } from 'node:os';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';

import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import { openLogDatabase, type LogDatabase } from '../logs/log-db.js';
import {
  createDeviceGateway,
  DEVICE_GATEWAY_PREFIX,
  DEVICE_MUX_PATH,
  DEVICE_WEB_MUX_PATH,
} from './gateway.js';
import { createDevicesHttp, DEVICES_PATH } from './http.js';
import { createDevicePairing, type DevicePairingEvent } from './pairing.js';
import { detectPhoneRoutes } from './routes.js';

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

export function mountDevicePairing(
  ctx: Context,
  options: { database: OperationalDatabaseOwner; dshHome: string },
): void {
  if (options.database.mode !== 'ready') return;
  let logs: LogDatabase | undefined;
  try {
    logs = openLogDatabase({ dir: join(options.dshHome, 'botharness') });
  } catch {
    logs = undefined;
  }
  ctx.effect(() => () => logs?.close(), 'botharness: device pairing logs');
  const pairing = createDevicePairing({
    database: attachOperationalModule(options.database, 'device-pairing'),
    hostName: hostname().replace(/\.local$/u, ''),
    record: (event) => {
      const message = `device-pairing ${detail(event)}`;
      ctx.logger.info(message);
      try {
        logs?.write({
          plugin: 'device-pairing',
          owner: 'profile-shared',
          kind: event.phase,
          detail: message,
        });
      } catch {}
    },
  });

  ctx.inject(['connection', 'webServer'], (webCtx) => {
    const connection = (webCtx as unknown as { connection: ConnectionLike }).connection;
    const webServer = (webCtx as unknown as { webServer: WebServerLike }).webServer;
    const routes = () => detectPhoneRoutes({ port: webServer.port });
    const http = createDevicesHttp({ pairing, routes });
    for (const [path, methods] of [
      [DEVICES_PATH, ['GET']],
      [`${DEVICES_PATH}/offer`, ['POST']],
      [`${DEVICES_PATH}/revoke`, ['POST']],
    ] as const)
      webCtx.effect(
        () => connection.fetch.register({ path, methods, requestBody: 'buffered', fetch: http }),
        `botharness: paired devices ${path}`,
      );

    const gateway = createDeviceGateway({
      pairing,
      port: () => webServer.port,
      authenticatedUrl: (base) => connection.authenticatedUrl(base),
      log: (message) => ctx.logger.info(message),
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
    for (const path of [DEVICE_MUX_PATH, DEVICE_WEB_MUX_PATH])
      webCtx.effect(
        () =>
          webServer.registerUpgrade({
            path,
            handler: (request, socket, head) => void gateway.upgrade(request, socket, head),
          }),
        `botharness: device gateway stream ${path}`,
      );
  });
}
