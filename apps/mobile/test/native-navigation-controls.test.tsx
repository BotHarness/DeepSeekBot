// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'ios', Version: 26 },
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityLabel: (label: string) => ({ $type: 'accessibilityLabel', label }),
  accessibilityElement: () => ({}),
  accessibilityHidden: () => ({}),
  accessibilityAddTraits: (traits: string[]) => ({ $type: 'accessibilityAddTraits', traits }),
  tint: () => ({}),
  buttonStyle: () => ({}),
  background: () => ({}),
  buttonBorderShape: () => ({}),
  glassEffect: () => ({}),
  padding: () => ({}),
  shapes: { capsule: () => ({}) },
  font: () => ({}),
  lineLimit: () => ({}),
  dynamicTypeSize: () => ({}),
  foregroundStyle: () => ({}),
  frame: () => ({}),
  monospacedDigit: () => ({}),
}));
vi.mock('@expo/ui/swift-ui', () => {
  const container = ({ children }: { children: ReactNode }) => createElement('div', null, children);
  return {
    Host: container,
    HStack: container,
    VStack: container,
    Section: ({ children }: { children: ReactNode }) => createElement('section', null, children),
    Text: ({ children, testID }: { children: ReactNode; testID?: string }) =>
      createElement('span', { 'data-testid': testID }, children),
    ContextMenu: Object.assign(
      ({ children }: { children: ReactNode }) =>
        createElement('div', { 'data-context-menu': true }, children),
      {
        Trigger: container,
        Items: ({ children }: { children: ReactNode }) => createElement('menu', null, children),
      },
    ),
    Image: ({ systemName }: { systemName: string }) => createElement('i', { title: systemName }),
    Button: ({
      onPress,
      children,
      label,
      modifiers = [],
    }: {
      onPress(): void;
      children?: ReactNode;
      label?: string;
      modifiers?: { $type: string; label?: string; traits?: string[] }[];
    }) =>
      createElement(
        'button',
        {
          onClick: onPress,
          'aria-label': modifiers.find((m) => m.$type === 'accessibilityLabel')?.label,
          'aria-pressed': modifiers.some(
            (m) => m.$type === 'accessibilityAddTraits' && m.traits?.includes('isSelected'),
          ),
        },
        children ?? label,
      ),
  };
});
import { NavigationDestinations } from '../src/ui/shell/navigation-destinations.ios';
import { NavigationAction } from '../src/ui/shell/navigation-action.ios';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('native controls preserve selection, unread label and distinct navigation/create/close actions', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const recent = vi.fn();
  const newGroup = vi.fn();
  const chats = vi.fn(),
    activity = vi.fn(),
    create = vi.fn(),
    close = vi.fn();
  try {
    await act(async () =>
      root.render(
        <>
          <NavigationDestinations
            items={[
              {
                key: 'chats',
                focused: true,
                activity: false,
                count: 0,
                onPress: chats,
                menu: [
                  { key: 'design', label: 'Design', glyph: 'channel', run: recent },
                  { key: 'new-group', label: 'New Group', glyph: 'new', run: newGroup },
                ],
              },
              {
                key: 'activity',
                focused: false,
                activity: true,
                count: 4,
                onPress: activity,
              },
            ]}
          />
          <NavigationAction size={64} label="Create" onPress={create} />
          <NavigationAction size={64} label="Close" close onPress={close} />
        </>,
      ),
    );
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button[aria-label]')];
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]!.getAttribute('aria-label')).toContain('4');
    expect(buttons[1]!.querySelector('i')).toBeNull();
    expect(buttons[1]!.textContent).toContain('4');
    expect(buttons[0]!.querySelector('i')?.title).toBe('bubble.left.and.bubble.right.fill');
    const menus = host.querySelectorAll('[data-context-menu]');
    expect(menus).toHaveLength(1);
    expect(menus[0]!.contains(buttons[0]!)).toBe(true);
    expect(menus[0]!.contains(buttons[1]!)).toBe(false);
    const rows = [...menus[0]!.querySelectorAll('menu button')];
    expect(rows.map((row) => row.textContent)).toEqual(['Design', 'New Group']);
    expect(menus[0]!.querySelector('menu section')?.textContent).toBe('Design');
    await act(async () => {
      (rows[0] as HTMLButtonElement).click();
      (rows[1] as HTMLButtonElement).click();
      buttons[1]!.click();
      buttons[2]!.click();
      buttons[3]!.click();
    });
    expect(activity).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(chats).not.toHaveBeenCalled();
    expect(recent).toHaveBeenCalledOnce();
    expect(newGroup).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it('shows the native Settings gear and opens it without selecting a new tab', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const open = vi.fn();
  try {
    await act(async () =>
      root.render(
        <NavigationDestinations
          items={[
            {
              key: 'settings',
              focused: false,
              activity: false,
              settings: true,
              count: 0,
              onPress: open,
            },
          ]}
        />,
      ),
    );
    const button = host.querySelector('button')!;
    expect(button.querySelector('i')?.title).toBe('gearshape');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Settings');
    expect(button.textContent).toBe('');
    await act(async () => button.click());
    expect(open).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it('opens the optional Sessions tab from its own native icon and label', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const open = vi.fn();
  try {
    await act(async () =>
      root.render(
        <NavigationDestinations
          items={[
            {
              key: 'sessions',
              focused: false,
              activity: false,
              sessions: true,
              count: 0,
              onPress: open,
            },
          ]}
        />,
      ),
    );
    const tab = host.querySelector<HTMLButtonElement>('button[aria-label="Sessions"]');
    expect(tab?.querySelector('i')?.title).toBe('list.bullet.rectangle');
    await act(async () => tab?.click());
    expect(open).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
  }
});

it('shows icons only and keeps each spoken name on a plain tab button', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const selected: string[] = [];
  const item = (key: string, kind: { sessions?: boolean; settings?: boolean }) => ({
    key,
    focused: key === 'chats',
    activity: false,
    ...kind,
    count: 0,
    onPress: () => selected.push(key),
  });
  const items = [
    item('chats', {}),
    item('sessions', { sessions: true }),
    item('settings', { settings: true }),
  ];
  try {
    await act(async () => root.render(<NavigationDestinations items={items} />));
    expect(host.querySelectorAll('[data-testid="tab-label"]')).toHaveLength(0);
    expect(host.querySelector('[data-context-menu]')).toBeNull();
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('button[aria-label]')];
    expect(tabs.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Chats',
      'Sessions',
      'Settings',
    ]);
    expect(tabs.map((b) => b.textContent)).toEqual(['', '', '']);
    await act(async () => tabs[1]!.click());
    expect(selected).toEqual(['sessions']);
  } finally {
    act(() => root.unmount());
  }
});
