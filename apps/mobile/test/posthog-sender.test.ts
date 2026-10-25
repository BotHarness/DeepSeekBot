import { expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const shim = require('./posthog-native-shim.cjs');
const { createPostHogSender } = await import('../src/telemetry/posthog-sender');
shim.restore();
import type { TelemetryEvent } from '../src/telemetry/schema';
import { createMobileTelemetry } from '../src/telemetry/mobile-telemetry';

const event: TelemetryEvent = {
  event: 'mobile_app_opened',
  uuid: '00000000-0000-4000-8000-000000000001',
  distinct_id: '00000000-0000-4000-8000-000000000002',
  timestamp: '2026-10-16T00:00:00.000Z',
  properties: {
    source: 'mobile',
    schema_version: 1,
    platform: 'ios',
    app_version: '2.0.0',
    app_build: '12',
    os_version: '26.1',
    device_class: 'phone',
    device_model: 'iPhone11,6',
    total_mem_gb_bucket: '8',
    device_year_class: 2018,
    environment: 'development',
    language: 'en',
    foreground_session_id: '00000000-0000-4000-8000-000000000003',
    launch_kind: 'cold',
    paired_host_count_bucket: '0',
    $geoip_disable: true,
    $process_person_profile: false,
  },
};

it('initializes without bootstrap requests and sends only the approved event through the actual SDK', async () => {
  const request = vi.fn(
    async (
      _url: string,
      _init: Parameters<typeof createPostHogSender>[0]['request'] extends (
        url: string,
        init: infer I,
      ) => unknown
        ? I
        : never,
    ) => ({ status: 200, text: async () => '1', json: async () => ({ status: 1 }) }),
  );
  const transport = createPostHogSender({ token: 'phc_test', request });
  expect(request).not.toHaveBeenCalled();

  await transport.send([event], new AbortController().signal);
  expect(request).toHaveBeenCalledTimes(1);
  const [url, init] = request.mock.calls[0]!;
  expect(url).toBe('https://t.botharness.ai/batch/');
  const body = JSON.parse(String(init.body));
  expect(body.batch).toEqual([event]);
  await transport.clear();
});

it('rejects failed delivery and retries the identical approved event without an SDK duplicate', async () => {
  const request = vi.fn<Parameters<typeof createPostHogSender>[0]['request']>(async () => ({
    status: 200,
    text: async () => '1',
    json: async () => ({ status: 1 }),
  }));
  request.mockRejectedValueOnce(new Error('offline'));
  const transport = createPostHogSender({ token: 'phc_test', request });
  await expect(transport.send([event], new AbortController().signal)).rejects.toThrow();
  await transport.send([event], new AbortController().signal);
  expect(request).toHaveBeenCalledTimes(2);
  for (const [, init] of request.mock.calls)
    expect(JSON.parse(String(init.body)).batch).toEqual([event]);
  await transport.clear();
});

it('preserves common context on every owner-produced event through the actual SDK', async () => {
  const batches: TelemetryEvent[][] = [];
  const transport = createPostHogSender({
    token: 'phc_test',
    request: async (_url, init) => {
      batches.push(JSON.parse(String(init.body)).batch);
      return { status: 200, text: async () => '1', json: async () => ({ status: 1 }) };
    },
  });
  let sequence = 0;
  const context = {
    platform: 'ios',
    app_version: '2.0.0',
    app_build: '12',
    environment: 'development',
    language: 'en',
    os_version: '26.1',
    device_class: 'phone',
    device_model: 'iPhone11,6',
    total_mem_gb_bucket: '8',
    device_year_class: 2018,
  } as const;
  const telemetry = createMobileTelemetry({
    context,
    storage: { read: async () => undefined, write: () => {} },
    sender: transport.send,
    uuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    now: () => Date.parse('2026-10-16T00:00:00Z'),
    monotonic: () => 0,
  });
  await telemetry.ready;
  telemetry.foreground(true, 1);
  telemetry.pairing('qr').finish('success');
  telemetry.connection('pair').finish('ready');
  telemetry.activation('host_ready');
  telemetry.botOperation('marketplace', 'submit').finish('created');
  await telemetry.flush();
  expect(batches).toHaveLength(1);
  expect(new Set(batches[0]!.map((item) => item.event))).toEqual(
    new Set([
      'mobile_app_opened',
      'mobile_pairing_started',
      'mobile_pairing_result',
      'mobile_connection_result',
      'mobile_activation_step',
      'mobile_bot_operation_started',
      'mobile_bot_operation_result',
    ]),
  );
  for (const item of batches[0]!) {
    expect(item.properties).toMatchObject({
      ...context,
      $geoip_disable: true,
      $process_person_profile: false,
    });
  }
  telemetry.dispose();
  await transport.clear();
});
