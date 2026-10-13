// @vitest-environment jsdom
import { act, createElement, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => null,
  IconChevronRightOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Menu: ({
    open,
    anchor,
    children,
    onClose,
  }: {
    open: boolean;
    anchor: ReactNode;
    children: ReactNode;
    onClose(): void;
  }) =>
    createElement(
      'div',
      null,
      anchor,
      open
        ? createElement(
            'div',
            {
              role: 'menu',
              onKeyDown: (event: KeyboardEvent) => {
                if (event.key === 'Escape') onClose();
              },
            },
            children,
          )
        : null,
    ),
  MenuSurface: ({ children, ...props }: { children: ReactNode }) =>
    createElement('div', props, children),
  MenuItemButton: ({
    onSelect,
    children,
    icon,
  }: {
    onSelect(): void;
    children: ReactNode;
    icon?: ReactNode;
  }) => createElement('button', { role: 'menuitem', onClick: onSelect }, icon, children),
}));
import { ChannelSidebarContents } from '../src/client/channel-sidebar-view.js';
import { MemoryDisplaySettings } from '../src/client/channel-sidebar-settings.js';
import {
  channelSidebarPrefs,
  createChannelSidebarPrefs,
  type ChannelSidebarPrefs,
} from '../src/client/channel-sidebar-prefs.js';
import {
  sessionViewPreferenceSnapshot,
  subscribeSessionViewPreference,
} from '../src/client/session-view-prefs.js';
import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
} from '../src/client/channel-sidebar.js';
let root: Root;
let host: HTMLDivElement;
let prefs: ChannelSidebarPrefs;
let entries: ChannelSidebarEntry[];
let revoke: (() => void) | undefined;
function MemoryBody() {
  const value = useSyncExternalStore(
    channelSidebarPrefs.subscribe,
    () => channelSidebarPrefs.getSnapshot().memoryTerminology,
  );
  return createElement('div', null, 'memory-' + value);
}
function SessionsBody() {
  const value = useSyncExternalStore(
    (listener) => subscribeSessionViewPreference('ada', listener),
    () => sessionViewPreferenceSnapshot('ada'),
  );
  return createElement('div', null, 'sessions-' + value.scope + '-' + value.layout);
}
function render(slug = 'ada') {
  const scope = 'personabot:' + slug;
  const props = {
    scope: 'personabot',
    channelId: 'dm-' + slug,
    botSlug: slug,
    actions: {},
    t: (key: string) => key,
  } as unknown as ChannelSidebarEntryProps;
  act(() =>
    root.render(
      createElement(ChannelSidebarContents, {
        key: scope,
        entries,
        entryProps: props,
        prefs,
        controller: {
          isEntryExpanded: (id) => prefs.isEntryExpanded(scope, id),
          toggleEntry: (id) => prefs.setEntryExpanded(scope, id, !prefs.isEntryExpanded(scope, id)),
        },
      }),
    ),
  );
}
function button(label: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === label || node.getAttribute('aria-label') === label,
  );
  expect(found).toBeDefined();
  return found!;
}
function click(label: string) {
  act(() => button(label).click());
}
function hover(label: string) {
  act(() => button(label).dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
}
function expanded() {
  return [...host.querySelectorAll<HTMLElement>('[data-entry-id]')]
    .filter((row) => row.querySelector('[aria-expanded=true]'))
    .map((row) => row.dataset['entryId']);
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  prefs = createChannelSidebarPrefs(undefined);
  entries = [
    {
      id: 'files',
      label: 'Files',
      scope: 'personabot',
      component: () => createElement('div', null, 'files-body'),
    },
    {
      id: 'memory-evolution',
      label: 'Memory',
      scope: 'personabot',
      settings: MemoryDisplaySettings,
      component: MemoryBody,
    },
    {
      id: 'sessions',
      label: 'Sessions',
      scope: 'personabot',
      component: SessionsBody,
    },
    {
      id: 'computer',
      label: 'Computer',
      scope: 'personabot',
      component: () => createElement('div', null, 'computer-body'),
      headerAction: (props) => {
        revoke = () => props.setExpandable?.(false);
        return null;
      },
    },
  ];
  prefs.setEntryExpanded('personabot:ada', 'files', true);
  prefs.setEntryExpanded('personabot:ada', 'sessions', true);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  localStorage.clear();
  channelSidebarPrefs.setMemoryTerminology('memory');
  vi.useRealTimers();
});
describe('temporary sidebar settings preview', () => {
  it('opens only Memory evolution on hover, retains both menus while comparing, and restores disclosure without saving it', () => {
    render();
    const saved = prefs.getSnapshot();
    click('sidebar.settings');
    expect(host.textContent).not.toContain('memory.terms.git');
    hover('entry.memoryEvolution · memory.terminology');
    expect(expanded()).toEqual(['memory-evolution']);
    expect(host.querySelectorAll('[role=menu]')).toHaveLength(2);
    click('memory.terms.git');
    expect(host.textContent).toContain('memory-git');
    click('memory.terms.memory');
    expect(host.textContent).toContain('memory-memory');
    expect(host.querySelectorAll('[role=menu]')).toHaveLength(2);
    expect(prefs.getSnapshot()).toBe(saved);
    click('sidebar.settings');
    expect(expanded()).toEqual(['files', 'sessions']);
    expect(host.querySelector('[role=menu]')).toBeNull();
  });
  it('supports keyboard entry and keeps focus within the menus until Escape restores the prior state', () => {
    vi.useFakeTimers();
    render();
    click('sidebar.settings');
    const trigger = button('entry.memoryEvolution · memory.terminology');
    act(() =>
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );
    act(() => vi.runAllTimers());
    expect(document.activeElement?.textContent).toBe('memory.terms.memory');
    act(() =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    );
    expect(expanded()).toEqual(['files', 'sessions']);
    expect(host.querySelector('[role=menu]')).toBeNull();
  });
  it('does not restore a permission revoked while a different entry is being previewed', () => {
    prefs.setEntryExpanded('personabot:ada', 'computer', true);
    render();
    click('sidebar.settings');
    hover('entry.memoryEvolution · memory.terminology');
    act(() => revoke?.());
    click('sidebar.settings');
    expect(expanded()).toEqual(['files', 'sessions']);
    expect(prefs.isEntryExpanded('personabot:ada', 'computer')).toBe(false);
  });
  it('discards preview when the selected scope changes', () => {
    render();
    click('sidebar.settings');
    hover('entry.memoryEvolution · memory.terminology');
    render('bea');
    expect(expanded()).toEqual([]);
    expect(host.querySelector('[role=menu]')).toBeNull();
    render();
    expect(expanded()).toEqual(['files', 'sessions']);
  });
  it('restores disclosure if the preview entry disappears', () => {
    render();
    click('sidebar.settings');
    hover('entry.memoryEvolution · memory.terminology');
    entries = entries.filter((entry) => entry.id !== 'memory-evolution');
    render();
    expect(expanded()).toEqual(['files', 'sessions']);
  });
  it('clears preview before entering the existing transactional order editor', () => {
    render();
    click('sidebar.settings');
    hover('entry.memoryEvolution · memory.terminology');
    click('sidebar.order.edit');
    expect(expanded()).toEqual([]);
    expect(host.querySelector('[role=menu]')).toBeNull();
    click('sidebar.order.cancel');
    expect(expanded()).toEqual(['files', 'sessions']);
  });
});
