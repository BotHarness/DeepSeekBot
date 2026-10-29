// @vitest-environment jsdom
import { createRequire, Module } from 'node:module';
import { basename } from 'node:path';
import { act, createElement, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', async () => await import('./react-native-shim'));
type Modifier = { description?: string; id?: string };
const props = (modifiers: Modifier[], colors: Record<string, string>) => ({
  'aria-label': modifiers.find((m) => m.description)?.description,
  'data-testid': modifiers.find((m) => m.id)?.id,
  'data-content': colors['contentColor'],
  'data-checked-content': colors['checkedContentColor'],
});
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: ({ children, style }: { children: ReactNode; style: CSSProperties }) =>
    createElement('section', { style }, children),
  IconButton: ({
    children,
    onClick,
    modifiers,
    colors,
  }: {
    children: ReactNode;
    onClick(): void;
    modifiers: Modifier[];
    colors: Record<string, string>;
  }) =>
    createElement(
      'button',
      { onClick, 'data-kind': 'icon-button', ...props(modifiers, colors) },
      children,
    ),
  IconToggleButton: ({
    children,
    checked,
    onCheckedChange,
    modifiers,
    colors,
  }: {
    children: ReactNode;
    checked: boolean;
    onCheckedChange(checked: boolean): void;
    modifiers: Modifier[];
    colors: Record<string, string>;
  }) =>
    createElement(
      'button',
      {
        onClick: () => onCheckedChange(!checked),
        'aria-pressed': checked,
        'data-kind': 'icon-toggle-button',
        ...props(modifiers, colors),
      },
      children,
    ),
  Icon: ({ source, size }: { source: string; size: number }) =>
    createElement('i', { 'data-source': source, 'data-size': size }),
  useMaterialColors: () => ({
    onSurface: 'on-surface',
    onSurfaceVariant: 'on-surface-variant',
    primary: 'primary',
  }),
}));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  semantics: ({ contentDescription }: { contentDescription: string }) => ({
    description: contentDescription,
  }),
  testID: (id: string) => ({ id }),
}));

vi.mock(
  '../src/ui/shell/header-icon-button',
  async () => await import('../src/ui/shell/header-icon-button.android'),
);

const requireAsset = createRequire(import.meta.url);
for (const name of [
  'arrow-back',
  'close',
  'filter-list',
  'search',
  'settings',
  'edit',
  'add',
  'language',
  'computer',
  'do-not-touch',
  'tob-mode',
  'more-vert',
]) {
  const path = requireAsset.resolve(`../assets/header/${name}.xml`);
  const asset = new Module(path);
  asset.exports = basename(path, '.xml');
  requireAsset.cache[path] = asset;
}

const { HeaderIconButton } = await import('../src/ui/shell/header-icon-button.android');
const { HeaderAction } = await import('../src/ui/shell/header-action');
const { materialIconButton } = await import('../src/ui/design/tokens');
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function render(node: ReactNode) {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(node));
  return {
    host,
    button: () => host.querySelector('button')!,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    dispose: () => act(() => root.unmount()),
  };
}

it.each(['edit', 'more'] as const)(
  'renders the %s Compose icon button with its label',
  async (iconName) => {
    const onPress = vi.fn();
    const view = await render(
      <HeaderIconButton
        icon={iconName}
        label="Edit notes"
        testID="memory-edit"
        onPress={onPress}
      />,
    );
    const button = view.button();
    expect(button.dataset['kind']).toBe('icon-button');
    expect(button.getAttribute('aria-label')).toBe('Edit notes');
    expect(button.dataset['testid']).toBe('memory-edit');
    expect(button.hasAttribute('aria-pressed')).toBe(false);
    const icon = button.querySelector('i')!;
    expect(icon.dataset['source']).toBe(iconName === 'more' ? 'more-vert' : 'edit');
    expect(Number(icon.dataset['size'])).toBe(materialIconButton.iconSize);
    expect(view.host.querySelector('svg')).toBeNull();
    await act(async () => button.click());
    expect(onPress).toHaveBeenCalledOnce();
    view.dispose();
  },
);

it('reserves the 48dp touch target around the 40dp Compose container', async () => {
  const view = await render(<HeaderIconButton icon="add" label="New" onPress={() => {}} />);
  const frame = view.host.querySelector('section')!;
  expect(materialIconButton.target).toBe(48);
  expect(materialIconButton.container).toBe(40);
  expect(frame.style.width).toBe('48px');
  expect(frame.style.height).toBe('48px');
  view.dispose();
});

it('colours navigation icons onSurface and actions onSurfaceVariant', async () => {
  const view = await render(
    <>
      <HeaderIconButton icon="back" label="Back" onPress={() => {}} />
      <HeaderIconButton icon="close" label="Close" onPress={() => {}} />
      <HeaderIconButton icon="computer" label="Computer" onPress={() => {}} />
    </>,
  );
  const buttons = [...view.host.querySelectorAll('button')];
  expect(buttons.map((b) => b.dataset['content'])).toEqual([
    'on-surface',
    'on-surface',
    'on-surface-variant',
  ]);
  expect(buttons.map((b) => b.querySelector('i')!.dataset['source'])).toEqual([
    'arrow-back',
    'close',
    'computer',
  ]);
  view.dispose();
});

it('shows a selectable header action as a Material icon toggle button', async () => {
  const onPress = vi.fn();
  const action = (active: boolean) => (
    <HeaderAction
      icon="filter"
      label="Filter"
      testID="activity-filter-button"
      active={active}
      onPress={onPress}
    />
  );
  const view = await render(action(false));
  let button = view.button();
  expect(button.dataset['kind']).toBe('icon-toggle-button');
  expect(button.getAttribute('aria-pressed')).toBe('false');
  expect(button.dataset['checkedContent']).toBe('primary');
  expect(button.querySelector('i')!.dataset['source']).toBe('filter-list');
  await view.rerender(action(true));
  button = view.button();
  expect(button.getAttribute('aria-pressed')).toBe('true');
  await act(async () => button.click());
  expect(onPress).toHaveBeenCalledOnce();
  view.dispose();
});

it('maps every Chats header action to a native symbol', async () => {
  const view = await render(
    <>
      <HeaderAction icon="search" label="Search" testID="search-button" onPress={() => {}} />
      <HeaderAction icon="settings" label="Settings" testID="settings-button" onPress={() => {}} />
    </>,
  );
  const buttons = [...view.host.querySelectorAll('button')];
  expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Search', 'Settings']);
  expect(buttons.map((b) => b.dataset['testid'])).toEqual(['search-button', 'settings-button']);
  expect(buttons.map((b) => b.querySelector('i')!.dataset['source'])).toEqual([
    'search',
    'settings',
  ]);
  view.dispose();
});
