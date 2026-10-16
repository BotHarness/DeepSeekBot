import { describe, expect, it, vi } from 'vitest';
import {
  createMobileTelemetry,
  type TelemetryEvent,
  type TelemetryOptions,
} from '../src/telemetry/mobile-telemetry';

function fixture(overrides: Partial<TelemetryOptions> = {}) {
  let stored: unknown;
  let sequence = 0;
  let now = Date.parse('2026-10-16T00:00:00Z');
  const send = vi.fn(async (_batch: readonly TelemetryEvent[], _signal: AbortSignal) => {});
  const telemetry = createMobileTelemetry({
    storage: {
      read: async () => stored,
      write: (value) => {
        stored = structuredClone(value);
      },
    },
    sender: send,
    uuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    now: () => now,
    monotonic: () => now,
    context: {
      platform: 'ios',
      app_version: '2.0.0',
      app_build: '12',
      environment: 'development',
      language: 'en',
    },
    ...overrides,
  });
  return {
    telemetry,
    send,
    stored: () => stored,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('mobile statistics preference', () => {
  it('defaults new installations on and forgets the queue and identity on opt-out', async () => {
    const { telemetry, send, stored } = fixture();
    await telemetry.ready;
    telemetry.foreground(true, 0);
    expect(telemetry.getSnapshot().enabled).toBe(true);
    await telemetry.flush();
    expect(send).toHaveBeenCalledTimes(1);
    const first = send.mock.calls[0]![0];
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      event: 'mobile_app_opened',
      properties: { source: 'mobile', launch_kind: 'cold' },
    });
    await telemetry.setEnabled(false);
    expect(stored()).toEqual({ version: 1, enabled: false });
    telemetry.foreground(false, 0);
    telemetry.foreground(true, 0);
    await telemetry.flush();
    expect(send).toHaveBeenCalledTimes(1);
    await telemetry.setEnabled(true);
    telemetry.foreground(true, 0);
    await telemetry.flush();
    expect(send.mock.calls[1]![0][0]!.distinct_id).not.toBe(first[0]!.distinct_id);
    telemetry.dispose();
  });
});

it('keeps only sanitized bounded events, retries stable UUIDs, expires offline data', async () => {
  const { telemetry, send, stored, advance } = fixture();
  await telemetry.setEnabled(true);
  telemetry.foreground(true, 1);
  const unsafe = JSON.parse('{"method":"paste","credential":"SENTINEL","route":"SENTINEL"}');
  for (let i = 0; i < 105; i += 1) telemetry.pairing(unsafe.method).finish('failed', 'unreachable');
  expect(JSON.stringify(stored())).not.toContain('SENTINEL');
  send.mockRejectedValueOnce(new Error('SENTINEL raw network error'));
  await telemetry.flush();
  expect(send.mock.calls[0]![0]).toHaveLength(100);
  expect(new TextEncoder().encode(JSON.stringify(stored())).length).toBeLessThan(256 * 1024);
  await telemetry.flush();
  expect(send.mock.calls[1]![0]).toEqual(send.mock.calls[0]![0]);
  telemetry.pairing('qr').finish('refused', 'link-invalid');
  advance(24 * 60 * 60 * 1000 + 1);
  await telemetry.flush();
  expect(send).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(stored())).not.toContain('mobile_pairing');
  telemetry.dispose();
});

it('renews foreground sessions after 30 minutes, not permission dialogs; aborts an in-flight batch', async () => {
  const { telemetry, send, advance } = fixture();
  await telemetry.setEnabled(true);
  telemetry.foreground(true, 2);
  telemetry.foreground(false, 2);
  advance(60_000);
  telemetry.foreground(true, 2);
  await telemetry.flush();
  expect(send.mock.calls[0]![0]).toHaveLength(1);
  telemetry.foreground(false, 2);
  advance(30 * 60_000);
  telemetry.foreground(true, 2);
  send.mockImplementationOnce(() => new Promise(() => {}));
  const pending = telemetry.flush();
  expect(send.mock.calls[1]![0][0]).toMatchObject({
    properties: { launch_kind: 'resume', paired_host_count_bucket: '2plus' },
  });
  expect(send.mock.calls[1]![0][0]!.properties['foreground_session_id']).not.toBe(
    send.mock.calls[0]![0][0]!.properties['foreground_session_id'],
  );
  await telemetry.setEnabled(false);
  await pending;
  expect(send.mock.calls[1]![1].aborted).toBe(true);
  telemetry.dispose();
});

