import { noiseFingerprint, noisePublicKey } from '../../../../packages/core/src/devices/noise/xk';
import {
  ConnectRefused,
  encryptedCarrier,
  keyBytes,
  keyHex,
  openNoiseSocket,
  secureRandom,
} from './encrypted-carrier';
import {
  isConnectRoute,
  isEncryptedRoute,
  isLanRoute,
  isLoopbackRoute,
  isTailscaleRoute,
} from './route';
import { channelFailureDetail, joinFailureDetails } from './pairing-detail';
import type { HostEncryption } from './hosts';
import type { HostCarrier, LocalNetworkStatus } from './carrier';
import { checkRoute } from './route';
import type { ConnectRefusal } from './connect-account';
import type { SavedHost } from './hosts';
import { learnedRoutes } from './learned-routes';

export const DEVICE_PREFIX = '/botharness-device';

export interface PairingPayload {
  enrollment?: { body: string; signature: string };
  encryption?: { protocol: 'connect-noise-xk-v1'; publicKey: string; loopback?: 'encrypted' };
  host: { id: string; name: string };
  offer: string;
  routes: string[];
  expiresAt: string;
  verifier?: string;
}

export type PairingRefusal =
  | 'lan-build-required'
  | 'lan-unreachable'
  | 'lan-permission-denied'
  | 'already-paired'
  | 'host-key-required'
  | 'host-key-changed'
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
  | { ok: false; code: PairingRefusal; detail?: string };

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

export function pairingLinkMode(encoded: string, now = Date.now()): 'lan' | undefined {
  const parsed = parsePairingLink(`deepseekbot://pair?p=${encodeURIComponent(encoded)}`, now);
  if (!parsed.ok) return undefined;
  const { routes } = parsed.payload;
  const lan = (route: string) => isLanRoute(route) && !isTailscaleRoute(route);
  return routes.some(lan) && routes.every((route) => lan(route) || isLoopbackRoute(route))
    ? 'lan'
    : undefined;
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
    (value['v'] !== 1 && value['v'] !== 2) ||
    typeof host['id'] !== 'string' ||
    typeof host['name'] !== 'string' ||
    typeof value['offer'] !== 'string' ||
    typeof value['expiresAt'] !== 'string' ||
    !Array.isArray(value['routes'])
  )
    return { ok: false, code: 'link-invalid' };
  if (value['v'] === 2) {
    const encryption = record(value['encryption']);
    if (
      encryption['loopback'] !== 'encrypted' ||
      encryption['protocol'] !== 'connect-noise-xk-v1' ||
      typeof encryption['publicKey'] !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(encryption['publicKey']) ||
      value['routes'].length !== 1 ||
      typeof value['routes'][0] !== 'string' ||
      !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/u.test(value['routes'][0])
    )
      return { ok: false, code: 'link-invalid' };
  }
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
              ...(record(value['encryption'])['loopback'] === 'encrypted'
                ? { loopback: 'encrypted' as const }
                : {}),
              publicKey: String(record(value['encryption'])['publicKey']),
            },
          }
        : {}),
    },
  };
}

export type Redemption =
  | { ok: true; host: SavedHost }
  | { ok: false; code: PairingRefusal; detail?: string };

