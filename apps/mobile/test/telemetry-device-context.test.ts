import { expect, it } from 'vitest';
import { deviceTelemetryContext, totalMemoryBucket } from '../src/telemetry/device-context';
import { sanitizeEvent } from '../src/telemetry/schema';

const context = deviceTelemetryContext({
  osVersion: '26.1.2',
  deviceClass: 'phone',
  modelId: 'iPhone11,6',
  totalMemory: 6 * 1024 ** 3,
  deviceYearClass: 2018,
});
const id = '11111111-1111-4111-8111-111111111111';
const base = {
  platform: 'ios',
  app_version: '2.0.0',
  app_build: '42',
  environment: 'production',
  language: 'en',
  foreground_session_id: id,
};
const envelope = (event: string, properties: Record<string, unknown>) => ({
  event,
  uuid: id,
  distinct_id: id,
  timestamp: '2026-10-22T00:00:00.000Z',
  properties: { ...base, ...properties },
});

it('reduces OS precision and collects only approved hardware facts', () => {
  expect(context).toEqual({
    os_version: '26.1',
    device_class: 'phone',
    device_model: 'iPhone11,6',
    total_mem_gb_bucket: '8',
    device_year_class: 2018,
  });
  expect(
    deviceTelemetryContext({
      osVersion: '16',
      deviceClass: 'tablet',
      modelId: null,
      totalMemory: null,
      deviceYearClass: null,
    }),
  ).toEqual({
    os_version: '16.0',
    device_class: 'tablet',
    device_model: 'unknown',
    total_mem_gb_bucket: 'unknown',
    device_year_class: 'unknown',
  });
  expect(
    deviceTelemetryContext({
      osVersion: '/private/version',
      deviceClass: 'unknown',
      modelId: 'My private phone',
      totalMemory: Infinity,
      deviceYearClass: -1,
    }),
  ).toEqual({
    os_version: 'unknown',
    device_class: 'unknown',
    device_model: 'unknown',
    total_mem_gb_bucket: 'unknown',
    device_year_class: 'unknown',
  });
});

it.each([
  [0, 'unknown'],
  [-1, 'unknown'],
  [NaN, 'unknown'],
  [Infinity, 'unknown'],
  [2, '<=4'],
  [4, '<=4'],
  [4.01, '8'],
  [8, '8'],
  [8.01, '16'],
  [16, '16'],
  [16.01, '32'],
  [32, '32'],
  [32.01, '64plus'],
  [48, '64plus'],
  [64, '64plus'],
] as const)('buckets %s GiB as %s', (gb, bucket) => {
  expect(totalMemoryBucket(gb * 1024 ** 3)).toBe(bucket);
});

it.each([
  ['mobile_app_opened', { launch_kind: 'cold', paired_host_count_bucket: '0' }],
  ['mobile_pairing_started', { method: 'qr', attempt_id: id }],
  [
    'mobile_pairing_result',
    {
      method: 'qr',
      attempt_id: id,
      outcome: 'success',
      reason: 'none',
      duration_bucket: 'under1s',
    },
  ],
  [
    'mobile_connection_result',
    {
      trigger: 'open',
      outcome: 'ready',
      reason: 'none',
      attempt_id: id,
      duration_bucket: 'under1s',
      retry_count_bucket: '0',
    },
  ],
  ['mobile_activation_step', { step: 'host_ready', channel_kind: 'none' }],
] as const)(
  'preserves common context for %s and still accepts its old queued shape',
  (event, properties) => {
    const safe = sanitizeEvent(
      envelope(event, {
        ...properties,
        ...context,
        hostname: 'PRIVATE',
        deviceName: 'PRIVATE',
        androidId: 'PRIVATE',
        totalMemory: 123456789,
      }),
    );
    expect(safe?.properties).toMatchObject({
      ...context,
      $process_person_profile: false,
      $geoip_disable: true,
    });
    expect(JSON.stringify(safe)).not.toContain('PRIVATE');
    expect(safe?.properties).not.toHaveProperty('totalMemory');
    const old = sanitizeEvent(envelope(event, properties));
    expect(old).toBeDefined();
    expect(old?.properties).not.toHaveProperty('device_model');
  },
);

it.each([
  ['os_version', '26.1.2'],
  ['os_version', '/private/version'],
  ['device_class', 'private-device'],
  ['device_model', 'private-phone'],
  ['device_model', '123456789012345'],
  ['device_model', 'iPhone11,6/private'],
  ['total_mem_gb_bucket', 6442450944],
  ['total_mem_gb_bucket', '6'],
  ['device_year_class', 2018.5],
  ['device_year_class', 0],
  ['device_year_class', Infinity],
  ['device_year_class', '2018'],
] as const)('refuses an invalid %s field before storage or sending', (name, value) => {
  expect(
    sanitizeEvent(
      envelope('mobile_app_opened', {
        ...context,
        launch_kind: 'cold',
        paired_host_count_bucket: '0',
        [name]: value,
      }),
    ),
  ).toBeUndefined();
});
