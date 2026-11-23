import { createServer, request, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../../src/database/schema-plan.js';
import { createDeviceGateway, DEVICE_GATEWAY_PREFIX } from '../../src/devices/gateway.js';
import { createDevicePairing } from '../../src/devices/pairing.js';
import { DEVICE_ROUTE_HEADER, isConnectRequest } from '../../src/devices/route-context.js';
import { createTempRoot, trackTestOwner } from '../helpers.js';
import { requestListener } from '../async-listener.js';

export const servers: Server[] = [];

interface DeviceGatewayFixture {
  state: {
    secret: number;
    token: string;
    seen: Record<string, unknown>[];
    upgrades: string[];
    mints: number;
  };
  port: number;
  pairing: ReturnType<typeof createDevicePairing>;
  base: string;
}

export async function fakeDsh(
  connectOffer?: Parameters<typeof createDeviceGateway>[0]['connectOffer'],
  localVideo?: Parameters<typeof createDeviceGateway>[0]['localVideo'],
  rpc?: (method: string, payload: unknown) => unknown,
  activity?: Parameters<typeof createDeviceGateway>[0]['activity'],
  databaseOwner?: OperationalDatabaseOwner,
  ownerHumanId?: () => string,
): Promise<DeviceGatewayFixture> {
  const state = {
    secret: 1,
    token: 'launch-token',
    seen: [] as Record<string, unknown>[],
    upgrades: [] as string[],
    mints: 0,
  };
  const cookie = () => `dsh=${String(state.secret)}`;
  let gateway: ReturnType<typeof createDeviceGateway> | undefined;
  const server = createServer(
    requestListener(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname.startsWith(DEVICE_GATEWAY_PREFIX)) return gateway!.handle(req, res);
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
      for await (const chunk of req) chunks.push(chunk as Buffer);
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
    }),
  );
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

export async function pair(
  base: string,
  offer: string,
): Promise<{ status: number; body: Record<string, string> }> {
  const response = await fetch(`${base}/botharness-device/pair`, {
    method: 'POST',
    body: JSON.stringify({ offer, name: 'iPhone' }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, string> };
}

export function stream(
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

export const echo = (socket: Socket, text: string): Promise<string> =>
  new Promise<string>((resolve) => {
    socket.once('data', (chunk: Buffer) => resolve(chunk.toString()));
    socket.write(text);
  });
