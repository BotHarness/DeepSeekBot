import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import { isChannelCallVisual, isChannelMessage } from '../src/channels/channel.js';
import { callVisualNote } from '../src/runtime/bot-runtime.js';
import type { VoiceCallEvent, VoiceCallView } from '../src/voice/call-contract.js';
import { createCallImaging, drawLabel, frameLabel } from '../src/voice/call-frames.js';
import { createVoiceCalls, type VoiceCallsDeps } from '../src/voice/calls.js';
import {
  KEYFRAME_DEFAULTS,
  createKeyframePicker,
  frameDifference,
  gridLayout,
  pickGridFrames,
} from '../src/voice/keyframes.js';
import { concat, silence, speech } from './voice-audio-fixtures.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function jpeg(
  color: { r: number; g: number; b: number },
  width = 640,
  height = 360,
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .jpeg()
    .toBuffer();
}

const thumb = (value: number, length = 64 * 36) => new Uint8Array(length).fill(value);

describe('keyframe picker', () => {
  it('sends the first sample, skips a still picture and sends a settled change', () => {
    const picker = createKeyframePicker({ ...KEYFRAME_DEFAULTS.screen, stableMs: 500 });
    expect(picker.push(thumb(10), 0)).toEqual({ keyframe: true, score: 1 });
    expect(picker.push(thumb(10), 500).keyframe).toBe(false);
    expect(picker.push(thumb(10), 1000).keyframe).toBe(false);
    expect(picker.push(thumb(60), 1500).keyframe).toBe(false);
    expect(picker.push(thumb(90), 2000).keyframe).toBe(false);
    expect(picker.push(thumb(90), 2500).keyframe).toBe(false);
    const settled = picker.push(thumb(90), 3000);
    expect(settled.keyframe).toBe(true);
    expect(settled.score).toBeCloseTo(80 / 255, 3);
    expect(picker.keyframes).toBe(2);
    expect(picker.samples).toBe(7);
  });

  it('treats scrolled text on a mostly blank screen as a change', () => {
    const picker = createKeyframePicker(KEYFRAME_DEFAULTS.screen);
    const page = new Uint8Array(128 * 80).fill(255);
    const scrolled = page.slice();
    for (let index = 0; index < 120; index += 1) scrolled[1000 + index] = 0;
    picker.push(page, 0);
    expect(picker.push(scrolled, 500).keyframe).toBe(false);
    expect(picker.push(scrolled, 1000).keyframe).toBe(false);
    const sent = picker.push(scrolled, 1500);
    expect(sent.keyframe).toBe(true);
    expect(sent.score).toBeLessThan(0.02);
  });

  it('still sends a change that never settles, such as a playing video', () => {
    const picker = createKeyframePicker(KEYFRAME_DEFAULTS.camera);
    picker.push(thumb(0), 0);
    const sent: number[] = [];
    for (let at = 500; at <= 6000; at += 500)
      if (picker.push(thumb((at / 500) * 20), at).keyframe) sent.push(at);
    const wait = KEYFRAME_DEFAULTS.camera.maxWaitMs;
    expect(sent).toEqual([1000 + wait, 3500 + wait]);
  });

  it('sends again after a reset, as when the source switches', () => {
    const picker = createKeyframePicker(KEYFRAME_DEFAULTS.camera);
    picker.push(thumb(10), 0);
    expect(picker.push(thumb(10), 500).keyframe).toBe(false);
    picker.reset();
    expect(picker.push(thumb(10), 1000).keyframe).toBe(true);
  });

  it('measures differences from 0 to 1', () => {
    expect(frameDifference(thumb(0), thumb(0))).toBe(0);
    expect(frameDifference(thumb(0), thumb(255))).toBe(1);
    expect(frameDifference(thumb(0, 4), thumb(0, 5))).toBe(1);
  });
});

