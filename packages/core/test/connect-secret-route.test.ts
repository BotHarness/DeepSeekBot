import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';

import { SECRET_ROUTE_METHODS } from '../src/bridge/secret-route.js';
import { createGatewayOrigin } from '../src/devices/connect.js';
import { createDeviceGateway } from '../src/devices/gateway.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { DEVICE_ROUTE_HEADER, stampConnectRoute } from '../src/devices/route-context.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return (server.address() as AddressInfo).port;
}

async function rig() {
  const seen: string[] = [];
  const logs: string[] = [];
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('connect-secret-route-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'test',
  });
  const nativeMux = new WebSocketServer({ noServer: true });
  let gateway: ReturnType<typeof createDeviceGateway>;
  const host = createServer((request, response) => {
    if (request.url?.startsWith('/botharness-device'))
      return void gateway.handle(request, response);
    if (request.url === '/?token=test') {
      response.writeHead(302, { 'set-cookie': 'dsh=test', location: '/' });
      return response.end();
    }
    if (request.headers.cookie !== 'dsh=test') {
      response.writeHead(401);
      return response.end();
    }
    const parts: Buffer[] = [];
    request.on('data', (part: Buffer) => parts.push(part));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(parts).toString()) as { rpcId: string; method: string };
      seen.push(body.method);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          type: 'server-response',
          rpcId: body.rpcId,
          result: { ok: true, value: { accepted: true } },
        }),
      );
    });
  });
  host.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/botharness-device'))
      return void gateway.upgrade(request, socket, head);
    if (request.headers.cookie !== 'dsh=test') return socket.destroy();
    nativeMux.handleUpgrade(request, socket, head, (client) => {
      client.on('message', (data) => {
        const frame = JSON.parse(data.toString()) as {
          type: string;
          streamId: string;
          endpoint?: string;
        };
        if (frame.type !== 'open') return;
        seen.push(frame.endpoint!);
        client.send(
          JSON.stringify({ type: 'item', streamId: frame.streamId, value: { ready: true } }),
        );
      });
    });
  });
  const port = await listen(host);
  gateway = createDeviceGateway({
    pairing,
    port: () => port,
    authenticatedUrl: (base) => `${base}?token=test`,
    log: (line) => logs.push(line),
  });
  const origin = createServer((request, response) => {
    stampConnectRoute(request);
    void gateway.handle(request, response);
  });
  origin.on('upgrade', (request, socket, head) => {
    stampConnectRoute(request);
    void gateway.upgrade(request, socket, head);
  });
  const originPort = await listen(origin);
  const exposed = createGatewayOrigin(() => port);
  const exposedPort = await listen(exposed);
  cleanup.push(() => {
    for (const client of nativeMux.clients) client.terminate();
    nativeMux.close();
    for (const socket of exposed.upgraded) socket.destroy();
  });
  const offer = pairing.createOffer();
  const paired = await fetch(`http://127.0.0.1:${port}/botharness-device/pair`, {
    method: 'POST',
    body: JSON.stringify({ offer: offer.offer, name: 'test device' }),
  });
  const device = (await paired.json()) as { credential: string; deviceId: string };
  const headers = {
    authorization: `Device ${device.credential}`,
    'content-type': 'application/json',
    [DEVICE_ROUTE_HEADER]: 'tailscale',
  };
  const call = async (method: string, connect = true) => {
    const result = await fetch(
      `http://127.0.0.1:${connect ? originPort : port}/botharness-device/api/${method}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'test-call',
          method,
          payload: { args: { value: 'synthetic-secret-must-not-dispatch' } },
        }),
      },
    );
    return result.json();
  };
  const socket = async (connect = true, ticket?: string) => {
    const client = new WebSocket(
      `ws://127.0.0.1:${connect ? originPort : port}/botharness-device/api/remote.mux${ticket ? `?ticket=${ticket}` : ''}`,
      {
        headers: ticket ? {} : headers,
      },
    );
    cleanup.push(() => client.terminate());
    await new Promise<void>((resolve, reject) => {
      client.once('open', resolve);
      client.once('error', reject);
    });
    return client;
  };
  return { seen, logs, call, socket, pairing, device, originPort, exposedPort, headers };
}

function frame(client: WebSocket, endpoint: string, streamId: string) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    client.once('message', (data) =>
      resolve(JSON.parse(data.toString()) as Record<string, unknown>),
    );
    client.once('error', reject);
    client.send(
      JSON.stringify({
        type: 'open',
        endpoint,
        streamId,
        payload: { args: { value: 'synthetic-secret-must-not-dispatch' } },
      }),
    );
  });
}

