// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AutoCollapseMessages, MessageFold } from '../src/client/message-fold.js';
import { zhTranslate } from '../src/client/locale.js';

afterEach(() => vi.restoreAllMocks());

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('shows a long message in full by default', () => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(800);
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    act(() =>
      root.render(
        createElement(MessageFold, {
          messageId: 'long-default',
          enabled: true,
          t: zhTranslate,
          children: 'Long message',
        }),
      ),
    );
    expect(container.querySelector('[data-message-fold]')?.getAttribute('data-message-fold')).toBe(
      'open',
    );
    expect(container.querySelector('[data-message-fold-toggle]')).toBeNull();
  } finally {
    act(() => root.unmount());
  }
});

it('folds only when enabled, allows expansion and updates when the preference changes', () => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(800);
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = (value: boolean, eligible = true) =>
    act(() =>
      root.render(
        createElement(
          AutoCollapseMessages.Provider,
          { value },
          createElement(MessageFold, {
            messageId: 'long-opt-in',
            enabled: eligible,
            t: zhTranslate,
            children: 'Long message',
          }),
        ),
      ),
    );
  const state = () =>
    container.querySelector('[data-message-fold]')?.getAttribute('data-message-fold');
  try {
    render(false);
    expect(state()).toBe('open');
    render(true);
    expect(state()).toBe('folded');
    act(() => container.querySelector<HTMLButtonElement>('button')?.click());
    expect(state()).toBe('open');
    expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
    render(false);
    expect(state()).toBe('open');
    expect(container.querySelector('button')).toBeNull();
    render(true, false);
    expect(state()).toBe('open');
    expect(container.querySelector('button')).toBeNull();
  } finally {
    act(() => root.unmount());
  }
});
