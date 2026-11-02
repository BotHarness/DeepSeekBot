// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'android' },
  View: (props: {
    children?: ReactNode;
    testID?: string;
    accessible?: boolean;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    accessibilityState?: Record<string, boolean | undefined>;
    accessibilityActions?: { name: string }[];
    importantForAccessibility?: string;
    style?: { height?: number; minHeight?: number };
    onAccessibilityAction?(event: { nativeEvent: { actionName: string } }): void;
  }) =>
    createElement(
      'div',
      {
        'data-testid': props.testID,
        'data-node': props.accessible === true ? '' : undefined,
        role: props.accessibilityRole,
        'aria-label': props.accessibilityLabel,
        'aria-checked': props.accessibilityState?.['checked'],
        'aria-disabled': props.accessibilityState?.['disabled'],
        'aria-selected': props.accessibilityState?.['selected'],
        'aria-busy': props.accessibilityState?.['busy'],
        'aria-hidden': props.importantForAccessibility === 'no-hide-descendants' || undefined,
        'data-actions': props.accessibilityActions?.map((action) => action.name).join(' '),
        'data-height': props.style?.height ?? props.style?.minHeight,
        onDoubleClick: () =>
          props.onAccessibilityAction?.({ nativeEvent: { actionName: 'activate' } }),
      },
      props.children,
    ),
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock(
  '../src/ui/primitives/settings-list-item',
  () => import('../src/ui/primitives/settings-list-item.android'),
);
vi.mock('../src/ui/primitives/row-icon-source.android', async () => ({
  ROW_ICON_SOURCES: (await import('./compose-list-item-shim')).rowIconSources,
}));
vi.mock(
  '@expo/ui/jetpack-compose',
  async () => (await import('./compose-list-item-shim')).components,
);
vi.mock(
  '@expo/ui/jetpack-compose/modifiers',
  async () => (await import('./compose-list-item-shim')).modifiers,
);

import { DesignThemeProvider, resolveTheme } from '../src/ui/design/theme';
import { SettingsRow, SettingsSection } from '../src/ui/primitives/settings-row';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

async function render(node: ReactNode, scheme: 'light' | 'dark' = 'light') {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(<DesignThemeProvider appearance={{ scheme }}>{node}</DesignThemeProvider>),
  );
  return host;
}

const slot = (row: Element, name: string) =>
  row.querySelector<HTMLElement>(`[data-slot="${name}"]`);

