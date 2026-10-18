import { describe, expect, it } from 'vitest';
import { createTextPlayback, playbackTiming } from '../src/host/text-playback';

describe('reserved text playback', () => {
  it('keeps its established pace when the source closes with a short queue remaining', () => {
    const player = createTextPlayback('', 0);
    let text = '';
    for (let now = 0; now <= 2400; now += 20) {
      if (now % 100 === 0) {
        text += '字'.repeat(10);
        player.receive(text, false, now);
      }
      player.advance(now);
    }
    const before = player.getSnapshot();
    expect(before.rate).toBeGreaterThan(60);
    player.receive(text, true, 2400);
    for (let now = 2420; now < 2800; now += 20)
      expect(player.advance(now).rate).toBeGreaterThanOrEqual(before.rate * 0.99);
  });
  it('does not turn punctuation-rich fast input into minutes of trailing playback', () => {
    const player = createTextPlayback('', 0);
    const paragraph = '固定内容，保持均匀。标点保留阅读节奏，不能把快速回复拖成很长的尾巴。\n\n';
    const text = paragraph.repeat(300);
    let completed = 0;
    for (let now = 0; now <= 60000; now += 32) {
      player.receive(text.slice(0, Math.floor(now / 32) * 80), now >= 8000, now);
      const state = player.advance(now);
      if (state.phase === 'complete') {
        completed = now;
        break;
      }
    }
    expect(completed).toBeGreaterThan(8000);
    expect(completed).toBeLessThan(45000);
    expect(player.getSnapshot().body).toBe(text);
  });

  it('keeps a reserve and releases characters through a temporary input gap', () => {
    const player = createTextPlayback('', 0);
    let received = '';
    let previous = '';
    let lastRelease = 0;
    const gaps: number[] = [];
    const reserves: number[] = [];
    for (let now = 0; now <= 6000; now += 20) {
      if (now % 100 === 0 && (now < 3000 || now >= 3800)) {
        received += '自然阅读文字';
        player.receive(received, false, now);
      }
      const state = player.advance(now);
      expect(state.body.startsWith(previous)).toBe(true);
      expect(state.cursor).toBeLessThanOrEqual(state.received);
      if (state.body !== previous) {
        if (lastRelease >= 1000) gaps.push(now - lastRelease);
        lastRelease = now;
      }
      if (now >= 2000 && now < 3000) reserves.push(state.pending);
      previous = state.body;
    }
    expect(Math.min(...reserves)).toBeGreaterThan(10);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(180);
    expect(previous.length).toBeLessThan(received.length);
    player.receive(received, true, 6000);
    expect(player.getSnapshot().body).toBe(previous);
    for (let now = 6020; now <= 16000; now += 20) player.advance(now);
    expect(player.getSnapshot()).toMatchObject({ body: received, pending: 0, phase: 'complete' });
  });

  it('retains fast-input headroom and bounds release size even after a delayed frame or commitment', () => {
    const player = createTextPlayback('', 0);
    let previous = 0;
    for (let now = 0; now <= 2000; now += 32) {
      player.receive('字'.repeat(80 * (1 + Math.floor(now / 32))), false, now);
      const state = player.advance(now);
      expect(state.cursor - previous).toBeLessThanOrEqual(playbackTiming.maxRelease);
      previous = state.cursor;
    }
    const before = player.getSnapshot();
    expect(before.pending).toBeGreaterThan(100);
    const final = '字'.repeat(before.received);
    player.receive(final, true, 2010);
    expect(player.getSnapshot().cursor).toBe(before.cursor);
    const delayed = player.advance(6000);
    expect(delayed.cursor - before.cursor).toBeLessThanOrEqual(playbackTiming.maxRelease);
    expect(delayed.pending).toBeGreaterThan(0);
    for (let now = 6032; now < 60000; now += 32) player.advance(now);
    expect(player.getSnapshot().body).toBe(final);
  });

  it('pauses at punctuation instead of releasing through it in the same frame', () => {
    const player = createTextPlayback('', 0);
    player.receive('甲乙，丙丁。戊己\n后段', true, 0);
    const seen = new Map<string, number>();
    for (let now = 0; now < 3000; now += 16) {
      const body = player.advance(now).body;
      if (!seen.has(body)) seen.set(body, now);
    }
    expect(seen.has('甲乙，')).toBe(true);
    expect(seen.has('甲乙，丙丁。')).toBe(true);
    expect(seen.has('甲乙，丙丁。戊己\n')).toBe(true);
    const sentence = seen.get('甲乙，丙丁。')!;
    const following = [...seen].find(([body]) => body.startsWith('甲乙，丙丁。戊'))![1];
    expect(following - sentence).toBeGreaterThanOrEqual(96);
  });

  it('keeps complete graphemes and reconciles a correction in the queued suffix', () => {
    const player = createTextPlayback('', 0);
    const text = '👨‍👩‍👧‍👦é你好，后面内容。';
    player.receive(text, false, 0);
    for (let now = 0; now < 400; now += 16) player.advance(now);
    const before = player.getSnapshot().body;
    expect(before).not.toContain('�');
    const corrected = before + '修正后的尾部。';
    player.receive(corrected, true, 400);
    expect(player.getSnapshot().body).toBe(before);
    for (let now = 400; now < 4000; now += 16) player.advance(now);
    expect(player.getSnapshot().body).toBe(corrected);
    player.receive('权威正文改写', true, 4000);
    expect(player.getSnapshot().body).toBe('权威正文改写');
  });
});
