import { createNoiseIdentity } from './noise-identity.js';
import { createEncryptedGateway } from './encrypted-gateway.js';
import { CONNECT_CHANNEL_PATH } from './noise/channel.js';
import type { Context } from '@deepseek-ai/cordis';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { createDeviceLan } from './lan.js';
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
  DEVICE_SIGNALING_PATHS,
} from './gateway.js';
import { createConnectAccount } from './connect-account.js';
import { cloudflaredCacheRoot } from './cloudflared.js';
import { createDeviceConnect } from './connect.js';
import { createDevicesHttp, DEVICES_PATH, DEVICES_SERVE_PATH } from './http.js';
import { createDevicePairing, type DevicePairingEvent } from './pairing.js';
import { detectPhoneRoutes, publishPhoneRoute } from './routes.js';
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

export function mountDevicePairing(
  ctx: Context,
  options: {
    database: OperationalDatabaseOwner;
    dshHome: string;
    push?: DevicePushOptions;
    credentials?: () => CredentialProvider | undefined;
    packageAnchors?: readonly string[];
  },
): void {
  if (options.database.mode !== 'ready') return undefined;
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
    onPaired: (device) =>
      void push
        ?.announcePaired(device)
        .catch((error: unknown) =>
          ctx.logger.warn(`push phase=announce-failed error=${String(error)}`),
        ),
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
    const identity = createNoiseIdentity(options.credentials ?? (() => undefined));
    const lanKey = credentialKey('botharness-core', 'device-lan');
    const lan = createDeviceLan({
      read: async () => {
        const credentials = options.credentials?.();
        if (!credentials) throw new Error('lan-storage-unavailable');
        const record = await credentials.readRecord(lanKey);
        if (record?.kind !== 'grant') return undefined;
        if (!record.payload || typeof record.payload !== 'object' || !('port' in record.payload))
          return undefined;
        const port = record.payload.port;
        return typeof port === 'number' ? port : undefined;
      },
      write: async (port) => {
        const credentials = options.credentials?.();
        if (!credentials) throw new Error('lan-storage-unavailable');
        if (port === undefined) await credentials.deleteRecord(lanKey);
        else
          await credentials.modifyRecord(lanKey, async () => ({
            kind: 'grant',
            payload: { port },
          }));
      },
      gateway: () =>
        createEncryptedGateway({
          pairing,
          key: identity.key,
          port: () => webServer.port,
          route: 'lan',
          log: (phase) => write('device-lan', phase, `device-lan phase=${phase}`),
        }),
      log: (phase) => write('device-lan', phase, `device-lan phase=${phase}`),
    });
    webCtx.effect(() => {
      void lan.start();
      return () => {
        void lan.close();
      };
    }, 'botharness: encrypted LAN entry');
    let channels = { negotiating: 0, encrypted: 0 };
    const encryption = async () => ({
      ...(await identity.publicIdentity()),
      state:
        channels.encrypted > 0
          ? ('encrypted' as const)
          : channels.negotiating > 0
            ? ('negotiating' as const)
            : ('disconnected' as const),
    });
    const encrypted = createEncryptedGateway({
      pairing,
      key: identity.key,
      port: () => webServer.port,
      changed: (state) => {
        channels = state;
      },
      verifyEnrollment: (body, signature) => account.verifyOffer(body, signature),
      log: (phase) => write('device-encryption', phase, `device-encryption phase=${phase}`),
    });
    webCtx.effect(
      () => () => {
        encrypted.close();
        identity.close();
      },
      'botharness: encrypted device channels',
    );
    webCtx.effect(
      () =>
        webServer.registerUpgrade({
          path: CONNECT_CHANNEL_PATH,
          handler: (request, socket, head) => {
            void encrypted.upgrade(request, socket, head);
          },
        }),
      'botharness: encrypted transport',
    );
    const connect = createDeviceConnect({
      credentials: options.credentials ?? (() => undefined),
      port: () => webServer.port,
      cloudflaredCache: cloudflaredCacheRoot(options.dshHome),
      ...(options.packageAnchors === undefined ? {} : { packageAnchors: options.packageAnchors }),
      record: (phase, info) =>
        write('device-connect', phase, `device-connect phase=${phase}${info ? ` ${info}` : ''}`),
    });
    const account = createConnectAccount({
      credentials: options.credentials ?? (() => undefined),
      connect,
      record: (phase, info) =>
        write('device-connect', phase, `device-connect phase=${phase}${info ? ` ${info}` : ''}`),
    });
    webCtx.effect(() => {
      void connect.start().then(() => account.start());
      return () => {
        void account.close().then(() => connect.close());
      };
    }, 'botharness: device connect tunnel');
    const routes = async () => {
      const status = await detectPhoneRoutes({ port: webServer.port });
      status.routes.unshift(...lan.routes());
      const tunnel = connect.route();
      if (tunnel === undefined) return status;
      const loopback = status.routes.filter((route) => route.kind === 'loopback');
      const others = status.routes.filter((route) => route.kind !== 'loopback');
      return { ...status, routes: [...others, tunnel, ...loopback] };
    };
    const http = createDevicesHttp({
      pairing,
      encryption,
      routes,
      connect,
      account,
      lan,
      publish: () => publishPhoneRoute({ port: webServer.port }),
    });
    for (const [path, methods] of [
      [DEVICES_PATH, ['GET']],
      [`${DEVICES_PATH}/offer`, ['POST']],
      [`${DEVICES_PATH}/offer-status`, ['POST']],
      [`${DEVICES_PATH}/approve-key`, ['POST']],
      [`${DEVICES_PATH}/revoke`, ['POST']],
      [`${DEVICES_PATH}/connect`, ['POST']],
      [`${DEVICES_PATH}/lan`, ['POST']],
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
    webCtx.effect(
      () =>
        connection.fetch.register({
          path: DEVICES_SERVE_PATH,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: http,
        }),
      'botharness: publish phone route',
    );

    const gateway = createDeviceGateway({
      pairing,
      port: () => webServer.port,
      authenticatedUrl: (base) => connection.authenticatedUrl(base),
      log: (message) => ctx.logger.info(message),
      ...(push === undefined ? {} : { push: createDevicePushHttp(push) }),
      connectOffer: (body, signature) => account.verifyOffer(body, signature),
    });
    webCtx.effect(
      () =>
        webServer.register({
          kind: 'prefix',
          path: DEVICE_GATEWAY_PREFIX,
          handler: async (request, response) => {
            if (request.url === CONNECT_CHANNEL_PATH) {
              if (request.method !== 'GET') {
                response.writeHead(405);
                response.end();
                return;
              }
              try {
                const identity = await encryption();
                response.writeHead(200, {
                  'content-type': 'application/json',
                  'cache-control': 'no-store',
                  'access-control-allow-origin': '*',
                });
                response.end(JSON.stringify({ host: pairing.host(), encryption: identity }));
              } catch {
                response.writeHead(503, {
                  'content-type': 'application/json',
                  'cache-control': 'no-store',
                });
                response.end(JSON.stringify({ code: 'host-key-unavailable' }));
              }
              return;
            }
            await gateway.handle(request, response);
          },
        }),
      'botharness: device gateway',
    );
    for (const path of [DEVICE_MUX_PATH, ...DEVICE_SIGNALING_PATHS])
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
