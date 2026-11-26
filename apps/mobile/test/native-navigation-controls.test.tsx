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
import { NavigationAction } from '../src/ui/shell/navigation-action.ios';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('keeps distinct create and close navigation actions', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const create = vi.fn(),
    close = vi.fn();
  try {
    await act(async () =>
      root.render(
        <>
          <NavigationAction size={64} label="Create" onPress={create} />
          <NavigationAction size={64} label="Close" close onPress={close} />
        </>,
      ),
    );
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button[aria-label]')];
    await act(async () => {
      buttons[0]!.click();
      buttons[1]!.click();
    });
    expect(create).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