export async function redeemPairing(options: {
  payload: PairingPayload;
  deviceName: string;
  carrier: HostCarrier;
  timeoutMs?: number;
  lanRetryDelayMs?: number;
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
  const details: string[] = [];
  for (const route of payload.routes) {
    if (isEncryptedRoute(route)) return { ok: false, code: 'host-key-required' };
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
      const text = await response.text();
      try {
        body = record(JSON.parse(text));
      } catch {
        body = {};
      }
    } catch (error) {
      details.push(
        channelFailureDetail(
          route,
          controller.signal.aborted
            ? 'channel-timeout'
            : error instanceof Error
              ? error.message
              : '',
        ),
      );
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (status === 401)
      return {
        ok: false,
        code: body['code'] === 'offer-expired' ? 'offer-expired' : 'offer-invalid',
        detail: channelFailureDetail(
          route,
          typeof body['code'] === 'string' ? `refused-${body['code']}` : 'refused',
        ),
      };
    const host = record(body['host']);
    if (
      status !== 200 ||
      typeof body['credential'] !== 'string' ||
      typeof body['deviceId'] !== 'string' ||
      host['id'] !== payload.host.id
    ) {
      details.push(channelFailureDetail(route, status === 200 ? 'bad-reply' : `http-${status}`));
      continue;
    }
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
  const detail = joinFailureDetails(details);
  return detail === undefined
    ? { ok: false, code: 'unreachable' }
    : { ok: false, code: 'unreachable', detail };
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
  existing?: (hostId: string) => SavedHost | undefined;
  text: string | (() => Promise<ParsedLink>);
  method: import('../telemetry/schema').PairingMethod;
  deviceName: string;
  carrier: HostCarrier;
  save(host: SavedHost): Promise<void>;
  onPending?: (deviceFingerprint: string) => void;
  confirmFingerprint?: (fingerprint: string, hostName: string) => Promise<boolean>;
  telemetry: Pick<import('../telemetry/mobile-telemetry').MobileTelemetry, 'pairing'>;
  signal?: AbortSignal;
}): Promise<{ ok: true } | { ok: false; code: PairingFailure; detail?: string }> {
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
      if (parsed.detail === undefined) observation.finish('refused', parsed.code);
      else observation.finish('refused', parsed.code, parsed.detail);
      return parsed;
    }
    const existing = options.existing?.(parsed.payload.host.id);
    const updated = existing?.encryption
      ? await updatePairedRoutes(existing, parsed.payload, options.carrier, options.signal)
      : undefined;
    const redeemed =
      updated && (updated.ok || updated.code !== 'reapproval-required')
        ? updated
        : await redeemPairing({
            payload: parsed.payload,
            deviceName: options.deviceName,
            carrier: options.carrier,
            ...(options.onPending === undefined ? {} : { onPending: options.onPending }),
            ...(options.method === 'qr'
              ? { confirmFingerprint: async () => true }
              : options.confirmFingerprint === undefined
                ? {}
                : { confirmFingerprint: options.confirmFingerprint }),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
          });
    if (options.signal?.aborted) return { ok: false, code: 'cancelled' };
    if (!redeemed.ok) {
      const detail = 'detail' in redeemed ? redeemed.detail : undefined;
      observation.finish(
        redeemed.code === 'unreachable' ? 'failed' : 'refused',
        redeemed.code,
        detail,
      );
      return redeemed;
    }
    try {
      await options.save(redeemed.host);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const detail = `app:storage-${/^[a-z][a-z0-9-]{0,39}$/u.test(message) ? message : 'error'}`;
      observation.finish('failed', 'storage-failure', detail);
      return { ok: false, code: 'storage-failure', detail };
    }
    observation.finish('success');
    return { ok: true };
  } catch (error) {
    const code =
      error instanceof Error && error.message === 'lan-build-required'
        ? 'lan-build-required'
        : 'unknown';
    const detail = channelFailureDetail('app:', error instanceof Error ? error.message : 'thrown');
    observation.finish('failed', code, detail);
    return { ok: false, code, detail };
  } finally {
    options.signal?.removeEventListener('abort', cancelled);
  }
}

export async function updatePairedRoutes(
  host: SavedHost,
  payload: PairingPayload,
  raw: HostCarrier,
  signal?: AbortSignal,
): Promise<Redemption | { ok: false; code: 'reapproval-required' }> {
  if (!host.encryption) return { ok: false, code: 'host-key-required' };
  if (payload.host.id !== host.hostId || payload.encryption === undefined)
    return { ok: false, code: 'channel-authentication-failed' };
  if (payload.encryption.publicKey !== host.encryption.hostKey)
    return { ok: false, code: 'host-key-changed', detail: 'link:host-key-changed' };
  const carrier = encryptedCarrier({
    raw,
    hostId: host.hostId,
    credential: host.credential,
    encryption: host.encryption,
    requireEncryption: true,
  });
  try {
    for (const route of payload.routes.slice(0, 12)) {
      if (signal?.aborted) return { ok: false, code: 'unreachable' };
      if (!checkRoute(route).ok) continue;
      try {
        const deadline = AbortSignal.timeout(8000);
        const response = await carrier.request(`${route}${DEVICE_PREFIX}/api/botharness/devices`, {
          method: 'GET',
          signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
        });
        if (response.status !== 200) continue;
        const snapshot = record(JSON.parse(await response.text()));
        if (
          record(snapshot['host'])['id'] !== host.hostId ||
          record(record(snapshot['connect'])['encryption'])['publicKey'] !== host.encryption.hostKey
        )
          continue;
        const routes = learnedRoutes({ ...host, routes: [route, ...host.routes] }, snapshot);
        return { ok: true, host: { ...host, routes } };
      } catch (error) {
        if (
          error instanceof ConnectRefused &&
          (error.code === 'device-revoked' || error.code === 'device-unknown')
        )
          return { ok: false, code: 'reapproval-required' };
      }
    }
    return { ok: false, code: 'unreachable' };
  } finally {
    carrier.close?.();
  }
}

const LAN_PROMPT_RETRY_MS = 4000;

function pause(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    const stop = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop);
      resolve(true);
    }, ms);
    signal?.addEventListener('abort', stop, { once: true });
  });
}

