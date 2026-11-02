// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

type NativeTab = { value: string; label: string; dotColor?: string; accessibilityLabel?: string };

vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
vi.mock('react-native-reanimated', () => ({ runOnJS: (fn: unknown) => fn }));
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: (props: {
    children: ReactNode;
    seedColor?: string;
    matchContents?: { vertical?: boolean };
  }) =>
    createElement(
      'section',
      {
        'data-testid': 'host',
        'data-seed': props.seedColor,
        'data-match-height': String(props.matchContents?.vertical === true),
      },
      props.children,
    ),
}));
vi.mock('expo', () => ({
  requireNativeView:
    (module: string, view: string) =>
    (props: {
      tabs: NativeTab[];
      selected: string;
      containerColor?: string;
      onTabSelect(event: { nativeEvent: { value: string } }): void;
    }) =>
      createElement(
        'nav',
        { 'data-native': `${module}.${view}`, 'data-container': props.containerColor },
        props.tabs.map((tab) =>
          createElement(
            'button',
            {
              key: tab.value,
              role: 'tab',
              'aria-selected': String(tab.value === props.selected),
              'aria-label': tab.accessibilityLabel ?? tab.label,
              'data-dot': tab.dotColor,
              onClick: () => props.onTabSelect({ nativeEvent: { value: tab.value } }),
            },
            tab.label,
          ),
        ),
      ),
}));

import { PrimaryTabRow } from '../src/ui/primitives/primary-tab-row.android';
import { WorkspaceTabs } from '../src/ui/shell/workspace-tabs.android';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
const host = document.createElement('div');
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});
async function render(node: ReactNode) {
  root ??= createRoot(host);
  await act(async () => root?.render(node));
}
const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const selected = () => tabs().filter((tab) => tab.getAttribute('aria-selected') === 'true');

describe('Android primary tab row', () => {
  it('renders the Compose PrimaryTabRow inside a Host that sizes to its content', async () => {
    await render(
      <PrimaryTabRow
        tabs={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta', dotColor: 'yellow-token', accessibilityLabel: 'Beta, new' },
        ]}
        value="b"
        onChange={() => {}}
        containerColor="canvas"
      />,
    );
    expect(host.querySelector('[data-native]')?.getAttribute('data-native')).toBe(
      'MaterialTabRow.PrimaryTabRowView',
    );
    expect(host.querySelector('[data-testid="host"]')?.getAttribute('data-match-height')).toBe(
      'true',
    );
    expect(host.querySelector('[data-container]')?.getAttribute('data-container')).toBe('canvas');
    expect(selected().map((tab) => tab.getAttribute('aria-label'))).toEqual(['Beta, new']);
    expect(selected()[0]?.getAttribute('data-dot')).toBe('yellow-token');
    expect(tabs()[0]?.hasAttribute('data-dot')).toBe(false);
    expect(tabs()[0]?.getAttribute('aria-label')).toBe('Alpha');
  });

  it('reports a tapped tab and ignores values it does not own', async () => {
    const onChange = vi.fn();
    await render(
      <PrimaryTabRow tabs={[{ value: 'a', label: 'Alpha' }]} value="a" onChange={onChange} />,
    );
    await act(async () => tabs()[0]?.click());
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('selects no tab when the value is outside the row', async () => {
    await render(
      <PrimaryTabRow tabs={[{ value: 'a', label: 'Alpha' }]} value="handled" onChange={() => {}} />,
    );
    expect(selected()).toEqual([]);
  });
});

describe('Android workspace tabs', () => {
  it('shows Computers and Cloud as native tabs', async () => {
    const onChange = vi.fn();
    await render(<WorkspaceTabs value="cloud" onChange={onChange} />);
    expect(tabs().map((tab) => tab.textContent)).toEqual([t.computers, t.workspaceAdd.cloudTab]);
    expect(selected().map((tab) => tab.textContent)).toEqual([t.workspaceAdd.cloudTab]);
    await act(async () => tabs()[0]?.click());
    expect(onChange).toHaveBeenCalledWith('computers');
  });
});