describe('grid layout', () => {
  it('tiles 1, 2–4, 5–9 and 10–16 frames', () => {
    expect([1, 2, 4, 5, 9, 10, 16].map((count) => gridLayout(count).layout)).toEqual([
      '1x1',
      '2x2',
      '2x2',
      '3x3',
      '3x3',
      '4x4',
      '4x4',
    ]);
  });

  it('keeps the first frame and the biggest changes, in time order', () => {
    const frames = Array.from({ length: 20 }, (_, index) => ({
      index,
      score: index === 0 ? 1 : (index * 7) % 20,
    }));
    const kept = pickGridFrames(frames);
    expect(kept).toHaveLength(16);
    expect(kept[0]!.index).toBe(0);
    expect(kept.map((frame) => frame.index)).toEqual(
      [...kept.map((frame) => frame.index)].sort((a, b) => a - b),
    );
    const dropped = frames.filter((frame) => !kept.includes(frame));
    const lowest = Math.min(...kept.slice(1).map((frame) => frame.score));
    expect(dropped.every((frame) => frame.score <= lowest)).toBe(true);
  });
});

describe('grid imaging', () => {
  it('tiles keyframes into one labelled image no larger than 1536 pixels', async () => {
    const imaging = createCallImaging();
    const colors = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 255, g: 255, b: 0 },
      { r: 0, g: 255, b: 255 },
    ];
    const prepared = await Promise.all(
      colors.map(async (color) => imaging.prepare(new Uint8Array(await jpeg(color, 1920, 1080)))),
    );
    expect(prepared[0]).toMatchObject({ width: 1920, height: 1080, tileWidth: 768 });
    const grid = await imaging.compose(
      prepared,
      prepared.map((_, index) => frameLabel(index, 10 - index * 2)),
    );
    expect(grid.layout).toBe('3x3');
    expect(Math.max(grid.width, grid.height)).toBeLessThanOrEqual(1536);
    const { data, info } = await sharp(grid.jpeg).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const offset = (Math.floor(y) * info.width + Math.floor(x)) * 3;
      return [...data.subarray(offset, offset + 3)];
    };
    const tile = { w: info.width / 3, h: info.height / 2 };
    expect(tile.h).toBeCloseTo(tile.w * (1080 / 1920), -1);
    expect(pixel(tile.w * 0.5, tile.h * 0.6)[0]).toBeGreaterThan(200);
    expect(pixel(tile.w * 1.5, tile.h * 0.6)[1]).toBeGreaterThan(200);
    expect(pixel(tile.w * 2.5, tile.h * 0.6)[2]).toBeGreaterThan(200);
    expect(Math.max(...pixel(tile.w * 2.5, tile.h * 1.6))).toBeLessThan(30);
    expect(Math.max(...pixel(2, 2))).toBeLessThan(40);
  });

  it('sends a single keyframe as one sharp image', async () => {
    const imaging = createCallImaging();
    const frame = await imaging.prepare(
      new Uint8Array(await jpeg({ r: 9, g: 9, b: 9 }, 3000, 2000)),
    );
    const grid = await imaging.compose([frame], ['1 · -0s']);
    expect(grid).toMatchObject({ layout: '1x1', width: 1536, height: 1024 });
  });

  it('refuses something that is not a JPEG', async () => {
    const imaging = createCallImaging();
    await expect(imaging.prepare(new Uint8Array([1, 2, 3, 4, 5]))).rejects.toThrow(/JPEG/u);
    const truncated = (await jpeg({ r: 1, g: 2, b: 3 })).subarray(0, 40);
    await expect(imaging.prepare(new Uint8Array(truncated))).rejects.toThrow();
  });

  it('draws labels in white on black without fonts', () => {
    const canvas = Buffer.alloc(100 * 40 * 3, 128);
    drawLabel(canvas, 100, 0, 0, '3 · -12s', 2);
    expect(canvas[0]).toBe(0);
    expect([...canvas].includes(255)).toBe(true);
    expect(canvas[(39 * 100 + 99) * 3]).toBe(128);
  });
});