async function redeemEncrypted(options: {
  payload: PairingPayload;
  deviceName: string;
  carrier: HostCarrier;
  signal?: AbortSignal;
  lanRetryDelayMs?: number;
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
    ...(advertised.loopback === 'encrypted' ? { loopback: 'encrypted' as const } : {}),
    protocol: advertised.protocol,
    hostKey: advertised.publicKey,
    deviceKey: keyHex(secureRandom(options.carrier)),
  };
  const lan = payload.routes.filter(isLanRoute);
  const remote = payload.routes.filter((route) => !isLanRoute(route));
  const preferred = remote.find(isConnectRoute) ?? remote[0];
  const routes = [
    ...lan,
    ...(preferred ? [preferred] : []),
    ...remote.filter((route) => route !== preferred),
  ];
  let result: Redemption = { ok: false, code: 'no-route' };
  const details: string[] = [];
  let lanDenied = false;
  for (const route of routes) {
    if (options.signal?.aborted) return { ok: false, code: 'unreachable' };
    result = await redeemEncryptedRoute(options, encryption, route);
    if (result.ok) return result;
    if (result.detail !== undefined) details.push(result.detail);
    if (result.code === 'lan-permission-denied') lanDenied = true;
    if (result.code !== 'lan-unreachable' && result.code !== 'lan-permission-denied') break;
  }
  if (lanDenied && (await pause(options.lanRetryDelayMs ?? LAN_PROMPT_RETRY_MS, options.signal))) {
    lanDenied = false;
    for (const route of lan) {
      const retried = await redeemEncryptedRoute(options, encryption, route);
      if (retried.ok) return retried;
      if (retried.detail !== undefined) details.push(`${retried.detail}-retry`);
      if (retried.code === 'lan-permission-denied') lanDenied = true;
      const terminal =
        retried.code !== 'lan-unreachable' && retried.code !== 'lan-permission-denied';
      if (terminal || result.code === 'lan-unreachable' || result.code === 'lan-permission-denied')
        result = retried;
      if (terminal) break;
    }
  }
  const code =
    lanDenied && (result.code === 'unreachable' || result.code === 'lan-unreachable')
      ? 'lan-permission-denied'
      : result.code;
  const detail = joinFailureDetails(details);
  return detail === undefined ? { ok: false, code } : { ok: false, code, detail };
}

function redeemEncryptedRoute(
  options: Parameters<typeof redeemEncrypted>[0],
  encryption: HostEncryption,
  route: string,
): Promise<Redemption> {
  const { payload } = options;
  return new Promise<Redemption>((resolve) => {
    let authenticated = false;
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
    const expire = () =>
      finish({
        ok: false,
        code: 'offer-expired',
        detail: channelFailureDetail(route, 'offer-deadline'),
      });
    let probing = false;
    const fail = (reason: string) => {
      const probe = options.carrier.localNetworkStatus;
      if (
        authenticated ||
        !isLanRoute(route) ||
        reason.endsWith(':local-network-denied') ||
        reason === 'channel-authentication-failed' ||
        probe === undefined
      ) {
        finish(channelFailure(route, reason, authenticated));
        return;
      }
      if (probing) return;
      probing = true;
      void probe(route).then(
        (status) => finish(channelFailure(route, probedReason(reason, status), authenticated)),
        () => finish(channelFailure(route, reason, authenticated)),
      );
    };
    const socket = openNoiseSocket({
      origin: route,
      hostId: payload.host.id,
      encryption,
      raw: options.carrier,
      timeoutMs: isLanRoute(route) ? 2000 : 10_000,
      closed: fail,
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
            detail: channelFailureDetail(
              route,
              typeof value['code'] === 'string' ? `refused-${value['code']}` : 'refused',
            ),
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
        finish(channelFailure(route, 'channel-send-failed', authenticated));
      }
    };
    const deadline = setTimeout(
      expire,
      Math.max(1, Math.min(600_000, Date.parse(payload.expiresAt) - Date.now())),
    );
    options.signal?.addEventListener('abort', abort, { once: true });
    void socket.ready.then(
      () => {
        authenticated = true;
        submit();
      },
      (error: unknown) => fail(error instanceof Error ? error.message : 'channel-disconnected'),
    );
  });
}

function probedReason(reason: string, status: LocalNetworkStatus): string {
  if (status === 'denied') return 'lan-unreachable:local-network-denied';
  if (status === 'unknown' || reason.includes(':')) return reason;
  const tail = { reachable: 'tcp-open', unreachable: 'tcp-closed', timeout: 'tcp-timeout' }[status];
  return `${reason}:${tail}`;
}

export function channelFailure(
  route: string,
  reason: string,
  authenticated: boolean,
): Extract<Redemption, { ok: false }> {
  const detail = channelFailureDetail(route, reason);
  if (reason === 'channel-authentication-failed')
    return { ok: false, code: 'channel-authentication-failed', detail };
  if (isLanRoute(route) && !authenticated)
    return {
      ok: false,
      code: reason.endsWith(':local-network-denied') ? 'lan-permission-denied' : 'lan-unreachable',
      detail,
    };
  return { ok: false, code: 'unreachable', detail };
}
