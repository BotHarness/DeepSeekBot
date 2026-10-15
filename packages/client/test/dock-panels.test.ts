import { describe, expect, it } from 'vitest';

import {
  createChannelSidebarRegistry,
  type ChannelSidebarEntry,
} from '../src/client/channel-sidebar.js';
import { createDockPanelRegistry, type DockPanel } from '../src/client/dock-panels.js';

const panel = (id: string, overrides: Partial<DockPanel> = {}): DockPanel => ({
  id,
  title: id,
  scope: 'global',
  component: () => null,
  ...overrides,
});

const entry = (id: string, overrides: Partial<ChannelSidebarEntry> = {}): ChannelSidebarEntry => ({
  id,
  label: id,
  scope: 'personabot',
  component: () => null,
  ...overrides,
});

describe('dockPanels registry', () => {
  it('orders panels by order then id, with a stable list between changes', () => {
    const registry = createDockPanelRegistry();
    registry.register(panel('todo', { order: 20 }));
    registry.register(panel('goals', { order: 10 }));
    registry.register(panel('alpha', { order: 20 }));
    const first = registry.panels();
    expect(first.map((item) => item.id)).toEqual(['goals', 'alpha', 'todo']);
    expect(registry.panels()).toBe(first);
  });

  it('rejects a duplicate id and disposes one registration once', () => {
    const registry = createDockPanelRegistry();
    const seen: number[] = [];
    registry.subscribe(() => seen.push(registry.panels().length));
    const dispose = registry.register(panel('todo'));
    expect(() => registry.register(panel('todo'))).toThrow(/duplicate Dock panel: todo/);
    registry.register(panel('goals'));
    dispose();
    dispose();
    expect(registry.panels().map((item) => item.id)).toEqual(['goals']);
    expect(seen).toEqual([1, 2, 1]);
  });

  it('does not let a stale disposer remove a newer registration of the same id', () => {
    const registry = createDockPanelRegistry();
    const dispose = registry.register(panel('todo', { title: 'old' }));
    dispose();
    registry.register(panel('todo', { title: 'new' }));
    dispose();
    expect(registry.panels().map((item) => item.title)).toEqual(['new']);
  });

  it('routes open and close to the mounted layout and forgets open panels when it leaves', () => {
    const registry = createDockPanelRegistry();
    const calls: string[] = [];
    const detach = registry.attach({
      open: (id) => calls.push(`open:${id}`),
      close: (id) => calls.push(`close:${id}`),
    });
    registry.reportOpen(['sessions']);
    registry.toggle('sessions');
    registry.toggle('todo');
    expect(calls).toEqual(['close:sessions', 'open:todo']);
    expect(registry.isOpen('sessions')).toBe(true);
    detach();
    expect(registry.openPanels()).toEqual([]);
    registry.open('todo');
    expect(calls).toHaveLength(2);
  });

  it('reports whether a layout is mounted so the sidebar cards can enable themselves', () => {
    const registry = createDockPanelRegistry();
    const seen: boolean[] = [];
    registry.subscribe(() => seen.push(registry.available()));
    expect(registry.available()).toBe(false);
    const detach = registry.attach({ open: () => {}, close: () => {} });
    expect(registry.available()).toBe(true);
    detach();
    expect(registry.available()).toBe(false);
    expect(seen).toEqual([true, false]);
  });
});

describe('channelSidebar on top of dockPanels', () => {
  it('registers each entry as a channel panel, but not Channel settings sections', () => {
    const dock = createDockPanelRegistry();
    const sidebar = createChannelSidebarRegistry(dock);
    const dispose = sidebar.register(entry('sessions', { icon: 'history', order: 10 }));
    sidebar.register(entry('approval', { surface: 'settings' }));
    expect(dock.panels()).toEqual([
      expect.objectContaining({
        id: 'sessions',
        title: 'sessions',
        icon: 'history',
        scope: 'channel',
        order: 10,
      }),
    ]);
    dispose();
    expect(dock.panels()).toEqual([]);
    expect(sidebar.entries('personabot').map((item) => item.id)).toEqual(['approval']);
  });

  it('places entries that share a tab next to each other', () => {
    const dock = createDockPanelRegistry();
    const sidebar = createChannelSidebarRegistry(dock);
    sidebar.registerTab({ id: 'sessions', label: 'Sessions', scope: 'personabot' });
    sidebar.register(entry('sessions', { tab: 'sessions' }));
    sidebar.register(entry('bot-inbox', { tab: 'sessions' }));
    expect(dock.panels().find((item) => item.id === 'sessions')?.defaultPosition).toBeUndefined();
    expect(dock.panels().find((item) => item.id === 'bot-inbox')?.defaultPosition).toEqual({
      zone: 'right',
      relativeTo: 'sessions',
    });
  });

  it('refuses an entry whose id another plugin already took as a Dock panel', () => {
    const dock = createDockPanelRegistry();
    const sidebar = createChannelSidebarRegistry(dock);
    dock.register(panel('computer'));
    expect(() => sidebar.register(entry('computer'))).toThrow(/duplicate Dock panel/);
    expect(sidebar.entries('personabot')).toEqual([]);
  });
});