function host(transcripts: string[] = ['这是什么', '现在呢', '还是这个吗']) {
  let clock = 2_000_000;
  const sent: Parameters<VoiceCallsDeps['send']>[0][] = [];
  const calls = createVoiceCalls({
    bot: (slug) =>
      slug === 'mira'
        ? {
            slug,
            asr: { providerId: 'asr-000000000001' },
            voice: { providerId: 'tts-000000000001' },
          }
        : undefined,
    providers: {
      has: () => true,
      transcribe: async () => ({ text: transcripts.shift() ?? '', latencyMs: 1 }),
      synthesize: async () => ({
        audio: new Uint8Array([0x49, 0x44, 0x33, 0]),
        mime: 'audio/mpeg',
      }),
    },
    media: () => undefined,
    async send(input) {
      sent.push(input);
    },
    busy: () => false,
    now: () => clock,
  });
  cleanup.push(() => calls.dispose());
  const phone = { deviceId: 'phone-1' };
  const ok = async (command: Record<string, unknown>) => {
    const result = await calls.handle(phone, command);
    if (!result.ok) throw new Error(`${result.code}: ${result.error}`);
    return result.call as VoiceCallView;
  };
  const say = async (callId: string, ms = 1200) => {
    const audio = concat(silence(200), speech(ms), silence(900));
    for (let offset = 0; offset < audio.length; offset += 16_000) {
      const part = audio.slice(offset, offset + 16_000);
      clock += 1_000;
      await ok({
        kind: 'inject',
        callId,
        pcm: Buffer.from(part.buffer, part.byteOffset, part.byteLength).toString('base64'),
      });
    }
    for (let index = 0; index < 60; index += 1)
      await new Promise((resolve) => setTimeout(resolve, 5));
  };
  return {
    calls,
    sent,
    ok,
    say,
    phone,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const types = (events: readonly VoiceCallEvent[]) => events.map((event) => event.type);

describe('Host call owner with a shared camera or screen', () => {
  it('attaches a grid of the keyframes since the last sentence, then says when nothing changed', async () => {
    const h = host();
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    expect(call.visual).toBe('off');
    expect((await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' })).visual).toBe(
      'camera',
    );
    for (const color of [
      { r: 250, g: 0, b: 0 },
      { r: 0, g: 250, b: 0 },
      { r: 0, g: 0, b: 250 },
    ]) {
      h.advance(2_000);
      await h.ok({
        kind: 'frame',
        callId: call.callId,
        source: 'camera',
        jpeg: (await jpeg(color)).toString('base64'),
        score: 0.4,
        skipped: 3,
      });
    }
    await h.say(call.callId);
    expect(h.sent).toHaveLength(1);
    const first = h.sent[0]!;
    expect(first.body).toBe('这是什么');
    expect(first.visual).toMatchObject({ source: 'camera', frames: 3 });
    const image = (first.visual as { image: { layout: string; jpeg: Uint8Array } }).image;
    expect(image.layout).toBe('2x2');
    expect((await sharp(image.jpeg).metadata()).width).toBe(1536);

    await h.say(call.callId);
    expect(h.sent[1]!.visual).toEqual({ source: 'camera', sameAs: first.messageId });

    const events = (await h.ok({ kind: 'heartbeat', callId: call.callId })).events;
    expect(types(events)).toEqual(
      expect.arrayContaining([
        'visual',
        'frame-received',
        'grid-built',
        'grid-sent',
        'grid-unchanged',
      ]),
    );
    const received = events.find((event) => event.type === 'frame-received');
    expect(received).toMatchObject({ source: 'camera', width: 640, height: 360, skipped: 3 });
    const built = events.find((event) => event.type === 'grid-built');
    expect(built).toMatchObject({ frames: 3, dropped: 0, layout: '2x2' });
    const gridSent = events.find((event) => event.type === 'grid-sent');
    expect(gridSent).toMatchObject({ messageId: first.messageId, layout: '2x2' });
  });

  it('keeps keyframes for the next sentence when nothing was heard', async () => {
    const h = host(['', '现在呢']);
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'screen' });
    await h.ok({
      kind: 'frame',
      callId: call.callId,
      source: 'screen',
      jpeg: (await jpeg({ r: 10, g: 20, b: 30 })).toString('base64'),
    });
    await h.say(call.callId);
    expect(h.sent).toHaveLength(0);
    await h.say(call.callId);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.visual).toMatchObject({ source: 'screen', frames: 1 });
  });

  it('sends no picture with the camera off and refuses frames for another source', async () => {
    const h = host(['你好']);
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    const frame = (await jpeg({ r: 1, g: 1, b: 1 })).toString('base64');
    expect(
      await h.calls.handle(h.phone, {
        kind: 'frame',
        callId: call.callId,
        source: 'camera',
        jpeg: frame,
      }),
    ).toMatchObject({ ok: false, code: 'visual-off' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'screen' });
    expect(
      await h.calls.handle(h.phone, {
        kind: 'frame',
        callId: call.callId,
        source: 'camera',
        jpeg: frame,
      }),
    ).toMatchObject({ ok: false, code: 'visual-off' });
    expect(
      await h.calls.handle(h.phone, {
        kind: 'frame',
        callId: call.callId,
        source: 'screen',
        jpeg: Buffer.from('not a jpeg').toString('base64'),
      }),
    ).toMatchObject({ ok: false, code: 'frame-invalid' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'off' });
    await h.say(call.callId);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.visual).toBeUndefined();
  });

  it('forgets the old grid when the source switches', async () => {
    const h = host(['看这个', '换屏幕了']);
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    await h.ok({
      kind: 'frame',
      callId: call.callId,
      source: 'camera',
      jpeg: (await jpeg({ r: 200, g: 0, b: 0 })).toString('base64'),
    });
    await h.say(call.callId);
    await h.ok({ kind: 'visual', callId: call.callId, source: 'screen' });
    await h.say(call.callId);
    expect(h.sent.map((item) => item.visual === undefined)).toEqual([false, true]);
  });
});

