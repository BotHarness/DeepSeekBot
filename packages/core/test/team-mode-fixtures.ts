import { createDevicePairing } from '../src/devices/pairing.js';
import { createMemberDevices } from '../src/team/devices.js';
import { createDeviceGateway } from '../src/devices/gateway.js';
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import {
  noisePublicKey,
  noiseFingerprint,
  NOISE_PROTOCOL,
} from '@botharness/host-protocol/noise/xk';
import { CONNECT_PROTOCOL } from '@botharness/host-protocol/noise/channel';
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { createAttachmentStore } from '../src/attachments/store.js';
import { createServer } from 'node:http';
import { createChannelLiveHub } from '../src/channels/live.js';
import { createChannelManagement } from '../src/channels/management.js';
import { createHumanAttentionQuery } from '../src/runtime/human-attention.js';
import { stampConnectRoute } from '../src/devices/route-context.js';
import { createTeamHttp, TEAM_PATH } from '../src/team/http.js';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { RemoteAccessService } from '@deepseek-ai/dsh-api-remote-access';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { vi, type Mock } from 'vitest';
import { z } from 'zod';
import { mountContentPurge } from '../src/purge/owner.js';
import { TeamService } from '../src/team/service.js';
import { memberPolicy } from '../src/team/policy.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { composerRecoveryIdentity } from '../src/bridge/composer-recovery.js';
import { registerBridge } from '../src/bridge/rpc.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { createTestRosterStore } from './roster-fixture.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTempRoot, createTestOwnership } from './helpers.js';

export const closes: Array<() => Promise<void>> = [];

export function teamFixture(
  options: {
    urls?: () => string[];
    routes?: () => Promise<string[]>;
    now?: () => number;
    warn?: (message: string) => void;
  } = {},
) {
  const root = createTempRoot('team-mode-');
  const registry = createTestRegistry({ rootDir: root });
  const db = registryDatabase(root);
  const database = attachOperationalModule(db, 'team');
  const attachments = createAttachmentStore({ rootDir: join(root, 'attachments') });
  const channels = createSqliteChannelStore({
    database,
    rootDir: join(root, 'channels'),
    attachments,
  });
  let placements: Array<{ sourceEventId: string; channelId: string; messageId: string }> = [];
  const purge = mountContentPurge({
    dshHome: root,
    database: db,
    ...(options.now ? { now: () => new Date(options.now!()) } : {}),
  });
  const diagnostics: Mock = vi.fn();
  const team = new TeamService(database, channels, {
    purge,
    log: diagnostics,
    now: options.now ?? (() => Date.parse('2026-11-14T00:00:00Z')),
  });
  const live = createChannelLiveHub(
    channels,
    undefined,
    () => placements,
    undefined,
    (human) => team.isOwner(human),
    undefined,
    (human, id) => team.channelAccess.canRead(human, id, true),
    (human, id) => team.channelAccess.canKnow(human, id),
  );
  team.onAccessChanged(() => live.refreshAccess());
  const ctx = new Context();
  const peers: Peer[] = [];
  const invalidate: Mock = vi.fn();
  const off = team.bindRuntime({
    createPeer: (principal) => {
      const peer = new Peer(ctx, { principal });
      peers.push(peer);
      return peer;
    },
    invalidate,
    urls: options.urls ?? (() => ['https://host.test/botharness-device/team/']),
  });
  closes.push(async () => {
    live.close();
    await off();
    await ctx.fiber.dispose();
    purge.close();
    db.close();
  });
  const pairing = createDevicePairing({
    database,
    hostName: 'Team Host',
    ownerHumanId: () => team.ownerContext().humanId,
    ...(options.now ? { now: options.now } : {}),
    members: {
      redeem: (id, name, key) => team.createDeviceGrant(id, name, key),
      admit: (authorization, key) => {
        const peer = team.admitDevice(authorization, key);
        return peer?.principal.kind === 'botharness-member'
          ? team.device(peer.principal.grantId)
          : undefined;
      },
      refusal: (authorization) => team.deviceRefusal(authorization),
      check: (id) => team.device(id),
      attach: (id, close) => team.attachDeviceStream(id, close),
    },
  });
  const privateKey = randomBytes(32);
  const publicKey = noisePublicKey(privateKey);
  const encryption: import('../src/devices/noise-identity.js').EncryptionIdentity = {
    protocol: CONNECT_PROTOCOL,
    noise: NOISE_PROTOCOL,
    required: true as const,
    publicKey: Buffer.from(publicKey).toString('hex'),
    fingerprint: noiseFingerprint(publicKey),
  };
  const devices = createMemberDevices({
    team,
    pairing,
    encryption: async () => encryption,
    routes:
      options.routes ??
      (async () => ['https://host.test', 'http://127.0.0.1:3080', 'http://192.168.1.2:3080']),
    ...(options.now ? { now: options.now } : {}),
  });
  const unbindDevices = team.bindDevices(devices);
  closes.push(async () => unbindDevices());
  const methods = createBridgeMethodsForHumans({
    ...(options.warn ? { warn: options.warn } : {}),
    registry,
    channels,
    attachments,
    team,
    states: createBotStateTracker(),
    ownership: createTestOwnership(),
    roster: createTestRosterStore({ database: db }),
    humanAttention: createHumanAttentionQuery(database),
    composerIdentity: (human = owner) =>
      composerRecoveryIdentity(
        join(root, 'composer-host-id'),
        join(root, 'composer-profile-id'),
        human.humanId,
      ),
    channelManagement: createChannelManagement({
      database,
      registry,
      channels,
      isProtectedBot: () => false,
    }),
    createBotId: () => 'ada',
  });
  registerBridge(
    ctx,
    methods,
    undefined,
    {
      followRoster: (human, signal) => live.followRoster(human, signal),
      followActivity: (human, signal) => live.followActivity(human, signal),
      followChannel: (human, id, limit, signal, drafts) =>
        live.followChannel(human, id, limit, signal, drafts),
      journalPage: (human, id, request) => channels.readHumanJournalPage(human, id, request),
      filesPage: (human, id, request) => channels.readHumanFilesPage(human, id, request),
      changes: (human, id, request) => channels.readHumanChanges?.(human, id, request),
      changeCursor: () => channels.changeCursor?.(),
      async *followCompanion() {},
    },
    team,
  );
  ctx.provide('typert');
  ctx.set('typert', {
    local: { get: () => undefined, hasSeen: () => false },
    lookups: {
      definitions: () => [
        { key: 'botharness-public-flag', parameter: 'publicValue', wire: 'public' },
      ],
      get: (key: string) =>
        key === 'botharness-public-flag'
          ? { wire: 'public', resolve: (value: unknown) => z.boolean().parse(value) }
          : undefined,
    },
    resources: { entries: () => [] },
  });
  const access = new RemoteAccessService(ctx);
  access.registerPolicy('botharness-member', memberPolicy(team));
  const gateway = new TypertGatewayService(ctx, {});
  return {
    team,
    devices,
    pairing,
    encryption,
    privateKey,
    purge,
    root,
    channels,
    attachments,
    database,
    db,
    methods,
    peers,
    ctx,
    gateway,
    access,
    invalidate,
    diagnostics,
    registry,
    live,
    setPlacements(value: typeof placements) {
      placements = value;
    },
  };
}

