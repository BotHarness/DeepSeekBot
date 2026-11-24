// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import Yoga from 'yoga-layout';

const device = vi.hoisted(() => ({ fontScale: 1, listeners: new Set<() => void>() }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'android' },
  Dimensions: {
    get: () => ({ width: 390, height: 844, scale: 3, fontScale: device.fontScale }),
    addEventListener: (_event: string, listener: () => void) => {
      device.listeners.add(listener);
      return { remove: () => device.listeners.delete(listener) };
    },
  },
  View: (props: {
    children?: ReactNode;
    testID?: string;
    accessible?: boolean;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    accessibilityState?: Record<string, boolean | undefined>;
    accessibilityActions?: { name: string }[];
    importantForAccessibility?: string;
    style?: { height?: number; minHeight?: number; flex?: number };
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
        'data-flex': props.style?.flex,
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
import { SettingsGroupItem, SettingsRow, SettingsSection } from '../src/ui/primitives/settings-row';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  device.fontScale = 1;
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

it('keeps the Android Settings row value visible with its label at font scale 2', async () => {
  device.fontScale = 2;
  const computer = 'A very long Computer name';
  const open = vi.fn();
  const screen = await render(
    <SettingsRow
      testID="environment-row"
      title="Environment"
      icon="computer"
      singleLine
      control={{ kind: 'value', text: computer, chevron: true }}
      onPress={open}
    />,
  );
  const item = screen.querySelector<HTMLElement>('[data-list-item]')!;
  const headline = slot(item, 'headline')!.querySelector('span')!;
  const setFontScale = (scale: number) =>
    act(async () => {
      device.fontScale = scale;
      for (const notify of device.listeners) notify();
    });

  for (const scale of [2, 1.3]) {
    await setFontScale(scale);
    expect(headline.textContent).toBe(`Environment\n${computer}`);
    expect(headline.hasAttribute('data-max-lines')).toBe(false);
    expect(slot(item, 'supporting')).toBeNull();
    expect(slot(item, 'trailing')!.textContent).toBe('');
    expect(slot(item, 'trailing')!.querySelector('i')!.getAttribute('data-icon')).toBe(
      'row-icon:chevron',
    );
  }
  expect(screen.querySelector('[data-testid="environment-row"]')!.getAttribute('aria-label')).toBe(
    `Environment, ${computer}`,
  );
  await act(async () => headline.click());
  expect(open).toHaveBeenCalledOnce();

  await setFontScale(1);
  expect(headline.textContent).toBe('Environment');
  expect(headline.getAttribute('data-max-lines')).toBe('1');
  expect(slot(item, 'trailing')!.textContent).toBe(computer);
});

it.each([1, 2])('keeps a detail status dot beside a value at font scale %s', async (fontScale) => {
  device.fontScale = fontScale;
  const screen = await render(
    <SettingsSection>
      <SettingsRow
        title="Studio"
        detail="Online"
        detailDot="green-token"
        control={{ kind: 'value', text: 'QA Host', chevron: true }}
        onPress={() => {}}
      />
    </SettingsSection>,
  );
  const item = screen.querySelector('[data-list-item]')!;
  const supporting = slot(item, 'supporting')!;
  expect(supporting.querySelector('[data-dot]')!.getAttribute('data-dot')).toBe('green-token');
  expect(supporting.textContent).toContain('Online');
  expect(supporting.textContent).toBe('Online');
  expect(slot(item, 'headline')!.textContent?.includes('QA Host')).toBe(fontScale === 2);
});

it('keeps a text-only detail without a dot', async () => {
  const screen = await render(
    <SettingsSection>
      <SettingsRow title="Storage" detail="Cached files" onPress={() => {}} />
    </SettingsSection>,
  );
  const supporting = slot(screen.querySelector('[data-list-item]')!, 'supporting')!;
  expect(supporting.textContent).toBe('Cached files');
  expect(supporting.querySelector('[data-dot]')).toBeNull();
});

it('sizes a standalone row to its content and lets a row beside a trailing view fill the width', async () => {
  const view = await render(
    <>
      <SettingsRow testID="alone" title="Folder" control={{ kind: 'value', text: 'notes-app' }} />
      <SettingsRow testID="beside" title="Model" trailing={<span>Now</span>} />
    </>,
  );
  expect(view.querySelector('[data-testid="alone"]')?.getAttribute('data-flex')).toBeNull();
  expect(view.querySelector('[data-testid="beside"]')?.getAttribute('data-flex')).toBe('1');
});

function centredRowHeight(flex: number | undefined): number {
  const config = Yoga.Config.create();
  config.setUseWebDefaults(false);
  const root = Yoga.Node.create(config);
  try {
    root.setWidth(400);
    root.setHeight(800);
    const centre = Yoga.Node.create(config);
    centre.setFlex(1);
    centre.setJustifyContent(Yoga.JUSTIFY_CENTER);
    root.insertChild(centre, 0);
    const group = Yoga.Node.create(config);
    centre.insertChild(group, 0);
    const segment = Yoga.Node.create(config);
    segment.setMargin(Yoga.EDGE_HORIZONTAL, 16);
    group.insertChild(segment, 0);
    const item = Yoga.Node.create(config);
    if (flex !== undefined) item.setFlex(flex);
    segment.insertChild(item, 0);
    const compose = Yoga.Node.create(config);
    compose.setHeight(56);
    item.insertChild(compose, 0);
    root.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR);
    return item.getComputedHeight();
  } finally {
    root.freeRecursive();
    config.free();
  }
}

it('lays out the New Session picker rows at their Compose height in a centred column', async () => {
  const view = await render(
    <SettingsGroupItem first last on="canvas">
      <SettingsRow testID="new-session-folder" title="Folder" control={{ kind: 'chevron' }} />
    </SettingsGroupItem>,
  );
  const flex = view.querySelector('[data-testid="new-session-folder"]')?.getAttribute('data-flex');
  expect(centredRowHeight(flex == null ? undefined : Number(flex))).toBe(56);
  expect(centredRowHeight(1)).toBe(0);
});
