import { humanContext, OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods, createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { createHostRelationships } from '../src/devices/relationships.js';
import { createHash } from 'node:crypto';
import { createServer, request, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import type { Duplex } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createDeviceGateway, DEVICE_GATEWAY_PREFIX } from '../src/devices/gateway.js';
import { APP_VERSION_HEADER, MIN_PHONE_APP_VERSION } from '../src/devices/client-compat.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createGatewayOrigin } from '../src/devices/connect.js';
import { DEVICE_ROUTE_HEADER, isConnectRequest } from '../src/devices/route-context.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const servers: Server[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    ),
  );
});

async function fakeDsh(
  connectOffer?: Parameters<typeof createDeviceGateway>[0]['connectOffer'],
  localVideo?: Parameters<typeof createDeviceGateway>[0]['localVideo'],
  rpc?: (method: string, payload: unknown) => unknown,
  activity?: Parameters<typeof createDeviceGateway>[0]['activity'],
  databaseOwner?: OperationalDatabaseOwner,
  ownerHumanId?: () => string,
) {
  const state = {
    secret: 1,
    token: 'launch-token',
    seen: [] as Record<string, unknown>[],
    upgrades: [] as string[],
    mints: 0,
  };
  const cookie = () => `dsh=${String(state.secret)}`;
  let gateway: ReturnType<typeof createDeviceGateway> | undefined;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname.startsWith(DEVICE_GATEWAY_PREFIX)) return void gateway!.handle(req, res);
    if (url.pathname === '/' && url.searchParams.get('token') === state.token) {
      state.mints++;
      res.writeHead(303, { 'set-cookie': `${cookie()}; HttpOnly`, location: '/' });
      return res.end();
    }
    if (req.headers.cookie !== cookie()) {
      res.writeHead(401);
      return res.end();
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') {
      res.writeHead(403);
      return res.end('forbidden');
    }
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', async () => {
      const { [DEVICE_ROUTE_HEADER]: routeTag, ...headers } = req.headers;
      state.seen.push({
        ...headers,
        path: url.pathname,
        connect: isConnectRequest(req),
        routeHeaderPresent: routeTag !== undefined,
      });
      if (
        url.pathname === '/api/botharness/bot-avatar' &&
        url.searchParams.get('slug') === 'ada' &&
        url.searchParams.get('v') === 'portrait-1'
      ) {
        res.writeHead(200, { 'content-type': 'image/png', 'set-cookie': 'leak=1' });
        return res.end(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      }
      if (rpc !== undefined) {
        const input = JSON.parse(Buffer.concat(chunks).toString());
        const result = await rpc(input.method, input.payload.args);
        if (result === 'lost-response') return res.destroy();
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ type: 'server-response', result }));
      }
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'leak=1' });
      res.end(JSON.stringify({ path: url.pathname, body: Buffer.concat(chunks).toString() }));
    });
  });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url?.startsWith(DEVICE_GATEWAY_PREFIX)) return void gateway!.upgrade(req, socket, head);
    if (req.headers.cookie !== cookie()) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    state.upgrades.push(req.url ?? '');
    state.seen.push({
      upgrade: req.url,
      connect: isConnectRequest(req),
      routeHeaderPresent: req.headers[DEVICE_ROUTE_HEADER] !== undefined,
      routeHeaderCount: req.rawHeaders.filter(
        (value, index) => index % 2 === 0 && value.toLowerCase() === DEVICE_ROUTE_HEADER,
      ).length,
    });
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
    );
    socket.pipe(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const port = (server.address() as AddressInfo).port;
  const owner =
    databaseOwner ??
    trackTestOwner(
      mountOperationalDatabase({
        dshHome: createTempRoot('botharness-device-gateway-'),
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      }),
    );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'studio',
    ...(ownerHumanId ? { ownerHumanId } : {}),
  });
  gateway = createDeviceGateway({
    pairing,
    port: () => port,
    authenticatedUrl: (base) => `${base}?token=${state.token}`,
    ...(connectOffer === undefined ? {} : { connectOffer }),
    ...(localVideo === undefined ? {} : { localVideo }),
    ...(activity === undefined ? {} : { activity }),
  });
  return { state, port, pairing, base: `http://127.0.0.1:${String(port)}` };
}

