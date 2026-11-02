// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ glass: true, effects: [] as unknown[] }));
vi.mock('react-native', async () => import('./react-native-shim'));
vi.mock('../src/ui/primitives/drawer-material', () => ({ useLiquidGlass: () => native.glass }));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  foregroundStyle: () => ({}),
  disabled: (disabled: boolean) => ({ disabled }),
  opacity: (opacity: number) => ({ opacity }),
  accessibilityLabel: (label: string) => ({ label }),
  buttonStyle: (style: string) => ({ buttonStyle: style }),
  buttonBorderShape: () => ({}),
  contentShape: () => ({}),
  background: () => ({}),
  frame: () => ({}),
  shapes: { circle: () => ({}), rectangle: () => ({}) },
  accessibilityHidden: () => ({}),
  glassEffect: (params: unknown) => {
    native.effects.push(params);
    return {};
  },
}));
vi.mock('@expo/ui', () => ({
  Host: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
vi.mock('@expo/ui/swift-ui', () => ({
  Button: ({
    children,
    onPress,
    testID,
    modifiers,
  }: {
    children: ReactNode;
    onPress(): void;
    testID?: string;
    modifiers: Array<{
      label?: string;
      buttonStyle?: string;
      disabled?: boolean;
      opacity?: number;
    }>;
  }) =>
    createElement(
      'button',
      {
        'aria-label': modifiers.find((m) => m.label)?.label,
        'data-testid': testID,
        'data-button-style': modifiers.find((m) => m.buttonStyle)?.buttonStyle,
        disabled: modifiers.some((m) => m.disabled),
        'data-opacity': modifiers.find((m) => m.opacity !== undefined)?.opacity,
        onClick: onPress,
      },
      children,
    ),
  Image: ({ systemName }: { systemName: string }) =>
    createElement('span', { 'data-symbol': systemName }),
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
      <ComposerCircleButton
        label="Attach"
        symbol="plus"
        embedded
        size={44}
        onPress={() => undefined}
      >
        +
      </ComposerCircleButton>
      <ComposerFieldMaterial cornerRadius={22} />
    </>
  );
}

const surfaceTint = expect.stringMatching(/^#[0-9a-f]{6}$/iu);

it('keeps the embedded attachment control on the field’s single Liquid Glass surface', async () => {
  await act(async () => root.render(<Bar />));
  const button = container.querySelector('button[aria-label="Attach"]')!;
  expect(button.querySelector('[data-material="circle"]')).toBeNull();
  expect(container.querySelector('[data-material="rounded-22"]')).not.toBeNull();
  expect(native.effects).toEqual([
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

const { ComposerActionButton } = await import('../src/ui/chat/composer-action.ios');

it('dispatches a native Send action once with its accessible label and stable identifier', async () => {
  const send = vi.fn();
  await act(async () =>
    root.render(
      <ComposerActionButton
        symbol="arrow.up"
        label="Send"
        testID="composer-send"
        filled
        onPress={send}
      >
        fallback
      </ComposerActionButton>,
    ),
  );
  const button = container.querySelector<HTMLButtonElement>('[data-testid="composer-send"]')!;
  expect(button.getAttribute('aria-label')).toBe('Send');
  expect(button.dataset.buttonStyle).toBe('plain');
  expect(button.querySelector('[data-symbol="arrow.up"]')).not.toBeNull();
  await act(async () => button.click());
  expect(send).toHaveBeenCalledOnce();
});

it.each([true, false])('keeps the return action native with glass available=%s', async (glass) => {
  native.glass = glass;
  const jump = vi.fn();
  await act(async () =>
    root.render(
      <ComposerCircleButton
        symbol="chevron.down"
        label="Return to latest messages"
        size={48}
        onPress={jump}
      >
        fallback
      </ComposerCircleButton>,
    ),
  );
  const button = container.querySelector<HTMLButtonElement>('button')!;
  expect(button.dataset.buttonStyle).toBe(glass ? 'glass' : 'plain');
  await act(async () => button.click());
  expect(jump).toHaveBeenCalledOnce();
});

it('retains native Send disabled and dimmed until availability returns', async () => {
  const send = vi.fn();
  const render = (disabled: boolean) =>
    root.render(
      <ComposerActionButton
        symbol="arrow.up"
        label="Send"
        testID="composer-send"
        filled
        disabled={disabled}
        onPress={send}
      >
        fallback
      </ComposerActionButton>,
    );
  await act(async () => render(true));
  const button = container.querySelector<HTMLButtonElement>('[data-testid="composer-send"]')!;
  expect(button.disabled).toBe(true);
  expect(button.dataset.opacity).toBe('0.4');
  expect(button.querySelector('[data-symbol="arrow.up"]')).not.toBeNull();
  await act(async () => button.click());
  expect(send).not.toHaveBeenCalled();
  await act(async () => render(false));
  expect(container.querySelector('[data-testid="composer-send"]')).toBe(button);
  expect(button.disabled).toBe(false);
  expect(button.dataset.opacity).toBe('1');
  await act(async () => button.click());
  expect(send).toHaveBeenCalledOnce();
});
