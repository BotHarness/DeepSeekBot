// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('../src/ui/primitives/button', () => ({
  Button: ({ label, onPress }: { label: string; onPress(): void }) =>
    createElement('button', { onClick: onPress }, label),
}));
vi.mock('@expo/ui/jetpack-compose/modifiers', async () => ({
  ...(await import('./compose-menu-shim')).modifiers,
  combinedClickable: (handlers: { onClick?: () => void; onLongClick?: () => void }) => handlers,
  testID: () => ({}),
}));
vi.mock('@expo/ui/jetpack-compose', async () => {
  const base = (await import('./compose-menu-shim')).components;
  const pass = ({ children }: { children?: ReactNode }) => children ?? null;
  const ListItem = ({
    children,
    modifiers,
  }: {
    children: ReactNode;
    modifiers: { onClick?(): void; onLongClick?(): void }[];
  }) => {
    const action = modifiers.find((modifier) => modifier.onClick);
    return createElement(
      'button',
      { onClick: action?.onClick, onContextMenu: action?.onLongClick },
      children,
    );
  };
  return {
    ...base,
    ListItem: Object.assign(ListItem, {
      HeadlineContent: pass,
      SupportingContent: pass,
      LeadingContent: pass,
      TrailingContent: pass,
    }),
  };
});

import { DrawerListItem } from '../src/ui/primitives/drawer-list-item.android';
import { WorkspaceAddButton } from '../src/ui/shell/workspace-add.android';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function mount(content: ReactNode) {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(content));
  return { host, close: () => act(() => root.unmount()) };
}

describe('Android workspace controls', () => {
  it('selects an environment on tap and opens its actions on long press', () => {
    const select = vi.fn();
    const menu = vi.fn();
    const view = mount(
      <DrawerListItem
        label="Studio"
        selected
        accessibilityLabel="Studio, selected, Online, 3 unread"
        detail="Online · studio.local"
        onPress={select}
        onLongPress={menu}
      />,
    );
    const row = view.host.querySelector('button')!;
    expect(row.textContent).toContain('Online · studio.local');
    expect(view.host.querySelector('[aria-selected="true"]')?.getAttribute('aria-label')).toBe(
      'Studio, selected, Online, 3 unread',
    );
    act(() => row.click());
    expect(select).toHaveBeenCalledOnce();
    expect(menu).not.toHaveBeenCalled();
    act(() => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })));
    expect(menu).toHaveBeenCalledOnce();
    view.close();
  });

  it('blocks selection and long press while a workspace selection is busy', () => {
    const action = vi.fn();
    const view = mount(
      <DrawerListItem label="Cloud" disabled onPress={action} onLongPress={action} />,
    );
    act(() => {
      view.host.querySelector('button')!.click();
      view.host
        .querySelector('button')!
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    });
    expect(action).not.toHaveBeenCalled();
    view.close();
  });

  it('preserves the add action through the shared platform button', () => {
    const add = vi.fn();
    const view = mount(<WorkspaceAddButton label="Add computer" onPress={add} />);
    const button = view.host.querySelector('button')!;
    expect(button.textContent).toBe('Add computer');
    act(() => button.click());
    expect(add).toHaveBeenCalledOnce();
    view.close();
  });
});
