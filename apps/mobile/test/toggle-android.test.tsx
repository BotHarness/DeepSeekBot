// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'android' },
  View: (props: {
    children?: ReactNode;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    accessibilityState?: { checked?: boolean; disabled?: boolean };
    importantForAccessibility?: string;
    onAccessibilityAction?(event: { nativeEvent: { actionName: string } }): void;
  }) =>
    createElement(
      'div',
      {
        role: props.accessibilityRole,
        'aria-label': props.accessibilityLabel,
        'aria-checked': props.accessibilityState?.checked,
        'aria-disabled': props.accessibilityState?.disabled,
        'aria-hidden': props.importantForAccessibility === 'no-hide-descendants',
        onDoubleClick: () =>
          props.onAccessibilityAction?.({ nativeEvent: { actionName: 'activate' } }),
      },
      props.children,
    ),
}));
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: ({ children }: { children: ReactNode }) => children,
  Switch: (props: { value: boolean; enabled: boolean; onCheckedChange(value: boolean): void }) =>
    createElement('button', {
      'data-testid': 'native-switch',
      disabled: !props.enabled,
      onClick: () => props.onCheckedChange(!props.value),
    }),
}));

import { Toggle } from '../src/ui/primitives/toggle.android';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

it('keeps one semantic switch and routes native touch and accessibility activation to the same owner', async () => {
  const changed = vi.fn();
  function Preference({ disabled = false }: { disabled?: boolean }) {
    const [value, setValue] = useState(false);
    return (
      <Toggle
        label="Memory updates"
        value={value}
        disabled={disabled}
        onChange={(next) => {
          changed(next);
          setValue(next);
        }}
      />
    );
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Preference />));
  const control = host.querySelector<HTMLElement>('[role="switch"][aria-label="Memory updates"]')!;
  expect(host.querySelectorAll('[role="switch"]')).toHaveLength(1);
  expect(control.getAttribute('aria-checked')).toBe('false');
  await act(async () =>
    host!.querySelector<HTMLButtonElement>('[data-testid="native-switch"]')!.click(),
  );
  expect(control.getAttribute('aria-checked')).toBe('true');
  expect(changed.mock.calls).toEqual([[true]]);
  await act(async () => control.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(control.getAttribute('aria-checked')).toBe('false');
  expect(changed.mock.calls).toEqual([[true], [false]]);
  await act(async () => root!.render(<Preference disabled />));
  expect(control.getAttribute('aria-disabled')).toBe('true');
  await act(async () => {
    control.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    host!.querySelector<HTMLButtonElement>('[data-testid="native-switch"]')!.click();
  });
  expect(changed.mock.calls).toEqual([[true], [false]]);
});
