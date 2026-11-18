import { createElement } from 'react';
import { vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

export function shellPrimitives() {
  return {
    useModalLayer: () => undefined,
    closeTopModal: () => undefined,
  };
}

export function comboboxPrimitives() {
  return {
    ...shellPrimitives(),
    useAnchoredPosition: () => ({ top: 0, left: 0 }),
    useDismissOnOutsidePointer: () => undefined,
  };
}

export function combobox(label: string, root: ParentNode = document): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>(
    `input[role="combobox"][aria-label="${label}"]`,
  );
  if (input === null) throw new Error(`No combobox labelled ${label}`);
  return input;
}

export function comboboxOption(value: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (option) => option.dataset.value === value,
  );
}

export async function openCombobox(label: string, root: ParentNode = document): Promise<void> {
  const input = combobox(label, root);
  await flushOverlayFrames();
  await act(async () => {
    input.focus();
    input.click();
  });
}

export async function chooseOption(
  label: string,
  value: string,
  root: ParentNode = document,
): Promise<void> {
  await openCombobox(label, root);
  const option = comboboxOption(value);
  if (option === undefined) throw new Error(`No option ${value} in ${label}`);
  await act(async () => option.click());
}

export function dialogPrimitives() {
  return {
    ...shellPrimitives(),
  };
}

export function dialog(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[role="dialog"]');
  if (found === null) throw new Error('No dialog');
  return found;
}

export function buttonNamed(name: string, root: ParentNode = document): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => (button.getAttribute('aria-label') ?? button.textContent?.trim()) === name,
  );
  if (found === undefined) throw new Error(`No button named ${name}`);
  return found;
}

export function fieldNamed(name: string, root: ParentNode = document): HTMLInputElement {
  const label = [...root.querySelectorAll<HTMLLabelElement>('label')].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  const input =
    label === undefined
      ? null
      : (label.querySelector('input') ?? document.getElementById(label.htmlFor));
  if (!(input instanceof HTMLInputElement)) throw new Error(`No field named ${name}`);
  return input;
}

export async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export function queryMenuItem(name: string | RegExp): HTMLElement | null {
  return (
    [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => {
      const copy = item.cloneNode(true);
      if (!(copy instanceof HTMLElement)) return false;
      copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
      const label = item.getAttribute('aria-label') ?? copy.textContent?.trim() ?? '';
      return typeof name === 'string' ? label === name : name.test(label);
    }) ?? null
  );
}

export function menuItem(name: string | RegExp): HTMLElement {
  const item = queryMenuItem(name);
  if (item === null) throw new Error(`No menu item named ${name}`);
  return item;
}

export async function openTooltip(element: HTMLElement): Promise<HTMLElement> {
  await flushOverlayFrames();
  await act(async () => {
    element.ownerDocument.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    );
    element.focus();
  });
  const popup = element.ownerDocument.querySelector<HTMLElement>('[role="tooltip"]');
  if (popup === null) throw new Error('No tooltip after keyboard focus');
  return popup;
}

export async function openSubmenu(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.focus();
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
}

export async function hoverTooltip(
  element: HTMLElement,
  advance: (ms: number) => Promise<unknown>,
  delayMs = 0,
): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    await advance(delayMs);
  });
}

export function renderOverlayMarkup(element: import('react').ReactNode): string {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  try {
    act(() => root.render(element));
    return document.body.innerHTML;
  } finally {
    act(() => root.unmount());
    host.remove();
  }
}

export async function flushOverlayFrames(): Promise<void> {
  await act(async () => {
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(16);
    else
      await new Promise<void>((resolve) => {
        let frame: number | undefined;
        const timeout = window.setTimeout(() => {
          if (frame !== undefined) window.cancelAnimationFrame(frame);
          resolve();
        }, 32);
        frame = window.requestAnimationFrame(() => {
          window.clearTimeout(timeout);
          resolve();
        });
      });
  });
}
