// @vitest-environment jsdom
import { createRequire, Module } from 'node:module';
import { basename } from 'node:path';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

type Modifier = Record<string, unknown>;
type ControlProps = {
  enabled?: boolean;
  onClick(): void;
  modifiers: Modifier[];
  children: ReactNode;
};

vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('@expo/ui/jetpack-compose', () => {
  const control =
    (kind: string) =>
    ({ enabled = true, onClick, modifiers, children }: ControlProps) =>
      createElement(
        'button',
        {
          'data-kind': kind,
          disabled: !enabled,
          onClick,
          'data-testid': modifiers.find((m) => m['id'])?.['id'],
          'aria-label': modifiers.find((m) => m['description'])?.['description'],
          'data-modifiers': JSON.stringify(modifiers),
        },
        children,
      );
  return {
    Host: ({ children }: { children: ReactNode }) => createElement('section', {}, children),
    Row: ({ children }: { children: ReactNode }) => createElement('span', {}, children),
    Text: ({ children, maxLines }: { children: ReactNode; maxLines?: number }) =>
      createElement('b', { 'data-max-lines': maxLines }, children),
    Icon: ({ source }: { source: string }) => createElement('i', { 'data-source': source }),
    Button: control('filled'),
    FilledTonalIconButton: control('tonal-icon'),
  };
});
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  defaultMinSize: (value: object) => ({ defaultMinSize: value }),
  fillMaxWidth: () => ({ fillMaxWidth: true }),
  semantics: ({ contentDescription }: { contentDescription: string }) => ({
    description: contentDescription,
  }),
  size: (width: number, height: number) => ({ size: [width, height] }),
  testID: (id: string) => ({ id }),
  weight: (value: number) => ({ weight: value }),
}));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ scheme: 'light', touch: 48, color: { accent: 'seed' } }),
}));

const requireAsset = createRequire(import.meta.url);
for (const asset of ['../assets/header/search.xml', '../assets/button/plus.xml']) {
  const path = requireAsset.resolve(asset);
  const module = new Module(path);
  module.exports = basename(path, '.xml');
  requireAsset.cache[path] = module;
}

const { SessionDrawerFooterActions } =
  await import('../src/features/sessions/session-drawer-footer-actions.android');
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
afterEach(() => act(() => root?.unmount()));
async function render(props: { canSearch?: boolean; canCreate?: boolean } = {}) {
  const onSearch = vi.fn();
  const onCreate = vi.fn();
  const host = document.createElement('div');
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <SessionDrawerFooterActions
        searchLabel="Search sessions"
        createLabel="New Session"
        canSearch={props.canSearch ?? true}
        canCreate={props.canCreate ?? true}
        onSearch={onSearch}
        onCreate={onCreate}
      />,
    ),
  );
  return { host, onSearch, onCreate };
}
const modifiers = (element: Element) =>
  JSON.parse(element.getAttribute('data-modifiers')!) as Modifier[];

it('puts a tonal search icon button beside a filled New Session button as tall as it', async () => {
  const { host, onSearch, onCreate } = await render();
  const search = host.querySelector('[data-testid="session-drawer-search"]')!;
  expect(search.getAttribute('data-kind')).toBe('tonal-icon');
  expect(search.getAttribute('aria-label')).toBe('Search sessions');
  expect(search.querySelector('i')!.getAttribute('data-source')).toBe('search');
  expect(modifiers(search)).toContainEqual({ size: [48, 48] });

  const create = host.querySelector('[data-testid="session-drawer-new"]')!;
  expect(create.getAttribute('data-kind')).toBe('filled');
  expect(create.textContent).toBe('New Session');
  expect(create.querySelector('i')!.getAttribute('data-source')).toBe('plus');
  expect(create.querySelector('b')!.getAttribute('data-max-lines')).toBe('1');
  expect(modifiers(create)).toEqual(
    expect.arrayContaining([{ weight: 1 }, { defaultMinSize: { minHeight: 48 } }]),
  );

  await act(async () => (search as HTMLElement).click());
  await act(async () => (create as HTMLElement).click());
  expect(onSearch).toHaveBeenCalledOnce();
  expect(onCreate).toHaveBeenCalledOnce();
});

it('hides New Session from a member and disables search until Sessions can be queried', async () => {
  const { host } = await render({ canSearch: false, canCreate: false });
  expect(host.querySelector('[data-testid="session-drawer-new"]')).toBeNull();
  expect(
    host.querySelector<HTMLButtonElement>('[data-testid="session-drawer-search"]')!.disabled,
  ).toBe(true);
});
