import { isDeviceYearClass, isPublicModelId, type DeviceTelemetryContext } from './device-context';

export type PairingMethod = 'qr' | 'image' | 'paste' | 'deep_link' | 'account';
export type PairingOutcome = 'success' | 'refused' | 'failed' | 'cancelled';
export type PairingReason =
  | 'lan-build-required'
  | 'lan-unreachable'
  | 'already-paired'
  | 'none'
  | 'host-key-required'
  | 'host-key-confirmation-required'
  | 'channel-authentication-failed'
  | 'link-invalid'
  | 'link-expired'
  | 'no-route'
  | 'offer-invalid'
  | 'offer-expired'
  | 'unreachable'
  | 'storage-failure'
  | 'sign-in-cancelled'
  | 'sign-in-failed'
  | 'sign-in-required'
  | 'account-not-allowed'
  | 'host-offline'
  | 'relay-unavailable'
  | 'account-changed'
  | 'account-identity-required'
  | 'account-action-pending'
  | 'account-cleanup-failed'
  | 'account-deletion-uncertain'
  | 'unknown';
export type DurationBucket = 'under1s' | '1-5s' | '5-15s' | '15-60s' | '60plus';
export type ActivationStep = 'host_ready' | 'message_accepted' | 'bot_message_observed';
export type ChannelKind = 'dm' | 'group';
export type BotOperationKind = 'blank' | 'git' | 'zip' | 'marketplace';
export type BotOperationPhase = 'preview' | 'submit' | 'recover';
export type BotOperationOutcome =
  | 'preview_ready'
  | 'created'
  | 'recovered'
  | 'pending'
  | 'refused'
  | 'failed'
  | 'unknown';
export type BotOperationReason =
  | 'none'
  | 'validation'
  | 'target-unavailable'
  | 'host-update-required'
  | 'source-changed'
  | 'source-invalid'
  | 'storage'
  | 'transport'
  | 'unknown';
export type ConnectionTrigger = 'pair' | 'open' | 'resume' | 'switch' | 'recovery' | 'manual_retry';
export type ConnectionOutcome = 'ready' | 'refused' | 'timeout' | 'cancelled';
export type ConnectionReason =
  | 'none'
  | 'device-revoked'
  | 'device-unknown'
  | 'device-credential-missing';
export interface EventProperties {
  'bot_library:create_attempt_start': {
    kind: BotOperationKind;
    phase: BotOperationPhase;
    attempt_id: string;
  };
  'bot_library:create_attempt_complete': EventProperties['bot_library:create_attempt_start'] & {
    outcome: BotOperationOutcome;
    reason: BotOperationReason;
    duration_bucket: DurationBucket;
  };
  'connection:attempt_complete': {
    trigger: ConnectionTrigger;
    outcome: ConnectionOutcome;
    reason: ConnectionReason;
    attempt_id: string;
    duration_bucket: DurationBucket;
    retry_count_bucket: '0' | '1' | '2-3' | '4plus';
  };
  'onboarding:activation_step_complete': {
    step: ActivationStep;
    channel_kind: ChannelKind | 'none';
  };
  'app:app_open': {
    launch_kind: 'cold' | 'resume';
    paired_host_count_bucket: '0' | '1' | '2plus';
  };
  'pairing:attempt_start': { method: PairingMethod; attempt_id: string };
  'pairing:attempt_complete': {
    method: PairingMethod;
    attempt_id: string;
    outcome: PairingOutcome;
    reason: PairingReason;
    duration_bucket: DurationBucket;
  };
}
export interface TelemetryContext extends Partial<DeviceTelemetryContext> {
  platform: 'ios' | 'android';
  app_version: string;
  app_build: string;
  environment: 'production' | 'preview' | 'development';
  language: 'en' | 'zh';
  qa_run_id?: string;
}
export interface TelemetryEvent {
  uuid: string;
  distinct_id: string;
  timestamp: string;
  event: keyof EventProperties;
  properties: Record<string, string | number | boolean>;
}
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && uuidPattern.test(value);
export function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
const member =
  (...values: string[]) =>
  (value: unknown): value is string =>
    typeof value === 'string' && values.includes(value);
const method = member('qr', 'image', 'paste', 'deep_link', 'account');
const duration = member('under1s', '1-5s', '5-15s', '15-60s', '60plus');
const deviceFields: Record<keyof DeviceTelemetryContext, (value: unknown) => boolean> = {
  os_version: (value) => typeof value === 'string' && /^(?:\d{1,3}\.\d{1,3}|unknown)$/u.test(value),
  device_class: member('phone', 'tablet', 'unknown'),
  device_model: (value) => value === 'unknown' || isPublicModelId(value),
  total_mem_gb_bucket: member('<=4', '8', '16', '32', '64plus', 'unknown'),
  device_year_class: (value) => value === 'unknown' || isDeviceYearClass(value),
};
export const MOBILE_EVENT_FIELDS: Record<
  keyof EventProperties,
  Record<string, (value: unknown) => boolean>
