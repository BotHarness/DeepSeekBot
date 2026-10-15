import { describe, expect, it, vi } from 'vitest';

import type { ConversationMessage } from '../src/host/conversation';
import { createReadMarker, readTarget } from '../src/ui/chat/mark-read';

const message = (id: string, delivery: ConversationMessage['delivery']): ConversationMessage => ({
  id,
  at: '2026-10-15T10:00:00.000Z',
  author: 'bot',
  body: id,
  attachments: [],
  delivery,
});

describe('Read position', () => {
  it('marks the newest message the Host has stored', () => {
    expect(
      readTarget([message('a', 'committed'), message('b', 'committed'), message('c', 'pending')]),
    ).toBe('b');
  });

  it('marks nothing before any message is stored', () => {
    expect(readTarget([])).toBeUndefined();
    expect(readTarget([message('draft', 'pending'), message('lost', 'failed')])).toBeUndefined();
  });

  it('marks each newest message once, after the list settles', async () => {
    vi.useFakeTimers();
    const mark = vi.fn(() => Promise.resolve());
    const marker = createReadMarker(mark, 250);
    marker.offer('dm-ada', 'm1');
    marker.offer('dm-ada', 'm2');
    await vi.advanceTimersByTimeAsync(250);
    marker.offer('dm-ada', 'm2');
    await vi.advanceTimersByTimeAsync(250);
    expect(mark.mock.calls).toEqual([['dm-ada', 'm2']]);
    marker.offer('dm-ada', undefined);
    marker.offer('dm-ada', 'm3');
    marker.stop();
    await vi.advanceTimersByTimeAsync(250);
    expect(mark).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('tries again after the Host refuses a read position', async () => {
    vi.useFakeTimers();
    const mark = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const marker = createReadMarker(mark, 10);
    marker.offer('team', 'm1');
    await vi.advanceTimersByTimeAsync(10);
    marker.offer('team', 'm1');
    await vi.advanceTimersByTimeAsync(10);
    expect(mark).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
