// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const frames = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'ios', Version: 26 },
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityLabel: () => ({}),
  accessibilityElement: () => ({}),
  accessibilityAddTraits: () => ({}),
  onLongPressGesture: () => ({}),
  buttonStyle: () => ({}),
  background: () => ({}),
  glassEffect: () => ({ $type: 'glassEffect' }),
  padding: () => ({}),
  shapes: { capsule: () => ({}) },
  font: () => ({}),
  lineLimit: () => ({}),
  dynamicTypeSize: () => ({}),
  accessibilityHidden: () => ({}),
  foregroundStyle: () => ({}),
  frame: (options: Record<string, unknown>) => ({ $type: 'frame', ...options }),
  monospacedDigit: () => ({}),
}));
vi.mock('@expo/ui/swift-ui', () => {
  const container = ({ children }: { children: ReactNode }) => createElement('div', null, children);
  return {
    Host: container,
    HStack: container,
    Text: container,
    Image: () => createElement('i'),
    Button: container,
    VStack: ({ children, modifiers }: { children: ReactNode; modifiers: { $type?: string }[] }) => {
      for (const modifier of modifiers) if (modifier.$type === 'frame') frames.push(modifier);
      return createElement('div', null, children);
    },
  };
});

import { NavigationDestinations } from '../src/ui/shell/navigation-destinations.ios';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('lets each tab label fill the bar height so the selected capsule keeps an even inset', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <NavigationDestinations
          items={[
            {
              key: 'chats',
              focused: true,
              activity: false,
              count: 0,
              onPress: () => {},
              onLongPress: () => {},
            },
          ]}
        />,
      ),
    );
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame.maxWidth).toBe(Number.POSITIVE_INFINITY);
      expect(frame.maxHeight).toBe(Number.POSITIVE_INFINITY);
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
