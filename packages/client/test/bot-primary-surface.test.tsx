// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import {
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
