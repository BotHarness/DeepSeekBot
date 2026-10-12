import { describe, expect, it } from 'vitest';

import {
  channelSidebarScopeKey,
  createChannelSidebarPrefs,
} from '../src/client/channel-sidebar-prefs.js';
import { resolveChannelSidebarMode } from '../src/client/channel-sidebar-layout.js';
import {
  createChannelSidebarRegistry,
  type ChannelSidebarEntry,
} from '../src/client/channel-sidebar.js';

function entry(overrides: Partial<ChannelSidebarEntry> & Pick<ChannelSidebarEntry, 'id'>) {
  return {
    label: overrides.id,
    scope: 'personabot' as const,
    component: () => null,
    ...overrides,
  };
}

describe('Channel sidebar registry', () => {
  it('orders entries by order then id and filters them by scope', () => {
    const registry = createChannelSidebarRegistry();
    registry.register(entry({ id: 'members', order: 20, scope: 'channel' }));
    registry.register(entry({ id: 'assignments', order: 10, scope: 'personabot' }));
    registry.register(entry({ id: 'inbox', order: 10, scope: 'personabot' }));
    registry.register(entry({ id: 'computer', order: 30, scope: 'personabot' }));

    expect(registry.entries('personabot').map((item) => item.id)).toEqual([
      'assignments',
      'inbox',
      'computer',
    ]);
    expect(registry.entries('channel').map((item) => item.id)).toEqual(['members']);
  });

  it('returns a reference-stable scope list between changes', () => {
    const registry = createChannelSidebarRegistry();
    registry.register(entry({ id: 'assignments' }));
    const first = registry.entries('personabot');
    expect(registry.entries('personabot')).toBe(first);
    registry.register(entry({ id: 'inbox' }));
    expect(registry.entries('personabot')).not.toBe(first);
  });

  it('disposes one registration and notifies subscribers', () => {
    const registry = createChannelSidebarRegistry();
    const seen: number[] = [];
    registry.subscribe(() => seen.push(registry.entries('personabot').length));
    const dispose = registry.register(entry({ id: 'assignments' }));
    registry.register(entry({ id: 'inbox' }));
    dispose();
    dispose();

    expect(registry.entries('personabot').map((item) => item.id)).toEqual(['inbox']);
    expect(seen).toEqual([1, 2, 1]);
  });

  it('rejects a duplicate entry id', () => {
    const registry = createChannelSidebarRegistry();
    registry.register(entry({ id: 'assignments' }));
    expect(() => registry.register(entry({ id: 'assignments' }))).toThrow(
      /duplicate Channel sidebar entry/,
    );
  });
});

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe('Channel sidebar preferences', () => {
  it('defaults to nothing collapsed and nothing expanded', () => {
    const prefs = createChannelSidebarPrefs(undefined);
    expect(prefs.getSnapshot()).toEqual({
      collapsedSidebars: [],
      expandedEntries: [],
      width: 320,
      memoryTerminology: 'memory',
      selectedTabs: {},
      splitRatios: {},
      entryOrders: { personabot: [], channel: [] },
      hiddenEntries: { personabot: [], channel: [] },
    });
    expect(prefs.isSidebarCollapsed('personabot:ada')).toBe(false);
    expect(prefs.isEntryExpanded('personabot:ada', 'assignments')).toBe(false);
  });

  it('round-trips collapse and expansion through storage', () => {
    const storage = fakeStorage();
    const prefs = createChannelSidebarPrefs(storage);
    prefs.setSidebarCollapsed('channel:group-team', true);
    prefs.setEntryExpanded('personabot:ada', 'assignments', true);
    prefs.setMemoryTerminology('git');

    const reopened = createChannelSidebarPrefs(storage);
    expect(reopened.isSidebarCollapsed('channel:group-team')).toBe(true);
    expect(reopened.isSidebarCollapsed('personabot:ada')).toBe(false);
    expect(reopened.isEntryExpanded('personabot:ada', 'assignments')).toBe(true);
    expect(reopened.isEntryExpanded('personabot:ada', 'inbox')).toBe(false);
    expect(reopened.getSnapshot().memoryTerminology).toBe('git');
  });

  it('notifies once per real change and stays quiet otherwise', () => {
    const prefs = createChannelSidebarPrefs(undefined);
    let notifications = 0;
    const unsubscribe = prefs.subscribe(() => {
      notifications += 1;
    });
    prefs.setSidebarCollapsed('personabot:ada', true);
    prefs.setSidebarCollapsed('personabot:ada', true);
    prefs.setEntryExpanded('personabot:ada', 'assignments', true);
    prefs.setEntryExpanded('personabot:ada', 'assignments', false);
    unsubscribe();
    prefs.setSidebarCollapsed('personabot:ada', false);

    expect(notifications).toBe(3);
  });

  it('survives unreadable storage', () => {
    const prefs = createChannelSidebarPrefs({
      getItem: () => '{not json',
      setItem: () => undefined,
    });
    expect(prefs.getSnapshot()).toEqual({
      collapsedSidebars: [],
      expandedEntries: [],
      width: 320,
      memoryTerminology: 'memory',
      selectedTabs: {},
      splitRatios: {},
      entryOrders: { personabot: [], channel: [] },
      hiddenEntries: { personabot: [], channel: [] },
    });
  });

  it('keys scopes by PersonaBot and by Channel', () => {
    expect(channelSidebarScopeKey('personabot', 'dm-ada', 'ada')).toBe('personabot:ada');
    expect(channelSidebarScopeKey('channel', 'group-team', 'ada')).toBe('channel:group-team');
    expect(channelSidebarScopeKey('personabot', 'dm-ada', undefined)).toBe('personabot:dm-ada');
  });
});

describe('Channel sidebar layout', () => {
  it('docks on wide layouts unless the Human collapsed it', () => {
    expect(resolveChannelSidebarMode({ narrow: false, docked: true, overlayOpen: false })).toBe(
      'dock',
    );
    expect(resolveChannelSidebarMode({ narrow: false, docked: false, overlayOpen: false })).toBe(
      'hidden',
    );
  });

  it('hides on narrow layouts and opens only as a transient overlay', () => {
    expect(resolveChannelSidebarMode({ narrow: true, docked: true, overlayOpen: false })).toBe(
      'hidden',
    );
    expect(resolveChannelSidebarMode({ narrow: true, docked: false, overlayOpen: true })).toBe(
      'overlay',
    );
  });
});