async function pair(base: string, offer: string) {
  const response = await fetch(`${base}/botharness-device/pair`, {
    method: 'POST',
    body: JSON.stringify({ offer, name: 'iPhone' }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, string> };
}

it('retains the authenticated Owner Human on paired Client messages and refuses revoked writes', async () => {
  const core = createCore({
    dshHome: createTempRoot('gateway-human-context-'),
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('unexpected');
      },
    },
  });
  trackTestOwner(core.operationalDatabase);
  let offPairing: (() => void) | undefined;
  try {
    const methods = createBridgeMethodsForHumans(core);
    const created = methods(core.team.ownerContext()).create({
      displayName: 'Gateway Human',
      persona: 'Short replies',
    });
    expect(created.ok).toBe(true);
    const bot = core.registry.list()[0]!;
    const channel = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, bot.slug, bot.displayName)!;
    const live = await fakeDsh(
      undefined,
      undefined,
      (method, payload) => {
        const current = methods(core.team.ownerContext());
        if (method === 'botharness/channelMessages') return current.channelMessages(payload);
        if (method !== 'botharness/channelSend') throw new Error('unexpected method');
        return current.channelSend(payload);
      },
      undefined,
      core.operationalDatabase,
      () => core.team.ownerContext().humanId,
    );
    const client = await pair(live.base, live.pairing.createOffer().offer);
    const send = (credential = client.body.credential, channelId = channel.id) =>
      fetch(live.base + DEVICE_GATEWAY_PREFIX + '/api/botharness/channelSend', {
        method: 'POST',
        headers: {
          authorization: 'Device ' + credential,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'human-context',
          method: 'botharness/channelSend',
          humanId: 'spoofed-envelope',
          payload: {
            args: { channelId, body: 'Owner message', humanId: 'spoofed-payload' },
          },
        }),
      });
    expect(await (await send()).json()).toMatchObject({ result: { ok: true } });
    const events = () =>
      attachOperationalModule(core.operationalDatabase, 'human-context-test').read((db) =>
        db.prepare('SELECT human_id FROM source_events WHERE channel_id = ?').all(channel.id),
      );
    expect(events()).toEqual([{ human_id: OWNER_HUMAN_CONTEXT.humanId }]);
    offPairing = core.team.bindPairing(live.pairing);
    await core.team.setOwnerPassword(OWNER_HUMAN_CONTEXT, 'owner-password-1');
    await core.team.setMode(OWNER_HUMAN_CONTEXT, true);
    const next = await core.team.createMember(OWNER_HUMAN_CONTEXT, 'nextowner', 'Next Owner');
    const nextHuman = humanContext(next.member.humanId);
    await core.team.changePassword(nextHuman, next.initialPassword, 'next-owner-password-1');
    const pending = live.pairing.createOffer();
    await core.team.transferOwner(OWNER_HUMAN_CONTEXT, nextHuman.humanId, 'owner-password-1');
    expect((await send()).status).toBe(401);
    expect(live.pairing.redeem({ offer: pending.offer })).toEqual({
      ok: false,
      code: 'offer-invalid',
    });
    expect(events()).toEqual([{ human_id: OWNER_HUMAN_CONTEXT.humanId }]);
    const relationships = createHostRelationships({
      database: attachOperationalModule(core.operationalDatabase, 'host-relationships'),
      pairing: live.pairing,
    });
    const peer = {
      id: 'trusted-host',
      name: 'Trusted',
      publicKey: 'ab'.repeat(32),
      routes: ['http://127.0.0.1:31002'],
    };
    const relationship = relationships.propose({ peer, direction: 'incoming' });
    relationships.approve(relationship.id, peer.publicKey);
    relationships.activate(relationship.id, peer.publicKey);
    const offer = relationships.enrollment(relationship.id, peer.publicKey, {
      name: 'New Owner derived',
      publicKey: 'cd'.repeat(32),
    });
    const derived = live.pairing.redeem({ offer: offer.offer, publicKey: 'cd'.repeat(32) });
    if (!derived.ok) throw new Error(derived.code);
    const nextBot = core.registry.create({
      slug: 'next-private-bot',
      displayName: 'Next private Bot',
      ownerHumanId: nextHuman.humanId,
    });
    if (!nextBot.ok) throw new Error(nextBot.reason);
    const nextChannel = core.channels.getOrCreateDm(
      nextHuman,
      nextBot.record.slug,
      nextBot.record.displayName,
    )!;
    expect(await (await send(derived.credential, nextChannel.id)).json()).toMatchObject({
      result: { ok: true },
    });
    expect(
      attachOperationalModule(core.operationalDatabase, 'human-context-test').read((db) =>
        db.prepare('SELECT human_id FROM source_events WHERE channel_id = ?').all(nextChannel.id),
      ),
    ).toEqual([{ human_id: nextHuman.humanId }]);
    expect(await (await send(derived.credential, channel.id)).json()).toMatchObject({
      result: { ok: false },
    });
    const hidden = await fetch(
      live.base + DEVICE_GATEWAY_PREFIX + '/api/botharness/channelMessages',
      {
        method: 'POST',
        headers: {
          authorization: 'Device ' + derived.credential,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'private-read',
          method: 'botharness/channelMessages',
          payload: { args: { channelId: channel.id, limit: 10 } },
        }),
      },
    );
    expect(await hidden.json()).toMatchObject({ result: { ok: false } });
    expect(events()).toEqual([{ human_id: OWNER_HUMAN_CONTEXT.humanId }]);
    relationships.disconnect(relationship.id);
    expect((await send(derived.credential, nextChannel.id)).status).toBe(401);
  } finally {
    offPairing?.();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('does not let a paired device manage or inherit Host relationships', async () => {
  const host = await fakeDsh();
  const paired = host.pairing.redeem({ offer: host.pairing.createOffer().offer, name: 'Phone' });
  if (!paired.ok) throw new Error(paired.code);
  for (const endpoint of [
    'botharness/relationships',
    'botharness/%72elationships',
    'botharness//relationships',
  ]) {
    const response = await fetch(`${host.base}/botharness-device/api/${endpoint}`, {
      method: 'POST',
      headers: { authorization: `Device ${paired.credential}` },
      body: JSON.stringify({ action: 'enroll', id: 'forged', desktop: true }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'relationship-local-client-required' });
  }
  expect(host.state.seen).toEqual([]);
  expect(host.pairing.admit(`Device ${paired.credential}`).ok).toBe(true);
});

it('never uses the Owner session for a grant that is not bound to the current Owner', async () => {
  let ownerHumanId = OWNER_HUMAN_CONTEXT.humanId;
  const host = await fakeDsh(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => ownerHumanId,
  );
  const paired = await pair(host.base, host.pairing.createOffer().offer);
  const authorization = `Device ${paired.body.credential}`;
  const ticket = (await (
    await fetch(`${host.base}/botharness-device/stream-ticket`, {
      method: 'POST',
      headers: { authorization },
    })
  ).json()) as { ticket: string };
  // The grant now belongs to a Human who is not the Host Owner (a member grant or a transferred Owner).
  ownerHumanId = 'not-the-owner';
  const refused = { code: 'device-revoked' };
  const unary = await fetch(`${host.base}/botharness-device/api/botharness/list`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: '{"type":"client-request"}',
  });
  expect([unary.status, await unary.json()]).toEqual([401, refused]);
  const avatar = await fetch(
    `${host.base}/botharness-device/api/botharness/bot-avatar?slug=ada&v=portrait-1`,
    { headers: { authorization } },
  );
  expect([avatar.status, await avatar.json()]).toEqual([401, refused]);
  const issued = await fetch(`${host.base}/botharness-device/stream-ticket`, {
    method: 'POST',
    headers: { authorization },
  });
  expect([issued.status, await issued.json()]).toEqual([401, refused]);
  expect(await stream(host.port, { authorization })).toEqual({
    status: 401,
    body: JSON.stringify(refused),
  });
  expect(
    await stream(host.port, {}, `/botharness-device/api/remote.mux?ticket=${ticket.ticket}`),
  ).toEqual({ status: 401, body: JSON.stringify(refused) });
  expect(host.state.mints).toBe(0);
  expect(host.state.seen).toEqual([]);
  expect(host.state.upgrades).toEqual([]);
});

it('attributes Feed acknowledgement to the authenticated device and refuses revoked or missing credentials', async () => {
  const host = await fakeDsh();
  const paired = host.pairing.redeem({ offer: host.pairing.createOffer().offer });
  if (!paired.ok) throw new Error(paired.code);
  const post = (authorization?: string) =>
    fetch(`${host.base}/botharness-device/feed-read`, {
      method: 'POST',
      headers: authorization ? { authorization } : {},
      body: JSON.stringify({ deviceId: 'forged' }),
    });
  expect((await post()).status).toBe(401);
  const response = await post(`Device ${paired.credential}`);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ feedReadAt: expect.any(String) });
  expect(host.pairing.list()).toHaveLength(1);
  expect(host.pairing.list()[0]).toMatchObject({
    id: paired.device.id,
    feedReadAt: expect.any(String),
  });
  host.pairing.revoke(paired.device.id);
  expect((await post(`Device ${paired.credential}`)).status).toBe(401);
});

