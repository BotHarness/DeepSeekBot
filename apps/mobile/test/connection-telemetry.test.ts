import { afterEach, expect, it, vi } from 'vitest';
import { createConnectionTelemetry } from '../src/telemetry/connection';
import { createMobileTelemetry, type TelemetryEvent } from '../src/telemetry/mobile-telemetry';
afterEach(() => vi.useRealTimers());
it('times out observation without stopping the Host and records later recovery once', async () => {
  vi.useFakeTimers();
  let n = 0;
  const events: TelemetryEvent[] = [];
  const telemetry = createMobileTelemetry({
    storage: { read: async () => undefined, write() {} },
    uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    now: Date.now,
    monotonic: Date.now,
    context: {
      platform: 'android',
      app_version: '2.0.0',
      app_build: '12',
      environment: 'development',
      language: 'zh',
    },
    sender: async (batch) => {
      events.push(...batch);
    },
  });
  await telemetry.setEnabled(true);
  telemetry.foreground(true, 1);
  const connection = createConnectionTelemetry(telemetry, 'open');
  connection.update('connecting');
  connection.update('unreachable', 1);
  connection.update('unreachable', 6);
  await vi.advanceTimersByTimeAsync(30_001);
  connection.update('connected');
  connection.update('connected');
  await telemetry.flush();
  expect(
    events.filter((e) => e.event === 'mobile_connection_result').map((e) => e.properties),
  ).toMatchObject([
    { trigger: 'open', outcome: 'timeout', retry_count_bucket: '4plus' },
    { trigger: 'recovery', outcome: 'ready' },
  ]);
  expect(events.filter((e) => e.event === 'mobile_activation_step')).toHaveLength(1);
  connection.begin('switch');
  telemetry.foreground(false, 1);
  connection.update('connected');
  await telemetry.flush();
  expect(
    events.filter((e) => e.event === 'mobile_connection_result').at(-1)?.properties,
  ).toMatchObject({ trigger: 'switch', outcome: 'cancelled' });
  telemetry.foreground(true, 1);
  connection.begin('manual_retry');
  connection.update('refused', 0, 'device-revoked');
  await telemetry.flush();
  expect(
    events.filter((e) => e.event === 'mobile_connection_result').at(-1)?.properties,
  ).toMatchObject({ outcome: 'refused', reason: 'device-revoked' });
  connection.dispose();
  telemetry.dispose();
});
