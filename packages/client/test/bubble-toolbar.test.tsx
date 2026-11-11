// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { BubbleHoveredContext, BubbleToolbar } from '../src/client/bubble-toolbar.js';

it('mounts a bubble toolbar on hover, and every toolbar once Tab moves focus', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const toolbar = (hovered: boolean) =>
    createElement(
      BubbleHoveredContext.Provider,
      { value: hovered },
      createElement(BubbleToolbar, null, createElement('button', null, 'Reply')),
    );
  await act(async () => root.render(createElement('div', null, toolbar(false), toolbar(true))));
  expect(host.querySelectorAll('.bh-bubble-toolbar')).toHaveLength(1);

  const handled = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
  handled.preventDefault();
  await act(async () => window.dispatchEvent(handled));
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
  expect(host.querySelectorAll('.bh-bubble-toolbar')).toHaveLength(1);

  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' })));
  expect(host.querySelectorAll('.bh-bubble-toolbar button')).toHaveLength(2);
  await act(async () => root.unmount());
  host.remove();
});
