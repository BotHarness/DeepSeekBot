// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  View: (props: {
    children?: ReactNode;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    importantForAccessibility?: string;
  }) =>
    createElement(
      'div',
      {
        role: props.accessibilityRole,
        'aria-label': props.accessibilityLabel,
        'aria-hidden': props.importantForAccessibility === 'no-hide-descendants',
      },
      props.children,
    ),
}));
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: ({ children }: { children: ReactNode }) => children,
  LoadingIndicator: () => createElement('i', { 'data-testid': 'native-loading' }),
}));
import { LoadingIndicator } from '../src/ui/primitives/loading-indicator.android';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('shows the Material 3 loading indicator as one labelled progress node', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<LoadingIndicator />));
  const node = host.querySelector('[role="progressbar"]');
  expect(node?.getAttribute('aria-label')).toBe(t.loading);
  expect(node?.querySelector('[aria-hidden="true"] [data-testid="native-loading"]')).not.toBeNull();
  await act(async () => root.render(<LoadingIndicator accessibilityLabel="Loading image" />));
  expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe(
    'Loading image',
  );
  act(() => root.unmount());
});
