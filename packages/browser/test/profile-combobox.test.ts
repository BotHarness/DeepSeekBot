// @vitest-environment jsdom
import { type Root } from 'react-dom/client';
import { type BrowserTranslate } from '../src/client/locale.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement, forwardRef } = await import('react');
  return {
    MenuSurface: forwardRef<
      HTMLDivElement,
      import('react').HTMLAttributes<HTMLDivElement> & { compact?: boolean }
    >(({ compact: _compact, ...props }, ref) => createElement('div', { ...props, ref })),
    useAnchoredPosition: () => ({ top: 0, left: 0 }),
    useDismissOnOutsidePointer: () => undefined,
  };
});

import { ProfileCombobox } from '../src/client/profile-combobox.js';
import { en } from '../src/client/locale.js';

const t: BrowserTranslate = (key, params) => en[key].replace('{name}', String(params?.name ?? ''));
let host: HTMLDivElement;
let root: Root;
let input: HTMLInputElement;
const select = vi.fn();

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  select.mockClear();
  await act(async () =>
    root.render(
      createElement(ProfileCombobox, {
        value: 'work.v2',
        profiles: ['work.v2', 'team'],
        disabled: false,
        invalid: false,
        errorId: 'profile-error',
        onSelect: select,
        t,
      }),
    ),
  );
  input = host.querySelector('input')!;
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function type(value: string): Promise<void> {
  await act(async () => input.focus());
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function key(value: string, composing = false): Promise<void> {
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: value,
        bubbles: true,
        isComposing: composing,
      }),
    ),
  );
}
function option(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (button) => button.textContent === text,
  );
}

describe('Browser Profile combobox', () => {
  it('selects a typed existing name without offering creation', async () => {
    await type('team');
    expect(option('team')).toBeDefined();
    expect(document.querySelector('[role="listbox"]')?.textContent).not.toContain('Create');
    await key('Enter');
    expect(select).toHaveBeenCalledExactlyOnceWith('team');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('creates only through explicit selection and never saves on blur or Escape', async () => {
    await type('new.work');
    expect(option('Create “new.work”')).toBeDefined();
    await act(async () => input.blur());
    expect(select).not.toHaveBeenCalled();
    expect(input.value).toBe('work.v2');
    await type('new.work');
    await key('Escape');
    expect(select).not.toHaveBeenCalled();
    expect(input.value).toBe('work.v2');
    await type('new.work');
    await act(async () => option('Create “new.work”')!.click());
    expect(select).toHaveBeenCalledExactlyOnceWith('new.work');
  });

  it('supports keyboard option selection, default and composing Enter', async () => {
    await act(async () => input.focus());
    await key('ArrowDown');
    expect(document.getElementById(input.getAttribute('aria-activedescendant')!)?.textContent).toBe(
      'default',
    );
    await key('Enter', true);
    expect(select).not.toHaveBeenCalled();
    await key('Enter');
    expect(select).toHaveBeenCalledExactlyOnceWith('default');
    select.mockClear();
    await type('');
    await key('Enter');
    expect(select).toHaveBeenCalledExactlyOnceWith('default');
  });

  it('keeps a new exact name available when other names match its prefix', async () => {
    await type('work');
    expect(option('work.v2')).toBeDefined();
    expect(option('Create “work”')).toBeDefined();
    await key('Enter');
    expect(select).toHaveBeenCalledExactlyOnceWith('work');
  });
});
