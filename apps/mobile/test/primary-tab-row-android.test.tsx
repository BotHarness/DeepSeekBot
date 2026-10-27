// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

type NativeTab = { value: string; label: string; count?: number; accessibilityLabel?: string };

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
      onSelect(event: { nativeEvent: { value: string } }): void;
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
              'data-count': tab.count,
              onClick: () => props.onSelect({ nativeEvent: { value: tab.value } }),
            },
            tab.label,
          ),
        ),
      ),
}));

import { PrimaryTabRow } from '../src/ui/primitives/primary-tab-row.android';
import { ActivityTabs } from '../src/ui/shell/activity-tabs.android';
import { WorkspaceTabs } from '../src/ui/shell/workspace-tabs.android';
import { steppedActivityTab } from '../src/ui/shell/activity-tab-strip';
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
          { value: 'b', label: 'Beta', count: 3, accessibilityLabel: 'Beta, 3 items' },
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
    expect(selected().map((tab) => tab.getAttribute('aria-label'))).toEqual(['Beta, 3 items']);
    expect(selected()[0]?.getAttribute('data-count')).toBe('3');
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

describe('Android Activity tabs', () => {
  it('shows the three sections as native tabs and moves on a tap', async () => {
    const onSelect = vi.fn();
    await render(
      <ActivityTabs selected="replies" position={undefined as never} onSelect={onSelect} />,
    );
    expect(tabs().map((tab) => tab.textContent)).toEqual([
      t.inboxSections.action,
      t.inboxSections.replies,
      t.inboxSections.unread,
    ]);
    expect(selected().map((tab) => tab.textContent)).toEqual([t.inboxSections.replies]);
    await act(async () => tabs()[2]?.click());
    expect(onSelect).toHaveBeenCalledWith('unread');
  });

  it('keeps All and handled history without a selected tab', async () => {
    await render(<ActivityTabs selected="all" position={undefined as never} onSelect={() => {}} />);
    expect(selected()).toEqual([]);
  });

  it('steps to the neighbouring tab on a strip swipe and stops at either end', () => {
    expect(steppedActivityTab('action', true)).toBe('replies');
    expect(steppedActivityTab('unread', true)).toBeUndefined();
    expect(steppedActivityTab('replies', false)).toBe('action');
    expect(steppedActivityTab('action', false)).toBeUndefined();
    expect(steppedActivityTab('handled', true)).toBe('replies');
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
