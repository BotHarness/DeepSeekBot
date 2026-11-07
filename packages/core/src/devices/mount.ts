import { createConnectBotBridge } from './bot-connect-bridge.js';
import { BOT_CONNECT_PATH } from './bot-connect-channel.js';
import { createLanBotBridge } from './bot-lan-bridge.js';
import { createLanBotDiscovery } from './bot-lan-discovery.js';
import { createLanBotMembership } from './bot-lan-membership.js';
import { createLanBotControl } from './bot-lan-control.js';
import { createActivityDelivery, type ActivityDelivery } from '../live-activity/delivery.js';
import type { ChannelSendStatus } from '../channels/store.js';
import { createNoiseIdentity } from './noise-identity.js';
import { createEncryptedGateway } from './encrypted-gateway.js';
import { CONNECT_CHANNEL_PATH } from './noise/channel.js';
import type { Context } from '@deepseek-ai/cordis';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { createDeviceLan } from './lan.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { hostname, platform } from 'node:os';
import { createTailnetBotBridge } from './bot-tailnet-bridge.js';
import { createBotNetworkRoutes } from './bot-network-routes.js';
import {
  receiveNetworkBotDm,
  BotNetworkDeliveryError,
  type BotNetworkPort,
} from '../runtime/bot-network.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { ChannelStore } from '../channels/store.js';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import type { LocalVideoOwner } from '../../../computer/src/local-video-contract.js';
import { localVideoCommand } from '../../../computer/src/local-video-http.js';
import type { VoiceCallResult } from '../voice/call-contract.js';
import type { VoiceCalls } from '../voice/calls.js';

import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import { openLogDatabase, type LogDatabase } from '../logs/log-db.js';
import {
  createDeviceGateway,
  DEVICE_GATEWAY_PREFIX,
  DEVICE_MUX_PATH,
  DEVICE_SIGNALING_PATHS,
} from './gateway.js';
import { createConnectAccount, type ConnectAccount } from './connect-account.js';
import { cloudflaredCacheRoot } from './cloudflared.js';
import { createDeviceConnect } from './connect.js';
import { createDevicesHttp, DEVICES_PATH, DEVICES_SERVE_PATH } from './http.js';
import { createDevicePairing, type DevicePairingEvent } from './pairing.js';
import { createManagedPhoneRoute, parseManagedPhoneRoute } from './routes.js';
import {
  createPushDelivery,
  type ExpoSender,
  type PushDelivery,
  type PushEvent,
  type PushSource,
} from '../push/delivery.js';
import { createExpoSender } from '../push/expo-sender.js';
import { createDevicePushHttp } from '../push/http.js';
import type { TelemetryService } from '../telemetry/service.js';
import { coalesce } from '../runtime/coalesce.js';

const PUSH_SETTLE_MS = 500;
const SETTLE_MAX_WAIT_MS = 2_000;
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

const CONNECT_OUTCOMES: Readonly<Record<string, 'success' | 'denied' | 'expired'>> = {
  'signed-in': 'success',
  'sign-in-failed': 'denied',
  'sign-in-expired': 'expired',
};

