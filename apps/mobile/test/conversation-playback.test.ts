import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConversationSnapshot, ConversationTimelineSnapshot } from '../src/host/conversation';
import { createConversationPlayback } from '../src/host/conversation-playback';

function fixture(initial: Partial<ConversationSnapshot> = {}) {
  let snapshot: ConversationSnapshot = {
    status: 'live',
    messages: [],
    drafts: [],
    hasOlder: false,
    loadingOlder: false,
    fromCache: false,
    ...initial,
  };
  let timeline: ConversationTimelineSnapshot = { ...snapshot, drafts: [] };
  const listeners = new Set<() => void>();
  const source = {
    getSnapshot: () => snapshot,
    getTimelineSnapshot: () => timeline,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const playback = createConversationPlayback(source);
  const changed = vi.fn();
  const stop = playback.subscribe(changed);
  return {
    playback,
    changed,
    stop,
    listeners,
    update(next: Partial<ConversationSnapshot>) {
      snapshot = { ...snapshot, ...next };
      const references = snapshot.drafts.map(({ draftId, botSlug }) => ({ draftId, botSlug }));
      if (
        snapshot.messages !== timeline.messages ||
        JSON.stringify(references) !== JSON.stringify(timeline.drafts)
      )
        timeline = { ...snapshot, drafts: references };
      for (const listener of listeners) listener();
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('conversation playback ownership', () => {
  it('plays successive committed bubbles in order without replaying initial history', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = fixture({ status: 'opening' });
    const message = {
      id: 'old',
      at: '2026-10-16',
      author: 'bot' as const,
      bot: 'ada',
      body: '历史正文',
      attachments: [],
      delivery: 'committed' as const,
    };
    f.update({ status: 'live', messages: [message] });
    expect(f.playback.getBubble('old')).toBeUndefined();
    const historical = vi.fn();
    const unsubscribe = f.playback.subscribeBubble('old', historical);
    const first = { ...message, id: 'first', body: '第一条完整正文。'.repeat(12) };
    const second = { ...message, id: 'second', body: '第二条正文。' };
    f.update({ messages: [message, first, second] });
    vi.advanceTimersByTime(600);
    expect(f.playback.getBubble('first')!.message.body.length).toBeGreaterThan(0);
    expect(f.playback.getBubble('second')!.message.body).toBe('');
    expect(historical).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15000);
    expect(f.playback.getBubble('first')).toMatchObject({
      message: { body: first.body },
      streaming: false,
    });
    expect(f.playback.getBubble('second')).toMatchObject({
      message: { body: second.body },
      streaming: false,
    });
    unsubscribe();
    f.stop();
  });
  it('keeps the same row and cursor after commitment, draining without invalidating the timeline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = fixture();
    const body = '甲乙丙丁戊己庚辛'.repeat(30);
    f.update({ drafts: [{ draftId: 'd1', botSlug: 'ada', body }] });
    vi.advanceTimersByTime(800);
    const before = f.playback.getBubble('draft:d1')!.message.body;
    expect(before.length).toBeGreaterThan(0);
    expect(before.length).toBeLessThan(body.length);
    f.update({
      drafts: [],
      messages: [
        {
          id: 'm1',
          at: '2026-10-17',
          author: 'bot',
          bot: 'ada',
          body,
          attachments: [],
          delivery: 'committed',
        },
      ],
    });
    expect(f.playback.rowKey('m1')).toBe('draft:d1');
    expect(f.playback.getBubble('draft:d1')).toMatchObject({
      message: { id: 'm1', body: before },
      streaming: true,
    });
    const timeline = f.playback.getTimelineSnapshot();
    f.changed.mockClear();
    vi.advanceTimersByTime(800);
    expect(f.playback.getBubble('draft:d1')!.message.body.length).toBeGreaterThan(before.length);
    expect(f.playback.getTimelineSnapshot()).toBe(timeline);
    expect(f.changed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15000);
    expect(f.playback.getBubble('draft:d1')).toMatchObject({ message: { body }, streaming: false });
    f.stop();
    expect(f.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows opened history directly and buffers an instant new committed message', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const existing = {
      id: 'old',
      at: '2026-10-16',
      author: 'bot' as const,
      bot: 'ada',
      body: '历史',
      attachments: [],
      delivery: 'committed' as const,
    };
    const f = fixture({ messages: [existing] });
    expect(f.playback.getBubble('old')).toBeUndefined();
    f.update({ messages: [existing, { ...existing, id: 'new', body: '新的正文'.repeat(30) }] });
    expect(f.playback.getBubble('new')!.message.body).toBe('');
    vi.advanceTimersByTime(600);
    expect(f.playback.getBubble('new')!.message.body.length).toBeGreaterThan(0);
    expect(f.playback.getBubble('old')).toBeUndefined();
    f.stop();
  });

  it('holds the visible prefix during history reading, including commitment, then resumes on return', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = fixture();
    const body = '历史阅读时不应让增长中的气泡改变页面布局。'.repeat(30);
    f.update({ drafts: [{ draftId: 'd1', botSlug: 'ada', body }] });
    vi.advanceTimersByTime(600);
    f.playback.setFollowing(false);
    const held = f.playback.getBubble('draft:d1')!.message.body;
    expect(held.length).toBeGreaterThan(0);
    expect(vi.getTimerCount()).toBe(0);
    f.update({
      drafts: [],
      messages: [
        {
          id: 'm1',
          at: '2026-10-17',
          author: 'bot',
          bot: 'ada',
          body,
          attachments: [],
          delivery: 'committed',
        },
      ],
    });
    vi.advanceTimersByTime(5000);
    expect(f.playback.getBubble('draft:d1')!.message.body).toBe(held);
    expect(f.playback.rowKey('m1')).toBe('draft:d1');
    expect(vi.getTimerCount()).toBe(0);
    f.playback.setFollowing(true);
    vi.advanceTimersByTime(600);
    expect(f.playback.getBubble('draft:d1')!.message.body.length).toBeGreaterThan(held.length);
    vi.advanceTimersByTime(30000);
    expect(f.playback.getBubble('draft:d1')).toMatchObject({ message: { body }, streaming: false });
    f.stop();
  });

  it('cancels a retired draft and flushes a background presentation without replaying elapsed time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = fixture();
    const body = '一段待播放文字'.repeat(20);
    f.update({ drafts: [{ draftId: 'd1', botSlug: 'ada', body }] });
    vi.advanceTimersByTime(500);
    f.playback.setActive(false);
    expect(f.playback.getBubble('draft:d1')!.message.body).toBe(body);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(30000);
    f.playback.setActive(true);
    f.update({ drafts: [] });
    expect(f.playback.getBubble('draft:d1')).toBeUndefined();
    f.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
