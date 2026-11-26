// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

type Modifier = { click?: () => void; label?: string; tag?: string };

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  StyleSheet: { absoluteFill: {} },
}));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ scheme: 'dark', color: { accent: 'seed' } }),
}));
vi.mock('../src/ui/design/material-tokens', () => ({
  useMaterialRoles: () => ({
    primary: 'primary',
    error: 'error',
    onSurface: 'on-surface',
    onSurfaceVariant: 'on-surface-variant',
  }),
}));
vi.mock('../src/ui/primitives/row-icon-source.android', () => ({
  ROW_ICON_SOURCES: { check: 'check', add: 'add', chevron: 'chevron' },
}));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => {
  const none = () => ({});
  return {
    clickable: (click: () => void) => ({ click }),
    fillMaxWidth: none,
    padding: none,
    semantics: ({ contentDescription }: { contentDescription?: string }) => ({
      label: contentDescription,
    }),
    size: none,
    testID: (tag: string) => ({ tag }),
    toggleable: (_value: boolean, click: () => void) => ({ click }),
    weight: none,
  };
});
vi.mock('@expo/ui/jetpack-compose', () => {
  const slot =
    (name: string) =>
    ({ children }: { children?: ReactNode }) =>
      createElement('div', { 'data-slot': name }, children);
  const ListItem = ({ children, modifiers }: { children?: ReactNode; modifiers?: Modifier[] }) =>
    createElement(
      'button',
      {
        onClick: modifiers?.find((m) => m.click)?.click,
        'aria-label': modifiers?.find((m) => m.label)?.label,
        'data-testid': modifiers?.find((m) => m.tag)?.tag,
      },
      children,
    );
  ListItem.HeadlineContent = slot('headline');
  ListItem.SupportingContent = slot('supporting');
  ListItem.LeadingContent = slot('leading');
  ListItem.TrailingContent = slot('trailing');
  return {
    CircularProgressIndicator: () => createElement('progress'),
    Host: slot('host'),
    Icon: ({ source }: { source: string }) => createElement('i', { 'data-icon': source }),
    LazyColumn: slot('column'),
    ListItem,
    ModalBottomSheet: ({
      children,
      containerColor,
      onDismissRequest,
    }: {
      children: ReactNode;
      containerColor?: string;
      onDismissRequest(): void;
    }) =>
      createElement(
        'dialog',
        { open: true, 'data-fill': containerColor },
        createElement('button', { 'data-testid': 'scrim', onClick: onDismissRequest }),
        children,
      ),
    RNHostView: ({ children }: { children: ReactNode }) => children,
    Row: slot('row'),
    Switch: ({ value }: { value: boolean }) =>
      createElement('input', { type: 'checkbox', checked: value, readOnly: true }),
    Text: ({ children, color }: { children?: ReactNode; color?: string }) =>
      createElement('span', { 'data-color': color }, children),
    TextButton: ({ children, onClick }: { children: ReactNode; onClick(): void }) =>
      createElement('button', { 'data-testid': 'confirm', onClick }, children),
  };
});

const { SystemListSheet } = await import('../src/ui/primitives/system-list-sheet.android');
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const container = document.createElement('div');
const root = createRoot(container);
afterEach(() => act(() => root.render(null)));

it('renders Material list items on the default ModalBottomSheet container', () => {
  const choose = vi.fn();
  const confirm = vi.fn();
  const close = vi.fn();
  const toggle = vi.fn();
  act(() =>
    root.render(
      createElement(SystemListSheet, {
        visible: true,
        title: 'Delivery',
        closeLabel: 'Close',
        confirm: { label: 'Done', onPress: confirm },
        onClose: close,
        sections: [
          {
            key: 'bots',
            title: 'Bots',
            rows: [
              {
                kind: 'choice',
                key: 'ada',
                testID: 'row-ada',
                label: 'Ada',
                value: 'Read',
                selected: true,
                onPress: choose,
              },
              { kind: 'choice', key: 'del', label: 'Delete', destructive: true, onPress: choose },
              { kind: 'choice', key: 'off', label: 'Off', disabled: true, onPress: choose },
              { kind: 'toggle', key: 'unread', label: 'Unread', value: false, onChange: toggle },
            ],
          },
        ],
      }),
    ),
  );
  expect(container.querySelector('dialog')?.hasAttribute('data-fill')).toBe(false);
  expect(container.textContent).toContain('Delivery');
  expect(container.querySelector('[data-color="primary"]')?.textContent).toBe('Bots');
  const ada = container.querySelector('[data-testid="row-ada"]');
  expect(ada?.querySelector('[data-icon="check"]')).not.toBeNull();
  expect(ada?.textContent).toContain('Read');
  expect(
    container
      .querySelector('[aria-label="Delete"] [data-slot="headline"] span')
      ?.getAttribute('data-color'),
  ).toBe('error');
  act(() => (ada as HTMLButtonElement).click());
  expect(choose).toHaveBeenCalledOnce();
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Off"]')!.click());
  expect(choose).toHaveBeenCalledOnce();
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[data-slot="headline"] + [data-slot="trailing"] input')
      ?.closest('button')
      ?.click(),
  );
  expect(toggle).toHaveBeenCalledWith(true);
  act(() => container.querySelector<HTMLButtonElement>('[data-testid="confirm"]')!.click());
  expect(confirm).toHaveBeenCalledOnce();
  act(() => container.querySelector<HTMLButtonElement>('[data-testid="scrim"]')!.click());
  expect(close).toHaveBeenCalledOnce();
});
