// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityLabel: (label: string) => ({ label }),
  accessibilityElement: () => ({}),
  buttonStyle: () => ({}),
  fixedSize: () => ({}),
  font: () => ({}),
  frame: () => ({}),
  pickerStyle: () => ({}),
  tag: (value: string) => ({ value }),
}));
vi.mock('@expo/ui/swift-ui', () => ({
  Host: ({ children }: { children: ReactNode }) => children,
  HStack: ({ children }: { children: ReactNode }) => children,
  Image: () => null,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Menu: ({
    label,
    children,
    modifiers,
  }: {
    label: ReactNode;
    children: ReactNode;
    modifiers: { label?: string }[];
  }) => (
    <div aria-label={modifiers.find((modifier) => modifier.label)?.label}>
      {label}
      {children}
    </div>
  ),
  Picker: ({ onSelectionChange }: { onSelectionChange(value: string): void }) => (
    <button onClick={() => onSelectionChange('b')}>Choose second computer</button>
  ),
}));
import { EnvironmentPicker } from '../src/ui/primitives/environment-picker.ios';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('exposes the full selected computer as the native menu label and preserves selection on label changes', () => {
  const element = document.createElement('div');
  const root = createRoot(element);
  const change = vi.fn();
  const render = (name: string) =>
    act(() =>
      root.render(
        <EnvironmentPicker
          label="Computer"
          placeholder="Choose"
          value="a"
          options={[
            { value: 'a', label: name },
            { value: 'b', label: 'Second computer' },
          ]}
          onChange={change}
        />,
      ),
    );
  try {
    render('A computer name that needs several lines');
    expect(
      element.querySelector('[aria-label="Computer, A computer name that needs several lines"]'),
    ).not.toBeNull();
    expect(change).not.toHaveBeenCalled();
    render('Renamed computer');
    expect(element.querySelector('[aria-label="Computer, Renamed computer"]')).not.toBeNull();
    expect(change).not.toHaveBeenCalled();
    act(() => element.querySelector('button')!.click());
    expect(change).toHaveBeenCalledExactlyOnceWith('b');
  } finally {
    act(() => root.unmount());
  }
});
