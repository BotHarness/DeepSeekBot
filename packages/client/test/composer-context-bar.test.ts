// @vitest-environment jsdom
import { act, createElement as h, createRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  ComposerContextBar,
  type ComposerFooterHandle,
} from '../src/client/composer-context-bar.js';
import {
  defaultFooterPreferences,
  saveFooterPreferences,
} from '../src/client/composer-footer-preferences.js';
import { zhTranslate as t } from '../src/client/locale.js';

vi.mock('../src/client/ds/panel-dialog.js', () => ({
  PanelDialog: ({
    children,
    title,
    actions,
    secondary,
    onClose,
  }: {
    children: ReactNode;
    title: string;
    actions: ReactNode;
    secondary: ReactNode;
    onClose(): void;
  }) =>
    h(
      'section',
      { role: 'dialog', 'aria-label': title },
      children,
      actions,
      secondary,
      h('button', { onClick: onClose }, 'close'),
    ),
}));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, size: _size, ...props }: { children: ReactNode; size: string }) =>
    h('button', props, children),
  Switch: ({
    checked,
    label,
    onChange,
  }: {
    checked: boolean;
    label: string;
    onChange(value: boolean): void;
  }) =>
    h('input', {
      type: 'checkbox',
      role: 'switch',
      'aria-label': label,
      checked,
      onChange: () => onChange(!checked),
    }),
}));
let host: HTMLDivElement;
let root: Root;
const handle = createRef<ComposerFooterHandle>();
const clicked = vi.fn();
function pointer(target: Element, type: string, props = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(
    event,
    { pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 10, clientY: 10 },
    props,
  );
  target.dispatchEvent(event);
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  clicked.mockClear();
  saveFooterPreferences(defaultFooterPreferences());
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      h(ComposerContextBar, {
        label: 'footer',
        t,
        settingsRef: handle,
        available: ['model'],
        children: h('button', { 'data-composer-chip': 'model', onClick: clicked }, 'model'),
      }),
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});
const button = () => host.querySelector<HTMLButtonElement>('[data-composer-chip]')!;
const dialog = () => host.querySelector('[role=dialog]');
it('opens settings after a hold, suppresses its click, and permits the next tap', async () => {
  await act(async () => pointer(button(), 'pointerdown'));
  await act(async () => vi.advanceTimersByTime(549));
  expect(dialog()).toBeNull();
  await act(async () => vi.advanceTimersByTime(1));
  expect(dialog()).not.toBeNull();
  await act(async () => {
    pointer(button(), 'pointerup');
    button().click();
  });
  expect(clicked).not.toHaveBeenCalled();
  await act(async () => {
    pointer(button(), 'pointerdown');
    pointer(button(), 'pointerup');
    button().click();
  });
  expect(clicked).toHaveBeenCalledOnce();
});
it.each(['pointerup', 'pointercancel', 'move', 'second-touch', 'blur'])(
  'cancels a hold on %s',
  async (cancel) => {
    await act(async () => {
      pointer(button(), 'pointerdown');
      if (cancel === 'move') pointer(button(), 'pointermove', { clientX: 25 });
      else if (cancel === 'second-touch')
        pointer(button(), 'pointerdown', { isPrimary: false, pointerId: 2 });
      else if (cancel === 'blur') window.dispatchEvent(new Event('blur'));
      else pointer(button(), cancel);
      vi.advanceTimersByTime(600);
    });
    expect(dialog()).toBeNull();
  },
);
it('keeps settings open while hiding the last item and can recover from the shortcut handle', async () => {
  await act(async () => handle.current!.open());
  await act(async () => host.querySelector<HTMLInputElement>('[role=switch]')!.click());
  expect(host.querySelector<HTMLElement>('[data-composer-context]')!.hidden).toBe(true);
  expect(dialog()).not.toBeNull();
  expect(JSON.parse(localStorage.getItem('botharness.composer-footer.v1')!).hidden).toContain(
    'model',
  );
  await act(async () =>
    [...host.querySelectorAll('button')].find((b) => b.textContent === 'close')!.click(),
  );
  expect(dialog()).toBeNull();
  await act(async () => handle.current!.open());
  await act(async () => host.querySelector<HTMLInputElement>('[role=switch]')!.click());
  expect(host.querySelector<HTMLElement>('[data-composer-context]')!.hidden).toBe(false);
});
it('cleans up a pending hold on unmount', async () => {
  const timers = vi.getTimerCount();
  await act(async () => pointer(button(), 'pointerdown'));
  expect(vi.getTimerCount()).toBe(timers + 1);
  await act(async () => root.render(null));
  expect(vi.getTimerCount()).toBe(timers);
});
it('retains desktop context-menu and keyboard access without turning a mouse hold into a long press', async () => {
  await act(async () => {
    pointer(button(), 'pointerdown', { pointerType: 'mouse' });
    vi.advanceTimersByTime(600);
  });
  expect(dialog()).toBeNull();
  await act(async () =>
    button().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
  );
  expect(dialog()).not.toBeNull();
});

it('collapses even when all items are hidden from keyboard arrangement mode', async () => {
  await act(async () => handle.current!.open());
  await act(async () =>
    [...host.querySelectorAll('button')].find((b) => b.textContent === t('footer.layout'))!.click(),
  );
  expect(host.querySelector('[data-footer-editing]')).not.toBeNull();
  await act(async () => handle.current!.open());
  await act(async () => host.querySelector<HTMLInputElement>('[role=switch]')!.click());
  expect(host.querySelector<HTMLElement>('[data-composer-context]')!.hidden).toBe(true);
});
