// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

type Modifier = Record<string, unknown>;

const glass = vi.hoisted(() => ({ on: false }));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('../src/ui/primitives/drawer-material', () => ({ useLiquidGlass: () => glass.on }));
vi.mock('@expo/ui', () => ({
  Host: ({
    children,
    matchContents,
    colorScheme,
  }: {
    children: ReactNode;
    matchContents: unknown;
    colorScheme: string;
  }) =>
    createElement(
      'div',
      { 'data-host': JSON.stringify(matchContents), 'data-scheme': colorScheme },
      children,
    ),
}));
vi.mock('@expo/ui/swift-ui', () => ({
  Button: ({
    children,
    onPress,
    role,
    testID,
    modifiers,
  }: {
    children: ReactNode;
    onPress(): void;
    role: string;
    testID?: string;
    modifiers: Modifier[];
  }) => {
    const find = (key: string) => modifiers.find((modifier) => key in modifier)?.[key];
    return createElement(
      'button',
      {
        'data-testid': testID,
        'data-role': role,
        'data-style': find('buttonStyle'),
        'data-size': find('controlSize'),
        'data-tint': find('tint'),
        'aria-label': find('label'),
        'aria-valuetext': find('value'),
        disabled: find('disabled'),
        onClick: onPress,
      },
      children,
    );
  },
  HStack: ({ children, modifiers }: { children: ReactNode; modifiers: Modifier[] }) =>
    createElement(
      'span',
      {
        'data-min-height': (modifiers[0]!.frame as { minHeight: number }).minHeight,
        'data-max-width': String((modifiers[0]!.frame as { maxWidth: number }).maxWidth),
      },
      children,
    ),
  Image: ({ systemName, modifiers }: { systemName: string; modifiers: Modifier[] }) =>
    createElement('i', {
      'data-symbol': systemName,
      'aria-hidden': modifiers.some((modifier) => modifier.hidden) || undefined,
    }),
  ProgressView: () => createElement('progress'),
  Text: ({ children, modifiers }: { children: string; modifiers: Modifier[] }) =>
    createElement('span', { 'data-font': JSON.stringify(modifiers[0]!.font) }, children),
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityHidden: () => ({ hidden: true }),
  accessibilityLabel: (label: string) => ({ label }),
  accessibilityValue: (value: string) => ({ value }),
  buttonStyle: (buttonStyle: string) => ({ buttonStyle }),
  controlSize: (controlSize: string) => ({ controlSize }),
  disabled: (disabled: boolean) => ({ disabled }),
  font: (font: unknown) => ({ font }),
  frame: (frame: unknown) => ({ frame }),
  multilineTextAlignment: () => ({}),
  tint: (tint: string) => ({ tint }),
}));

import { Button, ACTION_SF_SYMBOL } from '../src/ui/primitives/button.ios';
import { DesignThemeProvider } from '../src/ui/design/theme';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  glass.on = false;
});

async function render(node: ReactNode, scheme: 'light' | 'dark' = 'light') {
  const host = document.createElement('div');
  root = createRoot(host);
  await act(async () =>
    root!.render(<DesignThemeProvider appearance={{ scheme }}>{node}</DesignThemeProvider>),
  );
  return host;
}

it.each([
  ['primary', 'filled', false, 'borderedProminent', 'default'],
  ['secondary', 'filled', false, 'bordered', 'default'],
  ['tonal', 'filled', false, 'bordered', 'default'],
  ['danger', 'filled', false, 'bordered', 'destructive'],
  ['primary', 'text', false, 'borderless', 'default'],
  ['danger', 'text', false, 'borderless', 'destructive'],
  ['primary', 'filled', true, 'glassProminent', 'default'],
  ['secondary', 'filled', true, 'glass', 'default'],
  ['tonal', 'filled', true, 'glass', 'default'],
  ['danger', 'filled', true, 'glass', 'destructive'],
  ['secondary', 'text', true, 'borderless', 'default'],
] as const)(
  'renders %s %s (Liquid Glass %s) as the SwiftUI %s style with the %s role',
  async (tone, variant, liquid, style, role) => {
    glass.on = liquid;
    const host = await render(
      <Button label="Allow once" tone={tone} variant={variant} onPress={() => {}} />,
    );
    const button = host.querySelector('button')!;
    expect(button.dataset.style).toBe(style);
    expect(button.dataset.role).toBe(role);
    expect(button.dataset.size).toBe('large');
    expect(button.dataset.tint === undefined).toBe(tone === 'danger');
  },
);

