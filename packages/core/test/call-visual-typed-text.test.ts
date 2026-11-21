import { host, imageFrames } from './call-visual-fixtures.js';
import { describe, expect, it, vi } from 'vitest';
import { VOICE_CALL_LIMITS } from '../src/voice/call-contract.js';

describe('text typed during a call', () => {
  it('carries the five keyframes that waited, with their picture range, call id and arrival time', async () => {
    const h = host();
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    for (let index = 0; index < 5; index += 1) {
      h.advance(1_000);
      await h.frame(call.callId, 'camera', index * 40);
    }
    await h.settle();
    h.advance(500);
    const { messageId, harvested } = await h.type(call.channelId);
    expect(harvested).toMatchObject({ callId: call.callId, atMs: 5_500 });
    expect(harvested!.visual).toMatchObject({
      source: 'camera',
      frames: 5,
      fromMs: 1_000,
      toMs: 5_000,
    });
    expect((harvested!.visual as { image: { layout: string } }).image.layout).toBe('3+2');
    expect(h.records).toHaveLength(0);
    const zoom = h.calls.zoom({ slug: 'mira', messageId, cell: 5 });
    expect(zoom).toMatchObject({ released: false, cell: 5, cells: 5, source: 'camera' });
    const events = (await h.ok({ kind: 'heartbeat', callId: call.callId })).events;
    expect(events.find((event) => event.type === 'text')).toMatchObject({ messageId, atMs: 5_500 });
    expect(events.find((event) => event.type === 'grid-sent')).toMatchObject({ messageId });
  });

  it('writes keyframes older than the newest nine as commits before the text lands', async () => {
    const h = host(['你看这一路']);
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    let shown = 0;
    let typed: Awaited<ReturnType<typeof h.type>> | undefined;
    await h.talk(call.callId, async (index) => {
      if (index > 3) return;
      for (let count = 0; count < 4; count += 1) await h.frame(call.callId, 'camera', ++shown);
      if (index === 3) typed = await h.type(call.channelId);
    });
    await h.settle();
    expect(shown).toBe(16);
    expect(h.order.slice(0, 2)).toEqual(['record:7', 'text:9']);
    expect(h.records[0]!.toMs).toBeLessThanOrEqual(
      (typed!.harvested!.visual as { fromMs: number }).fromMs,
    );
    expect(await h.dropped(call.callId)).toBe(0);
  });

  it('points at the last picture when nothing changed and sends none before any picture', async () => {
    const h = host();
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    expect((await h.type(call.channelId)).harvested).toMatchObject({ callId: call.callId });
    expect((await h.type(call.channelId)).harvested!.visual).toBeUndefined();
    await h.ok({ kind: 'visual', callId: call.callId, source: 'screen' });
    expect((await h.type(call.channelId)).harvested!.visual).toBeUndefined();
    await h.frame(call.callId, 'screen');
    const first = await h.type(call.channelId);
    expect(imageFrames(first.harvested!.visual)).toBe(1);
    expect((await h.type(call.channelId)).harvested!.visual).toEqual({
      source: 'screen',
      sameAs: first.messageId,
    });
    await h.say(call.callId);
    expect(h.sent[0]!.visual).toEqual({ source: 'screen', sameAs: first.messageId });
  });

  it('leaves text outside a call and in another DM alone', async () => {
    const h = host();
    expect((await h.type('dm-mira')).harvested).toBeUndefined();
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    await h.frame(call.callId);
    expect((await h.type('dm-ada')).harvested).toBeUndefined();
    expect((await h.type(call.channelId, { picture: false })).harvested!.visual).toBeUndefined();
    await h.say(call.callId);
    expect(imageFrames(h.sent[0]!.visual)).toBe(1);
    await h.ok({ kind: 'hangup', callId: call.callId });
    expect((await h.type(call.channelId)).harvested).toBeUndefined();
  });

  it('puts the keyframes back when the text cannot be sent', async () => {
    const h = host();
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    for (let index = 0; index < 4; index += 1) await h.frame(call.callId, 'camera', index * 50);
    const failed = await h.type(call.channelId, { fails: true });
    expect(imageFrames(failed.harvested!.visual)).toBe(4);
    expect(h.calls.zoom({ messageId: failed.messageId, cell: 1 })).toMatchObject({
      released: true,
    });
    const next = await h.type(call.channelId);
    expect(imageFrames(next.harvested!.visual)).toBe(4);
  });

  it('lands text after a sentence that ended before it and is still being recognised', async () => {
    let hear!: () => void;
    const h = host(['先说一句', '再说一句'], undefined, {
      asr: new Promise<void>((resolve) => {
        hear = resolve;
      }),
    });
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    await h.frame(call.callId, 'camera', 10);
    await h.say(call.callId);
    expect(h.sent).toHaveLength(0);
    await h.frame(call.callId, 'camera', 200);
    const typed = h.type(call.channelId);
    await h.settle();
    expect(h.order).toEqual([]);
    hear();
    const { harvested } = await typed;
    expect(h.order).toEqual(['sent:1', 'text:1']);
    expect((harvested!.visual as { fromMs: number }).fromMs).toBeGreaterThanOrEqual(
      (h.sent[0]!.visual as { toMs: number }).toMs,
    );
    await h.say(call.callId);
    expect(h.order).toEqual(['sent:1', 'text:1', 'sent:same']);
  });

  it('lands typed text after at most the operation timeout when recognition is stuck', async () => {
    let hear!: () => void;
    const h = host(['先说一句'], undefined, {
      asr: new Promise<void>((resolve) => {
        hear = resolve;
      }),
    });
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    await h.frame(call.callId, 'camera', 10);
    await h.say(call.callId);
    await h.frame(call.callId, 'camera', 200);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const typed = h.type(call.channelId);
      await vi.advanceTimersByTimeAsync(VOICE_CALL_LIMITS.operationTimeoutMs + 1);
      const { harvested } = await typed;
      expect(imageFrames(harvested!.visual)).toBe(1);
      expect(h.order).toEqual(['text:1']);
    } finally {
      vi.useRealTimers();
    }
    hear();
    await vi.waitFor(() => expect(h.order).toEqual(['text:1', 'sent:1']));
    expect(await h.dropped(call.callId)).toBe(0);
  });

  it('does not wait on the end record when the call ends while text is queued', async () => {
    let hear!: () => void;
    const h = host(['先说一句'], undefined, {
      asr: new Promise<void>((resolve) => {
        hear = resolve;
      }),
    });
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    await h.frame(call.callId, 'camera', 10);
    await h.say(call.callId);
    await h.frame(call.callId, 'camera', 200);
    const typed = h.type(call.channelId);
    await h.settle();
    await h.ok({ kind: 'hangup', callId: call.callId });
    hear();
    const { harvested } = await typed;
    expect(harvested!.visual).toBeUndefined();
    await vi.waitFor(() => expect(h.records.map((record) => record.frames)).toEqual([1]));
    await vi.waitFor(() => expect(h.lifecycle.map((record) => record.state)).toContain('ended'));
  });
});
