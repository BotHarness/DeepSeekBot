// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PendingDelivery } from '../src/client/message-delivery.js';

it('keeps fast sends silent and delayed feedback separate from message content', () => {
  vi.useFakeTimers();
  vi.setSystemTime(10000);
  const container = document.createElement('div');
  const root = createRoot(container);
  const message = {
    id: 'message',
    at: new Date(10000).toISOString(),
    author: { kind: 'human' as const },
    body: '你好',
    pending: true,
  };
  const t = () => '发送中';
  try {
    act(() => root.render(createElement(PendingDelivery, { message, t })));
    expect(container.textContent).toBe('');
    act(() => vi.advanceTimersByTime(2999));
    expect(container.textContent).toBe('');
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('发送中');
    expect(container.textContent).toBe('…');
    act(() => root.render(null));
    act(() => vi.advanceTimersByTime(3000));
    expect(container.textContent).toBe('');
  } finally {
    act(() => root.unmount());
    vi.useRealTimers();
  }
});
