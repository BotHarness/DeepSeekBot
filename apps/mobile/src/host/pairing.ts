import type { HostCarrier } from './carrier';
import { checkRoute } from './route';
import type { ConnectRefusal } from './connect-account';
import type { SavedHost } from './hosts';

export const DEVICE_PREFIX = '/botharness-device';

export interface PairingPayload {
  host: { id: string; name: string };
  offer: string;
  routes: string[];
  expiresAt: string;
  verifier?: string;
}

export type PairingRefusal =
  | 'link-invalid'
  | 'link-expired'
  | 'no-route'
  | 'offer-invalid'
  | 'offer-expired'
  | 'unreachable'
  | ConnectRefusal;

export type ParsedLink =
  | { ok: true; payload: PairingPayload }
  | { ok: false; code: PairingRefusal };

const SCHEMES = new Set(['deepseekbot:', 'deepseekbot-dev:']);

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return decodeURIComponent(
    Array.from(binary, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
  );
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function parsePairingLink(text: string, now = Date.now()): ParsedLink {
  let encoded: string | null;
  try {
    const url = new URL(text.trim());
    if (!SCHEMES.has(url.protocol)) return { ok: false, code: 'link-invalid' };
    encoded = url.searchParams.get('p');
  } catch {
    return { ok: false, code: 'link-invalid' };
  }
  let value: Record<string, unknown>;
  try {
    value = record(JSON.parse(base64UrlDecode(encoded ?? '')));
  } catch {
    return { ok: false, code: 'link-invalid' };
  }
  const host = record(value['host']);
  if (
    value['v'] !== 1 ||
    typeof host['id'] !== 'string' ||
    typeof host['name'] !== 'string' ||
    typeof value['offer'] !== 'string' ||
    typeof value['expiresAt'] !== 'string' ||
    !Array.isArray(value['routes'])
  )
    return { ok: false, code: 'link-invalid' };
  if (Date.parse(value['expiresAt']) <= now) return { ok: false, code: 'link-expired' };
  const routes = value['routes'].flatMap((route) => {
    const checked = typeof route === 'string' ? checkRoute(route) : undefined;
    return checked?.ok === true ? [checked.origin] : [];
  });
  if (routes.length === 0) return { ok: false, code: 'no-route' };
  return {
    ok: true,
    payload: {
      host: { id: host['id'], name: host['name'] },
      offer: value['offer'],
      routes,
      expiresAt: value['expiresAt'],
    },
  };
}

export type Redemption = { ok: true; host: SavedHost } | { ok: false; code: PairingRefusal };

export async function redeemPairing(options: {
  payload: PairingPayload;
  deviceName: string;
  carrier: HostCarrier;
  timeoutMs?: number;
}): Promise<Redemption> {
  const { payload } = options;
  for (const route of payload.routes) {
    let status: number;
    let body: Record<string, unknown>;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
    try {
      const response = await options.carrier.request(`${route}${DEVICE_PREFIX}/pair`, {
        method: 'POST',
        body: JSON.stringify({
          offer: payload.offer,
          name: options.deviceName,
          ...(payload.verifier === undefined ? {} : { verifier: payload.verifier }),
        }),
        signal: controller.signal,
      });
      status = response.status;
      body = record(JSON.parse(await response.text()));
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (status === 401)
      return {
        ok: false,
        code: body['code'] === 'offer-expired' ? 'offer-expired' : 'offer-invalid',
      };
    const host = record(body['host']);
    if (
      status !== 200 ||
      typeof body['credential'] !== 'string' ||
      typeof body['deviceId'] !== 'string' ||
      host['id'] !== payload.host.id
    )
      continue;
    return {
      ok: true,
      host: {
        hostId: payload.host.id,
        hostName: payload.host.name,
        routes: [route, ...payload.routes.filter((other) => other !== route)],
        deviceId: body['deviceId'],
        credential: body['credential'],
      },
    };
  }
  return { ok: false, code: 'unreachable' };
}

export async function revokePairing(options: {
  host: SavedHost;
  carrier: HostCarrier;
  timeoutMs?: number;
}): Promise<'revoked' | 'unreachable'> {
  for (const route of options.host.routes) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
    try {
      const response = await options.carrier.request(`${route}${DEVICE_PREFIX}/unpair`, {
        method: 'POST',
        headers: { authorization: `Device ${options.host.credential}` },
        body: '{}',
        signal: controller.signal,
      });
      const body = record(JSON.parse(await response.text()));
      if (response.status === 200 && body['revoked'] === true) return 'revoked';
      if (
        response.status === 401 &&
        (body['code'] === 'device-revoked' || body['code'] === 'device-unknown')
      )
        return 'revoked';
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
  return 'unreachable';
}

export async function removeDevice(options: {
  host: SavedHost;
  deviceId: string;
  carrier: HostCarrier;
  timeoutMs?: number;
}): Promise<'removed' | 'unreachable'> {
  for (const route of options.host.routes) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
    try {
      const response = await options.carrier.request(`${route}${DEVICE_PREFIX}/devices/remove`, {
        method: 'POST',
        headers: { authorization: `Device ${options.host.credential}` },
        body: JSON.stringify({ deviceId: options.deviceId }),
        signal: controller.signal,
      });
      if (response.status === 200 || response.status === 404) return 'removed';
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
  return 'unreachable';
}

export type PairingFailure = PairingRefusal | 'storage-failure' | 'cancelled' | 'unknown';

export async function pairHost(options: {
  text: string | (() => Promise<ParsedLink>);
  method: import('../telemetry/schema').PairingMethod;
  deviceName: string;
  carrier: HostCarrier;
  save(host: SavedHost): Promise<void>;
  telemetry: Pick<import('../telemetry/mobile-telemetry').MobileTelemetry, 'pairing'>;
  signal?: AbortSignal;
}): Promise<{ ok: true } | { ok: false; code: PairingFailure }> {
  const observation = options.telemetry.pairing(options.method);
  const cancelled = () => observation.finish('cancelled');
  options.signal?.addEventListener('abort', cancelled, { once: true });
  try {
    if (options.signal?.aborted) {
      cancelled();
      return { ok: false, code: 'cancelled' };
    }
    const parsed =
      typeof options.text === 'string' ? parsePairingLink(options.text) : await options.text();
    if (options.signal?.aborted) return { ok: false, code: 'cancelled' };
    if (!parsed.ok) {
      observation.finish('refused', parsed.code);
      return parsed;
    }
    const redeemed = await redeemPairing({
      payload: parsed.payload,
      deviceName: options.deviceName,
      carrier: options.carrier,
    });
    if (options.signal?.aborted) return { ok: false, code: 'cancelled' };
    if (!redeemed.ok) {
      observation.finish(redeemed.code === 'unreachable' ? 'failed' : 'refused', redeemed.code);
      return redeemed;
    }
    try {
      await options.save(redeemed.host);
    } catch {
      observation.finish('failed', 'storage-failure');
      return { ok: false, code: 'storage-failure' };
    }
    observation.finish('success');
    return { ok: true };
  } catch {
    observation.finish('failed', 'unknown');
    return { ok: false, code: 'unknown' };
  } finally {
    options.signal?.removeEventListener('abort', cancelled);
  }
}
