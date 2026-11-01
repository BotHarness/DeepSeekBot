// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PersonaBotAvatar } from '../src/client/avatar.js';

it('keeps a static state marker across rerenders and removes it at idle', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const frames = vi.fn();
  vi.stubGlobal('requestAnimationFrame', frames);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = async (state: 'thinking' | 'working' | 'idle', name = 'Ada') => {
    await act(async () =>
      root.render(
        createElement(PersonaBotAvatar, {
          personaBotId: 'ada',
          name,
          size: 32,
          state,
          attention: { approvalCount: 2 },
        }),
      ),
    );
  };
  try {
    await render('thinking');
    const marker = container.querySelector('.bh-avatar-indicator');
    expect(marker).not.toBeNull();
    await render('thinking', 'Renamed Ada');
    expect(container.querySelector('.bh-avatar-indicator')).toBe(marker);
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain(
      'Renamed Ada',
    );
    const figure = container.querySelector('.bh-avatar-media-composed img');
    const identity = figure?.getAttribute('src');
    await render('working', 'Renamed Ada');
    expect(container.querySelector('.bh-avatar-indicator')).toBe(marker);
    expect(container.querySelector('.bh-avatar-media-composed img')).toBe(figure);
    expect(figure?.getAttribute('src')).toBe(identity);
    expect(container.querySelector('.botui-dot-matrix')).toBeNull();
    await render('idle');
    expect(container.querySelector('.botui-dot-matrix')).toBeNull();
    expect(container.querySelector('.bh-avatar-indicator')).toBeNull();
    expect(container.querySelector('.bh-avatar-attention')?.textContent).toBe('2');
    expect(frames).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
  expect(container.children).toHaveLength(0);
});
