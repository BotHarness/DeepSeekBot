// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({
    layer: { raised: { fill: 'raised', pressed: 'raised-pressed', divider: 'raised-line' } },
  }),
}));
vi.mock('../src/ui/design/material-tokens', () => ({
  useMaterialRoles: () => ({
    surfaceContainerHigh: 'high',
    surfaceContainerHighest: 'highest',
    outlineVariant: 'outline',
  }),
}));

const { useSheetGroupFill } = await import('../src/ui/primitives/sheet-group-fill.android');
const { SystemSheet } = await import('../src/ui/primitives/system-sheet');
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('puts Android sheet groups on Material surfaceContainerHigh and keeps raised elsewhere', () => {
  const seen: unknown[] = [];
  function Probe() {
    seen.push(useSheetGroupFill('raised'));
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() =>
    root.render(
      createElement(
        'div',
        null,
        createElement(SystemSheet, { value: true }, createElement(Probe)),
        createElement(Probe),
      ),
    ),
  );
  expect(seen).toEqual([
    { fill: 'high', pressed: 'highest', divider: 'outline' },
    { fill: 'raised', pressed: 'raised-pressed', divider: 'raised-line' },
  ]);
  act(() => root.unmount());
});
