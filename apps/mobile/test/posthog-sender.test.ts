import { expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const shim = require('./posthog-native-shim.cjs');
const { createPostHogSender } = await import('../src/telemetry/posthog-sender');
shim.restore();
import type { TelemetryEvent } from '../src/telemetry/schema';

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
