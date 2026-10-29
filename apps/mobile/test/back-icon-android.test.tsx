// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native-svg', () => ({
  default: ({ children }: { children?: unknown }) => children,
  Circle: () => null,
  Path: ({ d }: { d: string }) => createElement('i', { 'data-d': d }),
}));
import { BackIcon as AndroidBack } from '../src/ui/shell/back-icon.android';
import { BackIcon as IosBack } from '../src/ui/shell/back-icon';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function pathOf(Icon: typeof AndroidBack) {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<Icon color="#000000" size={24} />));
  const d = host.querySelector('i')?.getAttribute('data-d');
  act(() => root.unmount());
  return d;
}

it('uses the Material arrow for Back on Android and the chevron on iOS', async () => {
  expect(await pathOf(AndroidBack)).toBe('M19 12H5m7 7-7-7 7-7');
  expect(await pathOf(IosBack)).toBe('m15 6-6 6 6 6');
});
