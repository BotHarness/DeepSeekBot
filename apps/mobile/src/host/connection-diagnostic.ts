import { reasonCode } from './pairing-detail';

export type ConnectionPhase =
  | 'account'
  | 'service-config'
  | 'sign-in-session'
  | 'environment-list'
  | 'pairing-offer'
  | 'pairing'
  | 'account-action';

export interface ConnectionDiagnostic {
  readonly code: string;
  readonly phase: ConnectionPhase;
  readonly occurredAt: string;
  readonly detail?: string;
  readonly status?: number;
}

const phases = new Set<ConnectionPhase>([
  'account',
  'service-config',
  'sign-in-session',
  'environment-list',
  'pairing-offer',
  'pairing',
  'account-action',
]);
const codes = new Set([
  'relay-unavailable',
  'sign-in-required',
  'sign-in-failed',
  'sign-in-cancelled',
  'account-not-allowed',
  'account-changed',
  'account-identity-required',
  'account-action-pending',
  'account-cleanup-failed',
  'account-deletion-uncertain',
  'host-offline',
  'host-refused',
  'host-not-found',
  'current-host',
  'session-unknown',
  'invalid-host-id',
  'storage-failure',
  'cancelled',
  'unknown',
  'unreachable',
  'lan-build-required',
  'lan-unreachable',
  'lan-permission-denied',
  'already-paired',
  'host-key-required',
  'host-key-changed',
  'host-key-confirmation-required',
  'channel-authentication-failed',
  'link-invalid',
  'link-expired',
  'no-route',
  'offer-invalid',
  'offer-expired',
  'certificate-untrusted',
]);
const causes = new Set([
  ...codes,
  'upstream-unavailable',
  'invalid-response',
  'socket-error',
  'socket-dns',
  'socket-timeout',
  'socket-refused',
  'socket-reset',
  'socket-offline',
  'socket-tls',
  'channel-closed',
  'channel-disconnected',
  'channel-timeout',
  'channel-refused',
  'offer-timeout',
  'storage-error',
  'storage-keychain',
  'no-tunnel',
]);
const safeCause = (value: string) =>
  causes.has(value) || /^(?:http-[1-5]\d{2}|(?:nsurl|posix)-?\d{1,6})$/u.test(value);

function safeDetail(detail: string | undefined): string | undefined {
  if (!detail || detail.length > 240) return;
  const segments = detail
    .split(',')
    .slice(-4)
    .flatMap((segment) => {
      const [route, reason, cause, extra] = segment.split(':');
      if (!route || !['lan', 'connect', 'remote', 'link', 'app', 'relay'].includes(route))
        return [];
      if (!reason || !safeCause(reason) || extra !== undefined) return [];
      return [`${route}:${reason}${cause && safeCause(cause) ? `:${cause}` : ''}`];
    });
  return segments.length ? segments.join(',') : undefined;
}

export function connectionDiagnostic(input: {
  code: string;
  phase: ConnectionPhase;
  detail?: string | undefined;
  status?: number | undefined;
  occurredAt?: string;
}): ConnectionDiagnostic {
  const detail = safeDetail(input.detail);
  const at = input.occurredAt === undefined ? new Date() : new Date(input.occurredAt);
  return {
    code: codes.has(input.code) ? input.code : 'unknown',
    phase: phases.has(input.phase) ? input.phase : 'account',
    occurredAt: Number.isNaN(at.valueOf()) ? 'unknown' : at.toISOString(),
    ...(detail === undefined ? {} : { detail }),
    ...(typeof input.status === 'number' &&
    Number.isInteger(input.status) &&
    input.status >= 100 &&
    input.status <= 599
      ? { status: input.status }
      : {}),
  };
}

const networkCode = (value: unknown): string | undefined =>
  typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'string'
    ? value.code
    : undefined;

export function networkDiagnosticReason(error: unknown): string {
  const codes = [
    networkCode(error),
    networkCode(
      typeof error === 'object' && error !== null && 'cause' in error ? error.cause : undefined,
    ),
  ];
  for (const code of codes) {
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'socket-dns';
    if (code === 'ECONNREFUSED') return 'socket-refused';
    if (code === 'ETIMEDOUT') return 'socket-timeout';
    if (code === 'ECONNRESET' || code === 'EPIPE') return 'socket-reset';
    if (
      code &&
      (code.includes('CERT') ||
        code.includes('TLS') ||
        code.includes('SSL') ||
        code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
        code === 'INVALID_CA')
    )
      return 'socket-tls';
  }
  const reason = reasonCode(error instanceof Error ? error.message : '');
  return safeCause(reason) ? reason : 'socket-error';
}

export function connectionDiagnosticReport(
  failure: ConnectionDiagnostic,
  app: { platform: string; osVersion: string | null; version: string | null; build: string | null },
): string {
  const safe = connectionDiagnostic(failure);
  const version = (value: string | null) =>
    value && /^\d[\d.]{0,31}$/u.test(value) ? value : 'unknown';
  return [
    `reason: ${safe.code}`,
    `stage: ${safe.phase}`,
    `time: ${safe.occurredAt}`,
    `detail: ${safe.detail ?? 'not available'}`,
    ...(safe.status === undefined ? [] : [`http: ${safe.status}`]),
    `method: account`,
    `platform: ${app.platform === 'ios' || app.platform === 'android' ? app.platform : 'unknown'} ${version(app.osVersion)}`,
    `app: ${version(app.version)} (${version(app.build)})`,
  ].join('\n');
}