> = {
  'bot_library:create_attempt_start': {
    kind: member('blank', 'git', 'zip', 'marketplace'),
    phase: member('preview', 'submit', 'recover'),
    attempt_id: isUuid,
  },
  'bot_library:create_attempt_complete': {
    kind: member('blank', 'git', 'zip', 'marketplace'),
    phase: member('preview', 'submit', 'recover'),
    attempt_id: isUuid,
    outcome: member(
      'preview_ready',
      'created',
      'recovered',
      'pending',
      'refused',
      'failed',
      'unknown',
    ),
    reason: member(
      'none',
      'validation',
      'target-unavailable',
      'host-update-required',
      'source-changed',
      'source-invalid',
      'storage',
      'transport',
      'unknown',
    ),
    duration_bucket: duration,
  },
  'connection:attempt_complete': {
    trigger: member('pair', 'open', 'resume', 'switch', 'recovery', 'manual_retry'),
    outcome: member('ready', 'refused', 'timeout', 'cancelled'),
    reason: member('none', 'device-revoked', 'device-unknown', 'device-credential-missing'),
    attempt_id: isUuid,
    duration_bucket: duration,
    retry_count_bucket: member('0', '1', '2-3', '4plus'),
  },
  'onboarding:activation_step_complete': {
    step: member('host_ready', 'message_accepted', 'bot_message_observed'),
    channel_kind: member('dm', 'group', 'none'),
  },
  'app:app_open': {
    launch_kind: member('cold', 'resume'),
    paired_host_count_bucket: member('0', '1', '2plus'),
  },
  'pairing:attempt_start': { method, attempt_id: isUuid },
  'pairing:attempt_complete': {
    method,
    attempt_id: isUuid,
    outcome: member('success', 'refused', 'failed', 'cancelled'),
    reason: member(
      'lan-build-required',
      'lan-unreachable',
      'none',
      'host-key-required',
      'host-key-confirmation-required',
      'already-paired',
      'channel-authentication-failed',
      'link-invalid',
      'link-expired',
      'no-route',
      'offer-invalid',
      'offer-expired',
      'unreachable',
      'storage-failure',
      'sign-in-cancelled',
      'sign-in-failed',
      'sign-in-required',
      'account-not-allowed',
      'host-offline',
      'relay-unavailable',
      'account-changed',
      'account-identity-required',
      'account-action-pending',
      'account-cleanup-failed',
      'account-deletion-uncertain',
      'unknown',
    ),
    duration_bucket: duration,
  },
};
export const LEGACY_EVENT_NAMES: Readonly<Record<string, keyof EventProperties>> = {
  mobile_bot_operation_started: 'bot_library:create_attempt_start',
  mobile_bot_operation_result: 'bot_library:create_attempt_complete',
  mobile_connection_result: 'connection:attempt_complete',
  mobile_activation_step: 'onboarding:activation_step_complete',
  mobile_app_opened: 'app:app_open',
  mobile_pairing_started: 'pairing:attempt_start',
  mobile_pairing_result: 'pairing:attempt_complete',
};
export function sanitizeEvent(value: unknown): TelemetryEvent | undefined {
  const input = record(value);
  const props = record(input['properties']);
  const named = input['event'];
  const event =
    typeof named === 'string' && Object.hasOwn(LEGACY_EVENT_NAMES, named)
      ? LEGACY_EVENT_NAMES[named]
      : named;
  if (
    typeof event !== 'string' ||
    !Object.hasOwn(MOBILE_EVENT_FIELDS, event) ||
    !isUuid(input['uuid']) ||
    !isUuid(input['distinct_id']) ||
    typeof input['timestamp'] !== 'string' ||
    !Number.isFinite(Date.parse(input['timestamp']))
  )
    return undefined;
  if (
    !member('ios', 'android')(props['platform']) ||
    !member('production', 'preview', 'development')(props['environment']) ||
    !member('en', 'zh')(props['language']) ||
    !isUuid(props['foreground_session_id'])
  )
    return undefined;
  const version = props['app_version'];
  const build = props['app_build'];
  if (
    typeof version !== 'string' ||
    !/^(?:\d{1,4}\.\d{1,4}\.\d{1,4}|unknown)$/u.test(version) ||
    typeof build !== 'string' ||
    !/^(?:\d{1,12}|unknown)$/u.test(build)
  )
    return undefined;
  const properties: TelemetryEvent['properties'] = {
    source: 'mobile',
    schema_version: 1,
    platform: props['platform'],
    environment: props['environment'],
    language: props['language'],
    app_version: version,
    app_build: build,
    foreground_session_id: props['foreground_session_id'],
    $process_person_profile: false,
    $geoip_disable: true,
  };
  if (isUuid(props['qa_run_id'])) properties['qa_run_id'] = props['qa_run_id'];
  for (const [name, valid] of Object.entries(deviceFields)) {
    const field = props[name];
    if (field === undefined) continue;
    if (!valid(field) || (typeof field !== 'string' && typeof field !== 'number')) return undefined;
    properties[name] = field;
  }
  for (const [name, valid] of Object.entries(MOBILE_EVENT_FIELDS[event as keyof EventProperties])) {
    const field = props[name];
    if (!valid(field) || typeof field !== 'string') return undefined;
    properties[name] = field;
  }
  return {
    uuid: input['uuid'],
    distinct_id: input['distinct_id'],
    timestamp: new Date(input['timestamp']).toISOString(),
    event: event as keyof EventProperties,
    properties,
  };
}
export function durationBucket(ms: number): DurationBucket {
  return ms < 1000
    ? 'under1s'
    : ms < 5000
      ? '1-5s'
      : ms < 15000
        ? '5-15s'
        : ms < 60000
          ? '15-60s'
          : '60plus';
}