it.each(['light', 'dark'] as const)(
  'draws a switch row as one Compose list item that toggles from anywhere (%s)',
  async (scheme) => {
    const changed = vi.fn();
    function Preference({ disabled = false }: { disabled?: boolean }) {
      const [value, setValue] = useState(false);
      return (
        <SettingsSection>
          <SettingsRow
            testID="memory-row"
            title="Memory updates"
            detail="Show when the Bot saves memory"
            icon="history"
            control={{
              kind: 'switch',
              value,
              disabled,
              onChange: (next) => {
                changed(next);
                setValue(next);
              },
            }}
          />
        </SettingsSection>
      );
    }
    const screen = await render(<Preference />, scheme);
    const theme = resolveTheme(scheme, { scheme });
    const node = screen.querySelector<HTMLElement>('[data-testid="memory-row"]')!;
    const item = node.querySelector<HTMLElement>('[data-list-item]')!;

    expect(screen.querySelectorAll('[data-node]')).toHaveLength(1);
    expect(node.getAttribute('role')).toBe('switch');
    expect(node.getAttribute('aria-label')).toBe('Memory updates, Show when the Bot saves memory');
    expect(node.getAttribute('aria-checked')).toBe('false');
    expect(node.getAttribute('data-actions')).toBe('activate');
    expect(item.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(slot(item, 'headline')!.textContent).toBe('Memory updates');
    expect(slot(item, 'supporting')!.textContent).toBe('Show when the Bot saves memory');
    expect(slot(item, 'leading')!.querySelector('i')!.getAttribute('data-icon')).toBe(
      'row-icon:history',
    );
    expect(slot(item, 'trailing')!.querySelector('[data-native-switch]')).not.toBeNull();
    expect(item.getAttribute('data-toggle-role')).toBe('switch');
    expect(item.getAttribute('data-fill')).toBe(theme.layer.sheet.fill);
    expect(node.querySelector('[data-host]')!.getAttribute('data-host')).toBe('match-vertical');
    expect(screen.querySelector('[data-height]')).toBeNull();

    await act(async () => slot(item, 'headline')!.click());
    expect(node.getAttribute('aria-checked')).toBe('true');
    expect(item.querySelector<HTMLInputElement>('[data-native-switch]')!.checked).toBe(true);
    await act(async () => node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(node.getAttribute('aria-checked')).toBe('false');
    expect(changed.mock.calls).toEqual([[true], [false]]);

    await act(async () =>
      root!.render(
        <DesignThemeProvider appearance={{ scheme }}>
          <Preference disabled />
        </DesignThemeProvider>,
      ),
    );
    expect(node.getAttribute('aria-disabled')).toBe('true');
    expect(node.getAttribute('data-actions')).toBe('');
    await act(async () => {
      item.click();
      node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(changed.mock.calls).toEqual([[true], [false]]);
  },
);

it('gives navigation, value, check and busy rows native trailing content and row semantics', async () => {
  const open = vi.fn();
  const screen = await render(
    <SettingsSection>
      <SettingsRow testID="nav" title="Storage" icon="storage" disclosure onPress={open} />
      <SettingsRow
        testID="value"
        title="Images"
        control={{ kind: 'value', text: '12 MB', chevron: true }}
      />
      <SettingsRow testID="check" title="Dark" control={{ kind: 'check' }} />
      <SettingsRow testID="busy" title="Light" control={{ kind: 'busy' }} />
      <SettingsRow testID="danger" title="Unpair" icon="unpair" iconTone="danger" tone="danger" />
    </SettingsSection>,
  );
  const theme = resolveTheme('light', { scheme: 'light' });
  const row = (id: string) => screen.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  const icons = (id: string, name: string) =>
    [...slot(row(id), name)!.querySelectorAll('i')].map((icon) => icon.getAttribute('data-icon'));

  expect(screen.querySelectorAll('[data-node]')).toHaveLength(5);
  expect(row('nav').getAttribute('role')).toBe('button');
  expect(icons('nav', 'trailing')).toEqual(['row-icon:chevron']);
  await act(async () => slot(row('nav'), 'headline')!.click());
  await act(async () => row('nav').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(open).toHaveBeenCalledTimes(2);

  expect(row('value').getAttribute('role')).toBe('text');
  expect(row('value').getAttribute('aria-label')).toBe('Images, 12 MB');
  expect(slot(row('value'), 'trailing')!.textContent).toBe('12 MB');
  expect(icons('value', 'trailing')).toEqual(['row-icon:chevron']);

  expect(row('check').getAttribute('aria-selected')).toBe('true');
  const check = slot(row('check'), 'trailing')!.querySelector('i')!;
  expect(check.getAttribute('data-icon')).toBe('row-icon:check');
  expect(check.getAttribute('data-tint')).toBe(theme.color.accent);

  expect(row('busy').getAttribute('aria-busy')).toBe('true');
  expect(slot(row('busy'), 'trailing')!.querySelector('[data-native-busy]')).not.toBeNull();

  const danger = slot(row('danger'), 'leading')!.querySelector('i')!;
  expect(danger.getAttribute('data-tint')).toBe(theme.color.danger);
  expect(slot(row('danger'), 'headline')!.querySelector('span')!.getAttribute('data-color')).toBe(
    theme.color.danger,
  );
});

it('hosts avatars inside the item and keeps React Native buttons outside it', async () => {
  const screen = await render(
    <SettingsRow
      testID="member"
      title="Ada"
      leading={<b data-avatar="" />}
      trailing={<button type="button">Remove</button>}
    />,
  );
  const item = screen.querySelector('[data-list-item]')!;
  expect(slot(item, 'leading')!.querySelector('[data-avatar]')).not.toBeNull();
  expect(item.querySelector('button')).toBeNull();
  expect(slot(item, 'trailing')).toBeNull();
  expect(screen.querySelector('button')!.textContent).toBe('Remove');
});
