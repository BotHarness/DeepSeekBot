// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'android', select: (options: { android?: unknown }) => options.android },
}));
vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));
vi.mock('@expo/ui/jetpack-compose', () => {
  const node =
    (name: string) =>
    ({
      children,
      modifiers = [],
    }: {
      children?: ReactNode;
      modifiers?: { name: string; args: unknown[] }[];
    }) =>
      createElement(
        'div',
        {
          'data-node': name,
          'data-surface': modifiers.find((modifier) => modifier.name === 'background')?.args[0],
          'data-test-id': modifiers.find((modifier) => modifier.name === 'testID')?.args[0],
        },
        children,
      );
  return {
    Column: node('Column'),
    Row: node('Row'),
    Text: node('Text'),
    RNHostView: ({ children }: { children?: ReactNode }) => children ?? null,
    useMaterialColors: () => ({
      surfaceContainer: '#211f26',
      surfaceContainerHigh: '#2b2930',
      onSurface: '#e6e0e9',
      onSurfaceVariant: '#cac4d0',
    }),
  };
});
vi.mock('@expo/ui/jetpack-compose/modifiers', () => {
  const modifier =
    (name: string) =>
    (...args: unknown[]) => ({ name, args });
  return {
    Shapes: { RoundedCorner: (radius: unknown) => ({ radius }) },
    ...Object.fromEntries(
      [
        'background',
        'clickable',
        'clip',
        'defaultMinSize',
        'fillMaxWidth',
        'graphicsLayer',
        'padding',
        'paddingAll',
        'semantics',
        'selectable',
        'testID',
        'weight',
      ].map((name) => [name, modifier(name)]),
    ),
  };
});

import { MaterialMenuGroup } from '../src/ui/primitives/material-menu.android';

it('draws the menu header inside the menu surface, above the items', () => {
  const view = document.createElement('div');
  view.innerHTML = renderToStaticMarkup(
    <MaterialMenuGroup
      header="Investigate the flaky release build on the staging computer"
      items={[{ key: 'model', label: 'Model choice', icon: <span />, onPress() {} }]}
    />,
  );
  const surface = view.querySelector<HTMLElement>('[data-node="Column"][data-surface]')!;
  expect(surface.dataset['surface']).toBe('#211f26');
  const first = surface.firstElementChild as HTMLElement;
  expect(first.dataset['testId']).toBe('material-menu-header');
  expect(first.textContent).toBe('Investigate the flaky release build on the staging computer');
  expect(surface.textContent).toContain('Model choice');
});
