import type { ComponentType } from 'react';

import type { ChannelSidebarEntry } from './channel-sidebar.js';

export const ACTIVITY_CENTER_PANEL = 'activity-center';

export type DockPanelScope = 'global' | 'channel';

export interface DockPanelPosition {
  readonly zone: 'left' | 'center' | 'right' | 'bottom';
  readonly relativeTo?: string | undefined;
}

export interface DockPanelChannel {
  readonly id: string;
  readonly type: 'dm' | 'group';
  readonly botSlug: string | undefined;
}

export interface DockPanelProps {
  readonly channel: DockPanelChannel | undefined;
}

export interface DockPanel {
  readonly id: string;
  readonly title: string;
  readonly icon?: string | undefined;
  readonly scope: DockPanelScope;
  readonly defaultPosition?: DockPanelPosition | undefined;
  readonly order?: number | undefined;
  readonly component: ComponentType<DockPanelProps>;
}

export interface DockPanelRegistration extends DockPanel {
  readonly entry?: ChannelSidebarEntry | undefined;
}

export interface DockPanelLayout {
  open(id: string): void;
  close(id: string): void;
}

export interface DockPanelRegistry {
  register(panel: DockPanel): () => void;
  panels(): readonly DockPanelRegistration[];
  openPanels(): readonly string[];
  available(): boolean;
  isOpen(id: string): boolean;
  open(id: string): void;
  close(id: string): void;
  toggle(id: string): void;
  subscribe(listener: () => void): () => void;
}

export interface DockPanelHost extends DockPanelRegistry {
  registerEntry(entry: ChannelSidebarEntry, defaultPosition?: DockPanelPosition): () => void;
  attach(layout: DockPanelLayout): () => void;
  reportOpen(ids: readonly string[]): void;
}

const NO_IDS: readonly string[] = [];

function compare(left: DockPanelRegistration, right: DockPanelRegistration): number {
  return (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id);
}

export function dockPanelsFromEntries(
  entries: readonly ChannelSidebarEntry[],
): readonly DockPanelRegistration[] {
  const registry = createDockPanelRegistry();
  for (const entry of entries) registry.registerEntry(entry);
  return registry.panels();
}

export function createDockPanelRegistry(): DockPanelHost {
  const registrations = new Map<string, DockPanelRegistration>();
  const listeners = new Set<() => void>();
  let ordered: readonly DockPanelRegistration[] = [];
  let open: readonly string[] = NO_IDS;
  let layout: DockPanelLayout | undefined;

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const add = (registration: DockPanelRegistration): (() => void) => {
    if (registrations.has(registration.id))
      throw new Error(`duplicate Dock panel: ${registration.id}`);
    registrations.set(registration.id, registration);
    ordered = [...registrations.values()].sort(compare);
    notify();
    return () => {
      if (registrations.get(registration.id) !== registration) return;
      registrations.delete(registration.id);
      ordered = [...registrations.values()].sort(compare);
      notify();
    };
  };

  const registry: DockPanelHost = {
    register: (panel) => add({ ...panel, entry: undefined }),
    registerEntry: (entry, defaultPosition) =>
      add({
        id: entry.id,
        title: entry.label,
        icon: entry.icon,
        scope: 'channel',
        defaultPosition,
        order: entry.order,
        component: () => null,
        entry,
      }),
    panels: () => ordered,
    openPanels: () => open,
    available: () => layout !== undefined,
    isOpen: (id) => open.includes(id),
    open: (id) => layout?.open(id),
    close: (id) => layout?.close(id),
    toggle: (id) => (open.includes(id) ? registry.close(id) : registry.open(id)),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    attach(next) {
      layout = next;
      notify();
      return () => {
        if (layout !== next) return;
        layout = undefined;
        open = NO_IDS;
        notify();
      };
    },
    reportOpen(ids) {
      if (ids.length === open.length && ids.every((id, index) => open[index] === id)) return;
      open = ids.length === 0 ? NO_IDS : [...ids];
      notify();
    },
  };
  return registry;
}