export function recordConnectTelemetry(
  telemetry: Pick<TelemetryService, 'capture'> | undefined,
  phase: string,
): void {
  if (phase === 'sign-in-started') telemetry?.capture('connect:sign_in_start');
  const outcome = CONNECT_OUTCOMES[phase];
  if (outcome !== undefined) telemetry?.capture('connect:sign_in_complete', { outcome });
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
    requestStatus?: (channelId: string, messageId: string) => ChannelSendStatus | undefined;
    credentials?: () => CredentialProvider | undefined;
    packageAnchors?: readonly string[];
    onAccount?: (account: ConnectAccount | undefined) => void;
    telemetry?: Pick<TelemetryService, 'capture'>;
    calls?: () => VoiceCalls | undefined;
    botNetwork?: {
      registry: PersonaBotRegistry;
      channels: ChannelStore;
      admitBotDmMessage(channelId: string, messageId: string): void;
      withdrawNetworkMembership(hostId: string): Promise<void>;
      available(port: BotNetworkPort | undefined): void;
    };
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
  let activity: ActivityDelivery | undefined;
  const videoOwner = (): LocalVideoOwner | undefined =>
    (ctx.get('botharnessComputer') as { localVideo?: LocalVideoOwner } | undefined)?.localVideo;
  const voiceCall = async (
    caller: { deviceId: string },
    command: unknown,
    signal: AbortSignal,
  ): Promise<VoiceCallResult> =>
    options.calls?.() === undefined
      ? { ok: false, code: 'not-ready', error: 'Calls are not ready on this Host.' }
      : options.calls()!.handle(caller, command, signal);
  const pairing = createDevicePairing({
    database: attachOperationalModule(options.database, 'device-pairing'),
    hostName: hostname().replace(/\.local$/u, ''),
    record: (event) => write('device-pairing', event.phase, `device-pairing ${detail(event)}`),
    onRevoked: (deviceId) => {
      push?.unregister(deviceId);
      const activityStarted = Date.now();
      void activity
        ?.revoke(deviceId)
        .catch(() =>
          write(
            'live-activity',
            'revoke-failed',
            `live-activity phase=revoke-failed initiator=host code=delivery-error durationMs=${Date.now() - activityStarted}`,
          ),
        );

      void options
        .calls?.()
        ?.revoke(deviceId)
        .catch(() => write('voice', 'call-revoke-failed', 'voice-call phase=revoke-failed'));
      void videoOwner()
        ?.revoke(deviceId)
        .catch(() =>
          write('computer', 'video-revoke-failed', 'computer-video phase=revoke-failed'),
        );
    },
    onPaired: (device) =>
      void push
        ?.announcePaired(device)
        .catch((error: unknown) =>
          ctx.logger.warn(`push phase=announce-failed error=${String(error)}`),
        ),
  });
  const identity = createNoiseIdentity(options.credentials ?? (() => undefined));
  ctx.effect(() => () => identity.close(), 'botharness: Host encryption identity');
  const botNetworks = createBotNetworkRoutes({
    withdrawn: async (hostId) => options.botNetwork?.withdrawNetworkMembership(hostId),
  });
  const localBotDirectory = () => {
    const owners = options.botNetwork;
    if (owners === undefined) return [];
    const host = pairing.host();
    return owners.registry
      .list()
      .filter((bot) => bot.paused !== true)
      .map((bot) => ({
        hostId: host.id,
        botSlug: bot.slug,
        displayName: bot.displayName.slice(0, 128),
        ...(bot.description === undefined ? {} : { description: bot.description.slice(0, 1000) }),
        device: { model: null, platform: platform() },
        capabilities: [
          ...(bot.computerAccess === true && ctx.get('botharnessComputer') !== undefined
            ? ['computer']
            : []),
          ...(bot.browserAccess === true && ctx.get('botharnessBrowserTools') !== undefined
            ? ['browser']
            : []),
        ],
      }));
  };
  if (options.botNetwork !== undefined) {
    const owners = options.botNetwork;
    ctx.effect(() => {
      owners.available(botNetworks);
      return () => owners.available(undefined);
    }, 'botharness: Bot network capability');
    ctx.effect(() => {
      const host = pairing.host();
      const bridge = createTailnetBotBridge({
        hostId: host.id,
        key: identity.key,
        knownKey: (id) => owners.channels.remoteHostKey?.(id),
        trustKey: (id, key, membership) => {
          if (!owners.channels.trustRemoteHostKey)
            throw new Error('network-key-storage-unavailable');
          owners.channels.trustRemoteHostKey(id, key, membership);
        },
        knownMemberships: () =>
          owners.channels.list().flatMap((channel) =>
            channel.remoteBot?.membership === undefined
              ? []
              : [
                  {
                    hostId: channel.remoteBot.hostId,
                    membership: channel.remoteBot.membership,
                  },
                ],
          ),
        withdrawn: (hostId) => botNetworks.observeWithdrawal(hostId),
        unbound: (hostId) => owners.withdrawNetworkMembership(hostId),
        directory: localBotDirectory,
        receive: (sender, message) => receiveNetworkBotDm(owners, sender, message),
        record: (event) =>
          write(
            'bot-network',
            event.phase,
            JSON.stringify({ module: 'bot-network', initiator: 'host', ...event }),
          ),
      });
      const detach = botNetworks.attach({ ...bridge, membership: bridge.probeMembership });
      let starting: Promise<void> | undefined;
      const start = () => {
        const started = Date.now();
        starting ??= bridge
          .start()
          .catch(() => {
            write(
              'bot-network',
              'start-refused',
              JSON.stringify({
                module: 'bot-network',
                initiator: 'host',
                phase: 'start-refused',
                code: 'tailnet-unavailable',
                durationMs: Date.now() - started,
              }),
            );
          })
          .finally(() => {
            starting = undefined;
          });
        return starting;
      };
      const retryListener = setInterval(() => {
        void start();
      }, 30_000);
      retryListener.unref();
      void start();
      return () => {
        clearInterval(retryListener);
        detach();
        return bridge.close();
      };
    }, 'botharness: online Bot collaboration bridge');
  }
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

  ctx.inject(['connection', 'webServer'], (webCtx) => {
    const connection = (webCtx as unknown as { connection: ConnectionLike }).connection;
    const webServer = (webCtx as unknown as { webServer: WebServerLike }).webServer;
    const lanKey = credentialKey('botharness-core', 'device-lan');
    let lanDiscovery: ReturnType<typeof createLanBotDiscovery> | undefined;
    let lanBridge: ReturnType<typeof createLanBotBridge> | undefined;
    const lanMembership = createLanBotMembership({
      database: attachOperationalModule(options.database, 'bot-lan'),
      candidate: (id) => lanDiscovery?.candidates().find((candidate) => candidate.hostId === id),
      knownKey: (id) => options.botNetwork?.channels.remoteHostKey?.(id),
    });
    if (options.botNetwork)
      webCtx.effect(
        () =>
          botNetworks.attach({
            contacts: () => lanBridge?.contacts() ?? [],
            refresh: async () => {
              await lanBridge?.refresh();
            },
            availability: (host, bot) => lanBridge?.availability(host, bot) ?? 'unavailable',
            membership: async (host) => {
              if (lanBridge) return lanBridge.membership(host);
              const record = lanMembership.get(host);
              return record && record.revokedAt !== null ? 'withdrawn' : 'unavailable';
            },
            send: async (host, message) => {
              if (!lanBridge) throw new BotNetworkDeliveryError('unable-to-deliver');
              await lanBridge.send(host, message);
            },
          }),
        'botharness: LAN Bot network capability',
      );
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
          localVideo: ({ deviceId, command, signal }) =>
            localVideoCommand(videoOwner(), { deviceId }, command, signal),
          voiceCall: ({ deviceId, command, signal }) => voiceCall({ deviceId }, command, signal),
          log: (phase) => write('device-lan', phase, `device-lan phase=${phase}`),
        }),
      ...(options.botNetwork === undefined
        ? {}
        : {
            collaboration: () => {
              const owners = options.botNetwork!;
              const host = pairing.host();
              const record = (event: { phase: string; durationMs: number; code?: string }) =>
                write(
                  'bot-network',
                  event.phase,
                  JSON.stringify({ module: 'bot-network', initiator: 'host', ...event }),
                );
              const discovery = createLanBotDiscovery({
                identity: async () => ({
                  hostId: host.id,
                  name: host.name.slice(0, 128),
                  publicKey: (await identity.publicIdentity()).publicKey,
                }),
                record,
              });
              lanDiscovery = discovery;
              const bridge = createLanBotBridge({
                hostId: host.id,
                key: identity.key,
                peers: discovery.candidates,
                admission: lanMembership,
                knownKey: (id) => owners.channels.remoteHostKey?.(id),
                trustKey: (id, key, membership) => {
                  if (!owners.channels.trustRemoteHostKey)
                    throw new Error('network-key-storage-unavailable');
                  owners.channels.trustRemoteHostKey(id, key, membership);
                },
                knownMemberships: () =>
                  owners.channels.list().flatMap((channel) =>
                    channel.remoteBot?.membership
                      ? [
                          {
                            hostId: channel.remoteBot.hostId,
                            membership: channel.remoteBot.membership,
                          },
                        ]
                      : [],
                  ),
                withdrawn: (id) => botNetworks.observeWithdrawal(id),
                unbound: (id) => owners.withdrawNetworkMembership(id),
                directory: localBotDirectory,
                receive: (sender, message) => receiveNetworkBotDm(owners, sender, message),
                record,
              });
              lanBridge = bridge;
              let sweep: ReturnType<typeof setInterval> | undefined;
              let pending = false;
              let closed = false;
              const refresh = () => {
                if (closed || pending) return;
                pending = true;
                void bridge
                  .refresh(true)
                  .catch(() => record({ phase: 'lan-refresh-failed', durationMs: 0 }))
                  .finally(() => {
                    pending = false;
                  });
              };
              return {
                handle: bridge.handle,
                async start(port: number) {
                  await discovery.start(port);
                  if (closed) return;
                  refresh();
                  sweep = setInterval(refresh, 10_000);
                  sweep.unref();
                },
                close() {
                  if (closed) return;
                  closed = true;
                  clearInterval(sweep);
                  bridge.close();
                  discovery.close();
                  if (lanDiscovery === discovery) lanDiscovery = undefined;
                  if (lanBridge === bridge) lanBridge = undefined;
                },
              };
            },
          }),
      log: (event) =>
        write('device-lan', event.phase, JSON.stringify({ module: 'device-lan', ...event })),
    });
    const lanBots =
      options.botNetwork === undefined
        ? undefined
        : createLanBotControl({
            membership: lanMembership,
            candidates: () => lanDiscovery?.candidates() ?? [],
            state: () => lanDiscovery?.status() ?? 'off',
            identity: async () => ({
              hostId: pairing.host().id,
              name: pairing.host().name,
              publicKey: (await identity.publicIdentity()).publicKey,
            }),
            changed: async (host) => {
              await lanBridge?.refresh();
              await botNetworks.observeWithdrawal(host);
            },
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
      record: (phase, info) => {
        write('device-connect', phase, `device-connect phase=${phase}${info ? ` ${info}` : ''}`);
        recordConnectTelemetry(options.telemetry, phase);
      },
    });
    let connectBots: ReturnType<typeof createConnectBotBridge> | undefined;
    if (options.botNetwork !== undefined) {
      const owners = options.botNetwork;
      connectBots = createConnectBotBridge({
        hostId: pairing.host().id,
        key: identity.key,
        account: account.botNetwork,
        directory: localBotDirectory,
        receive: (sender, message) => receiveNetworkBotDm(owners, sender, message),
        knownKey: (id) => owners.channels.remoteHostKey?.(id),
        trustKey: (id, key, membership) => {
          if (!owners.channels.trustRemoteHostKey)
            throw new Error('network-key-storage-unavailable');
          owners.channels.trustRemoteHostKey(id, key, membership);
        },
        knownMemberships: () =>
          owners.channels.list().flatMap((channel) =>
            channel.remoteBot?.membership === undefined
              ? []
              : [
                  {
                    hostId: channel.remoteBot.hostId,
                    membership: channel.remoteBot.membership,
                  },
                ],
          ),
        withdrawn: (hostId) => botNetworks.observeWithdrawal(hostId),
        unbound: (hostId) => owners.withdrawNetworkMembership(hostId),
        record: (event) =>
          write(
            'bot-network',
            event.phase,
            JSON.stringify({ module: 'bot-network', initiator: 'host', ...event }),
          ),
      });
      const bridge = connectBots;
      webCtx.effect(() => {
        const detach = botNetworks.attach(bridge);
        const refresh = () => {
          const started = Date.now();
          void bridge.refresh(true).catch(() =>
            write(
              'bot-network',
              'connect-refresh-refused',
              JSON.stringify({
                module: 'bot-network',
                initiator: 'host',
                phase: 'connect-refresh-refused',
                code: 'connect-unavailable',
                durationMs: Date.now() - started,
              }),
            ),
          );
        };
        const timer = setInterval(refresh, 60_000);
        timer.unref();
        return () => {
          clearInterval(timer);
          detach();
          bridge.close();
        };
      }, 'botharness: Connect Bot network');
    }
    if (options.requestStatus) {
      activity = createActivityDelivery({
        database: attachOperationalModule(options.database, 'live-activity'),
        provider: account.activity,
        request: options.requestStatus,
        deviceActive: (deviceId) =>
          pairing.list().some((device) => device.id === deviceId && device.revokedAt === undefined),
        record: (phase, detail) =>
          write(
            'live-activity',
            phase,
            `live-activity phase=${phase} initiator=${detail.initiator} code=${detail.code} durationMs=${detail.durationMs}`,
          ),
      });
      const delivery = activity;
      webCtx.effect(() => {
        const reconcile = () => {
          const started = Date.now();
          void delivery
            .reconcile()
            .catch(() =>
              write(
                'live-activity',
                'reconcile-failed',
                `live-activity phase=reconcile-failed initiator=host code=delivery-error durationMs=${Date.now() - started}`,
              ),
            );
        };
        const settle = coalesce(reconcile, {
          delayMs: PUSH_SETTLE_MS,
          maxWaitMs: SETTLE_MAX_WAIT_MS,
        });
        const off = options.database.subscribe(({ module, topics }) => {
          if (module === 'live-activity' || module === 'telemetry') return;
          if (topics.length > 0 && topics.every((topic) => topic === 'usage')) return;
          settle.schedule();
        });
        const sweep = setInterval(reconcile, 60_000);
        return () => {
          off();
          settle.cancel();
          clearInterval(sweep);
          delivery.dispose();
          activity = undefined;
        };
      }, 'botharness: Live Activity delivery');
    }
    webCtx.effect(() => {
      void connect
        .start()
        .then(() => account.start())
        .then(() => connectBots?.refresh(true))
        .catch(() => {
          write(
            'bot-network',
            'connect-start-refused',
            JSON.stringify({
              module: 'bot-network',
              initiator: 'host',
              phase: 'connect-start-refused',
              code: 'connect-unavailable',
            }),
          );
        });
      options.onAccount?.(account);
      return () => {
        options.onAccount?.(undefined);
        void account.close().then(() => connect.close());
      };
    }, 'botharness: device connect tunnel');
    const publishKey = credentialKey('botharness-core', 'device-tailscale');
    const publishing = createManagedPhoneRoute({
      port: webServer.port,
      read: async () => {
        const credentials = options.credentials?.();
        if (!credentials) throw new Error('publishing-storage-unavailable');
        const record = await credentials.readRecord(publishKey);
        return record?.kind === 'grant' ? parseManagedPhoneRoute(record.payload) : undefined;
      },
      write: async (state) => {
        const credentials = options.credentials?.();
        if (!credentials) throw new Error('publishing-storage-unavailable');
        await credentials.modifyRecord(publishKey, async () => ({ kind: 'grant', payload: state }));
      },
      log: (event) =>
        write(
          'device-tailscale',
          event.phase,
          JSON.stringify({ module: 'device-tailscale', ...event }),
        ),
    });
    const publishingReady = publishing.start();
    webCtx.effect(() => () => publishing.close(), 'botharness: managed Tailscale publishing');
    const routes = async () => {
      await publishingReady;
      const status = await publishing.status();
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
      ...(lanBots ? { lanBots } : {}),
      publish: async () => {
        await publishingReady;
        return publishing.enable();
      },
      unpublish: async () => {
        await publishingReady;
        return publishing.disable();
      },
    });
    for (const [path, methods] of [
      [DEVICES_PATH, ['GET']],
      [`${DEVICES_PATH}/requests`, ['GET']],
      [`${DEVICES_PATH}/offer`, ['POST']],
      [`${DEVICES_PATH}/offer-status`, ['POST']],
      [`${DEVICES_PATH}/approve-key`, ['POST']],
      [`${DEVICES_PATH}/revoke`, ['POST']],
      [`${DEVICES_PATH}/connect`, ['POST']],
      [`${DEVICES_PATH}/account-hosts`, ['GET']],
      [`${DEVICES_PATH}/account-hosts/revoke`, ['POST']],
      [`${DEVICES_PATH}/lan`, ['POST']],
      [`${DEVICES_PATH}/lan-bots`, ['GET', 'POST']],
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
      localVideo: ({ deviceId, command, signal }) =>
        localVideoCommand(videoOwner(), { deviceId }, command, signal),
      voiceCall: ({ deviceId, command, signal }) => voiceCall({ deviceId }, command, signal),
      ...(push === undefined ? {} : { push: createDevicePushHttp(push) }),
      ...(activity === undefined ? {} : { activity: activity.handle }),
      connectOffer: (body, signature) => account.verifyOffer(body, signature),
    });
    webCtx.effect(
      () =>
        webServer.register({
          kind: 'prefix',
          path: DEVICE_GATEWAY_PREFIX,
          handler: async (request, response) => {
            if (request.url?.startsWith(`${BOT_CONNECT_PATH}/`)) {
              if (connectBots === undefined) {
                response.writeHead(503);
                response.end();
                return;
              }
              await connectBots.handle(request, response);
              return;
            }
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
