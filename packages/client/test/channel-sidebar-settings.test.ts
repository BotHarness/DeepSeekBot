// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChannelSidebarEntryProps } from '../src/client/channel-sidebar.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronRightOutlineRegular: () => null,
  Menu: ({ open, anchor, children }: { open: boolean; anchor: ReactNode; children: ReactNode }) =>
    createElement(
      'div',
      null,
      anchor,
      open ? createElement('div', { role: 'menu' }, children) : null,
    ),
  Tooltip: ({ children }: { children: ReactNode }) => children,
  MenuSurface: ({ children, ...props }: { children: ReactNode }) =>
    createElement('div', props, children),
  MenuItemButton: ({
    onSelect,
    children,
    disabled,
    icon,
  }: {
    onSelect: () => void;
    children: ReactNode;
    disabled?: boolean;
    icon?: ReactNode;
  }) => createElement('button', { role: 'menuitem', onClick: onSelect, disabled }, icon, children),
}));
import {
  ChannelSidebarSettings,
  MemoryDisplaySettings,
} from '../src/client/channel-sidebar-settings.js';
import {
  readSessionViewPreference,
  updateSessionViewPreference,
} from '../src/client/session-view-prefs.js';
import {
  channelSidebarPrefs,
  createChannelSidebarPrefs,
} from '../src/client/channel-sidebar-prefs.js';
import { hiddenDmActionsSnapshot } from '../src/client/dm-actions.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: { root: Root; container: HTMLDivElement }[] = [];
const props = {
  scope: 'personabot',
  channelId: 'dm-qa',
  botSlug: 'settings-qa',
  actions: {},
  t: (key: string) => key,
} as unknown as ChannelSidebarEntryProps;
function mount(slug: string | null = 'settings-qa', settings = true) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() =>
    root.render(
      createElement(ChannelSidebarSettings, {
        entryProps:
          slug === null
            ? { ...props, scope: 'channel', channelId: 'group-qa', botSlug: undefined }
            : { ...props, botSlug: slug },
        entries: settings
          ? [
              {
                id: 'memory',
                label: 'Memory',
                scope: 'personabot',
                component: () => null,
                settings: MemoryDisplaySettings,
              },
            ]
          : [],
      }),
    ),
  );
  return container;
}
function click(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll('button')].find(
    (n) => n.textContent === label || n.getAttribute('aria-label') === label,
  );
  expect(button).toBeDefined();
  act(() => button!.click());
}
afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  act(() => channelSidebarPrefs.setMemoryTerminology('memory'));
  localStorage.clear();
});

describe('registered Channel sidebar display settings', () => {
  it('keeps terminology shared across Bots and restores it from browser storage', () => {
    const first = mount('memory-qa-one');
    const second = mount('memory-qa-two');
    click(first, 'sidebar.settings');
    click(second, 'sidebar.settings');
    click(first, 'entry.memoryEvolution · memory.terminology');
    click(second, 'entry.memoryEvolution · memory.terminology');
    click(first, 'memory.terms.git');
    expect(channelSidebarPrefs.getSnapshot().memoryTerminology).toBe('git');
    expect(createChannelSidebarPrefs(localStorage).getSnapshot().memoryTerminology).toBe('git');
    const selected = [...second.querySelectorAll('button')].find(
      (n) => n.textContent === 'memory.terms.git',
    );
    expect(selected?.querySelector('svg')).not.toBeNull();
  });
  it('offers a disabled empty state when current visible entries have no settings', () => {
    const container = mount(null, false);
    click(container, 'sidebar.settings');
    const item = container.querySelector('[role=menuitem]');
    expect(item?.textContent).toBe('sidebar.settings.empty');
    expect(item?.hasAttribute('disabled')).toBe(true);
    expect(container.textContent).not.toContain('sessions.all');
  });
  it('toggles which of the Bot actions elsewhere its DM shows, per Bot', () => {
    const container = mount('timeline-qa', false);
    click(container, 'sidebar.settings');
    click(container, 'dmTrace.menu');
    const item = (label: string) =>
      [...container.querySelectorAll('button')].find((n) => n.textContent === label);
    expect(item('dmTrace.kind.posts')?.querySelector('svg')).not.toBeNull();
    click(container, 'dmTrace.kind.posts');
    expect(hiddenDmActionsSnapshot('timeline-qa')).toEqual(['posts']);
    expect(hiddenDmActionsSnapshot('timeline-other')).toEqual([]);
    expect(item('dmTrace.kind.posts')?.querySelector('svg')).toBeNull();
    expect(item('dmTrace.kind.memory')?.querySelector('svg')).not.toBeNull();
    click(container, 'dmTrace.kind.posts');
    expect(hiddenDmActionsSnapshot('timeline-qa')).toEqual([]);
  });
});
