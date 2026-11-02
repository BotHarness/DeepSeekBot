import { afterEach, expect, it, vi } from 'vitest';
import { recordFeature, setFeatureSink } from '../src/telemetry/features';
import { createMobileTelemetry, type TelemetryEvent } from '../src/telemetry/mobile-telemetry';

afterEach(() => setFeatureSink(undefined));

function telemetry() {
  let sequence = 0;
  const send = vi.fn(async (_batch: readonly TelemetryEvent[], _signal: AbortSignal) => {});
  const instance = createMobileTelemetry({
    storage: { read: async () => undefined, write: () => {} },
    sender: send,
    uuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    now: () => Date.parse('2026-10-28T00:00:00Z'),
    monotonic: () => 0,
    context: {
      platform: 'android',
      app_version: '2.1.0',
      app_build: '7',
      environment: 'development',
      language: 'zh',
    },
  });
  return { instance, send };
}

it('sends first-batch feature events only while the app is in the foreground', async () => {
  const { instance, send } = telemetry();
  await instance.ready;
  setFeatureSink((event, properties) => instance.feature(event, properties));
  recordFeature('tob:mode_open', {});
  instance.foreground(true, 1);
  recordFeature('activity:approval_submit', { decision: 'allow_once', entry: 'notification' });
  recordFeature('share:bot_share_send', { content: 'both' });
  recordFeature('viewer:subpanel_open', { panel: 'computer' });
  recordFeature('model:plan_update', { via: 'inherit' });
  await instance.flush();
  const events = send.mock.calls.flatMap(([batch]) => batch);
  expect(events.map((event) => event.event)).toEqual([
    'app:app_open',
    'activity:approval_submit',
    'share:bot_share_send',
    'viewer:subpanel_open',
    'model:plan_update',
  ]);
  expect(events[1]?.properties).toMatchObject({
    source: 'mobile',
    decision: 'allow_once',
    entry: 'notification',
  });
  instance.dispose();
});

it('refuses an unregistered feature value and never throws into the caller', async () => {
  const { instance, send } = telemetry();
  await instance.ready;
  instance.foreground(true, 0);
  setFeatureSink((event, properties) => instance.feature(event, properties));
  recordFeature('viewer:subpanel_open', { panel: 'terminal' as never });
  setFeatureSink(() => {
    throw new Error('sink failed');
  });
  expect(() => recordFeature('tob:mode_open', {})).not.toThrow();
  await instance.flush();
  expect(send.mock.calls.flatMap(([batch]) => batch).map((event) => event.event)).toEqual([
    'app:app_open',
  ]);
  instance.dispose();
});
