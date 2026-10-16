import { encode } from 'uqr';
import { DEVICE_COMPATIBILITY_PATH, type DeviceCompatibility } from './compatibility.js';

import type { DevicePairing, HostIdentity, PairedDevice } from './pairing.js';
import { phoneRoute, type PhoneRoute, type RouteStatus } from './routes.js';

export const DEVICES_PATH = '/api/botharness/devices';
export const PAIRING_LINK_SCHEME = 'deepseekbot';

const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

export interface PairingPayload {
  v: 1;
  host: HostIdentity;
  offer: string;
  routes: string[];
  expiresAt: string;
}

export interface DevicesSnapshot {
  host: HostIdentity;
  devices: PairedDevice[];
  routes: RouteStatus;
}

export interface PairingOfferView {
  link: string;
  qr: { size: number; path: string };
  expiresAt: string;
  routes: string[];
  reachable: boolean;
}

export function pairingLink(payload: PairingPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${PAIRING_LINK_SCHEME}://pair?p=${encoded}`;
}

function qrPath(text: string): { size: number; path: string } {
  const { size, data } = encode(text, { ecc: 'M', border: 0 });
  let path = '';
  data.forEach((row, y) => {
    let x = 0;
    while (x < size) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      let end = x;
      while (end < size && row[end]) end += 1;
      path += `M${String(x)} ${String(y)}h${String(end - x)}v1h-${String(end - x)}z`;
      x = end;
    }
  });
  return { size, path };
}

export function offeredRoutes(status: RouteStatus, clientOrigin: string | undefined): PhoneRoute[] {
  const routes = status.routes.filter((route) => route.ready && route.kind === 'tailscale');
  const own = clientOrigin === undefined ? undefined : phoneRoute(clientOrigin);
  if (own?.kind === 'tailscale' && !routes.some((route) => route.url === own.url)) routes.push(own);
  routes.push(...status.routes.filter((route) => route.kind === 'loopback'));
  return routes;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers });
}

async function body(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 4096) return {};
  try {
    const value = JSON.parse(text) as unknown;
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function createDevicesHttp(options: {
  pairing: DevicePairing;
  routes: () => Promise<RouteStatus>;
  compatibility?: () => DeviceCompatibility;
}): (request: Request) => Promise<Response> {
  const { pairing } = options;
  return async (request) => {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === DEVICE_COMPATIBILITY_PATH && options.compatibility)
      return json(options.compatibility());
    if (request.method === 'GET' && path === DEVICES_PATH) {
      const snapshot: DevicesSnapshot = {
        host: pairing.host(),
        devices: pairing.list(),
        routes: await options.routes(),
      };
      return json(snapshot);
    }
    if (request.method === 'POST' && path === `${DEVICES_PATH}/offer`) {
      const input = await body(request);
      const origin = typeof input['origin'] === 'string' ? input['origin'] : undefined;
      const routes = offeredRoutes(await options.routes(), origin).map((route) => route.url);
      const offer = pairing.createOffer();
      const link = pairingLink({
        v: 1,
        host: pairing.host(),
        offer: offer.offer,
        routes,
        expiresAt: offer.expiresAt,
      });
      const view: PairingOfferView = {
        link,
        qr: qrPath(link),
        expiresAt: offer.expiresAt,
        routes,
        reachable: routes.some((route) => phoneRoute(route)?.kind === 'tailscale'),
      };
      return json(view);
    }
    if (request.method === 'POST' && path === `${DEVICES_PATH}/revoke`) {
      const input = await body(request);
      if (typeof input['deviceId'] !== 'string') return json({ code: 'device-unknown' }, 400);
      const result = pairing.revoke(input['deviceId']);
      return result.revoked ? json(result) : json({ code: 'device-unknown' }, 404);
    }
    return json({ code: 'not-found' }, 404);
  };
}
