import { host, jpeg } from './call-visual-fixtures.js';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import {
  isChannelVoiceCallRecord,
  voiceCallRecordBody,
} from '../src/channels/voice-call-record.js';
import { callVisualNote } from '../src/runtime/bot-runtime.js';
import { type VoiceCallEvent } from '../src/voice/call-contract.js';

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
    expect(await sharp(image.jpeg).metadata()).toMatchObject({ width: 1536, height: 321 });

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
    expect(built).toMatchObject({ frames: 3, commits: 0, layout: '3', fromMs: 2_000, toMs: 6_000 });
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

  it('turns a share off when the call ends with it still on', async () => {
    const h = host();
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    const ended = await h.ok({ kind: 'hangup', callId: call.callId });
    expect(ended).toMatchObject({ phase: 'ended', visual: 'off' });
    const types = ended.events.map((event) => event.type);
    expect(types.lastIndexOf('visual')).toBeLessThan(types.indexOf('ended'));
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

  it('saves 9 silent keyframes as a frame record and sends the rest with the next sentence', async () => {
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
    expect(h.sent[0]!.visual).toMatchObject({ source: 'camera', frames: 2 });
    expect(h.sent[0]!.visual).not.toHaveProperty('records');
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
    expect(h.sent[0]!.visual).toEqual({ source: 'screen', sameAs: 'record-1' });
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
            visual: { source: 'screen', frames: 1, layout: '1', fromMs: 0, toMs: 0, unseen: true },
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
