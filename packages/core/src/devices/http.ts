import type { EncryptionIdentity } from './noise-identity.js';
import { encode } from 'uqr';
import type { DeviceLan, LanStatus } from './lan.js';

import type { AccountStatus, ConnectAccount } from './connect-account.js';
import type { ConnectStatus, DeviceConnect } from './connect.js';
import type { DevicePairing, HostIdentity, PairedDevice } from './pairing.js';
import {
  phoneRoute,
  type PhoneRoute,
  type PublishRouteResult,
  type RouteStatus,
} from './routes.js';

export const DEVICES_PATH = '/api/botharness/devices';
export const DEVICES_SERVE_PATH = '/api/botharness/devices/serve';
export const PAIRING_LINK_SCHEME = 'deepseekbot';

const headers = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export interface PairingPayload {
  v: 1 | 2;
  encryption?: EncryptionIdentity & { loopback?: 'encrypted' };
  host: HostIdentity;
  offer: string;
  routes: string[];
  expiresAt: string;
}

export interface DevicesSnapshot {
  lan?: LanStatus;
  host: HostIdentity;
  devices: PairedDevice[];
  pendingKeys?: ReturnType<DevicePairing['pendingKeys']>;
  routes: RouteStatus;
  connect: ConnectStatus & {
    account?: AccountStatus;
    encryption?: EncryptionIdentity & { state: 'negotiating' | 'encrypted' | 'disconnected' };
  };
}

export interface PairingOfferView {
  link: string;
  qr: { size: number; path: string };
  expiresAt: string;
  receipt: string;
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
  const routes = status.routes.filter((route) => route.ready && route.kind === 'lan');
  routes.push(...status.routes.filter((route) => route.ready && route.kind === 'tailscale'));
  const own = clientOrigin === undefined ? undefined : phoneRoute(clientOrigin);
  if (own?.kind === 'tailscale' && !routes.some((route) => route.url === own.url)) routes.push(own);
  routes.push(...status.routes.filter((route) => route.ready && route.kind === 'connect'));
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
  encryption?: () => Promise<
    EncryptionIdentity & { state: 'negotiating' | 'encrypted' | 'disconnected' }
  >;
  routes: () => Promise<RouteStatus>;
  publish?: () => Promise<PublishRouteResult>;
  unpublish?: () => Promise<PublishRouteResult>;
  connect?: DeviceConnect;
  account?: ConnectAccount;
  lan?: DeviceLan;
}): (request: Request) => Promise<Response> {
  const { pairing, connect, account } = options;
  return async (request) => {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === DEVICES_PATH) {
      const snapshot: DevicesSnapshot = {
        ...(options.lan ? { lan: options.lan.status() } : {}),
        host: pairing.host(),
        devices: pairing.list(),
        pendingKeys: pairing.pendingKeys(),
        routes: await options.routes(),
        connect: {
          ...(connect?.status() ?? { state: 'off' }),
          ...(options.encryption === undefined ? {} : { encryption: await options.encryption() }),
          ...(account === undefined ? {} : { account: account.status() }),
        },
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
        ...(options.encryption === undefined ? {} : { encryption: await options.encryption() }),
        host: pairing.host(),
        offer: offer.offer,
        routes,
        expiresAt: offer.expiresAt,
      });
      const view: PairingOfferView = {
        link,
        qr: qrPath(link),
        expiresAt: offer.expiresAt,
        receipt: offer.receipt,
        routes,
        reachable: routes.some((route) => {
          const kind = phoneRoute(route)?.kind;
          return kind === 'lan' || kind === 'tailscale' || kind === 'connect';
        }),
      };
      return json(view);
    }
    if (request.method === 'POST' && path === `${DEVICES_PATH}/offer-status`) {
      const input = await body(request);
      if (typeof input['receipt'] !== 'string' || input['receipt'] === '')
        return json({ code: 'receipt-required' }, 400);
      return json(pairing.offerStatus(input['receipt']));
    }
    if (request.method === 'POST' && path === `${DEVICES_PATH}/approve-key`) {
      const input = await body(request);
      if (
        input['confirm'] !== true ||
        typeof input['receipt'] !== 'string' ||
        typeof input['publicKey'] !== 'string'
      )
        return json({ code: 'key-confirmation-required' }, 400);
      const approved = pairing.approveKey(input['receipt'], input['publicKey']);
      return json({ approved }, approved ? 200 : 409);
    }
    if (request.method === 'POST' && path === `${DEVICES_PATH}/revoke`) {
      const input = await body(request);
      if (typeof input['deviceId'] !== 'string') return json({ code: 'device-unknown' }, 400);
      const target = pairing.list().find((device) => device.id === input['deviceId']);
      if (target === undefined) return json({ code: 'device-unknown' }, 404);
      if (target.revokedAt !== undefined)
        return json({ code: 'device-already-revoked', device: target }, 409);
      const result = pairing.revoke(target.id);
      return json({ ...result, device: { id: target.id, name: target.name } });
    }
    if (request.method === 'POST' && path === DEVICES_SERVE_PATH && options.publish) {
      const input = await body(request);
      if (
        input['action'] !== undefined &&
        input['action'] !== 'enable' &&
        input['action'] !== 'disable'
      )
        return json({ code: 'action-invalid' }, 400);
      if (input['confirm'] !== true)
        return json(
          { code: 'confirm-required', error: 'Pass confirm:true to run tailscale serve.' },
          400,
        );
      if (input['action'] === 'disable' && options.unpublish === undefined)
        return json({ code: 'unpublish-unavailable' }, 503);
      const result =
        input['action'] === 'disable' ? await options.unpublish!() : await options.publish();
      if (result.ok)
        return json({
          published: input['action'] !== 'disable',
          changed: result.changed,
          routes: result.status,
        });
      return json(
        {
          code: result.code,
          error: result.message,
          ...(result.enableUrl === undefined ? {} : { enableUrl: result.enableUrl }),
          routes: result.status,
        },
        409,
      );
    }
    if (request.method === 'POST' && path === `${DEVICES_PATH}/lan` && options.lan) {
      const input = await body(request);
      if (input['action'] !== 'enable' && input['action'] !== 'disable')
        return json({ code: 'lan-action-invalid' }, 400);
      if (input['action'] === 'enable' && input['confirm'] !== true)
        return json({ code: 'confirm-required' }, 400);
      const result = await options.lan[input['action']]();
      return result.ok ? json(result.status) : json({ code: result.code }, 503);
    }
    if (request.method === 'POST' && path === `${DEVICES_PATH}/connect` && connect !== undefined) {
      const input = await body(request);
      if (
        account !== undefined &&
        (input['action'] === 'sign-in' || input['action'] === 'sign-out')
      ) {
        const signed =
          input['action'] === 'sign-in' ? await account.signIn() : await account.signOut();
        if (signed.ok) return json(signed.status);
        return json({ code: signed.code }, 503);
      }
      const result =
        input['action'] === 'enable'
          ? await connect.enable({
              hostname: typeof input['hostname'] === 'string' ? input['hostname'] : '',
              token: typeof input['token'] === 'string' ? input['token'] : '',
            })
          : input['action'] === 'disable'
            ? await connect.disable()
            : ({ ok: false, code: 'connect-action-invalid' } as const);
      if (result.ok) return json(result.status);
      return json({ code: result.code }, result.code === 'credential-unavailable' ? 503 : 400);
    }
    return json({ code: 'not-found' }, 404);
  };
}
