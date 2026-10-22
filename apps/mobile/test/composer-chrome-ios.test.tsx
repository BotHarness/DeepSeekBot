// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ glass: true, effects: [] as unknown[] }));
vi.mock('react-native', async () => import('./react-native-shim'));
vi.mock('../src/ui/primitives/drawer-material', () => ({ useLiquidGlass: () => native.glass }));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  foregroundStyle: () => ({}),
  accessibilityHidden: () => ({}),
  glassEffect: (params: unknown) => {
    native.effects.push(params);
    return {};
  },
}));
vi.mock('@expo/ui/swift-ui', () => ({
  Host: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  Circle: () => createElement('div', { 'data-material': 'circle' }),
  RoundedRectangle: ({ cornerRadius }: { cornerRadius: number }) =>
    createElement('div', { 'data-material': `rounded-${cornerRadius}` }),
}));
const { ComposerCircleButton, ComposerFieldMaterial } =
  await import('../src/ui/chat/composer-chrome.ios');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  native.glass = true;
  native.effects = [];
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => act(() => root.unmount()));

function Bar() {
  return (
    <>
      <ComposerCircleButton label="Attach" size={44} onPress={() => undefined}>
        +
      </ComposerCircleButton>
      <ComposerFieldMaterial cornerRadius={22} />
    </>
  );
}

const surfaceTint = expect.stringMatching(/^#[0-9a-f]{6}$/iu);

it('floats + and the field on separate Liquid Glass shapes on iOS 26', async () => {
  await act(async () => root.render(<Bar />));
  const button = container.querySelector('button[aria-label="Attach"]')!;
  expect(button.querySelector('[data-material="circle"]')).not.toBeNull();
  expect(container.querySelector('[data-material="rounded-22"]')).not.toBeNull();
  expect(native.effects).toEqual([
    { glass: { variant: 'regular', tint: surfaceTint }, shape: 'circle' },
    {
      glass: { variant: 'regular', tint: surfaceTint },
      shape: 'roundedRectangle',
      cornerRadius: 22,
    },
  ]);
});

it('keeps the same layout on opaque fills without glass', async () => {
  native.glass = false;
  await act(async () => root.render(<Bar />));
  expect(container.querySelector('button[aria-label="Attach"]')).not.toBeNull();
  expect(container.querySelector('[data-material]')).toBeNull();
  expect(native.effects).toEqual([]);
});
