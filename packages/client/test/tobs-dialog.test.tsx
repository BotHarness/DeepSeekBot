// @vitest-environment jsdom
import { act, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const layer = vi.hoisted(() => ({
  calls: [] as { element: HTMLElement | null; open: boolean; onClose: () => void }[],
}));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  useModalLayer: (element: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) => {
    layer.calls.push({ element: element.current, open, onClose });
  },
}));

import { Dialog } from '../src/client/ds/dialog.js';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  layer.calls.length = 0;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(open: boolean, onClose = vi.fn()) {
  act(() =>
    root.render(
      <Dialog open={open} onClose={onClose} title="Settings" className="bh-test-dialog">
        <button type="button">Inside</button>
      </Dialog>,
    ),
  );
  return onClose;
}

it('renders a labelled modal popup inside the Appearance scope', () => {
  render(true);
  const popup = document.querySelector<HTMLElement>('[role="dialog"]');
  expect(popup?.getAttribute('aria-label')).toBe('Settings');
  expect(popup?.getAttribute('aria-modal')).toBe('true');
  expect(popup?.classList.contains('bh-appearance-scope')).toBe(true);
  expect(popup?.classList.contains('bh-test-dialog')).toBe(true);
  expect(popup?.textContent).toBe('Inside');
});

it('joins the shell layer stack only once the popup is mounted', () => {
  render(true);
  const popup = document.querySelector<HTMLElement>('[role="dialog"]');
  const last = layer.calls.at(-1);
  expect(last?.open).toBe(true);
  expect(last?.element).toBe(popup);
  expect(layer.calls.some((call) => call.open && call.element === null)).toBe(false);
});

it('closes from the scrim and nothing else outside the popup', () => {
  const onClose = render(true);
  act(() => {
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  });
  act(() => document.body.click());
  expect(onClose).not.toHaveBeenCalled();
  act(() => document.querySelector<HTMLElement>('[data-tobs-dialog-scrim]')?.click());
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('renders nothing while closed', () => {
  render(false);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(layer.calls.every((call) => !call.open)).toBe(true);
});