describe('Unencrypted Connect route guard behind the origin', () => {
  it('covers private input, provider credential values, generic secret settings and IM setup', () => {
    expect(SECRET_ROUTE_METHODS).toEqual([
      'botharness/privateInputSubmit',
      'botharness/privateInputReplace',
      'botharness/cloudConnections',
      'credentials/set',
      'settings/update',
      'settings/replace',
      'settings/mutate',
      'dsh-im/app-setup',
    ]);
  });

  it.each(SECRET_ROUTE_METHODS)(
    'refuses %s before unary or mux dispatch, leaving direct calls usable',
    async (method) => {
      const host = await rig();
      expect(await host.call(method)).toMatchObject({
        type: 'server-response',
        rpcId: 'test-call',
        result: { ok: false, error: { code: 'secret-route-refused' } },
      });
      const socket = await host.socket();
      expect(await frame(socket, method, 'secret')).toMatchObject({
        type: 'error',
        streamId: 'secret',
        error: { code: 'secret-route-refused' },
      });
      expect(host.seen).toEqual([]);
      expect(host.logs.join('\n')).not.toContain('synthetic-secret');
      expect(await host.call(method, false)).toMatchObject({
        result: { ok: true, value: { accepted: true } },
      });
      expect(host.seen).toEqual([method]);
      expect(await frame(socket, 'botharness/followRoster', 'safe')).toMatchObject({
        type: 'item',
        streamId: 'safe',
      });
      const closed = new Promise((resolve) => socket.once('close', resolve));
      host.pairing.revoke(host.device.deviceId);
      await closed;
    },
  );

  it('returns a bounded refusal for an oversized unary envelope without dispatch', async () => {
    const host = await rig();
    const response = await fetch(
      `http://127.0.0.1:${host.originPort}/botharness-device/api/credentials/set`,
      { method: 'POST', headers: host.headers, body: 'x'.repeat(1024 * 1024 + 1) },
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ code: 'secret-route-refused' });
    expect(host.seen).toEqual([]);
  });

  it('keeps status, cancel and revoke usable', async () => {
    const host = await rig();
    for (const method of [
      'privateInputStatus',
      'privateInputCancel',
      'privateAccountStatus',
      'privateAccountRevoke',
      'privateMcpServerRemove',
      'privateMcpServerEnable',
    ])
      expect(await host.call(`botharness/${method}`)).toMatchObject({ result: { ok: true } });
  });

  it('applies the same refusal to browser ticket-authenticated mux calls', async () => {
    const host = await rig();
    const response = await fetch(
      `http://127.0.0.1:${host.originPort}/botharness-device/stream-ticket`,
      { method: 'POST', headers: host.headers },
    );
    const { ticket } = (await response.json()) as { ticket: string };
    const socket = await host.socket(true, ticket);
    expect(await frame(socket, 'botharness/privateInputSubmit', 'ticketed')).toMatchObject({
      error: { code: 'secret-route-refused' },
    });
    expect(host.seen).toEqual([]);
  });
  it.each([
    'not-json',
    'null',
    '[]',
    '{"type":"open","streamId":17}',
    '{"type":"open","streamId":"bad","endpoint":[]}',
  ])('closes malformed mux input without dispatch: %s', async (input) => {
    const host = await rig();
    const socket = await host.socket();
    const closed = new Promise((resolve) => socket.once('close', resolve));
    socket.send(input);
    await closed;
    expect(host.seen).toEqual([]);
  });
  it('does not forward uplink data belonging to a refused stream', async () => {
    const host = await rig();
    const socket = await host.socket();
    await frame(socket, 'credentials/set', 'blocked');
    socket.send(JSON.stringify({ type: 'item', streamId: 'blocked', value: 'synthetic-secret' }));
    socket.send(JSON.stringify({ type: 'end', streamId: 'blocked' }));
    await frame(socket, 'botharness/followRoster', 'allowed');
    expect(host.seen).toEqual(['botharness/followRoster']);
  });
});

it('refuses legacy plaintext HTTP and mux at the actual Connect origin before dispatch', async () => {
  const host = await rig();
  for (const path of ['/pair', '/stream-ticket', '/api/botharness/list', '/api/credentials/set']) {
    for (const headers of [{}, host.headers]) {
      const response = await fetch(
        `http://127.0.0.1:${host.exposedPort}/botharness-device${path}`,
        { method: 'POST', headers, body: '{}' },
      );
      expect(response.status).toBe(404);
    }
  }
  const client = new WebSocket(
    `ws://127.0.0.1:${host.exposedPort}/botharness-device/api/remote.mux`,
    { headers: host.headers },
  );
  client.on('error', () => undefined);
  cleanup.push(() => client.terminate());
  const status = await new Promise<number | undefined>((resolve) =>
    client.once('unexpected-response', (_request, response) => {
      response.resume();
      resolve(response.statusCode);
      client.terminate();
    }),
  );
  expect(status).toBe(404);
  expect(host.seen).toEqual([]);
});
