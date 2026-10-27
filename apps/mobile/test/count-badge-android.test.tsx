// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { createElement } = await import('react');
  return {
    ...(await import('./react-native-shim')),
    View: (props: { children?: ReactNode; importantForAccessibility?: string }) =>
      createElement(
        'div',
        { 'aria-hidden': props.importantForAccessibility === 'no-hide-descendants' },
        props.children,
      ),
  };
});
vi.mock('@expo/ui/jetpack-compose', async () => (await import('./compose-card-shim')).compose);
vi.mock('../src/ui/design/theme', async () => {
  const { theme } = await import('./compose-card-shim');
  return { useDesignTheme: () => theme };
});

import { CountBadge } from '../src/ui/primitives/count-badge.android';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it.each([
  ['needs-you', 3, '3', 'warning', 'fg'],
  ['unread', 100, '99+', 'role:primary', 'role:onPrimary'],
  ['muted', 12, '12', 'role:surfaceContainerHighest', 'role:onSurfaceVariant'],
] as const)(
  'draws a %s count as the Material 3 badge, hidden from TalkBack',
  async (tone, count, text, container, content) => {
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () =>
      root.render(<CountBadge count={count} tone={tone} label="2 waiting for you" />),
    );
    const badge = host.querySelector('[data-compose="Badge"]');
    expect(badge?.textContent).toBe(text);
    expect(badge?.getAttribute('data-containercolor') ?? undefined).toBe(container);
    expect(badge?.getAttribute('data-contentcolor') ?? undefined).toBe(content);
    expect(
      JSON.parse(host.querySelector('[data-compose="Host"]')!.getAttribute('data-matchcontents')!),
    ).toBe(true);
    expect(host.querySelector('[aria-hidden="true"] [data-compose="Badge"]')).not.toBeNull();
    expect(host.querySelector('[aria-label]')).toBeNull();
    act(() => root.unmount());
  },
);
