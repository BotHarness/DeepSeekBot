import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isChannelCallVisual, isChannelMessage } from '../src/channels/channel.js';
import {
  isChannelVoiceCallRecord,
  voiceCallRecordBody,
  type ChannelVoiceCallRecord,
} from '../src/channels/voice-call-record.js';
import { callVisualNote } from '../src/runtime/bot-runtime.js';
import type { VoiceCallEvent, VoiceCallView } from '../src/voice/call-contract.js';
import { createCallImaging, drawLabel, frameLabel, gridCells } from '../src/voice/call-frames.js';
import { createVoiceCalls, type VoiceCallsDeps } from '../src/voice/calls.js';
import {
  KEYFRAME_DEFAULTS,
  createKeyframePicker,
  frameDifference,
  gridLayout,
  MAX_GRID_FRAMES,
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
    const settled = picker.push(thumb(90), 2500);
    expect(settled.keyframe).toBe(true);
    expect(settled.score).toBeCloseTo(80 / 255, 3);
    expect(picker.push(thumb(90), 3000).keyframe).toBe(false);
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
    const sent = picker.push(scrolled, 1000);
    expect(sent.keyframe).toBe(true);
    expect(sent.score).toBeLessThan(0.02);
  });

  it('sends a page shown for a second, counting stillness from when it appeared', () => {
    const picker = createKeyframePicker(KEYFRAME_DEFAULTS.screen);
    const sent: number[] = [];
    const pages = [10, 60, 110, 160];
    for (let at = 0; at < 4_000; at += 500)
      if (picker.push(thumb(pages[Math.floor(at / 1_000)]!), at).keyframe) sent.push(at);
    expect(sent).toEqual([0, 1_500, 2_500, 3_500]);
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
  it('balances 1 to 9 frames into rows of at most three, the longer rows first', () => {
    expect(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => {
        const { layout, rows } = gridLayout(count);
        return { layout, rows };
      }),
    ).toEqual([
      { layout: '1', rows: [1] },
      { layout: '2', rows: [2] },
      { layout: '3', rows: [3] },
      { layout: '2+2', rows: [2, 2] },
      { layout: '3+2', rows: [3, 2] },
      { layout: '3+3', rows: [3, 3] },
      { layout: '3+2+2', rows: [3, 2, 2] },
      { layout: '3+3+2', rows: [3, 3, 2] },
      { layout: '3+3+3', rows: [3, 3, 3] },
    ]);
    expect(MAX_GRID_FRAMES).toBe(9);
  });

  it('keeps the first frame and the biggest changes, in time order', () => {
    const frames = Array.from({ length: 20 }, (_, index) => ({
      index,
      score: index === 0 ? 1 : (index * 7) % 20,
    }));
    const kept = pickGridFrames(frames);
    expect(kept).toHaveLength(9);
    expect(kept[0]!.index).toBe(0);
    expect(kept.map((frame) => frame.index)).toEqual(
      [...kept.map((frame) => frame.index)].sort((a, b) => a - b),
    );
    const dropped = frames.filter((frame) => !kept.includes(frame));
    const lowest = Math.min(...kept.slice(1).map((frame) => frame.score));
    expect(dropped.every((frame) => frame.score <= lowest)).toBe(true);
  });

  it('numbers cells row by row and centres a shorter row', () => {
    expect(gridCells([3, 2], 512, 288)).toEqual([
      { left: 0, top: 0 },
      { left: 512, top: 0 },
      { left: 1024, top: 0 },
      { left: 256, top: 288 },
      { left: 768, top: 288 },
    ]);
  });
});

const PALETTE = [
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 255, g: 255, b: 0 },
  { r: 0, g: 255, b: 255 },
  { r: 255, g: 0, b: 255 },
  { r: 255, g: 128, b: 0 },
  { r: 128, g: 0, b: 255 },
  { r: 255, g: 255, b: 255 },
];

