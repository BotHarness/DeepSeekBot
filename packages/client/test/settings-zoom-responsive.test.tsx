// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
  IconChevronDownOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null,
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
it('includes the exact compact boundary and disposes its layout observer', () => {
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