describe('Local Computer video gateway admission', () => {
  it('binds direct commands to admitted identity and keeps removed web routes refused', async () => {
    const admitted: string[] = [];
    const live = await fakeDsh(undefined, async ({ deviceId }) => {
      admitted.push(deviceId);
      return { ok: false, code: 'media-not-live', error: 'No live picture.' };
    });
    const phone = await pair(live.base, live.pairing.createOffer().offer);
    const credential = `Device ${phone.body.credential}`;
    for (const path of ['/api/computer/video', '/api/computer/%76ideo', '/api//computer/video/']) {
      const answer = await fetch(`${live.base}${DEVICE_GATEWAY_PREFIX}${path}`, {
        method: 'POST',
        headers: { authorization: credential, 'x-botharness-device-id': 'forged' },
        body: JSON.stringify({ kind: 'status', deviceId: 'forged' }),
      });
      expect(answer.status).toBe(409);
      expect(await answer.json()).toMatchObject({ code: 'media-not-live' });
    }
    for (const path of [
      '/web/api/computer/video',
      '/web/api/computer/%76ideo',
      '/web/api//computer/video/',
    ]) {
      const answer = await fetch(`${live.base}${DEVICE_GATEWAY_PREFIX}${path}`, {
        method: 'POST',
        headers: { authorization: credential },
        body: '{"kind":"open"}',
      });
      expect(answer.status).toBe(404);
      const upgrade = await stream(
        live.port,
        { authorization: credential },
        `${DEVICE_GATEWAY_PREFIX}${path}`,
      );
      expect(upgrade.status).toBe(404);
    }
    expect(admitted).toEqual([phone.body.deviceId, phone.body.deviceId, phone.body.deviceId]);
    expect(live.state.seen).toHaveLength(0);
    live.pairing.revoke(phone.body.deviceId!);
    const refused = await fetch(`${live.base}${DEVICE_GATEWAY_PREFIX}/api/computer/video`, {
      method: 'POST',
      headers: { authorization: credential },
      body: '{"kind":"open"}',
    });
    expect(refused.status).toBe(401);
    expect(admitted).toHaveLength(3);
  });

  it('refuses missing owner and oversized commands without proxying through the Host owner', async () => {
    const live = await fakeDsh();
    const phone = await pair(live.base, live.pairing.createOffer().offer);
    for (const [body, code] of [
      ['{"kind":"open"}', 'not-ready'],
      [JSON.stringify({ kind: 'signal', data: 'x'.repeat(128 * 1024) }), 'request-too-large'],
    ] as const) {
      const result = await fetch(`${live.base}${DEVICE_GATEWAY_PREFIX}/api/computer/video`, {
        method: 'POST',
        headers: { authorization: `Device ${phone.body.credential}` },
        body,
      });
      expect(await result.json()).toMatchObject({ code });
    }
    expect(live.state.seen).toHaveLength(0);
  });
});

