// @vitest-environment jsdom
import { act, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const layer = vi.hoisted(() => ({
  calls: [] as { element: HTMLElement | null; open: boolean; onClose: () => void }[],
}));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  useModalLayer: (element: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) => {
    layer.calls.push({ element: element.current, open, onClose });
  },
}));

import { Button } from '../src/client/ds/button.js';
import { Dialog } from '../src/client/ds/dialog.js';
import { trackDialogInput } from '../src/client/ds/dialog-input.js';
import { FormDialog } from '../src/client/ds/form-dialog.js';
import { PanelDialog } from '../src/client/ds/panel-dialog.js';

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
  const viewport = document.querySelector('[data-tobs-dialog-viewport]');
  expect(viewport?.classList.contains('bh-appearance-scope')).toBe(true);
  expect(viewport?.contains(document.querySelector('[data-tobs-dialog-scrim]'))).toBe(true);
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

it('opens the PanelDialog without the pointer fade after keyboard input', () => {
  const untrack = trackDialogInput(document);
  const renderPanel = () => {
    act(() =>
      root.render(<PanelDialog title="Channel details" closeLabel="Close" onClose={vi.fn()} />),
    );
    return ['[role="dialog"]', '[data-tobs-dialog-scrim]'].map(
      (selector) => document.querySelector(selector)?.className,
    );
  };
  try {
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    const pointer = renderPanel();
    act(() => root.render(null));

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const keyboard = renderPanel();

    expect(keyboard.every((classes, index) => classes !== pointer[index])).toBe(true);
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(renderPanel()).toEqual(keyboard);
  } finally {
    untrack();
  }
});

it('renders exactly one primary action in the standard form dialog', () => {
  act(() =>
    root.render(
      <>
        <div data-reference-actions>
          <Button variant="primary">Primary sample</Button>
          <Button variant="outline">Outline sample</Button>
        </div>
        <FormDialog
          title="Connection"
          inline
          labels={{ cancel: 'Cancel', close: 'Close' }}
          submitLabel="Save"
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          secondary={<Button variant="outline">Reset</Button>}
        >
          <label>
            Server <input name="server" />
          </label>
        </FormDialog>
      </>,
    ),
  );
  const reference = host.querySelectorAll('[data-reference-actions] button');
  expect(reference).toHaveLength(2);
  const primaryOnly = [...reference.item(0).classList].filter(
    (name) => !reference.item(1).classList.contains(name),
  );
  expect(primaryOnly.length).toBeGreaterThan(0);
  const actions = [...host.querySelectorAll('section[aria-label="Connection"] button')];
  expect(actions.map((button) => button.textContent)).toEqual(['Reset', 'Cancel', 'Save']);
  expect(
    actions
      .filter((button) => primaryOnly.every((name) => button.classList.contains(name)))
      .map((button) => button.textContent),
  ).toEqual(['Save']);
});
