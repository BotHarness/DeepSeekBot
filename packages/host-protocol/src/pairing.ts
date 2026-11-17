import { teamHttpsRoute } from './team-invitation';
import { checkRoute, isLanRoute, isTailscaleRoute, isLoopbackRoute } from './route';
import { parsePrivateAdmission, type HostEncryption } from './host-encryption';
import type { ConnectionDiagnostic } from './connection-diagnostic';
import type { ConnectRefusal } from './connect-refusal';

export const DEVICE_PREFIX = '/botharness-device';

export interface PairingPayload {
  member?: true;
  enrollment?: { body: string; signature: string };
  encryption?: {
    protocol: 'connect-noise-xk-v1';
    publicKey: string;
    loopback?: 'encrypted';
    privateRelay?: HostEncryption['privateRelay'];
  };
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
  | 'certificate-untrusted'
  | ConnectRefusal;

export type ParsedLink =
  | { ok: true; payload: PairingPayload }
  | { ok: false; code: PairingRefusal; detail?: string; diagnostic?: ConnectionDiagnostic };

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

export function pairingLinkMode(encoded: string, now = Date.now()): 'lan' | 'private' | undefined {
  const parsed = parsePairingLink(`deepseekbot://pair?p=${encodeURIComponent(encoded)}`, now);
  if (!parsed.ok) return undefined;
  if (parsed.payload.encryption?.privateRelay) return 'private';
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
  const privateRelay = parsePrivateAdmission(record(value['encryption'])['privateRelay']);
  if (privateRelay && (value['routes'].length !== 1 || value['routes'][0] !== privateRelay.origin))
    return { ok: false, code: 'no-route' };
  const routes = value['routes'].flatMap((route) => {
    const checked =
      typeof route === 'string'
        ? checkRoute(
            route,
            parsePrivateAdmission(record(value['encryption'])['privateRelay'])?.origin,
          )
        : undefined;
    return checked?.ok === true
      ? [checked.origin]
      : value['member'] === true &&
          teamHttpsRoute(route) &&
          record(value['encryption'])['protocol'] === 'connect-noise-xk-v1'
        ? [new URL(route).origin]
        : [];
  });
  if (routes.length === 0) return { ok: false, code: 'no-route' };
  return {
    ok: true,
    payload: {
      ...(value['member'] === true ? { member: true as const } : {}),
      host: { id: host['id'], name: host['name'] },
      offer: value['offer'],
      routes,
      expiresAt: value['expiresAt'],
      ...(record(value['encryption'])['protocol'] === 'connect-noise-xk-v1' &&
      typeof record(value['encryption'])['publicKey'] === 'string' &&
      /^[0-9a-f]{64}$/u.test(String(record(value['encryption'])['publicKey']))
        ? {
            encryption: {
              ...(parsePrivateAdmission(record(value['encryption'])['privateRelay'])
                ? {
                    privateRelay: parsePrivateAdmission(
                      record(value['encryption'])['privateRelay'],
                    )!,
                  }
                : {}),
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
