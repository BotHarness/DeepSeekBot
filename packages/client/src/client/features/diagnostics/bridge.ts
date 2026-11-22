import { asRecord, unwrap, type BridgeCall } from '../../bridge-transport.js';
import type {
  TelemetryStatus,
  TelemetryLock,
  GitInstallFailure,
  GitUnavailableReason,
  GitInstallState,
  GitAvailability,
} from '../../bridge.js';
const TELEMETRY_LOCKS: readonly TelemetryLock[] = [
  'config',
  'DO_NOT_TRACK',
  'BOTHARNESS_TELEMETRY',
];
const GIT_UNAVAILABLE_REASONS: readonly GitUnavailableReason[] = [
  'missing',
  'unrunnable',
  'too-old',
];
const GIT_INSTALL_FAILURES: readonly GitInstallFailure[] = [
  'unsupported',
  'network',
  'checksum',
  'unpack',
  'unrunnable',
];

export function parseTelemetryStatus(value: unknown): TelemetryStatus {
  const item = asRecord(value);
  if (typeof item?.['enabled'] !== 'boolean') throw new Error('invalid telemetry status');
  const lockedBy = TELEMETRY_LOCKS.find((lock) => lock === item['lockedBy']);
  return {
    enabled: item['enabled'],
    preference: item['preference'] !== false,
    ...(lockedBy === undefined ? {} : { lockedBy }),
  };
}

function parseGitInstall(value: unknown): GitInstallState {
  const item = asRecord(value);
  const phase = item?.['phase'];
  if (phase === 'downloading') {
    const received = typeof item?.['received'] === 'number' ? item['received'] : 0;
    const total = typeof item?.['total'] === 'number' ? item['total'] : undefined;
    return { phase, received, ...(total === undefined ? {} : { total }) };
  }
  if (phase === 'verifying' || phase === 'unpacking') return { phase };
  if (phase === 'failed') {
    const reason = GIT_INSTALL_FAILURES.find((candidate) => candidate === item?.['reason']);
    const detail = typeof item?.['detail'] === 'string' ? item['detail'] : undefined;
    return {
      phase,
      reason: reason ?? 'unpack',
      ...(detail === undefined ? {} : { detail }),
    };
  }
  return { phase: 'idle' };
}

export function gitInstalling(git: GitAvailability | undefined): boolean {
  const phase = git?.install.phase;
  return phase === 'downloading' || phase === 'verifying' || phase === 'unpacking';
}

export function parseGitAvailability(value: unknown): GitAvailability {
  const item = asRecord(value);
  const version = typeof item?.['version'] === 'string' ? item['version'] : undefined;
  const extra = {
    installable: item?.['installable'] === true,
    install: parseGitInstall(item?.['install']),
  };
  if (item?.['available'] === true && version !== undefined) {
    const source = item['source'] === 'managed' ? 'managed' : 'system';
    return { available: true, version, source, ...extra };
  }
  const reason = GIT_UNAVAILABLE_REASONS.find((candidate) => candidate === item?.['reason']);
  if (item?.['available'] !== false || reason === undefined) throw new Error('invalid Git status');
  return {
    available: false,
    reason,
    ...(version === undefined ? {} : { version }),
    ...extra,
  };
}

export async function loadGitAvailability(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<GitAvailability> {
  return parseGitAvailability(await unwrap(call, 'gitStatus', {}, signal));
}

export async function startGitInstall(call: BridgeCall): Promise<GitAvailability> {
  return parseGitAvailability(await unwrap(call, 'gitInstall', {}));
}

export async function loadTelemetryStatus(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<TelemetryStatus> {
  return parseTelemetryStatus(await unwrap(call, 'telemetryStatus', {}, signal));
}

export async function setTelemetryPreference(
  call: BridgeCall,
  enabled: boolean,
): Promise<TelemetryStatus> {
  return parseTelemetryStatus(await unwrap(call, 'telemetrySet', { enabled }));
}
