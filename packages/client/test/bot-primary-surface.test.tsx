// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  paintBotName,
  refreshBotPrimaryColors,
  useConversationSurface,
} from '../src/client/bot-primary-color.js';

it('reads each conversation surface independently and refreshes after appearance changes', async () => {
  function Surface({ background }: { background: string }) {
    const surface = useConversationSurface();
    return createElement(
      'div',
      { style: { backgroundColor: background } },
      createElement('span', { ref: surface.probe }, surface.background),
    );
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        createElement(
          'section',
          null,
          createElement(Surface, { background: '#ffffff' }),
          createElement(Surface, { background: '#151517' }),
        ),
      ),
    );
    expect([...host.querySelectorAll('span')].map((node) => node.textContent)).toEqual([
      '#ffffff',
      '#151517',
    ]);
    await act(async () => {
      host.querySelector('div')!.style.backgroundColor = '#f8f5fc';
      refreshBotPrimaryColors();
    });
    expect([...host.querySelectorAll('span')].map((node) => node.textContent)).toEqual([
      '#f8f5fc',
      '#151517',
    ]);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it('reads the surface once per theme instead of on every render', async () => {
  function Name({ tick }: { tick: number }) {
    const surface = useConversationSurface();
    return createElement(
      'div',
      { style: { backgroundColor: '#ffffff' } },
      createElement('span', { ref: surface.probe }, surface.background),
      createElement(
        'b',
        { ref: (element: HTMLElement | null) => paintBotName(element, '#9aa3ad') },
        tick,
      ),
    );
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const computed = vi.spyOn(window, 'getComputedStyle');
  try {
    await act(async () => root.render(createElement(Name, { tick: 0 })));
    const name = host.querySelector('b')!;
    const firstColor = name.dataset['botNameColor'];
    expect(host.querySelector('span')!.textContent).toBe('#ffffff');
    computed.mockClear();
    for (let tick = 1; tick <= 20; tick += 1)
      await act(async () => root.render(createElement(Name, { tick })));
    expect(computed).not.toHaveBeenCalled();
    expect(name.dataset['botNameColor']).toBe(firstColor);

    await act(async () => {
      host.querySelector('div')!.style.backgroundColor = '#151517';
      const style = document.createElement('style');
      style.textContent = '.theme-changed {}';
      document.head.append(style);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(computed).toHaveBeenCalled();
    expect(host.querySelector('span')!.textContent).toBe('#151517');
    expect(name.dataset['botNameColor']).not.toBe(firstColor);
  } finally {
    computed.mockRestore();
    act(() => root.unmount());
    host.remove();
  }
});

it('recomputes when the workspace material scope changes', async () => {
  function Surface() {
    const surface = useConversationSurface();
    return createElement('span', { ref: surface.probe }, surface.background);
  }
  const mount = document.createElement('div');
  mount.style.backgroundColor = '#f8f5fc';
  const host = document.createElement('div');
  mount.append(host);
  document.body.append(mount);
  document.body.style.backgroundColor = '#211d2b';
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(Surface)));
    expect(host.textContent).toBe('#f8f5fc');
    await act(async () => {
      mount.style.backgroundColor = 'transparent';
      mount.setAttribute('data-wallpaper-active', '');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host.textContent).toBe('#211d2b');
  } finally {
    document.body.style.removeProperty('background-color');
    act(() => root.unmount());
    mount.remove();
  }
});
