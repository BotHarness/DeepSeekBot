import { noiseFingerprint, noisePublicKey } from '../../../../packages/core/src/devices/noise/xk';
import {
  ConnectRefused,
  encryptedCarrier,
  keyBytes,
  keyHex,
  openNoiseSocket,
  secureRandom,
} from './encrypted-carrier';
import { isConnectRoute } from './route';
import type { HostEncryption } from './hosts';
import type { HostCarrier } from './carrier';
import { checkRoute } from './route';
import type { ConnectRefusal } from './connect-account';
import type { SavedHost } from './hosts';

export const DEVICE_PREFIX = '/botharness-device';

export interface PairingPayload {
  enrollment?: { body: string; signature: string };
  encryption?: { protocol: 'connect-noise-xk-v1'; publicKey: string };
  host: { id: string; name: string };
  offer: string;
  routes: string[];
  expiresAt: string;
  verifier?: string;
}

export type PairingRefusal =
  | 'host-key-required'
  | 'host-key-confirmation-required'
  | 'channel-authentication-failed'
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
      ...(record(value['encryption'])['protocol'] === 'connect-noise-xk-v1' &&
      typeof record(value['encryption'])['publicKey'] === 'string' &&
      /^[0-9a-f]{64}$/u.test(String(record(value['encryption'])['publicKey']))
        ? {
            encryption: {
              protocol: 'connect-noise-xk-v1' as const,
              publicKey: String(record(value['encryption'])['publicKey']),
            },
          }
        : {}),
    },
  };
}

export type Redemption = { ok: true; host: SavedHost } | { ok: false; code: PairingRefusal };