describe('grid imaging', () => {
  it.each([2, 3, 4, 5, 6, 7, 8, 9])(
    'tiles %i keyframes in balanced rows with no empty cell',
    async (count) => {
      const imaging = createCallImaging();
      const prepared = await Promise.all(
        PALETTE.slice(0, count).map(async (color) =>
          imaging.prepare(new Uint8Array(await jpeg(color, 1920, 1080))),
        ),
      );
      expect(prepared[0]).toMatchObject({ width: 1920, height: 1080, tileWidth: 768 });
      const grid = await imaging.compose(
        prepared,
        prepared.map((_, index) => frameLabel(index, 10 - index)),
      );
      const { layout, rows } = gridLayout(count);
      expect(grid.layout).toBe(layout);
      const tileWidth = count === 2 ? 768 : 512;
      const tileHeight = Math.floor(tileWidth / (1920 / 1080));
      expect(grid).toMatchObject({
        width: tileWidth * Math.max(...rows),
        height: tileHeight * rows.length,
      });
      expect(Math.max(grid.width, grid.height)).toBeLessThanOrEqual(1536);
      const { data, info } = await sharp(grid.jpeg).raw().toBuffer({ resolveWithObject: true });
      const pixel = (x: number, y: number) => {
        const offset = (Math.floor(y) * info.width + Math.floor(x)) * 3;
        return [...data.subarray(offset, offset + 3)];
      };
      const widest = Math.max(...rows);
      let cell = 0;
      rows.forEach((size, row) => {
        const offset = ((widest - size) * tileWidth) / 2;
        for (let col = 0; col < size; col += 1) {
          const color = PALETTE[cell]!;
          const [r, g, b] = pixel(offset + (col + 0.5) * tileWidth, (row + 0.6) * tileHeight);
          expect([r! > 128, g! > 128, b! > 128]).toEqual([
            color.r > 128,
            color.g > 128,
            color.b > 128,
          ]);
          cell += 1;
        }
      });
      expect(Math.max(...pixel(2, 2))).toBeLessThan(40);
    },
  );

  it('refuses more than nine frames in one grid', async () => {
    const imaging = createCallImaging();
    const frame = await imaging.prepare(new Uint8Array(await jpeg({ r: 9, g: 9, b: 9 })));
    await expect(
      imaging.compose(
        Array.from({ length: 10 }, () => frame),
        [],
      ),
    ).rejects.toThrow(/at most 9/u);
  });

  it('sends a single keyframe as one sharp image', async () => {
    const imaging = createCallImaging();
    const frame = await imaging.prepare(
      new Uint8Array(await jpeg({ r: 9, g: 9, b: 9 }, 3000, 2000)),
    );
    const grid = await imaging.compose([frame], ['1 · -0s']);
    expect(grid).toMatchObject({ layout: '1', width: 1536, height: 1024 });
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

function host(transcripts: string[] = ['这是什么', '现在呢', '还是这个吗'], sees?: boolean) {
  let clock = 2_000_000;
  const sent: Parameters<VoiceCallsDeps['send']>[0][] = [];
  const records: Parameters<NonNullable<VoiceCallsDeps['recordFrames']>>[0][] = [];
  const lifecycle: Parameters<NonNullable<VoiceCallsDeps['record']>>[0]['record'][] = [];
  const calls = createVoiceCalls({
    async record({ record }) {
      lifecycle.push(record);
      return `lifecycle-${lifecycle.length}`;
    },
    async recordFrames(input) {
      records.push(input);
      return `record-${records.length}`;
    },
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
    ...(sees === undefined ? {} : { seesImages: async () => sees }),
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
    records,
    lifecycle,
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
    expect(image.layout).toBe('3');
    expect(await sharp(image.jpeg).metadata()).toMatchObject({ width: 1536, height: 288 });

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
    expect(built).toMatchObject({ frames: 3, dropped: 0, layout: '3' });
    const gridSent = events.find((event) => event.type === 'grid-sent');
    expect(gridSent).toMatchObject({
      grid: (built as { grid: number }).grid,
      messageId: first.messageId,
      layout: '3',
    });
  });

  it('returns a grid cell at its original size until the call ends', async () => {
    const h = host();
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'screen' });
    const originals: Buffer[] = [];
    for (const color of [
      { r: 250, g: 0, b: 0 },
      { r: 0, g: 250, b: 0 },
    ]) {
      const original = await jpeg(color, 1920, 1080);
      originals.push(original);
      await h.ok({
        kind: 'frame',
        callId: call.callId,
        source: 'screen',
        jpeg: original.toString('base64'),
      });
    }
    await h.say(call.callId);
    const messageId = h.sent[0]!.messageId;

    const second = h.calls.zoom({ slug: 'mira', messageId, cell: 2 });
    expect(second).toMatchObject({ released: false, cell: 2, cells: 2, width: 1920, height: 1080 });
    expect(Buffer.from((second as { jpeg: Uint8Array }).jpeg).equals(originals[1]!)).toBe(true);
    expect(h.calls.zoom({ slug: 'other', messageId, cell: 1 }).released).toBe(true);
    expect(() => h.calls.zoom({ slug: 'mira', messageId, cell: 3 })).toThrow(/pick 1 to 2/u);

    const routed = await h.calls.handle({ deviceId: 'cli' }, { kind: 'zoom', messageId, cell: 1 });
    expect(routed).toMatchObject({
      ok: true,
      zoom: { released: false, cell: 1, cells: 2, source: 'screen', width: 1920, height: 1080 },
    });
    expect(
      await h.calls.handle({ deviceId: 'cli' }, { kind: 'zoom', messageId, cell: 0 }),
    ).toMatchObject({ ok: false, code: 'cell-invalid' });
    const events = (await h.ok({ kind: 'heartbeat', callId: call.callId })).events;
    expect(events.filter((event) => event.type === 'frame-zoomed')).toHaveLength(2);

    await h.ok({ kind: 'hangup', callId: call.callId });
    expect(h.calls.zoom({ slug: 'mira', messageId, cell: 1 })).toEqual({
      released: true,
      messageId,
      cell: 1,
    });
  });

  it('keeps only the newest 64 grid cells', async () => {
    const h = host();
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    const frame = (await jpeg({ r: 10, g: 20, b: 30 }, 160, 90)).toString('base64');
    for (let batch = 0; batch < 8; batch += 1) {
      for (let index = 0; index < 9; index += 1)
        await h.ok({ kind: 'frame', callId: call.callId, source: 'camera', jpeg: frame });
      for (let index = 0; index < 20 && h.records.length <= batch; index += 1)
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(h.records).toHaveLength(8);
    expect(h.calls.zoom({ slug: 'mira', messageId: 'record-1', cell: 1 }).released).toBe(true);
    for (const messageId of [
      'record-2',
      'record-3',
      'record-4',
      'record-5',
      'record-6',
      'record-7',
      'record-8',
    ])
      expect(h.calls.zoom({ slug: 'mira', messageId, cell: 9 }).released).toBe(false);
  });

  it('saves 9 silent keyframes as a frame record and lists it on the next sentence', async () => {
    const h = host();
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    for (let index = 0; index < 11; index += 1) {
      h.advance(1_000);
      await h.ok({
        kind: 'frame',
        callId: call.callId,
        source: 'camera',
        jpeg: (await jpeg({ r: index * 12, g: 0, b: 0 }, 160, 90)).toString('base64'),
      });
    }
    for (let index = 0; index < 20; index += 1)
      await new Promise((resolve) => setTimeout(resolve, 5));
    expect(h.records).toHaveLength(1);
    expect(h.records[0]).toMatchObject({ source: 'camera', frames: 9, image: { layout: '3+3+3' } });
    expect(h.records[0]!.toMs - h.records[0]!.fromMs).toBe(8_000);
    expect(h.sent).toHaveLength(0);
    expect(h.calls.zoom({ slug: 'mira', messageId: 'record-1', cell: 9 }).released).toBe(false);

    await h.say(call.callId);
    expect(h.sent[0]!.visual).toMatchObject({ source: 'camera', frames: 2, records: ['record-1'] });
    await h.say(call.callId);
    expect(h.sent[1]!.visual).toEqual({ source: 'camera', sameAs: h.sent[0]!.messageId });
    const events = (await h.ok({ kind: 'heartbeat', callId: call.callId })).events;
    expect(events.find((event) => event.type === 'frame-record')).toMatchObject({
      messageId: 'record-1',
      frames: 9,
      layout: '3+3+3',
    });
  });

  it('points the next sentence at the newest record when no keyframe is left', async () => {
    const h = host();
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'screen' });
    const frame = (await jpeg({ r: 0, g: 90, b: 0 }, 160, 90)).toString('base64');
    for (let index = 0; index < 9; index += 1)
      await h.ok({ kind: 'frame', callId: call.callId, source: 'screen', jpeg: frame });
    for (let index = 0; index < 20; index += 1)
      await new Promise((resolve) => setTimeout(resolve, 5));
    await h.say(call.callId);
    expect(h.sent[0]!.visual).toEqual({
      source: 'screen',
      sameAs: 'record-1',
      records: ['record-1'],
    });
  });

  it('refuses the removed save switch and always saves frames', async () => {
    const h = host();
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    for (const save of [false, true, 'no'])
      expect(
        await h.calls.handle(
          { deviceId: 'phone-1' },
          { kind: 'visual', callId: call.callId, source: 'screen', save },
        ),
      ).toMatchObject({ ok: false, code: 'invalid-input', error: expect.stringMatching(/save/u) });
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
    const h = host(['看这个', '换屏幕了', '再看摄像头']);
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
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    await h.say(call.callId);
    expect(h.sent.map((item) => item.visual === undefined)).toEqual([false, true, true]);
  });

  it('tells a Bot whose model cannot read images that a share is on and keeps the grid for later', async () => {
    const h = host(['你看到什么了', '现在呢'], false);
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'screen' });
    await h.ok({
      kind: 'frame',
      callId: call.callId,
      source: 'screen',
      jpeg: (await jpeg({ r: 0, g: 0, b: 200 })).toString('base64'),
    });
    await h.say(call.callId);
    await h.say(call.callId);
    expect(h.sent[0]!.visual).toMatchObject({ source: 'screen', frames: 1, unseen: true });
    expect('image' in h.sent[0]!.visual!).toBe(true);
    expect(h.sent[1]!.visual).toEqual({ source: 'screen', sameAs: h.sent[0]!.messageId });
    expect(
      callVisualNote(
        'dm-mira',
        {
          id: 'human-3',
          at: '2026-11-04T00:00:00.000Z',
          author: { kind: 'human' },
          body: '你看到什么了',
          voiceCall: {
            callId: 'call-0123456789abcdef',
            visual: { source: 'screen', frames: 1, layout: '1', unseen: true },
          },
        },
        'hint',
      ),
    ).toMatch(/cannot read images/u);
  });

  it('drops a keyframe still being read when the camera was turned off and on again', async () => {
    const h = host(['现在看到什么']);
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    const late = h.ok({
      kind: 'frame',
      callId: call.callId,
      source: 'camera',
      jpeg: (await jpeg({ r: 0, g: 200, b: 0 }, 1920, 1080)).toString('base64'),
    });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'off' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    await late;
    await h.say(call.callId);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.visual).toBeUndefined();
  });

  it('notes a camera paused in the background and resumed in the foreground', async () => {
    const h = host();
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    h.advance(20_000);
    await h.ok({ kind: 'visual', callId: call.callId, source: 'off', paused: true });
    h.advance(10_000);
    const back = await h.ok({
      kind: 'visual',
      callId: call.callId,
      source: 'camera',
      resumed: true,
    });
    expect(back.visual).toBe('camera');
    await vi.waitFor(() =>
      expect(h.lifecycle.map((record) => record.state)).toEqual([
        'started',
        'share-paused',
        'share-resumed',
      ]),
    );
    const [, paused, resumed] = h.lifecycle;
    expect(paused).toMatchObject({ source: 'camera' });
    expect(resumed).toMatchObject({ source: 'camera' });
    expect(voiceCallRecordBody(paused!)).toContain('went to the background');
    expect(voiceCallRecordBody(resumed!)).toContain('resumed at');
    expect(isChannelVoiceCallRecord(resumed)).toBe(true);
    for (const command of [
      { source: 'camera', paused: true },
      { source: 'off', resumed: true },
      { source: 'off', paused: true, stopped: true },
      { source: 'off', paused: 'yes' },
    ])
      expect(
        await h.calls.handle(h.phone, { kind: 'visual', callId: call.callId, ...command }),
      ).toMatchObject({
        ok: false,
        code: 'invalid-input',
      });
  });

  it('notes in the DM when the system stops a share, and only then', async () => {
    const h = host();
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'screen' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'off' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'screen' });
    h.advance(65_000);
    const stopped = await h.ok({
      kind: 'visual',
      callId: call.callId,
      source: 'off',
      stopped: true,
    });
    expect(stopped.visual).toBe('off');
    await h.ok({ kind: 'visual', callId: call.callId, source: 'off', stopped: true });
    await vi.waitFor(() =>
      expect(h.lifecycle.map((record) => record.state)).toEqual(['started', 'share-stopped']),
    );
    const record = h.lifecycle[1]!;
    expect(record).toMatchObject({ callId: call.callId, source: 'screen' });
    expect(record.state === 'share-stopped' && record.atMs).toBeGreaterThanOrEqual(65_000);
    expect(isChannelVoiceCallRecord(record)).toBe(true);
    expect(voiceCallRecordBody(record)).toContain('Screen sharing in call');
    const refused = await h.calls.handle(h.phone, {
      kind: 'visual',
      callId: call.callId,
      source: 'camera',
      stopped: true,
    });
    expect(refused).toMatchObject({ ok: false, code: 'invalid-input' });
  });
});

