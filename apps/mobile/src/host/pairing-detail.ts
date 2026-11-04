import { isConnectRoute, isLanRoute } from './route';

const TOKEN = /^[a-z][a-z0-9-]{0,47}$/u;
const SEGMENT =
  /^(?:lan|connect|remote|link|app|relay):[a-z][a-z0-9-]{0,47}(?::[a-z][a-z0-9-]{0,47})?$/u;
const MAX_SEGMENTS = 4;

function pathKind(route: string): 'lan' | 'connect' | 'remote' | 'app' {
  if (route === 'app:') return 'app';
  if (isLanRoute(route)) return 'lan';
  return isConnectRoute(route) ? 'connect' : 'remote';
}

const KNOWN_HEAD =
  /^(?:channel|lan|refused|offer|http|socket|nsurl|posix|storage|bad-reply|no-tunnel|timeout|unreachable)(?:-[a-z0-9-]*)?$/u;

export function reasonCode(reason: string): string {
  const [head = '', tail] = reason.split(':', 2);
  if (TOKEN.test(head) && KNOWN_HEAD.test(head) && (tail === undefined || TOKEN.test(tail)))
    return tail === undefined ? head : `${head}:${tail}`;
  const native = /(NSURLErrorDomain|NSPOSIXErrorDomain)[^\d-]{0,16}(-?\d{1,6})/u.exec(reason);
  if (native) return `${native[1] === 'NSURLErrorDomain' ? 'nsurl' : 'posix'}${native[2]}`;
  const lower = reason.toLowerCase();
  if (/response|http/u.test(lower)) {
    const status = lower.match(/\b[1-5]\d\d\b/gu)?.find((value) => value !== '101');
    if (status) return `http-${status}`;
  }
  if (lower.includes('timed out') || lower.includes('timeout')) return 'socket-timeout';
  if (lower.includes('refused')) return 'socket-refused';
  if (lower.includes('reset') || lower.includes('broken pipe')) return 'socket-reset';
  if (lower.includes('resolve') || lower.includes('hostname') || lower.includes('dns'))
    return 'socket-dns';
  if (lower.includes('offline') || lower.includes('not connected')) return 'socket-offline';
  if (lower.includes('certificate') || lower.includes('ssl') || lower.includes('tls'))
    return 'socket-tls';
  return 'socket-error';
}

export function channelFailureDetail(route: string, reason: string): string {
  return `${pathKind(route)}:${reasonCode(reason || 'channel-disconnected')}`;
}

export function relayFailureDetail(code: string, cause?: unknown): string {
  const head = TOKEN.test(code) ? code : 'relay-error';
  return typeof cause === 'string' && TOKEN.test(cause)
    ? `relay:${head}:${cause}`
    : `relay:${head}`;
}

export function joinFailureDetails(details: readonly string[]): string | undefined {
  const kept = details.filter((detail) => SEGMENT.test(detail)).slice(-MAX_SEGMENTS);
  return kept.length === 0 ? undefined : kept.join(',');
}

export function isPairingFailureDetail(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 240) return false;
  const segments = value.split(',');
  return segments.length <= MAX_SEGMENTS && segments.every((segment) => SEGMENT.test(segment));
}

export function pairingDiagnostics(input: {
  code: string;
  detail?: string | undefined;
  method: string;
  platform: string;
  osVersion?: string | null;
  appVersion?: string | null;
  appBuild?: string | null;
}): string {
  return [
    `reason: ${input.code}`,
    `detail: ${input.detail ?? 'none'}`,
    `method: ${input.method}`,
    `platform: ${input.platform} ${input.osVersion ?? 'unknown'}`,
    `app: ${input.appVersion ?? 'unknown'} (${input.appBuild ?? 'unknown'})`,
  ].join('\n');
}
