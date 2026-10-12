// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => null,
  IconChevronRightOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Menu: ({ open, anchor, children }: { open: boolean; anchor: ReactNode; children: ReactNode }) =>
    createElement('div', null, anchor, open ? children : null),
  MenuItemButton: ({ onSelect, children }: { onSelect(): void; children: ReactNode }) =>
    createElement('button', { onClick: onSelect }, children),
  MenuSurface: ({ children, ...props }: { children: ReactNode }) =>
    createElement('div', props, children),
}));
import { ChannelSidebarTabs } from '../src/client/channel-sidebar-tabs.js';
import {
  createChannelSidebarRegistry,
  resolveChannelSidebarTabs,
  type ChannelSidebarEntry,
  type ChannelSidebarEntryProps,
  type ChannelSidebarTab,
} from '../src/client/channel-sidebar.js';
import {
  channelSidebarScopeKey,
  createChannelSidebarPrefs,
  type ChannelSidebarPrefs,
} from '../src/client/channel-sidebar-prefs.js';
import { zhTranslate } from '../src/client/locale.js';
import { mergeSavedOrder } from '../src/client/channel-sidebar-order.js';

const scopeKey = channelSidebarScopeKey('personabot', 'dm-ada', 'ada');
const entryProps = {
  scope: 'personabot',
  channelId: 'dm-ada',
  botSlug: 'ada',
  actions: {},
  t: zhTranslate,
} as unknown as ChannelSidebarEntryProps;

const entry = (id: string, order: number, tab?: string): ChannelSidebarEntry => ({
  id,
  label: id,
  order,
  scope: 'personabot',
  component: () => createElement('div', { 'data-body': id }, 'body-' + id),
  ...(tab === undefined ? {} : { tab }),
});
const memoryTab: ChannelSidebarTab = {
  id: 'memory',
  label: 'Memory',
  icon: 'files',
  order: 5,
  scope: 'personabot',
};

let root: Root;
let host: HTMLDivElement;
let storage: Map<string, string>;
let prefs: ChannelSidebarPrefs;

function newPrefs(): ChannelSidebarPrefs {
  return createChannelSidebarPrefs({
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => void storage.set(key, value),
  });
}

function render(entries: readonly ChannelSidebarEntry[], tabs: readonly ChannelSidebarTab[] = []) {
  act(() =>
    root.render(
      createElement(ChannelSidebarTabs, {
        tabs: resolveChannelSidebarTabs(tabs, entries),
        entryProps,
        scopeKey,
        prefs,
      }),
    ),
  );
}

const tabNames = () =>
  [...host.querySelectorAll('[role="tab"]')].map(
    (tab) => tab.getAttribute('aria-label') ?? tab.textContent,
  );
const selected = () => host.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
const bodies = () =>
  [...host.querySelectorAll<HTMLElement>('[role="tabpanel"] [data-body]')].map(
    (body) => body.dataset['body'],
  );
const clickTab = (name: string) =>
  act(() => host.querySelector<HTMLButtonElement>(`[role="tab"][aria-label="${name}"]`)!.click());
const openViews = () =>
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="视图"]')!.click());
const viewItem = (name: string) =>
  host.querySelector<HTMLButtonElement>(`[data-view-id="${name}"] [role="menuitemcheckbox"]`)!;

