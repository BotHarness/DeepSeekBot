import { connected, fakeMedia, harness, settled, view } from './voice-calls-fixtures.js';
import { channel } from 'node:diagnostics_channel';
import { createSchedulingCapture } from '../../../scripts/capture-scheduling-diagnostics.mjs';
import { describe, expect, it, vi } from 'vitest';
import type { VoiceCallResult } from '../src/voice/call-contract.js';
import { VOICE_CALL_HOST_OWNER } from '../src/voice/call-contract.js';
import { createVoiceCallHttp } from '../src/voice/call-http.js';
import { createVoiceDictations } from '../src/voice/dictation.js';
import { concat, silence, speech } from './voice-audio-fixtures.js';

describe('Host call owner', () => {
  it.each([false, true])(
    'records only admitted heartbeat owner work when diagnostics enabled=%s',
    async (enabled) => {
      vi.stubEnv('BOTHARNESS_SCHEDULING_DIAGNOSTICS', enabled ? '1' : '');
      const capture = createSchedulingCapture();
      const output = channel('botharness.scheduling.v1');
      output.subscribe(capture.record);
      try {
        const h = harness({ media: fakeMedia().media });
        const callId = await connected(h);
        expect(
          await h.calls.handle({ deviceId: 'other-private-device' }, { kind: 'heartbeat', callId }),
        ).toMatchObject({ ok: false, code: 'call-not-found' });
        expect(
          await h.calls.handle(h.phone, { kind: 'heartbeat', callId, after: -1 }),
        ).toMatchObject({ ok: false, code: 'invalid-input' });
        expect(capture.snapshot().rows).toHaveLength(0);
        expect((await h.ok({ kind: 'heartbeat', callId })).call?.phase).toBe('listening');
        await h.ok({ kind: 'hangup', callId });
        expect((await h.ok({ kind: 'heartbeat', callId })).call?.phase).toBe('ended');
        const { rows } = capture.snapshot();
        if (!enabled) {
          expect(rows).toHaveLength(0);
          return;
        }
        expect(rows.map((row) => row.kind)).toEqual([
          'heartbeat-owner-enter',
          'heartbeat-owner-settle',
          'heartbeat-owner-enter',
          'heartbeat-owner-settle',
        ]);
        expect(rows[0]).toMatchObject({ active: true });
        expect(rows[2]).toMatchObject({ active: false });
        expect(rows[1]).toMatchObject({
          outcome: 'ok',
          operation: rows[0]?.operation,
          call: rows[0]?.call,
        });
        expect(rows[3]).toMatchObject({
          outcome: 'ok',
          operation: rows[2]?.operation,
          call: rows[0]?.call,
        });
        expect(rows[0]?.operation).not.toBe(rows[2]?.operation);
        expect(rows[1]!.monotonicMs).toBeGreaterThanOrEqual(rows[0]!.monotonicMs);
        expect(JSON.stringify(rows)).not.toMatch(
          new RegExp(callId + '|mira|phone-1|other-private-device'),
        );
      } finally {
        output.unsubscribe(capture.record);
        vi.unstubAllEnvs();
      }
    },
  );

  it('settles a throwing heartbeat owner operation as error without changing its refusal', async () => {
    vi.stubEnv('BOTHARNESS_SCHEDULING_DIAGNOSTICS', '1');
    const capture = createSchedulingCapture();
    const output = channel('botharness.scheduling.v1');
    output.subscribe(capture.record);
    let fail = false;
    try {
      const h = harness({
        media: fakeMedia().media,
        busy: () => {
          if (fail) throw new Error('private-owner-failure');
          return false;
        },
      });
      const callId = await connected(h);
      fail = true;
      const result = await h.calls.handle(h.phone, { kind: 'heartbeat', callId });
      fail = false;
      expect(result).toMatchObject({ ok: false });
      const { rows } = capture.snapshot();
      expect(rows.map((row) => row.kind)).toEqual([
        'heartbeat-owner-enter',
        'heartbeat-owner-settle',
      ]);
      expect(rows[1]).toMatchObject({
        outcome: 'error',
        operation: rows[0]?.operation,
        call: rows[0]?.call,
      });
      expect(JSON.stringify(rows)).not.toContain('private-owner-failure');
      vi.stubEnv('BOTHARNESS_SCHEDULING_DIAGNOSTICS', '');
      fail = true;
      const withoutDiagnostics = await h.calls.handle(h.phone, { kind: 'heartbeat', callId });
      fail = false;
      expect(withoutDiagnostics).toEqual(result);
      expect(capture.snapshot().rows).toHaveLength(2);
      expect((await h.ok({ kind: 'heartbeat', callId })).call?.phase).toBe('listening');
    } finally {
      fail = false;
      output.unsubscribe(capture.record);
      vi.unstubAllEnvs();
    }
  });

  it('revokes the canonical device call independently of its transport connection', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    await h.calls.revoke(h.phone.deviceId!);
    expect(await view(h, callId)).toMatchObject({ phase: 'ended', endReason: 'connection-lost' });
    expect(state.closed).toBe(1);
  });

  it('ends a call whose phone stops sending heartbeats, keeping what was already sent', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    h.feed(state.onPcm!, concat(silence(300), speech(1000), silence(900)));
    await settled();
    expect(h.sent).toHaveLength(1);
    h.advance(9_000);
    await new Promise((resolve) => setTimeout(resolve, 2_200));
    const ended = (await h.calls.handle(h.phone, { kind: 'status' })) as Extract<
      VoiceCallResult,
      { ok: true }
    >;
    expect(ended.calls?.[0]).toMatchObject({ phase: 'ended', endReason: 'connection-lost' });
    expect(state.closed).toBe(1);
    expect(h.sent).toHaveLength(1);
  });

  it('keeps a call whose page stalls while its WebRTC connection still delivers packets', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    await connected(h);
    const alive = {
      uplinkPackets: 0,
      uplinkBytes: 0,
      uplinkLost: 0,
      concealedSamples: 0,
      receivedSamples: 0,
      downlinkPackets: 0,
      downlinkBytes: 0,
    };
    state.stats = { ...alive, receivedAgeMs: 400 };
    h.advance(9_000);
    await new Promise((resolve) => setTimeout(resolve, 2_200));
    const status = async () =>
      (
        (await h.calls.handle(h.phone, { kind: 'status' })) as Extract<
          VoiceCallResult,
          { ok: true }
        >
      ).calls?.[0];
    expect((await status())?.phase).not.toBe('ended');
    expect(state.closed).toBe(0);
    state.stats = { ...alive, receivedAgeMs: 9_500 };
    h.advance(9_000);
    await new Promise((resolve) => setTimeout(resolve, 2_200));
    expect(await status()).toMatchObject({ phase: 'ended', endReason: 'connection-lost' });
    expect(state.closed).toBe(1);
  });

  it('reads heartbeats that queued while the Host itself was stalled before judging the call', async () => {
    const { media } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    h.advance(9_000);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await h.calls.handle(h.phone, { kind: 'heartbeat', callId });
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const status = (await h.calls.handle(h.phone, { kind: 'status' })) as Extract<
      VoiceCallResult,
      { ok: true }
    >;
    expect(status.calls?.[0]).toMatchObject({ callId });
    expect(status.calls?.[0]?.phase).not.toBe('ended');
  });

  it('samples media stats every five seconds and reports per-direction rates in the call view', async () => {
    const { media, state } = fakeMedia();
    const base = {
      uplinkPackets: 100,
      uplinkBytes: 10_000,
      uplinkLost: 0,
      concealedSamples: 0,
      receivedSamples: 48_000,
      downlinkPackets: 50,
      downlinkBytes: 5_000,
      helperCpuPct: 4,
    };
    state.stats = base;
    const h = harness({ media });
    const callId = await connected(h);
    expect((await view(h, callId)).perf).toBeUndefined();
    state.stats = {
      ...base,
      uplinkPackets: 129,
      uplinkBytes: 12_500,
      uplinkLost: 1,
      receivedSamples: 288_000,
      concealedSamples: 2_400,
      downlinkPackets: 300,
      downlinkBytes: 30_000,
      rttMs: 12,
    };
    h.advance(5_000);
    await view(h, callId);
    await settled();
    const perf = (await view(h, callId)).perf!;
    expect(perf.samples).toBe(1);
    expect(perf.last).toMatchObject({
      atMs: 5_000,
      uplinkPps: 5.8,
      uplinkKbps: 4,
      uplinkLossPct: 3.3,
      concealedPct: 1,
      downlinkPps: 50,
      downlinkKbps: 40,
      rttMs: 12,
      helperCpuPct: 4,
    });
    expect(perf.uplinkPps).toEqual({ avg: 5.8, max: 5.8 });
    expect(typeof perf.hostCpuPct.avg).toBe('number');
  });

  it('ends the call when the media fails', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    state.onStatus!('failed');
    await settled();
    expect(await view(h, callId)).toMatchObject({ phase: 'ended', endReason: 'media-failed' });
  });

  it('explains what is missing before a call can start', async () => {
    const h = harness({
      bot: { slug: 'mira', voice: { providerId: 'tts-000000000001' } },
      media: fakeMedia('helper-missing').media,
    });
    const result = await h.ok({ kind: 'readiness', slug: 'mira' });
    expect(result.readiness).toMatchObject({
      ready: false,
      missing: ['asr', 'media-helper-missing'],
      ttsProviderId: 'tts-000000000001',
      asrProviderId: null,
    });
    expect(await h.calls.handle(h.phone, { kind: 'open', slug: 'mira' })).toMatchObject({
      ok: false,
      code: 'asr-not-configured',
    });
    const off = harness({
      media: fakeMedia().media,
      providers: {
        has: () => true,
        localServiceOff: async (_id, kind) => kind === 'asr',
        async transcribe() {
          return { text: '', latencyMs: 1 };
        },
        synthesize: async () => ({ audio: new Uint8Array(), mime: 'audio/mpeg' }),
      },
    });
    expect((await off.ok({ kind: 'readiness', slug: 'mira' })).readiness).toMatchObject({
      ready: false,
      missing: ['local-voice-off'],
    });
    const noMedia = harness({ media: undefined });
    expect(await noMedia.calls.handle(noMedia.phone, { kind: 'open', slug: 'mira' })).toMatchObject(
      { ok: false, code: 'media-unsupported' },
    );
  });

  it('agrees with dictation readiness for the same Bot while its local service is off (#3786)', async () => {
    const providers = {
      has: () => true,
      listAsr: () => [{ id: 'asr-000000000002', streaming: true }],
      streams: () => false,
      openStream: () => undefined,
      localServiceOff: async (id: string, kind: 'asr' | 'tts') =>
        kind === 'asr' && id === 'asr-000000000001',
      async transcribe() {
        return { text: '', latencyMs: 1 };
      },
      synthesize: async () => ({ audio: new Uint8Array(), mime: 'audio/mpeg' }),
    };
    const h = harness({ media: fakeMedia().media, providers });
    const dictations = createVoiceDictations({
      providers: () => providers,
      bot: () => ({ asr: { providerId: 'asr-000000000001', language: 'zh' } }),
    });
    const call = (await h.ok({ kind: 'readiness', slug: 'mira' })).readiness!;
    const dictation = await dictations.readiness({ slug: 'mira' });
    expect(call).toMatchObject({ ready: false, missing: ['local-voice-off'] });
    expect(dictation).toMatchObject({ ready: false, reason: 'local-voice-off' });
  });

  it('allows one call per Host: another device is refused, the same device replaces it', async () => {
    const { media } = fakeMedia();
    const h = harness({ media });
    const first = await connected(h);
    expect(
      await h.calls.handle({ deviceId: 'tablet' }, { kind: 'open', slug: 'mira' }),
    ).toMatchObject({ ok: false, code: 'call-active' });
    expect(
      await h.calls.handle({ deviceId: 'tablet' }, { kind: 'heartbeat', callId: first }),
    ).toMatchObject({ ok: false, code: 'call-not-found' });
    const second = await h.ok({ kind: 'open', slug: 'mira' });
    expect(second.call!.callId).not.toBe(first);
    expect(await view(h, first)).toMatchObject({ phase: 'ended', endReason: 'replaced' });
  });

  it('treats each desktop window as its own caller and refuses the second one', async () => {
    const { media } = fakeMedia();
    const h = harness({ media });
    const mac = { deviceId: VOICE_CALL_HOST_OWNER, client: 'window-mac-0001' };
    const other = { deviceId: VOICE_CALL_HOST_OWNER, client: 'window-win-0002' };
    const opened = await h.ok({ kind: 'open', slug: 'mira' }, mac);
    const callId = opened.call!.callId;
    expect(await h.calls.handle(other, { kind: 'readiness', slug: 'mira' })).toMatchObject({
      readiness: { activeCallId: null, callElsewhere: true },
    });
    expect(await h.ok({ kind: 'readiness', slug: 'mira' }, mac)).toMatchObject({
      readiness: { activeCallId: callId, callElsewhere: false },
    });
    expect(await h.calls.handle(other, { kind: 'open', slug: 'mira' })).toMatchObject({
      ok: false,
      code: 'call-active',
    });
    expect(await h.calls.handle(h.phone, { kind: 'open', slug: 'mira' })).toMatchObject({
      ok: false,
      code: 'call-active',
    });
    expect(await h.calls.handle(other, { kind: 'mute', callId, muted: true })).toMatchObject({
      ok: false,
      code: 'call-not-found',
    });
    const kept = await h.ok({ kind: 'heartbeat', callId }, mac);
    expect(kept.call!.phase).not.toBe('ended');
    const replaced = await h.ok({ kind: 'open', slug: 'mira' }, mac);
    expect(replaced.call!.callId).not.toBe(callId);
  });

  it('a phone call refuses a desktop window', async () => {
    const { media } = fakeMedia();
    const h = harness({ media });
    await connected(h);
    const mac = { deviceId: VOICE_CALL_HOST_OWNER, client: 'window-mac-0001' };
    expect(await h.ok({ kind: 'readiness', slug: 'mira' }, mac)).toMatchObject({
      readiness: { callElsewhere: true, activeCallId: null },
    });
    expect(await h.calls.handle(mac, { kind: 'open', slug: 'mira' })).toMatchObject({
      ok: false,
      code: 'call-active',
    });
  });

  it('reads the Client window id on the Host-owner route', async () => {
    const seen: unknown[] = [];
    const route = createVoiceCallHttp(() => ({
      handle: async (caller) => {
        seen.push(caller);
        return { ok: true };
      },
      draft: () => undefined,
      speak: async () => undefined,
      text: async () => undefined,
      zoom: ({ messageId, cell }) => ({ released: true, messageId, cell }),
      revoke: async () => undefined,
      dispose: async () => undefined,
    }));
    const post = (body: unknown) =>
      route(
        new Request('http://host/api/voice/call', { method: 'POST', body: JSON.stringify(body) }),
      );
    await post({ kind: 'status', client: 'window-mac-0001' });
    await post({ kind: 'status', client: 'bad id!' });
    await post({ kind: 'status' });
    expect(seen).toEqual([
      { deviceId: VOICE_CALL_HOST_OWNER, client: 'window-mac-0001' },
      { deviceId: VOICE_CALL_HOST_OWNER, client: undefined },
      { deviceId: VOICE_CALL_HOST_OWNER, client: undefined },
    ]);
  });

  it('lets the Host owner see and end any call, but not mute it', async () => {
    const { media } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    const owner = { deviceId: VOICE_CALL_HOST_OWNER };
    expect(await h.calls.handle(owner, { kind: 'status' })).toMatchObject({
      ok: true,
      calls: [{ callId }],
    });
    expect(await h.calls.handle({ deviceId: 'tablet' }, { kind: 'status' })).toMatchObject({
      calls: [],
    });
    expect(await h.calls.handle(owner, { kind: 'mute', callId, muted: true })).toMatchObject({
      ok: false,
      code: 'call-not-found',
    });
    expect(await h.calls.handle(owner, { kind: 'hangup', callId })).toMatchObject({ ok: true });
    expect(await view(h, callId)).toMatchObject({ phase: 'ended', endReason: 'hangup' });
  });
});
