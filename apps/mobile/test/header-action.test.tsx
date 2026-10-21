// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const platform = vi.hoisted(() => ({ OS: 'ios', Version: 26 }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: platform,
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityLabel: (label: string) => ({ $type: 'accessibilityLabel', label }),
  accessibilityAddTraits: (traits: string[]) => ({ $type: 'accessibilityAddTraits', traits }),
  buttonStyle: (style: string) => ({ $type: 'buttonStyle', style }),
  buttonBorderShape: () => ({}),
  font: () => ({}),
  foregroundStyle: () => ({}),
  frame: () => ({}),
}));
vi.mock('@expo/ui/swift-ui', () => ({
  Host: ({ children, testID }: { children: ReactNode; testID?: string }) =>
    createElement('div', { 'data-testid': testID }, children),
  Image: ({ systemName }: { systemName: string }) => createElement('i', { title: systemName }),
  Button: ({
    onPress,
    children,
    modifiers,
  }: {
    onPress(): void;
    children: ReactNode;
    modifiers: { $type: string; label?: string; style?: string; traits?: string[] }[];
  }) =>
    createElement(
      'button',
      {
        onClick: onPress,
        'aria-label': modifiers.find((m) => m.$type === 'accessibilityLabel')?.label,
        'data-style': modifiers.find((m) => m.$type === 'buttonStyle')?.style,
        'aria-pressed': modifiers.some(
          (m) => m.$type === 'accessibilityAddTraits' && m.traits?.includes('isSelected'),
        ),
      },
      children,
    ),
}));
vi.mock('../src/ui/shell/icons', () => ({
  ActivityFilterIcon: () => createElement('svg', { 'data-icon': 'filter' }),
  ActivitySearchIcon: () => createElement('svg', { 'data-icon': 'search' }),
  SettingsIcon: () => createElement('svg', { 'data-icon': 'settings' }),
}));
import { HeaderAction } from '../src/ui/shell/header-action.ios';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function render(version: number, onPress: () => void) {
  platform.Version = version;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <>
        <HeaderAction icon="search" label="Search" testID="search-button" onPress={onPress} />
        <HeaderAction icon="settings" label="Settings" testID="settings-button" onPress={onPress} />
      </>,
    ),
  );
  return {
    host,
    dispose() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

it('chat list header actions are Liquid Glass SF Symbol buttons on iOS 26', async () => {
  const onPress = vi.fn();
  const view = await render(26, onPress);
  try {
    const buttons = [...view.host.querySelectorAll('button')];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Search', 'Settings']);
    expect(buttons.map((b) => b.dataset['style'])).toEqual(['glass', 'glass']);
    expect(buttons.map((b) => b.querySelector('i')?.title)).toEqual([
      'magnifyingglass',
      'gearshape',
    ]);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
    expect(view.host.querySelector('[data-testid="settings-button"] button')).not.toBeNull();
    await act(async () => buttons[1]!.click());
    expect(onPress).toHaveBeenCalledOnce();
  } finally {
    view.dispose();
  }
});

it('keeps the drawn raised buttons before iOS 26', async () => {
  const onPress = vi.fn();
  const view = await render(18, onPress);
  try {
    const buttons = [...view.host.querySelectorAll('button')];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Search', 'Settings']);
    expect(buttons.map((b) => b.dataset['testid'])).toEqual(['search-button', 'settings-button']);
    expect(view.host.querySelector('i')).toBeNull();
    expect(view.host.querySelector('[data-icon="settings"]')).not.toBeNull();
    await act(async () => buttons[0]!.click());
    expect(onPress).toHaveBeenCalledOnce();
  } finally {
    view.dispose();
  }
});

it('marks an active Activity filter as selected on both paths', async () => {
  for (const version of [26, 18]) {
    platform.Version = version;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <HeaderAction
          icon="filter"
          label="Filter"
          testID="activity-filter-button"
          active
          onPress={() => {}}
        />,
      ),
    );
    const button = host.querySelector('button')!;
    if (version === 26) {
      expect(button.querySelector('i')?.title).toBe('line.3.horizontal.decrease');
      expect(button.getAttribute('aria-pressed')).toBe('true');
    } else {
      expect(button.getAttribute('aria-selected')).toBe('true');
    }
    act(() => root.unmount());
    host.remove();
  }
});
