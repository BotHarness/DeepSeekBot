// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

type Modifier = Record<string, unknown>;
type ButtonProps = {
  enabled: boolean;
  onClick(): void;
  colors?: { containerColor?: string; contentColor?: string };
  modifiers: Modifier[];
  children: ReactNode;
};

vi.hoisted(async () => {
  const { createRequire, Module } = await import('node:module');
  const { readdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  const requireAsset = createRequire(import.meta.url);
  for (const name of readdirSync(dirname(requireAsset.resolve('../assets/button/check.xml')))) {
    const path = requireAsset.resolve(`../assets/button/${name}`);
    const asset = new Module(path);
    asset.exports = name;
    requireAsset.cache[path] = asset;
  }
});

vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('@expo/ui/jetpack-compose', () => {
  const button =
    (kind: string) =>
    ({ enabled, onClick, colors, modifiers, children }: ButtonProps) =>
      createElement(
        'button',
        {
          'data-kind': kind,
          disabled: !enabled,
          onClick,
          'data-container': colors?.containerColor,
          'data-content': colors?.contentColor,
          'data-modifiers': JSON.stringify(modifiers),
        },
        children,
      );
  return {
    Host: ({ children, style }: { children: ReactNode; style?: { alignSelf?: string } }) =>
      createElement('div', { 'data-testid': 'host', 'data-align': style?.alignSelf }, children),
    Button: button('filled'),
    FilledTonalButton: button('tonal'),
    TextButton: button('text'),
    Row: ({ children }: { children: ReactNode }) => createElement('span', {}, children),
    Text: ({ children }: { children: ReactNode }) => createElement('b', {}, children),
    Icon: ({ source, size }: { source: unknown; size: number }) =>
      createElement('i', {
        'data-testid': 'icon',
        'data-source': String(source),
        'data-size': size,
      }),
    CircularProgressIndicator: ({ modifiers }: { modifiers: Modifier[] }) =>
      createElement('i', {
        'data-testid': 'busy',
        'data-modifiers': JSON.stringify(modifiers),
      }),
    RNHostView: ({ children }: { children: ReactNode }) =>
      createElement('section', { 'data-testid': 'rn-host' }, children),
    useMaterialColors: () => ({ error: 'role:error', onError: 'role:onError' }),
  };
});
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  fillMaxWidth: () => ({ fillMaxWidth: true }),
  defaultMinSize: (value: object) => ({ defaultMinSize: value }),
  size: (width: number, height: number) => ({ size: [width, height] }),
  semantics: (value: object) => ({ semantics: value }),
  testID: (id: string) => ({ testID: id }),
}));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ scheme: 'light', touch: 48, color: { accent: 'seed' } }),
}));
vi.mock('../src/ui/strings', () => ({ useStrings: () => ({ loading: 'Loading' }) }));

import type { ButtonSymbol } from '../src/ui/primitives/button';
import { Button } from '../src/ui/primitives/button.android';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const LABEL_LINE_OF_LABEL_LARGE = 20;
const local = createRequire(import.meta.url);

let root: Root | undefined;
afterEach(() => act(() => root?.unmount()));
async function mount(node: ReactNode) {
  const host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}
function modifiers(element: Element | null): Modifier[] {
  return JSON.parse(element?.getAttribute('data-modifiers') ?? '[]') as Modifier[];
}

it.each([
  [{ tone: 'primary' }, 'filled', undefined, undefined],
  [{ tone: 'secondary' }, 'tonal', undefined, undefined],
  [{ tone: 'tonal' }, 'tonal', undefined, undefined],
  [{}, 'tonal', undefined, undefined],
  [{ tone: 'danger' }, 'filled', 'role:error', 'role:onError'],
  [{ variant: 'text' }, 'text', undefined, undefined],
  [{ variant: 'text', tone: 'primary' }, 'text', undefined, undefined],
  [{ variant: 'text', tone: 'danger' }, 'text', undefined, 'role:error'],
] as const)('maps %o to the %s Compose button', async (props, kind, container, content) => {
  const press = vi.fn();
  const view = await mount(<Button label="Save" onPress={press} {...props} />);
  const button = view.querySelector('button');
  expect(button?.getAttribute('data-kind')).toBe(kind);
  expect(button?.getAttribute('data-container') ?? undefined).toBe(container);
  expect(button?.getAttribute('data-content') ?? undefined).toBe(content);
  expect(button?.textContent).toBe('Save');
  await act(async () => button?.click());
  expect(press).toHaveBeenCalledOnce();
});

it('keeps a 48dp minimum touch target and stretches to the caller width', async () => {
  const view = await mount(<Button label="Save" testID="save" onPress={() => {}} />);
  expect(view.querySelector('[data-testid="host"]')?.getAttribute('data-align')).toBe('stretch');
  expect(modifiers(view.querySelector('button'))).toEqual([
    { fillMaxWidth: true },
    { defaultMinSize: { minHeight: 48 } },
    { testID: 'save' },
  ]);
});

it('shows a native busy indicator no larger than the label line and disables the button', async () => {
  const press = vi.fn();
  const view = await mount(<Button label="Save" busy symbol="check" onPress={press} />);
  const button = view.querySelector('button');
  expect(button?.disabled).toBe(true);
  const busy = button?.querySelector('[data-testid="busy"]') ?? null;
  const [size, semantics] = modifiers(busy);
  const [width, height] = size!.size as number[];
  expect(width).toBe(height);
  expect(width).toBeLessThanOrEqual(LABEL_LINE_OF_LABEL_LARGE);
  expect(semantics).toEqual({ semantics: { contentDescription: 'Loading' } });
  expect(view.querySelector('[data-testid="icon"]')).toBeNull();
  expect(button?.textContent).toBe('Save');
  await act(async () => button?.click());
  expect(press).not.toHaveBeenCalled();
});

it('disables the button without a busy indicator', async () => {
  const view = await mount(<Button label="Save" disabled onPress={() => {}} />);
  expect(view.querySelector('button')?.disabled).toBe(true);
  expect(view.querySelector('[data-testid="busy"]')).toBeNull();
});

const symbols: ButtonSymbol[] = [
  'refresh',
  'check',
  'shield-check',
  'x',
  'archive',
  'plus',
  'message-square',
  'settings',
  'folder-key',
  'external-link',
  'terminal',
  'info',
  'photo',
];

it.each(symbols)('draws the %s symbol as a native icon inside the button', async (symbol) => {
  const view = await mount(<Button label="Act" symbol={symbol} onPress={() => {}} />);
  const icon = view.querySelector('button [data-testid="icon"]');
  expect(icon?.getAttribute('data-source')).toBe(`${symbol}.xml`);
  expect(Number(icon?.getAttribute('data-size'))).toBeLessThanOrEqual(LABEL_LINE_OF_LABEL_LARGE);
  expect(view.querySelector('[data-testid="rn-host"]')).toBeNull();
  expect(readFileSync(local.resolve(`../assets/button/${symbol}.xml`), 'utf8')).toMatch(
    /^<vector[\s\S]*android:pathData=/,
  );
});

it('is the only Android button: creation screens reuse it', () => {
  const creation = local.resolve('../src/ui/primitives/creation-button.tsx');
  expect(existsSync(creation.replace(/\.tsx$/, '.android.tsx'))).toBe(false);
  expect(readFileSync(creation, 'utf8')).toBe("export { Button } from './button';\n");
});
