import { describe, expect, it } from 'vitest';

import {
  MESSAGE_SELECTION_LIMIT,
  selectionRange,
  toggleSelection,
} from '../src/client/message-selection-state.js';
import type { ChannelMessage } from '../src/client/store.js';

const message = (id: string, minute: number, extra: Partial<ChannelMessage> = {}): ChannelMessage =>
  ({
    id,
    at: new Date(Date.UTC(2026, 9, 13, 4, minute)).toISOString(),
    author: { kind: 'human' },
    body: id,
    ...extra,
  }) as ChannelMessage;

describe('message selection', () => {
  it('toggles saved messages and skips pending, streaming or failed ones', () => {
    const one = message('one', 1);
    expect(toggleSelection([], one)).toEqual(['one']);
    expect(toggleSelection(['one'], one)).toEqual([]);
    expect(toggleSelection([], message('p', 2, { pending: true }))).toEqual([]);
    expect(toggleSelection([], message('s', 2, { streaming: true }))).toEqual([]);
    expect(toggleSelection([], message('f', 2, { failed: 'offline' }))).toEqual([]);
    const full = Array.from({ length: MESSAGE_SELECTION_LIMIT }, (_, index) => `m${index}`);
    expect(toggleSelection(full, one)).toBe(full);
  });

  it('exports from the earliest to the latest selected message', () => {
    const messages = [message('a', 1), message('b', 5), message('c', 9)];
    expect(selectionRange(['c', 'a'], messages)).toEqual({
      fromMessageId: 'a',
      toMessageId: 'c',
      messageIds: ['a', 'c'],
    });
    expect(selectionRange(['b'], messages)).toEqual({ fromMessageId: 'b', messageIds: ['b'] });
    expect(selectionRange(['gone'], messages)).toBeUndefined();
  });
});
