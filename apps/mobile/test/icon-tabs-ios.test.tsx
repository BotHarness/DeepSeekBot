// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityLabel: () => ({}),
  pickerStyle: () => ({}),
  tag: () => ({}),
}));
vi.mock('@expo/ui/swift-ui', () => ({
  Host: ({ children }: { children: ReactNode }) => children,
  Image: () => null,
  Picker: ({ onSelectionChange }: { onSelectionChange(value: string): void }) => (
    <button
      onClick={() => {
        onSelectionChange('settings');
        onSelectionChange('work');
      }}
    >
      Rapid return
    </button>
  ),
}));

import { IconTabs } from '../src/ui/primitives/icon-tabs.ios';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('forwards a return to the rendered value so the shared pager can keep the latest intent', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const onChange = vi.fn();
  try {
    act(() =>
      root.render(
        <IconTabs
          label="Profile"
          options={[
            { value: 'work', label: 'Work', symbol: 'briefcase', path: '', glyph: () => null },
            {
              value: 'settings',
              label: 'Settings',
              symbol: 'gearshape',
              path: '',
              glyph: () => null,
            },
          ]}
          value="work"
          onChange={onChange}
        />,
      ),
    );
    act(() => container.querySelector('button')?.click());
    expect(onChange.mock.calls.map(([value]) => value)).toEqual(['settings', 'work']);
  } finally {
    act(() => root.unmount());
  }
});