function stream(
  port: number,
  headers: Record<string, string>,
  path = '/botharness-device/api/remote.mux',
): Promise<{ status: number; body: string; socket?: Socket }> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1',
      port,
      path,
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
        ...headers,
      },
    });
    req.on('upgrade', (res, socket) => resolve({ status: res.statusCode ?? 0, body: '', socket }));
    req.on('response', (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString()));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

const echo = (socket: Socket, text: string) =>
  new Promise<string>((resolve) => {
    socket.once('data', (chunk: Buffer) => resolve(chunk.toString()));
    socket.write(text);
  });

describe('device gateway', () => {
  it('pairs once and forwards unary calls with the Host-held session only', async () => {
    const host = await fakeDsh();
    const { offer } = host.pairing.createOffer();
    const paired = await pair(host.base, offer);
    expect(paired.status).toBe(200);
    expect(paired.body.credential).toMatch(/^[\w-]+\.[\w-]+$/u);
    expect(await pair(host.base, offer)).toEqual({ status: 401, body: { code: 'offer-invalid' } });

    const response = await fetch(`${host.base}/botharness-device/api/botharness/list`, {
      method: 'POST',
      headers: {
        authorization: `Device ${paired.body.credential}`,
        'content-type': 'application/json',
      },
      body: '{"type":"client-request"}',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      path: '/api/botharness/list',
      body: '{"type":"client-request"}',
    });
    expect(response.headers.get('set-cookie')).toBeNull();
    const seen = host.state.seen.at(-1)!;
    expect(seen.authorization).toBeUndefined();
    expect(seen.host).toBe(`127.0.0.1:${String(host.port)}`);
  });

  it('serves a phone app of any version and never refuses it for being old', async () => {
    const host = await fakeDsh();
    const { offer } = host.pairing.createOffer();
    const paired = await pair(host.base, offer);
    const list = (appVersion?: string) =>
      fetch(`${host.base}/botharness-device/api/botharness/list`, {
        method: 'POST',
        headers: {
          authorization: `Device ${paired.body.credential}`,
          'content-type': 'application/json',
          ...(appVersion === undefined ? {} : { [APP_VERSION_HEADER]: appVersion }),
        },
        body: '{"type":"client-request"}',
      });
    expect((await list('1.0.0')).status).toBe(200);
    expect((await list(MIN_PHONE_APP_VERSION)).status).toBe(200);
    expect((await list()).status).toBe(200);
  });

  it('refuses unpaired and cross-origin callers with coded errors', async () => {
    const host = await fakeDsh();
    const call = (headers: Record<string, string>) =>
      fetch(`${host.base}/botharness-device/api/botharness/list`, { method: 'POST', headers });
    const missing = await call({});
    expect([missing.status, await missing.json()]).toEqual([
      401,
      { code: 'device-credential-missing' },
    ]);
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const crossSite = await call({
      authorization: `Device ${paired.body.credential}`,
      origin: 'https://evil.example',
    });
    expect([crossSite.status, await crossSite.json()]).toEqual([403, { code: 'origin-refused' }]);
  });

  it('lets another Host’s browser pair and call with its device credential', async () => {
    const host = await fakeDsh();
    const browser = 'http://127.0.0.1:41000';
    const preflight = await fetch(`${host.base}/botharness-device/api/botharness/list`, {
      method: 'OPTIONS',
      headers: {
        origin: browser,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type',
        'access-control-request-private-network': 'true',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(browser);
    expect(preflight.headers.get('access-control-allow-headers')).toBe(
      'authorization, content-type',
    );
    expect(preflight.headers.get('access-control-allow-private-network')).toBe('true');

    const paired = await fetch(`${host.base}/botharness-device/pair`, {
      method: 'POST',
      headers: { origin: browser, 'content-type': 'application/json' },
      body: JSON.stringify({ offer: host.pairing.createOffer().offer, name: 'Studio browser' }),
    });
    expect(paired.headers.get('access-control-allow-origin')).toBe(browser);
    const { credential } = (await paired.json()) as { credential: string };

    const call = await fetch(`${host.base}/botharness-device/api/botharness/list`, {
      method: 'POST',
      headers: {
        origin: browser,
        authorization: `Device ${credential}`,
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
        'sec-fetch-user': '?1',
      },
      body: '{"type":"client-request"}',
    });
    expect(call.status).toBe(200);
    expect(call.headers.get('access-control-allow-origin')).toBe(browser);
    expect(host.state.seen.at(-1)!.origin).toBeUndefined();
    for (const name of ['sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-user'])
      expect(host.state.seen.at(-1)![name]).toBeUndefined();

    const withCookie = await fetch(`${host.base}/botharness-device/api/botharness/list`, {
      method: 'POST',
      headers: { origin: browser, cookie: 'botharness-device-web=x' },
    });
    expect([withCookie.status, await withCookie.json()]).toEqual([403, { code: 'origin-refused' }]);
    const web = await fetch(`${host.base}/botharness-device/web/`, {
      headers: { origin: browser, authorization: `Device ${credential}` },
    });
    expect(web.status).toBe(403);
  });

  it('forwards cross-origin avatar GET bytes only for an admitted device without cookies', async () => {
    const host = await fakeDsh();
    const browser = 'http://127.0.0.1:41000';
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const authorization = `Device ${paired.body.credential}`;
    const url = `${host.base}/botharness-device/api/botharness/bot-avatar?slug=ada&v=portrait-1`;
    const preflight = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        origin: browser,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('GET');
    expect(preflight.headers.get('access-control-allow-headers')).toContain('authorization');
    const image = await fetch(url, { headers: { origin: browser, authorization } });
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('access-control-allow-origin')).toBe(browser);
    expect(image.headers.get('vary')).toBe('origin');
    expect(image.headers.get('access-control-allow-credentials')).toBeNull();
    expect(image.headers.get('set-cookie')).toBeNull();
    expect(Buffer.from(await image.arrayBuffer())).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(host.state.seen.at(-1)).toMatchObject({
      path: '/api/botharness/bot-avatar',
      cookie: 'dsh=1',
    });
    expect(host.state.seen.at(-1)!.authorization).toBeUndefined();
    expect(host.state.seen.at(-1)!.origin).toBeUndefined();
    const admitted = host.state.seen.length;
    expect((await fetch(url, { headers: { origin: browser } })).status).toBe(401);
    expect(
      (await fetch(url, { headers: { origin: 'https://evil.example', authorization } })).status,
    ).toBe(403);
    expect(
      (await fetch(url, { headers: { origin: browser, authorization, cookie: 'dsh=1' } })).status,
    ).toBe(403);
    host.pairing.revoke(paired.body.deviceId!);
    const revoked = await fetch(url, { headers: { origin: browser, authorization } });
    expect(revoked.status).toBe(401);
    expect(await revoked.json()).toEqual({ code: 'device-revoked' });
    expect(host.state.seen).toHaveLength(admitted);
  });

  it('opens a browser stream with a one-time ticket instead of a header', async () => {
    const host = await fakeDsh();
    const browser = 'https://studio.tailnet.ts.net';
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const issue = async () => {
      const response = await fetch(`${host.base}/botharness-device/stream-ticket`, {
        method: 'POST',
        headers: { origin: browser, authorization: `Device ${paired.body.credential}` },
      });
      expect(response.headers.get('access-control-allow-origin')).toBe(browser);
      return ((await response.json()) as { ticket: string }).ticket;
    };
    const ticket = await issue();
    const path = (value: string) => `/botharness-device/api/remote.mux?ticket=${value}`;

    const open = await stream(host.port, { origin: browser }, path(ticket));
    expect(open.status).toBe(101);
    expect(await echo(open.socket!, 'frame-1')).toBe('frame-1');
    expect(host.state.upgrades.at(-1)).toBe('/api/remote.mux');
    open.socket!.destroy();

    expect(await stream(host.port, { origin: browser }, path(ticket))).toEqual({
      status: 401,
      body: '{"code":"ticket-invalid"}',
    });
    expect((await stream(host.port, { origin: browser })).status).toBe(403);
    expect(
      (await stream(host.port, { origin: 'https://evil.example' }, path(await issue()))).status,
    ).toBe(403);

    const later = await issue();
    host.pairing.revoke(paired.body.deviceId!);
    expect(await stream(host.port, { origin: browser }, path(later))).toEqual({
      status: 401,
      body: '{"code":"device-revoked"}',
    });
  });

  it('splices the stream mux, closes it on revoke, and refuses the device afterwards', async () => {
    const host = await fakeDsh();
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const authorization = `Device ${paired.body.credential}`;

    const open = await stream(host.port, {
      authorization,
      origin: host.base,
    });
    expect(open.status).toBe(101);
    expect(await echo(open.socket!, 'frame-1')).toBe('frame-1');

    const closed = new Promise((resolve) => open.socket!.on('close', resolve));
    expect(host.pairing.revoke(paired.body.deviceId!)).toEqual({ revoked: true, closedStreams: 1 });
    await closed;

    expect(await stream(host.port, { authorization })).toEqual({
      status: 401,
      body: '{"code":"device-revoked"}',
    });
    const unary = await fetch(`${host.base}/botharness-device/api/botharness/list`, {
      method: 'POST',
      headers: { authorization },
    });
    expect([unary.status, await unary.json()]).toEqual([401, { code: 'device-revoked' }]);
  });

  it('lets a paired device revoke only its own pairing', async () => {
    const host = await fakeDsh();
    const phone = await pair(host.base, host.pairing.createOffer().offer);
    const other = await pair(host.base, host.pairing.createOffer().offer);
    const unpair = (credential?: string) =>
      fetch(`${host.base}/botharness-device/unpair`, {
        method: 'POST',
        headers: credential === undefined ? {} : { authorization: `Device ${credential}` },
      });

    const missing = await unpair();
    expect([missing.status, await missing.json()]).toEqual([
      401,
      { code: 'device-credential-missing' },
    ]);
    const done = await unpair(phone.body.credential);
    expect([done.status, await done.json()]).toEqual([200, { revoked: true }]);
    const again = await unpair(phone.body.credential);
    expect([again.status, await again.json()]).toEqual([401, { code: 'device-revoked' }]);

    const devices = host.pairing.list();
    expect(devices.find((device) => device.id === phone.body.deviceId)?.revokedAt).toBeDefined();
    expect(devices.find((device) => device.id === other.body.deviceId)?.revokedAt).toBeUndefined();
  });

  it('mints relay-signed offers that only the phone holding the verifier redeems', async () => {
    const verifier = 'phone-verifier-0123456789abcdefghijklmnop';
    const verifierHash = createHash('sha256').update(verifier).digest('base64url');
    const signed: { body: string; signature: string | undefined }[] = [];
    const host = await fakeDsh(async (body, signature) => {
      signed.push({ body, signature });
      return signature === 'good'
        ? { ok: true, verifierHash, name: 'Relay iPhone' }
        : { ok: false };
    });
    const request = (signature: string) =>
      fetch(`${host.base}/botharness-device/connect/offer`, {
        method: 'POST',
        headers: { 'x-botharness-relay-signature': signature },
        body: '{"hostId":"h"}',
      });
    const refused = await request('bad');
    expect([refused.status, await refused.json()]).toEqual([
      401,
      { code: 'relay-signature-invalid' },
    ]);
    const minted = await request('good');
    const offer = (await minted.json()) as { offer: string; host: { id: string; name: string } };
    expect(minted.status).toBe(200);
    expect(offer.host).toEqual(host.pairing.host());
    expect(signed).toEqual([
      { body: '{"hostId":"h"}', signature: 'bad' },
      { body: '{"hostId":"h"}', signature: 'good' },
    ]);
    const redeem = (body: Record<string, string>) =>
      fetch(`${host.base}/botharness-device/pair`, { method: 'POST', body: JSON.stringify(body) });
    const stolen = await redeem({ offer: offer.offer, verifier: 'someone-else' });
    expect([stolen.status, await stolen.json()]).toEqual([401, { code: 'offer-invalid' }]);
    const again = (await (await request('good')).json()) as { offer: string };
    expect((await redeem({ offer: again.offer })).status).toBe(401);
    const third = (await (await request('good')).json()) as { offer: string };
    const paired = await redeem({ offer: third.offer, verifier });
    expect(paired.status).toBe(200);
    expect(host.pairing.list()[0]?.name).toBe('Relay iPhone');
    const plain = await fakeDsh();
    const absent = await fetch(`${plain.base}/botharness-device/connect/offer`, { method: 'POST' });
    expect(absent.status).toBe(404);
  });

  it('lets a paired phone remove another device it was told about', async () => {
    const host = await fakeDsh();
    const phone = await pair(host.base, host.pairing.createOffer().offer);
    const stranger = await pair(host.base, host.pairing.createOffer().offer);
    const remove = (body: unknown, credential?: string) =>
      fetch(`${host.base}/botharness-device/devices/remove`, {
        method: 'POST',
        headers: credential === undefined ? {} : { authorization: `Device ${credential}` },
        body: JSON.stringify(body),
      });
    const unpaired = await remove({ deviceId: stranger.body.deviceId });
    expect([unpaired.status, await unpaired.json()]).toEqual([
      401,
      { code: 'device-credential-missing' },
    ]);
    const unknown = await remove({ deviceId: 'nobody' }, phone.body.credential);
    expect(unknown.status).toBe(404);
    const done = await remove({ deviceId: stranger.body.deviceId }, phone.body.credential);
    expect([done.status, await done.json()]).toEqual([
      200,
      { revoked: true, device: { id: stranger.body.deviceId, name: 'iPhone' } },
    ]);
    const after = await remove({ deviceId: phone.body.deviceId }, stranger.body.credential);
    expect([after.status, await after.json()]).toEqual([401, { code: 'device-revoked' }]);
    expect(host.pairing.list().find((device) => device.id === phone.body.deviceId)?.revokedAt).toBe(
      undefined,
    );
  });

  it('carries WebRTC signalling to the Host route and ends it on revoke', async () => {
    const host = await fakeDsh();
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const authorization = `Device ${paired.body.credential}`;

    const open = await stream(
      host.port,
      { authorization },
      '/botharness-device/api/browser/webrtc/signaling?viewer=abc',
    );
    expect(open.status).toBe(101);
    expect(host.state.seen).toContainEqual(
      expect.objectContaining({ upgrade: '/api/browser/webrtc/signaling?viewer=abc' }),
    );
    expect(await echo(open.socket!, 'HELLO')).toBe('HELLO');

    const closed = new Promise((resolve) => open.socket!.on('close', resolve));
    expect(host.pairing.revoke(paired.body.deviceId!)).toEqual({ revoked: true, closedStreams: 1 });
    await closed;
    expect(
      await stream(
        host.port,
        { authorization },
        '/botharness-device/api/computer/webrtc/signaling',
      ),
    ).toEqual({ status: 401, body: '{"code":"device-revoked"}' });
  });

  it('re-mints its loopback session after a global sign-out', async () => {
    const host = await fakeDsh();
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const authorization = `Device ${paired.body.credential}`;
    const call = () =>
      fetch(`${host.base}/botharness-device/api/botharness/list`, {
        method: 'POST',
        headers: { authorization },
      });
    expect((await call()).status).toBe(200);
    host.state.secret += 1;
    const open = await stream(host.port, { authorization });
    expect(open.status).toBe(101);
    open.socket!.destroy();
    expect((await call()).status).toBe(200);
  });
});

describe('Connect route provenance', () => {
  async function originFor(port: number) {
    const origin = createGatewayOrigin(() => port);
    servers.push(origin);
    await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', resolve));
    const originPort = (origin.address() as AddressInfo).port;
    return { base: `http://127.0.0.1:${originPort}`, port: originPort };
  }

  it.each([undefined, 'connect', 'tailscale', 'loopback', ''])(
    'refuses plaintext Connect HTTP regardless of forged route tag (%s)',
    async (tag) => {
      const host = await fakeDsh();
      const origin = await originFor(host.port);
      const paired = await pair(host.base, host.pairing.createOffer().offer);
      const headers = {
        authorization: `Device ${paired.body.credential}`,
        ...(tag === undefined ? {} : { [DEVICE_ROUTE_HEADER]: tag }),
      };
      const direct = await fetch(`${host.base}/botharness-device/api/botharness/list`, { headers });
      await direct.text();
      expect(host.state.seen.at(-1)).toMatchObject({ connect: false, routeHeaderPresent: false });
      const tunneled = await fetch(`${origin.base}/botharness-device/api/botharness/list`, {
        headers,
      });
      await tunneled.text();
      expect(tunneled.status).toBe(404);
      expect(host.state.seen).toHaveLength(1);
      expect(tunneled.headers.get(DEVICE_ROUTE_HEADER)).toBeNull();
    },
  );

  it('refuses the removed full Web Client on every route, including cookies and upgrades', async () => {
    const host = await fakeDsh();
    const origin = await originFor(host.port);
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const headers = {
      authorization: `Device ${paired.body.credential}`,
      cookie: 'botharness-device-web=old',
    };
    for (const base of [host.base, origin.base]) {
      for (const path of [
        '/web',
        '/web/',
        '/web/api/botharness/privateInputSubmit',
        '/web/assets/main.js',
      ]) {
        const answer = await fetch(`${base}/botharness-device${path}`, { headers });
        expect(answer.status).toBe(404);
        await answer.text();
      }
    }
    for (const port of [host.port, origin.port]) {
      expect((await stream(port, headers, '/botharness-device/web/api/remote.mux')).status).toBe(
        404,
      );
    }
    expect(host.state.seen).toEqual([]);
  });

  it('refuses plaintext Connect upgrades and strips forged direct tags', async () => {
    const host = await fakeDsh();
    const origin = await originFor(host.port);
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const headers = {
      authorization: `Device ${paired.body.credential}`,
      [DEVICE_ROUTE_HEADER]: 'loopback',
    };
    const direct = await stream(host.port, headers);
    expect(direct.status).toBe(101);
    expect(host.state.seen.at(-1)).toMatchObject({ connect: false, routeHeaderPresent: false });
    direct.socket!.destroy();
    const tunneled = await stream(
      origin.port,
      headers,
      '/botharness-device/api/browser/webrtc/signaling',
    );
    expect(tunneled.status).toBe(404);
    expect(host.state.seen).toHaveLength(1);
  });
});

describe('mobile creation recovery through device admission', () => {
  it.each(['blank', 'git'] as const)(
    'recovers a lost %s create reply with the same Bot and DM and refuses revoked pairing',
    async (kind) => {
      let gitSource: { gitUrl: string; expectedCommit: string } | undefined;
      if (kind === 'git') {
        const directory = createTempRoot('gateway-git-source-');
        const git = (...args: string[]) =>
          execFileSync('git', args, { cwd: directory, encoding: 'utf8', windowsHide: true }).trim();
        git('init', '--quiet');
        git('config', 'user.name', 'Fixture');
        git('config', 'user.email', 'fixture@example.test');
        writeFileSync(join(directory, 'SOUL.md'), 'Paired imported persona.');
        git('add', '.');
        git('commit', '--quiet', '-m', 'source');
        vi.stubEnv('GIT_CONFIG_COUNT', '1');
        vi.stubEnv('GIT_CONFIG_KEY_0', `url.${directory.replaceAll('\\', '/')}/.insteadOf`);
        vi.stubEnv('GIT_CONFIG_VALUE_0', 'https://gateway.example/source.git');
        gitSource = {
          gitUrl: 'https://gateway.example/source.git',
          expectedCommit: git('rev-parse', 'HEAD'),
        };
      }
      const lookupMethod = kind === 'git' ? 'botImportLookup' : 'createLookup';
      const createMethod = kind === 'git' ? 'createFromGit' : 'create';
      const core = createCore({
        dshHome: createTempRoot('gateway-create-'),
        agents: {
          async runOrchestrator() {},
          async runAssignment() {},
          async close() {},
          requestAssignment() {
            throw new Error('unexpected');
          },
        },
      });
      try {
        const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, core);
        let drop = true;
        const live = await fakeDsh(undefined, undefined, async (method, payload) => {
          if (method === 'botharness/' + lookupMethod)
            return kind === 'git'
              ? methods.botImportLookup(payload)
              : methods.createLookup(payload);
          const result =
            kind === 'git' ? await methods.createFromGit(payload) : methods.create(payload);
          if (drop) {
            drop = false;
            return 'lost-response';
          }
          return result;
        });
        const phone = await pair(live.base, live.pairing.createOffer().offer);
        const payload = {
          displayName: 'Recovery',
          ...(gitSource ?? { persona: 'Short replies' }),
          description: 'QA',
          roles: ['qa'],
          operationKey: 'device-create-001',
        };
        const call = (method: string) =>
          fetch(live.base + DEVICE_GATEWAY_PREFIX + '/api/botharness/' + method, {
            method: 'POST',
            headers: {
              authorization: 'Device ' + phone.body.credential,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              type: 'client-request',
              rpcId: 'test',
              method: 'botharness/' + method,
              payload: { args: payload },
            }),
          });
        expect(await (await call(lookupMethod)).json()).toMatchObject({
          result: { ok: true, value: { receipt: null } },
        });
        expect(core.registry.list()).toHaveLength(0);
        const lost = await call(createMethod).catch(() => null);
        expect(lost === null || !lost.ok).toBe(true);
        const recovered = await (await call(lookupMethod)).json();
        expect(recovered.result.value.receipt).toMatchObject({
          operationKey: payload.operationKey,
          status: 'created',
        });
        const retried = await (await call(createMethod)).json();
        expect(retried.result.value.receipt).toEqual(recovered.result.value.receipt);
        expect(core.registry.list()).toHaveLength(1);
        expect(core.channels.list()).toHaveLength(1);
        live.pairing.revoke(phone.body.deviceId!);
        expect((await call(lookupMethod)).status).toBe(401);
        expect(core.registry.list()).toHaveLength(1);
      } finally {
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );
});

it('admits activity operations by credential, ignoring caller-supplied device identity', async () => {
  const admitted: string[] = [];
  const live = await fakeDsh(undefined, undefined, undefined, async (input) => {
    admitted.push(input.deviceId);
    return { status: 200, body: { accepted: true } };
  });
  const paired = live.pairing.redeem({ offer: live.pairing.createOffer().offer, name: 'Phone' });
  if (!paired.ok) throw new Error('pairing failed');
  const url = `${live.base}/botharness-device/activity/register`;
  expect((await fetch(url, { method: 'POST', body: '{}' })).status).toBe(401);
  expect(admitted).toHaveLength(0);
  const request = () =>
    fetch(url, {
      method: 'POST',
      headers: { authorization: `Device ${paired.credential}` },
      body: JSON.stringify({ deviceId: 'other-device', token: 'private-token' }),
    });
  expect((await request()).status).toBe(200);
  expect(admitted).toEqual([paired.device.id]);
  live.pairing.revoke(paired.device.id);
  expect((await request()).status).toBe(401);
  expect(admitted).toHaveLength(1);
});