export async function redeemPairing(options: {
  payload: PairingPayload;
  deviceName: string;
  carrier: HostCarrier;
  timeoutMs?: number;
  onPending?: (deviceFingerprint: string) => void;
  confirmFingerprint?: (fingerprint: string, hostName: string) => Promise<boolean>;
  signal?: AbortSignal;
}): Promise<Redemption> {
  const { payload } = options;
  if (payload.routes.length === 0 || payload.routes.some((route) => !checkRoute(route).ok))
    return { ok: false, code: 'no-route' };
  if (payload.enrollment && payload.routes.some((route) => !isConnectRoute(route)))
    return { ok: false, code: 'no-route' };
  if (payload.encryption !== undefined) return redeemEncrypted(options);
  for (const route of payload.routes) {
    if (isConnectRoute(route)) return { ok: false, code: 'host-key-required' };
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
  const carrier = encryptedCarrier({ raw: options.carrier, ...options.host });
  try {
    for (const route of options.host.routes) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
      try {
        const response = await carrier.request(`${route}${DEVICE_PREFIX}/unpair`, {
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
        if (isConnectRoute(route)) return 'unreachable';
      } catch (error) {
        if (isConnectRoute(route)) {
          if (error instanceof ConnectRefused && error.code === 'device-revoked') return 'revoked';
          try {
            await carrier.request(`${route}${DEVICE_PREFIX}/api/botharness/list`, {
              method: 'POST',
              body: '{}',
              signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
            });
          } catch (probe) {
            if (probe instanceof ConnectRefused && probe.code === 'device-revoked')
              return 'revoked';
          }
          return 'unreachable';
        }
        continue;
      } finally {
        clearTimeout(timer);
      }
    }
    return 'unreachable';
  } finally {
    carrier.close?.();
  }
}

export async function removeDevice(options: {
  host: SavedHost;
  deviceId: string;
  carrier: HostCarrier;
  timeoutMs?: number;
}): Promise<'removed' | 'unreachable'> {
  if (options.deviceId === options.host.deviceId)
    return (await revokePairing(options)) === 'revoked' ? 'removed' : 'unreachable';
  const carrier = encryptedCarrier({ raw: options.carrier, ...options.host });
  try {
    for (const route of options.host.routes) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
      try {
        const response = await carrier.request(`${route}${DEVICE_PREFIX}/devices/remove`, {
          method: 'POST',
          headers: { authorization: `Device ${options.host.credential}` },
          body: JSON.stringify({ deviceId: options.deviceId }),
          signal: controller.signal,
        });
        if (response.status === 200 || response.status === 404) return 'removed';
        if (isConnectRoute(route)) return 'unreachable';
      } catch {
        if (isConnectRoute(route)) return 'unreachable';
        continue;
      } finally {
        clearTimeout(timer);
      }
    }
    return 'unreachable';
  } finally {
    carrier.close?.();
  }
}

export type PairingFailure = PairingRefusal | 'storage-failure' | 'cancelled' | 'unknown';

export async function pairHost(options: {
  text: string | (() => Promise<ParsedLink>);
  method: import('../telemetry/schema').PairingMethod;
  deviceName: string;
  carrier: HostCarrier;
  save(host: SavedHost): Promise<void>;
  onPending?: (deviceFingerprint: string) => void;
  confirmFingerprint?: (fingerprint: string, hostName: string) => Promise<boolean>;
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
      ...(options.onPending === undefined ? {} : { onPending: options.onPending }),
      ...(options.confirmFingerprint === undefined
        ? {}
        : { confirmFingerprint: options.confirmFingerprint }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
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

async function redeemEncrypted(options: {
  payload: PairingPayload;
  deviceName: string;
  carrier: HostCarrier;
  signal?: AbortSignal;
  onPending?: (deviceFingerprint: string) => void;
  confirmFingerprint?: (fingerprint: string, hostName: string) => Promise<boolean>;
}): Promise<Redemption> {
  const { payload } = options;
  const advertised = payload.encryption!;
  if (
    !(await options.confirmFingerprint?.(
      noiseFingerprint(keyBytes(advertised.publicKey)),
      payload.host.name,
    ))
  )
    return { ok: false, code: 'host-key-confirmation-required' };
  if (options.signal?.aborted) return { ok: false, code: 'unreachable' };
  const encryption: HostEncryption = {
    protocol: advertised.protocol,
    hostKey: advertised.publicKey,
    deviceKey: keyHex(secureRandom(options.carrier)),
  };
  const route = payload.routes.find(isConnectRoute) ?? payload.routes[0]!;
  return new Promise<Redemption>((resolve) => {
    let done = false,
      poll: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: Redemption) => {
      if (done) return;
      done = true;
      clearTimeout(deadline);
      clearTimeout(poll);
      options.signal?.removeEventListener('abort', abort);
      socket.close();
      resolve(result);
    };
    const abort = () => finish({ ok: false, code: 'unreachable' });
    const socket = openNoiseSocket({
      origin: route,
      hostId: payload.host.id,
      encryption,
      raw: options.carrier,
      closed: () => finish({ ok: false, code: 'channel-authentication-failed' }),
      message: (value) => {
        if (value['type'] === 'pair-pending') {
          options.onPending?.(noiseFingerprint(noisePublicKey(keyBytes(encryption.deviceKey))));
          poll = setTimeout(submit, 2000);
          return;
        }
        if (
          value['type'] === 'paired' &&
          typeof value['credential'] === 'string' &&
          typeof value['deviceId'] === 'string' &&
          record(value['host'])['id'] === payload.host.id
        )
          finish({
            ok: true,
            host: {
              hostId: payload.host.id,
              hostName: payload.host.name,
              routes: [route, ...payload.routes.filter((other) => other !== route)],
              deviceId: value['deviceId'],
              credential: value['credential'],
              encryption,
            },
          });
        else
          finish({
            ok: false,
            code: value['code'] === 'offer-expired' ? 'offer-expired' : 'offer-invalid',
          });
      },
    });
    const submit = () => {
      if (done) return;
      try {
        socket.send({
          type: 'pair',
          offer: payload.offer,
          name: options.deviceName,
          verifier: payload.verifier,
          enrollment: payload.enrollment,
        });
      } catch {
        finish({ ok: false, code: 'channel-authentication-failed' });
      }
    };
    const deadline = setTimeout(
      abort,
      Math.max(1, Math.min(600_000, Date.parse(payload.expiresAt) - Date.now())),
    );
    options.signal?.addEventListener('abort', abort, { once: true });
    void socket.ready.then(submit, () =>
      finish({ ok: false, code: 'channel-authentication-failed' }),
    );
  });
}