it.each(['light', 'dark'] as const)(
  'follows the %s appearance and sizes to its content height',
  async (scheme) => {
    const host = await render(<Button label="Done" onPress={() => {}} />, scheme);
    const native = host.querySelector<HTMLElement>('[data-host]')!;
    expect(native.dataset.scheme).toBe(scheme);
    expect(JSON.parse(native.dataset.host!)).toEqual({ vertical: true });
  },
);

it('presses through to the shared callback and exposes its label', async () => {
  const onPress = vi.fn();
  const host = await render(<Button label="Try again" testID="retry" onPress={onPress} />);
  const button = host.querySelector<HTMLButtonElement>('[data-testid="retry"]')!;
  expect(button.getAttribute('aria-label')).toBe('Try again');
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  expect(onPress).toHaveBeenCalledOnce();
});

it('shows a progress view while busy, disables the button and tells VoiceOver it is loading', async () => {
  const onPress = vi.fn();
  const host = await render(<Button label="Allow once" tone="primary" busy onPress={onPress} />);
  const button = host.querySelector('button')!;
  expect(button.querySelector('progress')).not.toBeNull();
  expect(button.disabled).toBe(true);
  expect(button.getAttribute('aria-valuetext')).toBe('Loading');
  await act(async () => button.click());
  expect(onPress).not.toHaveBeenCalled();
});

it('exposes disabled to VoiceOver without a busy value', async () => {
  const host = await render(<Button label="Copy" disabled onPress={() => {}} />);
  const button = host.querySelector('button')!;
  expect(button.disabled).toBe(true);
  expect(button.hasAttribute('aria-valuetext')).toBe(false);
  expect(button.querySelector('progress')).toBeNull();
});

it.each(Object.entries(ACTION_SF_SYMBOL))(
  'draws the %s action symbol as the SF Symbol %s',
  async (symbol, name) => {
    const host = await render(
      <Button label="Action" symbol={symbol as keyof typeof ACTION_SF_SYMBOL} onPress={() => {}} />,
    );
    const image = host.querySelector<HTMLElement>('button i')!;
    expect(image.dataset.symbol).toBe(name);
    expect(image.getAttribute('aria-hidden')).toBe('true');
  },
);

it('never hosts a React Native view inside the button', async () => {
  const host = await render(
    <Button label="Paste" icon={<div data-react-native-icon />} onPress={() => {}} />,
  );
  expect(host.querySelector('[data-react-native-icon]')).toBeNull();
  expect(host.querySelector('button i')).toBeNull();
});

it('keeps a 44pt minimum target and scales its label with Dynamic Type', async () => {
  const host = await render(
    <>
      <Button label="Bordered" onPress={() => {}} />
      <Button label="Text" variant="text" onPress={() => {}} />
    </>,
  );
  const [bordered, text] = [...host.querySelectorAll<HTMLElement>('button > span')];
  expect(bordered!.dataset).toMatchObject({ minHeight: '28', maxWidth: 'Infinity' });
  expect(text!.dataset).toMatchObject({ minHeight: '44', maxWidth: 'Infinity' });
  for (const label of host.querySelectorAll<HTMLElement>('[data-font]')) {
    expect(JSON.parse(label.dataset.font!)).toMatchObject({ textStyle: 'body' });
  }
});
