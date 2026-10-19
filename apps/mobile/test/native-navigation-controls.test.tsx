// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'ios', Version: 26 },
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityLabel: (label: string) => ({ $type: 'accessibilityLabel', label }),
  accessibilityElement: () => ({}),
  accessibilityAddTraits: (traits: string[]) => ({ $type: 'accessibilityAddTraits', traits }),
  onLongPressGesture: (onLongPress: () => void) => ({ $type: 'onLongPressGesture', onLongPress }),
  buttonStyle: () => ({}),
  buttonBorderShape: () => ({}),
  font: () => ({}),
  lineLimit: () => ({}),
  minimumScaleFactor: () => ({}),
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
    Text: container,
    Image: ({ systemName }: { systemName: string }) => createElement('i', { title: systemName }),
    Button: ({
      onPress,
      children,
      modifiers,
    }: {
      onPress(): void;
      children: ReactNode;
      modifiers: { $type: string; label?: string; traits?: string[]; onLongPress?: () => void }[];
    }) =>
      createElement(
        'button',
        {
          onClick: onPress,
          onContextMenu: modifiers.find((m) => m.$type === 'onLongPressGesture')?.onLongPress,
          'aria-label': modifiers.find((m) => m.$type === 'accessibilityLabel')?.label,
          'aria-pressed': modifiers.some(
            (m) => m.$type === 'accessibilityAddTraits' && m.traits?.includes('isSelected'),
          ),
        },
        children,
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
  const longPress = vi.fn();
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
                onLongPress: longPress,
              },
              {
                key: 'activity',
                focused: false,
                activity: true,
                count: 4,
                onPress: activity,
                onLongPress: longPress,
              },
            ]}
          />
          <NavigationAction size={64} label="Create" onPress={create} />
          <NavigationAction size={64} label="Close" close onPress={close} />
        </>,
      ),
    );
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]!.getAttribute('aria-label')).toContain('4');
    expect(buttons[1]!.querySelector('i')).toBeNull();
    expect(buttons[1]!.textContent).toContain('4');
    expect(buttons[0]!.querySelector('i')?.title).toBe('bubble.left.and.bubble.right.fill');
    await act(async () => {
      buttons[0]!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      buttons[1]!.click();
      buttons[2]!.click();
      buttons[3]!.click();
    });
    expect(activity).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(chats).not.toHaveBeenCalled();
    expect(longPress).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
