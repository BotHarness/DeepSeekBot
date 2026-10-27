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
import { ActivityTabs } from '../src/ui/shell/activity-tabs.android';
import { WorkspaceTabs } from '../src/ui/shell/workspace-tabs.android';
import {
  activityDotColor,
  activityTabMarks,
  NO_ACTIVITY_MARKS,
  steppedActivityTab,
} from '../src/ui/shell/activity-tab-strip';
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

describe('Android Activity tabs', () => {
  it('shows Needs you and For you as native tabs and moves on a tap', async () => {
    const onTabSelect = vi.fn();
    await render(
      <ActivityTabs
        selected="replies"
        marks={NO_ACTIVITY_MARKS}
        position={undefined as never}
        onTabSelect={onTabSelect}
      />,
    );
    expect(tabs().map((tab) => tab.textContent)).toEqual([
      t.inboxSections.action,
      t.inboxSections.replies,
    ]);
    expect(selected().map((tab) => tab.textContent)).toEqual([t.inboxSections.replies]);
    expect(tabs().some((tab) => tab.hasAttribute('data-dot'))).toBe(false);
    await act(async () => tabs()[0]?.click());
    expect(onTabSelect).toHaveBeenCalledWith('action');
  });

  it('marks a tab with content by a warning dot (Needs you) or an accent dot (For you), no count', async () => {
    await render(
      <ActivityTabs
        selected="action"
        marks={{ action: true, replies: true }}
        position={undefined as never}
        onTabSelect={() => {}}
      />,
    );
    const [needsYou, forYou] = tabs().map((tab) => tab.getAttribute('data-dot'));
    const theme = { color: { warning: 'warning', accent: 'accent' } } as never;
    expect(activityDotColor(theme, 'action')).toBe('warning');
    expect(activityDotColor(theme, 'replies')).toBe('accent');
    expect(needsYou).toBeTruthy();
    expect(forYou).toBeTruthy();
    expect(needsYou).not.toBe(forYou);
    expect(tabs().map((tab) => tab.getAttribute('aria-label'))).toEqual([
      t.activityTabNew(t.inboxSections.action),
      t.activityTabNew(t.inboxSections.replies),
    ]);
    expect(tabs().map((tab) => tab.textContent)).toEqual([
      t.inboxSections.action,
      t.inboxSections.replies,
    ]);
  });

  it('marks only sections that have items once the inbox is ready', () => {
    expect(activityTabMarks({ status: 'loading' })).toEqual(NO_ACTIVITY_MARKS);
    expect(
      activityTabMarks({
        status: 'ready',
        sections: { action: [{} as never], replies: [], unread: [{} as never], handled: [] },
      }),
    ).toEqual({ action: true, replies: false });
  });

  it('keeps All and handled history without a selected tab', async () => {
    await render(
      <ActivityTabs
        selected="all"
        marks={NO_ACTIVITY_MARKS}
        position={undefined as never}
        onTabSelect={() => {}}
      />,
    );
    expect(selected()).toEqual([]);
  });

  it('steps to the neighbouring tab on a strip swipe and stops at either end', () => {
    expect(steppedActivityTab('action', true)).toBe('replies');
    expect(steppedActivityTab('replies', true)).toBeUndefined();
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