beforeEach(() => {
  storage = new Map();
  prefs = newPrefs();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    callback();
    return 0;
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('Channel sidebar tabs', () => {
  it('groups entries by registered tab and gives every other entry its own tab', () => {
    const entries = [
      entry('memory-files', 5, 'memory'),
      entry('memory-evolution', 6, 'memory'),
      entry('sessions', 10),
      entry('orphan', 20, 'not-registered'),
    ];
    const tabs = resolveChannelSidebarTabs([memoryTab], entries);
    expect(tabs.map((tab) => [tab.id, tab.entries.map((item) => item.id)])).toEqual([
      ['memory', ['memory-files', 'memory-evolution']],
      ['sessions', ['sessions']],
      ['orphan', ['orphan']],
    ]);
    expect(resolveChannelSidebarTabs([memoryTab], [entry('sessions', 10)])).toHaveLength(1);
  });

  it('registers and removes tabs per scope', () => {
    const registry = createChannelSidebarRegistry();
    const release = registry.registerTab(memoryTab);
    expect(registry.tabs('personabot').map((tab) => tab.id)).toEqual(['memory']);
    expect(registry.tabs('channel')).toEqual([]);
    expect(() => registry.registerTab(memoryTab)).toThrow('duplicate Channel sidebar tab');
    release();
    expect(registry.tabs('personabot')).toEqual([]);
  });

  it('shows one panel at a time with the selected tab labelled', () => {
    render(
      [
        entry('memory-files', 5, 'memory'),
        entry('memory-evolution', 6, 'memory'),
        entry('sessions', 10),
      ],
      [memoryTab],
    );
    expect(tabNames()).toEqual(['Memory', 'sessions']);
    expect(selected()).toBe('Memory');
    expect(bodies()).toEqual(['memory-files', 'memory-evolution']);
    expect(host.querySelector('.bh-channel-sidebar-entry-chevron')).toBeNull();

    clickTab('sessions');
    expect(selected()).toBe('sessions');
    expect(bodies()).toEqual(['sessions']);
  });

  it('remembers the selected tab per scope key', () => {
    const entries = [entry('a', 1), entry('b', 2)];
    render(entries);
    clickTab('b');
    act(() => root.unmount());
    root = createRoot(host);
    prefs = newPrefs();
    render(entries);
    expect(selected()).toBe('b');
  });

  it('moves between tabs with the arrow keys', () => {
    render([entry('a', 1), entry('b', 2), entry('c', 3)]);
    act(() => {
      host
        .querySelector('[role="tab"][aria-selected="true"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(selected()).toBe('c');
    expect(document.activeElement?.getAttribute('data-tab-id')).toBe('c');
  });

  it('hides and shows tabs from the views menu but keeps one visible', () => {
    render([entry('a', 1), entry('b', 2)]);
    openViews();
    expect(viewItem('a').getAttribute('aria-checked')).toBe('true');
    act(() => viewItem('a').click());
    expect(tabNames()).toEqual(['b']);
    expect(selected()).toBe('b');
    expect(viewItem('b').getAttribute('aria-disabled')).toBe('true');
    act(() => viewItem('b').click());
    expect(tabNames()).toEqual(['b']);
    act(() => viewItem('a').click());
    expect(tabNames()).toEqual(['a', 'b']);
    expect(newPrefs().getSnapshot().hiddenEntries.personabot).toEqual([]);
  });

  it('reorders tabs from the views menu with Alt and the arrow keys', () => {
    render([entry('a', 1), entry('b', 2), entry('c', 3)]);
    openViews();
    act(() => {
      viewItem('c').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }),
      );
    });
    expect(tabNames()).toEqual(['a', 'c', 'b']);
    expect(newPrefs().getSnapshot().entryOrders.personabot).toEqual(['a', 'c', 'b']);
    expect(document.activeElement).toBe(viewItem('c'));
  });

  it('closes the views menu with Escape', () => {
    render([entry('a', 1)]);
    openViews();
    expect(host.querySelector('[role="menu"]')).not.toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('[role="menu"]')).toBeNull();
  });

  it('splits a two-entry tab into top and bottom panes with a remembered ratio', () => {
    render(
      [entry('memory-files', 5, 'memory'), entry('memory-evolution', 6, 'memory')],
      [memoryTab],
    );
    const panes = [...host.querySelectorAll<HTMLElement>('[data-split-pane]')];
    expect(
      panes.map((pane) => pane.querySelector('[data-body]')?.getAttribute('data-body')),
    ).toEqual(['memory-files', 'memory-evolution']);
    const handle = host.querySelector<HTMLElement>('[role="separator"]')!;
    expect(handle.getAttribute('aria-valuenow')).toBe('50');
    act(() => {
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(handle.getAttribute('aria-valuenow')).toBe('55');
    act(() => {
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(newPrefs().getSnapshot().splitRatios['memory']).toBe(0.85);
  });

  it('places a newly registered tab at its default position inside a saved order', () => {
    expect(mergeSavedOrder(['conversation', 'memory', 'a', 'b'], ['b', 'a', 'gone'])).toEqual([
      'conversation',
      'memory',
      'b',
      'a',
    ]);
  });

  it('keeps existing hidden and ordered entries as hidden and ordered tabs', () => {
    prefs.setEntryLayout('personabot', ['b', 'a'], ['c']);
    render([entry('a', 1), entry('b', 2), entry('c', 3)]);
    expect(tabNames()).toEqual(['b', 'a']);
  });
});
