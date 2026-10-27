// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('@expo/ui', () => ({
  Host: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@expo/ui/jetpack-compose', () => {
  const button = ({ children }: { children: ReactNode }) => createElement('button', {}, children);
  return {
    Host: ({ children }: { children: ReactNode }) => children,
    IconButton: button,
    FilledIconButton: button,
    Icon: () => createElement('i', { 'data-testid': 'icon' }),
    RNHostView: ({ children }: { children: ReactNode }) =>
      createElement('section', { 'data-testid': 'rn-host' }, children),
    LoadingIndicator: ({ modifiers }: { modifiers?: { size?: number[] }[] }) =>
      createElement('i', {
        'data-testid': 'native-loading',
        'data-size': modifiers?.find((m) => m.size)?.size?.join('x'),
      }),
  };
});
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  defaultMinSize: () => ({}),
  semantics: () => ({}),
  testID: () => ({}),
  size: (width: number, height: number) => ({ size: [width, height] }),
}));
import { CreationConfirm } from '../src/ui/primitives/creation-confirm.android';
import { SheetSaveButton } from '../src/ui/primitives/sheet-save-button.android';
import { materialIconButton } from '../src/ui/design/tokens';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it.each([
  ['creation confirm', CreationConfirm],
  ['sheet save', SheetSaveButton],
])('keeps the %s busy indicator inside the icon button at icon size', async (_, Button) => {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(<Button testID="save" label="Save" busy disabled={false} onPress={() => {}} />),
  );
  const spinner = host.querySelector('button [data-testid="native-loading"]');
  const [width, height] = (spinner?.getAttribute('data-size') ?? '').split('x').map(Number);
  expect(width).toBe(height);
  expect(width).toBeLessThan(materialIconButton.container);
  expect(host.querySelector('[data-testid="rn-host"]')).toBeNull();
  await act(async () =>
    root.render(
      <Button testID="save" label="Save" busy={false} disabled={false} onPress={() => {}} />,
    ),
  );
  expect(host.querySelector('[data-testid="native-loading"]')).toBeNull();
  expect(host.querySelector('button [data-testid="icon"]')).not.toBeNull();
  act(() => root.unmount());
});
