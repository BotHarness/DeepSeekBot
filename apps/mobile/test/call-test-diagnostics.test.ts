import { describe, expect, it, vi } from 'vitest';
import type { CallClientMedia, CallPost } from '../../../packages/core/src/voice/call-client';
import { createCallClient } from '../../../packages/core/src/voice/call-client';
import { callTestStateFields, createCallTestDiagnostics } from '../src/host/call-test-diagnostics';

const media: CallClientMedia = {
  start: async () => 'PRIVATE SDP',
  mute() {},
  stop() {},
  onState: () => () => {},
};
const options = { media, route: () => 'http://127.0.0.1:39420', encryptedLoopback: false };

describe('synthetic call control report', () => {
  it('observes the same request/result and a delayed refusal without body or error text', async () => {
    let now = 10;
    const result = { ok: false, code: 'call-ended', error: 'PRIVATE TOKEN' } as const;
    const post: CallPost = vi.fn(async () => {
      now = 75;
      return result;
    });
    const report = createCallTestDiagnostics({ ...options, post, now: () => now });
    const body = {
      kind: 'heartbeat',
      callId: 'call-a123',
      token: 'PRIVATE',
      answer: { sdp: 'PRIVATE' },
    };
    expect(await report.post(body)).toBe(result);
    expect(post).toHaveBeenCalledExactlyOnceWith(body);
    expect(report.snapshot().events).toMatchObject([
      {
        seq: 1,
        stage: 'dispatch',
        request: 1,
        action: 'heartbeat',
        callId: 'call-a123',
        route: 'loopback',
      },
      { seq: 2, stage: 'resolved', request: 1, durationMs: 65, ok: false, code: 'call-ended' },
    ]);
    expect(JSON.stringify(report.snapshot())).not.toMatch(/PRIVATE|127\.0\.0\.1|39420/);
  });

  it('rethrows the same exception and bounds retained events', async () => {
    const error = new Error('PRIVATE https://secret.invalid');
    const report = createCallTestDiagnostics({
      ...options,
      post: async () => {
        throw error;
      },
    });
    for (let i = 0; i < 260; i++)
      await expect(report.post({ kind: 'heartbeat' })).rejects.toBe(error);
    const snapshot = report.snapshot();
    expect(snapshot.events).toHaveLength(512);
    expect(snapshot.dropped).toBe(8);
    expect(snapshot.events.at(-1)).toMatchObject({ stage: 'exception', seq: 520 });
    expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE|secret/);
  });

  it('uses exactly the existing media subscription and preserves callback/unsubscribe behavior', async () => {
    let callback: Parameters<CallClientMedia['onState']>[0] | undefined;
    const unsubscribe = vi.fn();
    const original: CallClientMedia = {
      ...media,
      start: vi.fn(async function (this: CallClientMedia) {
        expect(this).toBe(original);
        return 'SDP';
      }),
      onState: vi.fn(function (this: CallClientMedia, listener) {
        expect(this).toBe(original);
        callback = listener;
        return unsubscribe;
      }),
    };
    const report = createCallTestDiagnostics({
      ...options,
      media: original,
      post: async () => ({ ok: true }),
    });
    const listener = vi.fn();
    expect(original.onState).not.toHaveBeenCalled();
    expect(report.media.onState(listener)).toBe(unsubscribe);
    expect(original.onState).toHaveBeenCalledTimes(1);
    expect(await report.media.start({ callId: 'call-abcd', offer: 'SECRET' })).toBe('SDP');
    callback?.('failed', 'ice-failed');
    expect(listener).toHaveBeenCalledExactlyOnceWith('failed', 'ice-failed');
    expect(report.snapshot().events.at(-1)).toMatchObject({
      kind: 'media',
      callId: 'call-abcd',
      state: 'failed',
      code: 'ice-failed',
    });
  });

  it('observer failures do not change success, exception, or media forwarding', async () => {
    const result = { ok: true } as const;
    const report = createCallTestDiagnostics({
      ...options,
      post: async () => result,
      route: () => {
        throw Error('observer');
      },
      now: () => {
        throw Error('clock');
      },
    });
    expect(await report.post({ kind: 'heartbeat' })).toBe(result);
    const error = Error('original');
    const failed = createCallTestDiagnostics({
      ...options,
      post: async () => {
        throw error;
      },
      route: () => {
        throw Error('observer');
      },
    });
    await expect(failed.post({ kind: 'heartbeat' })).rejects.toBe(error);
  });

  it('records the first native/client terminal sequence and strips free text', () => {
    const report = createCallTestDiagnostics({ ...options, post: async () => ({ ok: true }) });
    const state = {
      status: 'ended',
      reason: 'media-failed',
      mediaCode: 'ice-failed',
      error: 'SECRET',
      events: [],
    } as const;
    report.state(state);
    expect(callTestStateFields(state)).toMatchObject({
      status: 'ended',
      reason: 'media-failed',
      mediaCode: 'ice-failed',
    });
    expect(JSON.stringify(report.snapshot())).not.toContain('SECRET');
  });

  it('records native failure before the real client ends and posts cleanup', async () => {
    let callback: Parameters<CallClientMedia['onState']>[0] | undefined;
    const original = {
      ...media,
      onState: (listener: NonNullable<typeof callback>) => {
        callback = listener;
        return () => {};
      },
    };
    const call = {
      callId: 'call-ab12',
      slug: 'test',
      channelId: 'test',
      phase: 'listening',
      muted: false,
      busy: false,
      media: 'webrtc',
      startedAt: 0,
      durationMs: 0,
      events: [],
      lastSeq: 0,
      offer: { type: 'offer', sdp: 'PRIVATE' },
    } as const;
    const report = createCallTestDiagnostics({
      ...options,
      media: original,
      post: async () => ({ ok: true, call }),
    });
    const client = createCallClient({
      post: report.post,
      media: report.media,
      onChange: report.state,
      setInterval: () => 0,
      clearInterval: () => {},
    });
    await client.open('test');
    callback?.('failed', 'ice-failed');
    expect(client.state()).toMatchObject({
      status: 'ended',
      reason: 'media-failed',
      mediaCode: 'ice-failed',
    });
    const rows = report.snapshot().events;
    const native = rows.findIndex((row) => row.kind === 'media' && row.state === 'failed');
    const ended = rows.findIndex((row) => row.kind === 'state' && row.status === 'ended');
    expect(native).toBeGreaterThan(-1);
    expect(ended).toBeGreaterThan(native);
    expect(
      rows.slice(native, ended).some((row) => row.action === 'hangup' && row.stage === 'dispatch'),
    ).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('PRIVATE');
  });
});
