// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Menu: ({ anchor }: { anchor: ReactNode }) => createElement('div', { role: 'menu' }, anchor),
}));
import { usePanelMenu } from '../src/client/panel-menu.js';

it('links the header context menu to its exact owned portal and releases it on close', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let close = () => {};
  function Header() {
    const menu = usePanelMenu({ items: [], onSelect() {} });
    close = () => menu.menu?.props.onClose();
    return createElement('header', menu.triggerProps, 'Messages', menu.menu);
  }
  try {
    act(() => root.render(createElement(Header)));
    const header = host.querySelector('header')!;
    act(() => header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })));
    const id = header.getAttribute('aria-controls')!;
    const popup = document.getElementById(id)!;
    expect(popup.hasAttribute('data-pointer-menu')).toBe(true);
    expect(popup.parentElement).toBe(document.body);
    expect(popup.querySelector('[role="menu"]')).not.toBeNull();
    act(close);
    expect(header.hasAttribute('aria-controls')).toBe(false);
    expect(document.getElementById(id)).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