it('records activation once per identity and rejects pre-foreground or background observations', async () => {
  const { telemetry, send } = fixture();
  await telemetry.ready;
  const beforeForeground = telemetry.send('dm');
  await telemetry.setEnabled(true);
  telemetry.foreground(true, 1);
  expect(beforeForeground.accepted()).toBe(false);
  const first = telemetry.send('dm');
  expect(first.accepted()).toBe(true);
  first.accepted();
  telemetry.foreground(false, 1);
  first.observed();
  telemetry.foreground(true, 1);
  first.observed();
  first.observed();
  telemetry.send('group').accepted();
  await telemetry.flush();
  expect(
    send.mock.calls[0]![0].filter((e) => e.event === 'mobile_activation_step').map(
      (e) => e.properties,
    ),
  ).toMatchObject([
    { step: 'message_accepted', channel_kind: 'dm' },
    { step: 'bot_message_observed', channel_kind: 'dm' },
  ]);
  telemetry.dispose();
});

it('restores only sanitized unexpired data and activation deduplication; missing storage starts enabled', async () => {
  const first = fixture();
  await first.telemetry.setEnabled(true);
  first.telemetry.foreground(true, 1);
  first.telemetry.send('dm').accepted();
  const saved = structuredClone(first.stored()) as { queue: TelemetryEvent[] };
  saved.queue[0]!.properties['credential'] = 'SENTINEL';
  saved.queue[0]!.properties['device_name'] = 'SENTINEL';
  first.telemetry.dispose();
  let disk: unknown;
  const batch: TelemetryEvent[] = [];
  const restored = createMobileTelemetry({
    storage: {
      read: async () => saved,
      write: (value) => {
        disk = value;
      },
    },
    sender: async (events) => {
      batch.push(...events);
    },
    uuid: () => '11111111-1111-4111-8111-111111111111',
    now: () => Date.parse('2026-10-16T00:01:00Z'),
    monotonic: () => 0,
    context: {
      platform: 'ios',
      app_version: '2.0.0',
      app_build: '12',
      environment: 'development',
      language: 'en',
    },
  });
  await restored.ready;
  restored.foreground(true, 1);
  restored.send('dm').accepted();
  expect(JSON.stringify(disk)).not.toContain('SENTINEL');
  await restored.flush();
  expect(batch.filter((e) => e.event === 'mobile_activation_step')).toHaveLength(1);
  expect(batch.every((e) => e.distinct_id === batch[0]!.distinct_id)).toBe(true);
  restored.dispose();
  const reinstalled = fixture();
  await reinstalled.telemetry.ready;
  expect(reinstalled.telemetry.getSnapshot().enabled).toBe(true);
  reinstalled.telemetry.dispose();
});

it('fails closed on storage failure and times out a sender that ignores cancellation', async () => {
  vi.useFakeTimers();
  const first = fixture();
  await first.telemetry.setEnabled(true);
  first.telemetry.foreground(true, 1);
  first.send.mockImplementation(() => new Promise(() => {}));
  const pending = first.telemetry.flush();
  await vi.advanceTimersByTimeAsync(8000);
  await pending;
  expect(first.send.mock.calls[0]![1].aborted).toBe(true);
  first.telemetry.dispose();
  vi.useRealTimers();
  const send = vi.fn();
  const failed = createMobileTelemetry({
    storage: {
      read: async () => undefined,
      write() {
        throw new Error('SENTINEL');
      },
    },
    sender: send,
    uuid: () => '11111111-1111-4111-8111-111111111111',
    now: Date.now,
    monotonic: () => 0,
    context: {
      platform: 'ios',
      app_version: '2.0.0',
      app_build: '12',
      environment: 'development',
      language: 'en',
    },
  });
  expect(await failed.setEnabled(true)).toBe(false);
  failed.foreground(true, 1);
  await failed.flush();
  expect(send).not.toHaveBeenCalled();
  expect(failed.getSnapshot()).toMatchObject({ enabled: false, storageError: true });
  failed.dispose();
});

it('collects nothing in an unconfigured build even after explicit local consent', async () => {
  const { telemetry, send, stored } = fixture({ collect: false });
  await telemetry.setEnabled(true);
  telemetry.foreground(true, 0);
  telemetry.pairing('paste').finish('success');
  telemetry.connection('pair').finish('ready');
  telemetry.send('dm').accepted();
  await telemetry.flush();
  expect(send).not.toHaveBeenCalled();
  expect(stored()).toMatchObject({ enabled: true, queue: [], steps: [] });
  telemetry.dispose();
});