describe('call visuals in Channel messages', () => {
  it('accepts a grid or an unchanged view and refuses anything else', () => {
    expect(isChannelCallVisual({ source: 'camera', frames: 4, layout: '2x2' })).toBe(true);
    expect(isChannelCallVisual({ source: 'screen', sameAs: 'human-1' })).toBe(true);
    expect(isChannelCallVisual({ source: 'screen', frames: 17, layout: '4x4' })).toBe(false);
    expect(isChannelCallVisual({ source: 'tv', frames: 1, layout: '1x1' })).toBe(false);
    expect(isChannelCallVisual({ source: 'camera', frames: 1, layout: '1x1', extra: 1 })).toBe(
      false,
    );
    const message = {
      id: 'human-1',
      at: '2026-11-04T00:00:00.000Z',
      author: { kind: 'human' },
      body: '这是什么',
      voiceCall: {
        callId: 'call-0123456789abcdef',
        visual: { source: 'camera', sameAs: 'human-0' },
      },
    };
    expect(isChannelMessage(message)).toBe(true);
    expect(
      isChannelMessage({ ...message, voiceCall: { callId: 'call-0123456789abcdef', other: 1 } }),
    ).toBe(false);
  });

  it('tells the Bot where the picture is, or that it has not changed', () => {
    const image = {
      fileId: 'file:00000000-0000-4000-8000-000000000000',
      name: 'call.jpg',
      mime: 'image/jpeg',
      size: 10,
    };
    const base = {
      id: 'human-2',
      at: '2026-11-04T00:00:00.000Z',
      author: { kind: 'human' as const },
      body: '这是什么',
    };
    const grid = callVisualNote(
      'dm-mira',
      {
        ...base,
        attachments: [image],
        voiceCall: {
          callId: 'call-0123456789abcdef',
          visual: { source: 'camera', frames: 6, layout: '3x3' },
        },
      },
      'HINT',
    );
    expect(grid).toContain('a 3x3 grid of 6 keyframes');
    expect(grid).toContain(`attachment_id ${image.fileId}`);
    expect(grid).toContain('channel_id dm-mira');
    expect(grid).toContain('HINT');
    expect(
      callVisualNote(
        'dm-mira',
        {
          ...base,
          voiceCall: {
            callId: 'call-0123456789abcdef',
            visual: { source: 'screen', sameAs: 'human-1' },
          },
        },
        'HINT',
      ),
    ).toContain('since message human-1');
    expect(callVisualNote('dm-mira', { ...base }, 'HINT')).toBeUndefined();
  });
});