export async function enabledFixture(options: Parameters<typeof teamFixture>[0] = {}) {
  const fixture = teamFixture(options);
  await fixture.team.setOwnerPassword(owner, 'owner-password-1');
  await fixture.team.setMode(owner, true);
  const created = await fixture.team.createMember(owner, 'bob', 'Bob');
  return { ...fixture, ...created, human: humanContext(created.member.humanId) };
}

export class NativeSession extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'nativeSession', { namespace: 'session' });
  }
  list() {
    return { sessions: ['owner-session'] };
  }
}

Object.defineProperty(NativeSession.prototype, '@deepseek-ai/dsh-typert-protocol/remote-methods', {
  value: { version: 1, methods: [{ method: 'list', invocation: { kind: 'direct' } }] },
});

export async function memberHttp(
  f: ReturnType<typeof teamFixture>,
  remote = false,
  tls = false,
  connect = false,
) {
  const handler = createTeamHttp({
    team: f.team,
    gateway: f.gateway,
    hostName: () => 'Test Host',
    tls: () => tls,
    async readResource(_request, peer) {
      return new Response(`<html><head></head><body>${peer.principal.kind}</body></html>`, {
        headers: { 'content-type': 'text/html' },
      });
    },
    async fetchBundle() {
      return new Response('asset');
    },
  });
  const server = createServer((request, response) => {
    if (connect) stampConnectRoute(request);
    if (remote)
      Object.defineProperty(request.socket, 'remoteAddress', {
        value: '192.0.2.5',
        configurable: true,
      });
    void handler.handle(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  closes.push(async () => {
    await handler.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const origin = `http://127.0.0.1:${address.port}`;
  const signIn = (username: string, password: string, headers = {}) =>
    fetch(`${origin}${TEAM_PATH}/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ username, password }),
    });
  const password = (cookie: string, current: string, next: string, headers = {}) =>
    fetch(`${origin}${TEAM_PATH}/password`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ current, next }),
    });
  const wire = (cookie: string, command: unknown, headers = {}) =>
    fetch(`${origin}${TEAM_PATH}/__share/rpc`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', ...headers },
      body: JSON.stringify(command),
    });
  const rpc = async (cookie: string, method: string, args: Record<string, unknown>, headers = {}) =>
    (
      await wire(
        cookie,
        {
          op: 'call',
          path: `/api/botharness/${method}`,
          body: {
            type: 'client-request',
            rpcId: 'review-4',
            method: `botharness/${method}`,
            payload: { args },
          },
        },
        headers,
      )
    ).json();
  return { origin, signIn, password, wire, rpc, server };
}

export async function memberDeviceHost(
  f: ReturnType<typeof teamFixture>,
  options: { tls?: boolean; remote?: boolean } = {},
) {
  const http = createTeamHttp({
    team: f.team,
    devices: f.devices,
    gateway: f.gateway,
    hostName: () => 'Team Host',
    tls: () => options.tls ?? true,
    readResource: async () => new Response(''),
    fetchBundle: async () => new Response(''),
  });
  const mintOwner = vi.fn(() => {
    throw new Error('member-must-never-mint-owner-cookie');
  });
  let port = 0;
  const device = createDeviceGateway({
    team: http,
    pairing: f.pairing,
    port: () => port,
    authenticatedUrl: mintOwner,
  });
  const encrypted = createEncryptedGateway({
    pairing: f.pairing,
    memberDevices: f.devices,
    key: async () => Uint8Array.from(f.privateKey),
    port: () => port,
  });
  const server = createServer((req, res) => {
    if (req.url === '/botharness-device/channel') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ host: f.pairing.host(), encryption: f.encryption }));
      return;
    }
    if (options.remote)
      Object.defineProperty(req.socket, 'remoteAddress', {
        value: '192.0.2.5',
        configurable: true,
      });
    void device.handle(req, res);
  });
  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/botharness-device/channel') void encrypted.upgrade(req, socket, head);
    else void device.upgrade(req, socket, head);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing-address');
  port = address.port;
  closes.push(async () => {
    encrypted.close();
    await http.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const origin = `http://127.0.0.1:${port}`;
  const post = (path: string, input: unknown, credential?: string) =>
    fetch(`${origin}/botharness-device${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(credential ? { authorization: `Device ${credential}` } : {}),
      },
      body: JSON.stringify(input),
    });
  const signIn = (input: Record<string, unknown> = {}) =>
    post('/team/device-sign-in', {
      username: 'bob',
      password: 'initialPassword' in f ? f.initialPassword : '',
      deviceName: 'Phone',
      fingerprint: f.encryption.fingerprint,
      ...input,
    });
  const carrier: HostCarrier = {
    randomBytes: () => randomBytes(32),
    request: async (url, init) => {
      const target = new URL(url);
      const res = await fetch(`${origin}${target.pathname}${target.search}`, {
        method: init.method,
        headers: init.headers ?? {},
        signal: init.signal,
        ...(typeof init.body === 'string' ? { body: init.body } : {}),
      });
      return { status: res.status, text: () => res.text() };
    },
    openSocket: (url, events, headers) => {
      const target = new URL(url);
      const ws = new WebSocket(`ws://127.0.0.1:${port}${target.pathname}`, {
        ...(headers ? { headers } : {}),
      });
      ws.on('open', events.open);
      ws.on('message', (raw) => events.message(raw.toString()));
      ws.on('close', () => events.closed('socket-closed'));
      ws.on('error', () => events.closed('socket-error'));
      return { send: (text) => ws.send(text), close: () => ws.close() };
    },
  };
  return { origin, post, signIn, mintOwner, carrier };
}

export async function actors() {
  const f = await enabledFixture();
  await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
  const alice = await f.team.createMember(owner, 'alice', 'Alice');
  await f.team.changePassword(
    humanContext(alice.member.humanId),
    alice.initialPassword,
    'alice-password-1',
  );
  const bobLogin = await f.team.signIn('bob', 'member-password-1', 'bob-ip');
  const aliceLogin = await f.team.signIn('alice', 'alice-password-1', 'alice-ip');
  const invoke = (
    method: string,
    args: Record<string, unknown> = {},
    peer = f.team.admit(bobLogin.token) ?? bobLogin.peer,
  ) => f.gateway.invoke({ namespace: 'botharness', method, args, peer });
  return { ...f, alice, bobLogin, aliceLogin, invoke };
}

export const cleanup = async () => {
  for (const close of closes.splice(0).reverse()) await close();
  vi.restoreAllMocks();
};