it('does not consume an activation marker when the public context is refused', async () => {
  const context: TelemetryOptions['context'] = {
    platform: 'ios',
    app_version: 'private-build-name',
    app_build: '12',
    environment: 'development',
    language: 'en',
  };
  const { telemetry, send, stored } = fixture({ context });
  await telemetry.setEnabled(true);
  telemetry.foreground(true, 1);
  telemetry.activation('host_ready');
  context.app_version = '2.0.0';
  telemetry.activation('host_ready');
  await telemetry.flush();
  expect(send.mock.calls[0]![0]).toHaveLength(1);
  expect(stored()).toMatchObject({ steps: ['host_ready'] });
  expect(JSON.stringify(send.mock.calls)).not.toContain('private-build-name');
  telemetry.dispose();
});

it('retains an in-flight send acceptance on background without observing a hidden reply', async () => {
  const { telemetry, send } = fixture();
  await telemetry.setEnabled(true);
  telemetry.foreground(true, 1);
  const observation = telemetry.send('dm');
  telemetry.foreground(false, 1);
  expect(observation.accepted()).toBe(true);
  observation.observed();
  await telemetry.flush();
  expect(send.mock.calls[0]![0].filter((e) => e.event === 'mobile_activation_step')).toMatchObject([
    { properties: { step: 'message_accepted' } },
  ]);
  telemetry.dispose();
});

it('preserves a saved opt-out on startup instead of applying the new default', async () => {
  const { telemetry, send } = fixture({
    storage: { read: async () => ({ version: 1, enabled: false }), write: vi.fn() },
  });
  await telemetry.ready;
  expect(telemetry.getSnapshot().enabled).toBe(false);
  telemetry.foreground(true, 1);
  await telemetry.flush();
  expect(send).not.toHaveBeenCalled();
  telemetry.dispose();
});

it('does not replace an unreadable saved preference with default-on', async () => {
  const write = vi.fn();
  const { telemetry, send } = fixture({
    storage: {
      read: async () => {
        throw new Error('read failure');
      },
      write,
    },
  });
  await telemetry.ready;
  expect(telemetry.getSnapshot()).toMatchObject({ enabled: false, storageError: true });
  telemetry.foreground(true, 1);
  await telemetry.flush();
  expect(send).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  telemetry.dispose();
});

it('records the first app open when foreground arrives before preference loading', async () => {
  let finish!: (value: unknown) => void;
  const { telemetry, send } = fixture({
    storage: {
      read: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      write: vi.fn(),
    },
  });
  telemetry.foreground(true, 0);
  finish(undefined);
  await telemetry.ready;
  await telemetry.flush();
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]![0]).toEqual([expect.objectContaining({ event: 'mobile_app_opened' })]);
  telemetry.dispose();
});

it('shows the first-use notice without gating default-on sends, and remembers dismissal across opt-out and restart', async () => {
  const first = fixture();
  await first.telemetry.ready;
  expect(first.telemetry.getSnapshot().noticeOpen).toBe(true);
  first.telemetry.foreground(true, 0);
  await first.telemetry.flush();
  expect(first.send).toHaveBeenCalledTimes(1);
  const identity = first.send.mock.calls[0]![0][0]!.distinct_id;
  await first.telemetry.dismissNotice();
  expect(first.telemetry.getSnapshot().noticeOpen).toBe(false);
  expect(first.stored()).toMatchObject({ noticeSeen: true, identity });
  await first.telemetry.setEnabled(false);
  expect(first.stored()).toEqual({ version: 1, enabled: false, noticeSeen: true });
  const restored = fixture({ storage: { read: async () => first.stored(), write: vi.fn() } });
  await restored.telemetry.setEnabled(true);
  expect(restored.telemetry.getSnapshot().noticeOpen).toBe(false);
  first.telemetry.dispose();
  restored.telemetry.dispose();
});

it('shows the notice when an unseen saved opt-out is enabled, and fails closed if dismissal cannot be saved', async () => {
  let fail = false;
  const { telemetry } = fixture({
    storage: {
      read: async () => ({ version: 1, enabled: false }),
      write: () => {
        if (fail) throw new Error('storage');
      },
    },
  });
  await telemetry.ready;
  expect(telemetry.getSnapshot().noticeOpen).toBe(false);
  await telemetry.setEnabled(true);
  expect(telemetry.getSnapshot().noticeOpen).toBe(true);
  fail = true;
  await telemetry.dismissNotice();
  expect(telemetry.getSnapshot()).toMatchObject({
    noticeOpen: false,
    enabled: false,
    storageError: true,
  });
  telemetry.dispose();
});
