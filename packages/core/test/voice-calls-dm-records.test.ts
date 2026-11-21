import { clipFor, connected, fakeMedia, harness, settled, view } from './voice-calls-fixtures.js';
import { describe, expect, it } from 'vitest';
import {
  isChannelVoiceCallRecord,
  voiceCallRecordBody,
} from '../src/channels/voice-call-record.js';
import { concat, silence, speech } from './voice-audio-fixtures.js';

describe('call records in the DM (#3483)', () => {
  it("writes a start notice when the call connects and an end notice with its length after the call's messages", async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const opened = (await h.ok({ kind: 'open', slug: 'mira' })).call!;
    h.advance(2_000);
    expect(h.records).toEqual([]);
    await h.ok({
      kind: 'signal',
      callId: opened.callId,
      answer: { type: 'answer', sdp: 'v=0\r\n' },
    });
    await settled();
    const connectedAt = new Date(1_002_000).toISOString();
    expect(h.records).toEqual([
      { callId: opened.callId, botSlug: 'mira', state: 'started', startedAt: connectedAt },
    ]);
    h.feed(state.onPcm!, concat(silence(300), speech(1000), silence(900)));
    await h.ok({ kind: 'hangup', callId: opened.callId });
    await settled();
    const end = h.records[1]!;
    expect(end).toMatchObject({
      callId: opened.callId,
      botSlug: 'mira',
      state: 'ended',
      startedAt: connectedAt,
      reason: 'hangup',
      startMessageId: `voice-call-started-${opened.callId}`,
    });
    expect(end.state === 'ended' && end.durationMs).toBe(
      Date.parse(end.state === 'ended' ? end.endedAt : '') - 1_002_000,
    );
    expect(isChannelVoiceCallRecord(end)).toBe(true);
    expect(h.log.at(0)).toBe('record:started');
    expect(h.log.at(-1)).toBe('record:ended');
  });

  it('counts the sentences the call sent to the DM', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    h.feed(state.onPcm!, concat(silence(300), speech(1000), silence(900)));
    await settled();
    h.advance(65_000);
    await h.ok({ kind: 'heartbeat', callId });
    await h.ok({ kind: 'hangup', callId });
    await settled();
    expect(h.log).toEqual(['record:started', 'sent:帮我查一下明天的天气', 'record:ended']);
    expect(h.records[1]).toMatchObject({ state: 'ended', heard: 1, reason: 'hangup' });
  });

  it('keeps an earlier call end notice ahead of the next call when its last sentence is still transcribing', async () => {
    let release: (() => void) | undefined;
    const { media, state } = fakeMedia();
    const h = harness({
      media,
      providers: {
        has: (id, kind) => id.startsWith(kind),
        async transcribe() {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return { text: '最后一句', latencyMs: 5 };
        },
        async synthesize({ text }) {
          return { audio: clipFor(text), mime: 'audio/mpeg' };
        },
      },
    });
    const first = await connected(h);
    h.feed(state.onPcm!, concat(silence(300), speech(1000), silence(900)));
    await settled();
    expect(release).toBeDefined();
    const hungUp = h.ok({ kind: 'hangup', callId: first });
    await settled();
    const second = await connected(h);
    await h.ok({ kind: 'hangup', callId: second });
    await settled();
    expect(h.records.map((record) => `${record.state}:${record.callId}`)).toEqual([
      `started:${first}`,
    ]);
    release!();
    await hungUp;
    await settled();
    expect(h.records.map((record) => `${record.state}:${record.callId}`)).toEqual([
      `started:${first}`,
      `ended:${first}`,
      `started:${second}`,
      `ended:${second}`,
    ]);
  });

  it('leaves no record for a call that never connected', async () => {
    const { media } = fakeMedia();
    const h = harness({ media });
    const opened = (await h.ok({ kind: 'open', slug: 'mira' })).call!;
    await h.ok({ kind: 'hangup', callId: opened.callId });
    await settled();
    expect(h.records).toEqual([]);
  });

  it('keeps the call going when the notice cannot be written', async () => {
    const h = harness({
      media: undefined,
      record: async () => {
        throw new Error('disk full');
      },
    });
    const call = (await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' })).call!;
    const audio = concat(silence(300), speech(1200), silence(900));
    for (let offset = 0; offset < audio.length; offset += 16_000) {
      const part = audio.slice(offset, offset + 16_000);
      h.advance(1_000);
      await h.ok({
        kind: 'inject',
        callId: call.callId,
        pcm: Buffer.from(part.buffer, part.byteOffset, part.byteLength).toString('base64'),
      });
    }
    await settled();
    expect(h.sent.map((item) => item.body)).toEqual(['帮我查一下明天的天气']);
    expect((await view(h, call.callId)).phase).not.toBe('ended');
  });

  it('formats a body the Bot can search', () => {
    const body = voiceCallRecordBody({
      callId: 'call-0123456789abcdef',
      botSlug: 'mira',
      state: 'ended',
      startedAt: '2026-11-04T10:00:00.000Z',
      endedAt: '2026-11-04T10:12:04.000Z',
      durationMs: 724_000,
      reason: 'hangup',
      heard: 6,
    });
    expect(body.toLowerCase()).toContain('voice call');
    expect(body).toContain('12:04');
    expect(body).toContain('2026-11-04T10:00:00.000Z');
    expect(
      isChannelVoiceCallRecord({
        callId: 'call-0123456789abcdef',
        botSlug: 'mira',
        state: 'started',
        startedAt: '2026-11-04T10:00:00.000Z',
        extra: 1,
      }),
    ).toBe(false);
  });
});