describe('call visuals in Channel messages', () => {
  it('accepts a grid or an unchanged view and refuses anything else', () => {
    expect(isChannelCallVisual({ source: 'camera', frames: 4, layout: '2+2' })).toBe(true);
    expect(isChannelCallVisual({ source: 'screen', sameAs: 'human-1' })).toBe(true);
    expect(isChannelCallVisual({ source: 'camera', frames: 1, layout: '1', unseen: true })).toBe(
      true,
    );
    expect(isChannelCallVisual({ source: 'camera', frames: 1, layout: '1', unseen: false })).toBe(
      false,
    );
    for (const [frames, layout] of [
      [1, '1x1'],
      [4, '2x2'],
      [9, '3x3'],
      [16, '4x4'],
      [5, '2+3'],
      [5, '3+3'],
      [10, '3+3+3'],
    ] as const)
      expect(isChannelCallVisual({ source: 'camera', frames, layout })).toBe(false);
    expect(isChannelCallVisual({ source: 'camera', unseen: true })).toBe(false);
    expect(isChannelCallVisual({ source: 'tv', frames: 1, layout: '1' })).toBe(false);
    expect(isChannelCallVisual({ source: 'camera', frames: 1, layout: '1', extra: 1 })).toBe(false);
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
          visual: { source: 'camera', frames: 5, layout: '3+2' },
        },
      },
      'HINT',
    );
    expect(grid).toContain('a 3+2 grid of 5 keyframes');
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
    const recorded = callVisualNote(
      'dm-mira',
      {
        ...base,
        attachments: [image],
        voiceCall: {
          callId: 'call-0123456789abcdef',
          visual: {
            source: 'screen',
            frames: 4,
            layout: '2+2',
            records: ['voice-call-frames-a', 'voice-call-frames-b'],
          },
        },
      },
      'HINT',
    );
    expect(recorded).toContain(`attachment_id ${image.fileId}`);
    expect(recorded).not.toContain('cell 0');
    expect(recorded).toContain(
      '2 frame records in this DM (message voice-call-frames-a, voice-call-frames-b)',
    );
  });

  it('accepts frame records and their references on call messages', () => {
    expect(
      isChannelCallVisual({ source: 'camera', frames: 4, layout: '2+2', records: ['r-1'] }),
    ).toBe(true);
    expect(isChannelCallVisual({ source: 'camera', sameAs: 'h-1', records: ['r-1'] })).toBe(true);
    expect(isChannelCallVisual({ source: 'camera', sameAs: 'h-1', records: [] })).toBe(false);
    expect(
      isChannelCallVisual({ source: 'camera', frames: 4, layout: '2+2', unsaved: false }),
    ).toBe(false);
    expect(isChannelCallVisual({ source: 'camera', frames: 4, layout: '2+2', unsaved: true })).toBe(
      false,
    );
    const record = {
      callId: 'call-0123456789abcdef',
      botSlug: 'mira',
      state: 'frames',
      startedAt: '2026-11-04T00:00:00.000Z',
      source: 'screen',
      frames: 9,
      layout: '3+3+3',
      fromMs: 12_000,
      toMs: 40_000,
    };
    expect(isChannelVoiceCallRecord(record)).toBe(true);
    expect(isChannelVoiceCallRecord({ ...record, toMs: 1_000 })).toBe(false);
    expect(isChannelVoiceCallRecord({ ...record, frames: 10 })).toBe(false);
    expect(isChannelVoiceCallRecord({ ...record, frames: 16, layout: '4x4' })).toBe(false);
    expect(isChannelVoiceCallRecord({ ...record, frames: 8 })).toBe(false);
    expect(voiceCallRecordBody(record as ChannelVoiceCallRecord)).toBe(
      'Screen record of call call-0123456789abcdef from 0:12 to 0:40 while the Human was silent: a 3+3+3 grid of 9 keyframes, oldest first.',
    );
  });
});
