// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsDialog } from '../src/client/ds/settings-dialog.js';

vi.mock('../src/client/modal.js', () => ({
  Modal: ({ children, className }: { children: ReactNode; className: string }) => (
    <div role="dialog" className={className}>
      {children}
    </div>
  ),
}));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null,
  Modal: () => null,
  Menu: ({ anchor }: { anchor: ReactNode }) => anchor,
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
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = vi.fn();
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
function render() {
  act(() =>
    root.render(
      <SettingsDialog
        title="Settings"
        sections={[{ id: 'general', label: 'General' }]}
        activeId="general"
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
  const input = host.querySelector('input')!;
  input.value = 'unsaved';
  input.focus();
  expect(host.querySelector('nav')).not.toBeNull();
  act(() => {
    width = 293;
    resize();
  });
  expect(host.querySelector('nav')).toBeNull();
  expect(host.querySelector('[aria-label="Choose General"]')).not.toBeNull();
  expect(host.querySelector('input')).toBe(input);
  expect(input.value).toBe('unsaved');
  expect(document.activeElement).toBe(input);
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="Choose General"]')!.click());
  expect(host.querySelector('[data-pointer-menu]')).not.toBeNull();
  act(() => {
    width = 1261;
    resize();
  });
  expect(host.querySelector('nav')).not.toBeNull();
  expect(host.querySelector('input')).toBe(input);
  expect(host.querySelector('[data-pointer-menu]')).toBeNull();
  act(() => {
    width = 293;
    resize();
  });
  expect(host.querySelector('[data-pointer-menu]')).toBeNull();
});
it('includes the exact compact boundary and disposes its layout observer', () => {
  width = 648;
  render();
  expect(host.querySelector('nav')).toBeNull();
  act(() => {
    width = 649;
    resize();
  });
  expect(host.querySelector('nav')).not.toBeNull();
  act(() => root.render(null));
  expect(disconnect).toHaveBeenCalledTimes(1);
});
