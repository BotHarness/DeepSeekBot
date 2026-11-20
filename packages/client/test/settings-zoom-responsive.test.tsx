// @vitest-environment jsdom
import { type ReactNode } from 'react';
import { type Root } from 'react-dom/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getWindowClass } from '../src/client/ds/window-class.js';
import { SettingsDialog } from '../src/client/ds/settings-dialog.js';

vi.mock('../src/client/ds/dialog.js', () => ({
  Dialog: ({ children, className }: { children: ReactNode; className: string }) => (
    <div role="dialog" className={className}>
      {children}
    </div>
  ),
}));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));
let host: HTMLDivElement;
let root: Root;
let resize: () => void;
let width = 1261;
const disconnect = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: () => void) {}
      observe(node: Element) {
        if (node === document.body) resize = this.callback;
      }
      disconnect = disconnect;
    },
  );
  width = 1261;
  vi.spyOn(document.body, 'clientWidth', 'get').mockImplementation(() => width);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  disconnect.mockClear();
});
function render(pageNavigation = false) {
  act(() =>
    root.render(
      <SettingsDialog
        title="Settings"
        sections={[{ id: 'general', label: 'General' }]}
        activeId="general"
        {...(pageNavigation
          ? {
              compactNavigation: {
                backLabel: 'Back',
                showList: false,
                onBack: () => {},
                onExpand: () => {},
              },
            }
          : {})}
        onSelect={() => {}}
        onClose={() => {}}
        labels={{ nav: 'Sections', close: 'Close', picker: (label) => `Choose ${label}` }}
      >
        <input aria-label="Draft" defaultValue="keep draft" />
      </SettingsDialog>,
    ),
  );
}
it('uses local layout width after zoom and retains the mounted editor while changing navigation', () => {
  render();
  const input = document.body.querySelector('input')!;
  input.value = 'unsaved';
  input.focus();
  expect(document.body.querySelector('nav')).not.toBeNull();
  act(() => {
    width = 293;
    resize();
  });
  expect(document.body.querySelector('nav')).toBeNull();
  expect(document.body.querySelector('[aria-label="Choose General"]')).not.toBeNull();
  expect(document.body.querySelector('input')).toBe(input);
  expect(input.value).toBe('unsaved');
  expect(document.activeElement).toBe(input);
  act(() =>
    document.body.querySelector<HTMLButtonElement>('[aria-label="Choose General"]')!.click(),
  );
  expect(document.body.querySelector('[data-pointer-menu]')).not.toBeNull();
  act(() => {
    width = 1261;
    resize();
  });
  expect(document.body.querySelector('nav')).not.toBeNull();
  expect(document.body.querySelector('input')).toBe(input);
  expect(document.body.querySelector('[data-pointer-menu]')).toBeNull();
  act(() => {
    width = 293;
    resize();
  });
  expect(document.body.querySelector('[data-pointer-menu]')).toBeNull();
});
it('retains the Channel settings picker boundary and disposes its layout observer', () => {
  width = 648;
  render();
  expect(document.body.querySelector('nav')).toBeNull();
  act(() => {
    width = 649;
    resize();
  });
  expect(document.body.querySelector('nav')).not.toBeNull();
  act(() => root.render(null));
  expect(disconnect).toHaveBeenCalledTimes(1);
});

it('uses the generated Tobs window class boundaries', () => {
  width = 599;
  expect(getWindowClass()).toBe('compact');
  width = 600;
  expect(getWindowClass()).toBe('medium');
  width = 839;
  expect(getWindowClass()).toBe('medium');
  width = 840;
  expect(getWindowClass()).toBe('expanded');
});

it('keeps the active settings editor mounted when the Bot settings window becomes compact', () => {
  width = 600;
  render(true);
  const input = document.body.querySelector('input')!;
  input.value = 'unsaved';
  input.focus();
  expect(document.body.querySelector('nav')).not.toBeNull();
  act(() => {
    width = 599;
    resize();
  });
  expect(document.body.querySelector('nav')).toBeNull();
  expect(document.body.querySelector('[aria-label="Back"]')).not.toBeNull();
  expect(document.body.querySelector('input')).toBe(input);
  expect(input.value).toBe('unsaved');
  expect(document.activeElement).toBe(input);
});
