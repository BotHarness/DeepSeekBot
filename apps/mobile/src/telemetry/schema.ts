export type PairingMethod = 'qr' | 'paste' | 'deep_link' | 'account';
export type PairingOutcome = 'success' | 'refused' | 'failed' | 'cancelled';
export type PairingReason =
  | 'none'
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
  | 'unknown';
export type DurationBucket = 'under1s' | '1-5s' | '5-15s' | '15-60s' | '60plus';
export type ActivationStep = 'host_ready' | 'message_accepted' | 'bot_message_observed';
export type ChannelKind = 'dm' | 'group';
export type ConnectionTrigger = 'pair' | 'open' | 'resume' | 'switch' | 'recovery' | 'manual_retry';
export type ConnectionOutcome = 'ready' | 'refused' | 'timeout' | 'cancelled';
export type ConnectionReason =
  | 'none'
  | 'device-revoked'
  | 'device-unknown'
  | 'device-credential-missing';
export interface EventProperties {
  mobile_connection_result: {
    trigger: ConnectionTrigger;
    outcome: ConnectionOutcome;
    reason: ConnectionReason;
    attempt_id: string;
    duration_bucket: DurationBucket;
    retry_count_bucket: '0' | '1' | '2-3' | '4plus';
  };
  mobile_activation_step: { step: ActivationStep; channel_kind: ChannelKind | 'none' };
  mobile_app_opened: {
    launch_kind: 'cold' | 'resume';
    paired_host_count_bucket: '0' | '1' | '2plus';
  };
  mobile_pairing_started: { method: PairingMethod; attempt_id: string };
  mobile_pairing_result: {
    method: PairingMethod;
    attempt_id: string;
    outcome: PairingOutcome;
    reason: PairingReason;
    duration_bucket: DurationBucket;
  };
}
export interface TelemetryContext {
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
const method = member('qr', 'paste', 'deep_link', 'account');
const duration = member('under1s', '1-5s', '5-15s', '15-60s', '60plus');
const fields: Record<keyof EventProperties, Record<string, (value: unknown) => boolean>> = {
  mobile_connection_result: {
    trigger: member('pair', 'open', 'resume', 'switch', 'recovery', 'manual_retry'),
    outcome: member('ready', 'refused', 'timeout', 'cancelled'),
    reason: member('none', 'device-revoked', 'device-unknown', 'device-credential-missing'),
    attempt_id: isUuid,
    duration_bucket: duration,
    retry_count_bucket: member('0', '1', '2-3', '4plus'),
  },
  mobile_activation_step: {
    step: member('host_ready', 'message_accepted', 'bot_message_observed'),
    channel_kind: member('dm', 'group', 'none'),
  },
  mobile_app_opened: {
    launch_kind: member('cold', 'resume'),
    paired_host_count_bucket: member('0', '1', '2plus'),
  },
  mobile_pairing_started: { method, attempt_id: isUuid },
  mobile_pairing_result: {
    method,
    attempt_id: isUuid,
    outcome: member('success', 'refused', 'failed', 'cancelled'),
    reason: member(
      'none',
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
      'unknown',
    ),
    duration_bucket: duration,
  },
};
export function sanitizeEvent(value: unknown): TelemetryEvent | undefined {
  const input = record(value);
  const props = record(input['properties']);
  const event = input['event'];
  if (
    typeof event !== 'string' ||
    !Object.hasOwn(fields, event) ||
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
  for (const [name, valid] of Object.entries(fields[event as keyof EventProperties])) {
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
