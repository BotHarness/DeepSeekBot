// @vitest-environment jsdom
import { type Root } from 'react-dom/client';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

import { openTooltip } from './primitive-mocks.js';
import { zhTranslate } from '../src/client/locale.js';
import { MessageCopyAction } from '../src/client/message-copy-action.js';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
});

function setClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

function buttons(): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>('[data-bubble-action]')];
}

describe('message Copy action', () => {
  it('confirms only the copied message after success and restarts the reset timer', async () => {
    vi.useFakeTimers();
    let resolveFirstWrite: () => void = () => {};
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstWrite = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    setClipboard(writeText);
    await act(async () =>
      root.render(
        createElement(
          'div',
          null,
          createElement(MessageCopyAction, { body: 'first', t: zhTranslate }),
          createElement(MessageCopyAction, { body: 'second', t: zhTranslate }),
        ),
      ),
    );

    await act(async () => buttons()[0]?.click());
    expect(writeText).toHaveBeenCalledWith('first');
    expect(buttons()[0]?.getAttribute('aria-label')).toBe('复制消息');
    await act(async () => resolveFirstWrite());
    expect(buttons()[0]?.getAttribute('aria-label')).toBe('已复制');
    expect(buttons()[0]?.getAttribute('aria-label')).toBe('已复制');
    expect((await openTooltip(buttons()[0]!)).textContent).toBe('已复制');
    expect(buttons()[1]?.getAttribute('aria-label')).toBe('复制消息');

    await act(async () => vi.advanceTimersByTime(1_000));
    await act(async () => buttons()[0]?.click());
    expect(writeText).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(buttons()[0]?.getAttribute('aria-label')).toBe('已复制');
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(buttons()[0]?.getAttribute('aria-label')).toBe('复制消息');
    expect(buttons()[0]?.getAttribute('aria-label')).toBe('复制消息');
  });

  it('never shows success for a rejected or unavailable clipboard write', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    setClipboard(writeText);
    await act(async () =>
      root.render(createElement(MessageCopyAction, { body: 'message', t: zhTranslate })),
    );

    await act(async () => buttons()[0]?.click());
    expect(writeText).toHaveBeenCalledWith('message');
    expect(buttons()[0]?.getAttribute('aria-label')).toBe('复制消息');
    expect(buttons()[0]?.getAttribute('aria-label')).toBe('复制消息');

    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    await act(async () => buttons()[0]?.click());
    expect(buttons()[0]?.getAttribute('aria-label')).toBe('复制消息');
  });

  it('invalidates pending and visible confirmation when the message body changes', async () => {
    let resolveFirstWrite: () => void = () => {};
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstWrite = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    setClipboard(writeText);
    const render = async (body: string) =>
      act(async () => root.render(createElement(MessageCopyAction, { body, t: zhTranslate })));

    await render('before');
    await act(async () => buttons()[0]?.click());
    await render('after');
    await act(async () => resolveFirstWrite());
    expect(buttons()[0]?.getAttribute('aria-label')).toBe('复制消息');

    await act(async () => buttons()[0]?.click());
    expect(writeText).toHaveBeenNthCalledWith(2, 'after');
    expect(buttons()[0]?.getAttribute('aria-label')).toBe('已复制');
    await render('later');
    expect(buttons()[0]?.getAttribute('aria-label')).toBe('复制消息');
    await render('after');
    expect(buttons()[0]?.getAttribute('aria-label')).toBe('复制消息');
  });
});
