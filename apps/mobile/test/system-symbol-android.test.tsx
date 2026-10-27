// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const screen = vi.hoisted(() => ({ width: 411, height: 914, scale: 3, fontScale: 2 }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  useWindowDimensions: () => screen,
  Dimensions: {
    get: () => screen,
    addEventListener: (_event: string, _changed: () => void) => ({ remove() {} }),
  },
}));
vi.mock('expo-symbols', () => ({
  SymbolView: ({ size, style }: { size: number; style: { width: number; height: number } }) =>
    createElement('i', { 'data-glyph': size, 'data-box': `${style.width}x${style.height}` }),
}));

import { SystemSymbol } from '../src/ui/primitives/system-symbol.android';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

it('keeps an Android system symbol inside its box under large text', async () => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <SystemSymbol
        name={{ ios: 'desktopcomputer', android: 'computer' }}
        size={32}
        color="#000"
      />,
    ),
  );
  const symbol = host.querySelector('i')!;
  expect(Number(symbol.dataset['glyph']) * screen.fontScale).toBe(32);
  expect(symbol.dataset['box']).toBe('32x32');
});
