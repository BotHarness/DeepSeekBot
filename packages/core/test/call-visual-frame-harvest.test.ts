import { host, imageFrames } from './call-visual-fixtures.js';
import { describe, expect, it, vi } from 'vitest';

describe('call frame harvest, scenario by scenario', () => {
  it('sends a single still frame with a sentence spoken long after it', async () => {
    const h = host(['这是什么']);
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    h.advance(5_000);
    await h.frame(call.callId);
    h.advance(600_000);
    await h.ok({ kind: 'heartbeat', callId: call.callId });
    await h.say(call.callId);
    expect(h.records).toHaveLength(0);
    expect(h.sent[0]!.visual).toMatchObject({ frames: 1, fromMs: 5_000, toMs: 5_000 });
    expect(h.sent[0]!.speech!.fromMs).toBeGreaterThan(600_000);
    expect(h.sent[0]!.speech!.toMs).toBeGreaterThan(h.sent[0]!.speech!.fromMs);
  });

  it('writes 20 frames that arrive during one sentence as commits of 9 and 2 before it, dropping none', async () => {
    const h = host(['你看沿途这些']);
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    let shown = 0;
    let early = -1;
    await h.talk(call.callId, async (index) => {
      if (index > 5) return;
      for (let count = 0; count < 4 && shown < 20; count += 1)
        await h.frame(call.callId, 'camera', ++shown);
      if (shown >= 18 && early < 0) {
        await h.settle();
        early = h.records.length;
      }
    });
    await h.settle();
    expect(shown).toBe(20);
    expect(early).toBe(1);
    expect(h.records.map((record) => record.frames)).toEqual([9, 2]);
    expect(h.records[0]!.fromMs).toBeLessThanOrEqual(h.records[1]!.fromMs);
    expect(imageFrames(h.sent[0]!.visual)).toBe(9);
    expect(h.order).toEqual(['record:9', 'record:2', 'sent:9']);
    const visual = h.sent[0]!.visual as { fromMs: number; toMs: number };
    expect(visual.fromMs).toBeGreaterThanOrEqual(h.records[1]!.toMs);
    expect(await h.dropped(call.callId)).toBe(0);
  });

  it('writes the oldest nine as soon as 18 wait while the Human speaks, then sends the newest nine', async () => {
    const h = host(['再看看']);
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'screen' });
    for (let index = 0; index < 5; index += 1) await h.frame(call.callId, 'screen', index);
    await h.settle();
    expect(h.records).toHaveLength(0);
    let shown = 5;
    const seen: number[] = [];
    await h.talk(call.callId, async (index) => {
      if (index > 5) return;
      for (let count = 0; count < 3 && shown < 18; count += 1)
        await h.frame(call.callId, 'screen', ++shown);
      await h.settle();
      seen.push(h.records.length);
    });
    await h.settle();
    expect(shown).toBe(18);
    expect(seen.at(-1)).toBe(1);
    expect(h.order).toEqual(['record:9', 'sent:9']);
    expect(await h.dropped(call.callId)).toBe(0);
  });

  it('keeps written commits when a sentence is dropped and gives its newest frames to the next one', async () => {
    const h = host(['', '这里呢']);
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    let shown = 0;
    await h.talk(call.callId, async (index) => {
      if (index > 5) return;
      for (let count = 0; count < 2 && shown < 12; count += 1)
        await h.frame(call.callId, 'camera', ++shown);
    });
    await h.settle();
    expect(h.sent).toHaveLength(0);
    expect(h.records.map((record) => record.frames)).toEqual([3]);
    await h.say(call.callId);
    expect(imageFrames(h.sent[0]!.visual)).toBe(9);
    expect(h.order).toEqual(['record:3', 'sent:9']);
    expect(await h.dropped(call.callId)).toBe(0);
  });

  it('keeps written commits when a sentence cannot be sent', async () => {
    const h = host(['第一句', '第二句'], undefined, { failSend: 1 });
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    for (let index = 0; index < 13; index += 1) {
      await h.frame(call.callId, 'camera', index);
      if (index === 8) await h.settle();
    }
    await h.say(call.callId);
    expect(h.records.map((record) => record.frames)).toEqual([9]);
    expect(h.sent).toHaveLength(0);
    await h.say(call.callId);
    expect(imageFrames(h.sent[0]!.visual)).toBe(4);
  });

  it('points at the last picture when nothing changed and sends none before any was shown', async () => {
    const h = host(['你好', '看这个', '还是这个吗', '现在呢']);
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    await h.say(call.callId);
    expect(h.sent[0]!.visual).toBeUndefined();
    await h.frame(call.callId);
    await h.say(call.callId);
    await h.say(call.callId);
    await h.say(call.callId);
    expect(h.sent.slice(1).map((item) => item.visual)).toEqual([
      expect.objectContaining({ frames: 1 }),
      { source: 'camera', sameAs: h.sent[1]!.messageId },
      { source: 'camera', sameAs: h.sent[1]!.messageId },
    ]);
    expect(h.records).toHaveLength(0);
  });

  it('films a movie in silence as commits of nine and sends the rest with the comment after it', async () => {
    const h = host(['刚才那段怎么样']);
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'screen' });
    for (let index = 0; index < 40; index += 1) {
      h.advance(3_000);
      await h.frame(call.callId, 'screen', index * 6);
      if (index % 9 === 8) await vi.waitFor(() => expect(h.records).toHaveLength((index + 1) / 9));
    }
    await h.say(call.callId);
    expect(h.records.map((record) => record.frames)).toEqual([9, 9, 9, 9]);
    expect(h.records.map((record) => [record.fromMs, record.toMs])).toEqual([
      [3_000, 27_000],
      [30_000, 54_000],
      [57_000, 81_000],
      [84_000, 108_000],
    ]);
    expect(imageFrames(h.sent[0]!.visual)).toBe(4);
    expect(h.order).toEqual(['record:9', 'record:9', 'record:9', 'record:9', 'sent:4']);
    expect(await h.dropped(call.callId)).toBe(0);
  });

  it('walks and talks: every sentence carries the newest nine and the rest are commits, none lost', async () => {
    const h = host(['你看这条街', '前面那个店', '再往前走']);
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    let shown = 0;
    for (let sentence = 0; sentence < 3; sentence += 1) {
      await h.talk(call.callId, async (index) => {
        if (index > 5) return;
        for (let count = 0; count < 3; count += 1) await h.frame(call.callId, 'camera', ++shown);
      });
      await h.settle();
      for (let count = 0; count < 2; count += 1) await h.frame(call.callId, 'camera', ++shown);
    }
    await h.settle();
    expect(h.sent.map((item) => imageFrames(item.visual))).toEqual([9, 9, 9]);
    const pending = 2;
    const harvested =
      h.records.reduce((sum, record) => sum + record.frames, 0) +
      h.sent.reduce((sum, item) => sum + imageFrames(item.visual), 0);
    expect(harvested + pending).toBe(shown);
    expect(h.order.filter((entry) => entry.startsWith('sent'))).toHaveLength(3);
    expect(h.order.at(-1)).toBe('sent:9');
    expect(await h.dropped(call.callId)).toBe(0);
  });

  it('answers a still follow-up with the same picture instead of a new one', async () => {
    const h = host(['这个报错是什么', '那怎么修', '还有别的办法吗']);
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'screen' });
    await h.frame(call.callId, 'screen');
    for (let index = 0; index < 3; index += 1) await h.say(call.callId);
    expect(h.sent.map((item) => imageFrames(item.visual))).toEqual([1, 0, 0]);
    expect(h.sent.slice(1).map((item) => item.visual)).toEqual([
      { source: 'screen', sameAs: h.sent[0]!.messageId },
      { source: 'screen', sameAs: h.sent[0]!.messageId },
    ]);
    expect(h.records).toHaveLength(0);
  });

  it('drops the oldest frames only past the safety cap while a commit write is stuck', async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = host(['卡住了吗'], undefined, { hold });
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    for (let index = 0; index < 45; index += 1) await h.frame(call.callId, 'camera', index);
    await h.settle();
    const events = (await h.ok({ kind: 'heartbeat', callId: call.callId })).events;
    const drops = events.filter((event) => event.type === 'frames-dropped');
    expect(drops.reduce((sum, event) => sum + (event as { dropped: number }).dropped, 0)).toBe(4);
    expect(drops.at(-1)).toMatchObject({ source: 'camera', total: 4 });
    release();
    await vi.waitFor(() => expect(h.records.length).toBeGreaterThanOrEqual(4));
    expect(h.records.reduce((sum, record) => sum + record.frames, 0)).toBe(36);
  });

  it('writes what waits as a commit when the share stops', async () => {
    const h = host(['关了']);
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    for (let index = 0; index < 4; index += 1) await h.frame(call.callId, 'camera', index);
    await h.ok({ kind: 'visual', callId: call.callId, source: 'off' });
    await vi.waitFor(() => expect(h.records.map((record) => record.frames)).toEqual([4]));
    await h.say(call.callId);
    expect(h.sent[0]!.visual).toBeUndefined();
  });

  it('writes what waits as a commit when the Human hangs up, and finishes queued commits', async () => {
    let release = () => {};
    const hold = new Promise<void>((resolve) => (release = resolve));
    const h = host([], undefined, { hold });
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    await h.ok({ kind: 'visual', callId: call.callId, source: 'camera' });
    for (let index = 0; index < 13; index += 1) await h.frame(call.callId, 'camera', index);
    await h.ok({ kind: 'hangup', callId: call.callId });
    release();
    await vi.waitFor(() => expect(h.records.map((record) => record.frames)).toEqual([9, 4]));
  });
});
