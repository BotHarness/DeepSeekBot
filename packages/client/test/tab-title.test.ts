import { describe, expect, it } from 'vitest';

import { formatTabTitle, mountTabTitle } from '../src/client/tab-title.js';

function source(initial: { unreadCount: number; hasAction: boolean }) {
  let humanInbox = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => ({ humanInbox }),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next: { unreadCount: number; hasAction: boolean }) {
      humanInbox = next;
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

describe('tab title attention', () => {
  it('prefixes unread count and an action mark', () => {
    expect(formatTabTitle('DeepSeekBot', { unreadCount: 0, hasAction: false })).toBe('DeepSeekBot');
    expect(formatTabTitle('DeepSeekBot', { unreadCount: 3, hasAction: false })).toBe(
      '(3) DeepSeekBot',
    );
    expect(formatTabTitle('DeepSeekBot', { unreadCount: 3, hasAction: true })).toBe(
      '● (3) DeepSeekBot',
    );
    expect(formatTabTitle('DeepSeekBot', { unreadCount: 0, hasAction: true })).toBe(
      '● DeepSeekBot',
    );
    expect(formatTabTitle('DeepSeekBot', { unreadCount: 120, hasAction: false })).toBe(
      '(99+) DeepSeekBot',
    );
  });

  it('follows attention changes, keeps native title changes as the base and restores on dispose', () => {
    const attention = source({ unreadCount: 2, hasAction: false });
    let onTitleChange = (): void => {};
    const doc = { title: 'DeepSeek Harness', head: {} as Node };
    const dispose = mountTabTitle(attention, doc, (_target, onChange) => {
      onTitleChange = onChange;
      return () => {
        onTitleChange = () => {};
      };
    });
    expect(doc.title).toBe('(2) DeepSeek Harness');

    attention.set({ unreadCount: 5, hasAction: true });
    expect(doc.title).toBe('● (5) DeepSeek Harness');

    doc.title = 'Session A';
    onTitleChange();
    expect(doc.title).toBe('● (5) Session A');
    onTitleChange();
    expect(doc.title).toBe('● (5) Session A');

    attention.set({ unreadCount: 0, hasAction: false });
    expect(doc.title).toBe('Session A');

    attention.set({ unreadCount: 1, hasAction: false });
    dispose();
    expect(doc.title).toBe('Session A');
    expect(attention.listeners.size).toBe(0);
  });
});
