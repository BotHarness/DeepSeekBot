import { WORKSPACE_RAIL } from '../workspace-context.js';
import { type DockviewApi } from 'dockview-react';
import type { DockPanelRegistration } from '../dock-panels.js';
import {
  CHANNEL_BODY_COMPONENT,
  CHANNEL_BODY_PANEL,
  CHANNEL_ENTRY_COMPONENT,
  DEFAULT_DOCK_PANELS,
  dockPanelGap,
  resolveDefaultPosition,
  resolveDockPosition,
  type DockPosition,
} from '../channel-dock-layout.js';
import { clampChannelSidebarWidth, channelSidebarPrefs } from '../channel-sidebar-prefs.js';
import { ChannelBodyPanel } from './body-panel.js';
import { ChannelEntryPanel } from './entry-panel.js';
import { WorkspaceRailPanel } from './dock-context.js';
export { BOT_WORKSPACE_PANELS } from '../channel-dock-layout.js';

export const COMPONENTS = {
  [WORKSPACE_RAIL]: WorkspaceRailPanel,
  [CHANNEL_BODY_COMPONENT]: ChannelBodyPanel,
  [CHANNEL_ENTRY_COMPONENT]: ChannelEntryPanel,
};

export function hideBodyHeader(api: DockviewApi): void {
  for (const id of [CHANNEL_BODY_PANEL, WORKSPACE_RAIL]) {
    const group = api.getPanel(id)?.group;
    if (group !== undefined)
      group.header.hidden =
        id === WORKSPACE_RAIL || api.getPanel(id)?.params?.entryId !== CHANNEL_BODY_PANEL;
    if (id === WORKSPACE_RAIL && group) {
      group.locked = 'no-drop-target';
      if (group.minimumWidth !== 56 || group.maximumWidth !== 56)
        group.api.setConstraints({ minimumWidth: 56, maximumWidth: 56 });
    }
  }
}

export function restoreEntryPanel(
  api: DockviewApi,
  panel: DockPanelRegistration,
  remembered: DockPosition | undefined,
  gap: number,
): void {
  if (api.getPanel(panel.id) !== undefined) return;
  const added = api.addPanel({
    id: panel.id,
    component: panel.id === CHANNEL_BODY_PANEL ? CHANNEL_BODY_COMPONENT : CHANNEL_ENTRY_COMPONENT,
    title: panel.title,
    ...(remembered?.size
      ? {
          ...(remembered.direction === 'left' || remembered.direction === 'right'
            ? { initialWidth: Math.round(remembered.size.width * api.width) }
            : { initialHeight: Math.round(remembered.size.height * api.height) }),
        }
      : {}),
    params: { entryId: panel.id },
    position:
      remembered === undefined
        ? resolveDefaultPosition(api, panel.defaultPosition, panel.id)
        : resolveDockPosition(api, remembered),
  });
  if (remembered?.size) {
    const offset = dockPanelGap(api.toJSON(), panel.id, gap);
    added.group.api.setSize({
      ...(remembered.direction === 'left' || remembered.direction === 'right'
        ? { width: remembered.size.width * api.width + offset.width }
        : { height: remembered.size.height * api.height + offset.height }),
    });
  }
}

export function buildDefaultLayout(
  api: DockviewApi,
  entries: ReadonlyMap<string, DockPanelRegistration>,
) {
  api.clear();
  api.addPanel({
    id: CHANNEL_BODY_PANEL,
    component: CHANNEL_BODY_COMPONENT,
    title: entries.get(CHANNEL_BODY_PANEL)?.title ?? CHANNEL_BODY_PANEL,
    params: entries.has(CHANNEL_BODY_PANEL) ? { entryId: CHANNEL_BODY_PANEL } : {},
  });
  let previous: string | undefined;
  for (const id of DEFAULT_DOCK_PANELS) {
    const entry = entries.get(id);
    if (entry === undefined) continue;
    api.addPanel({
      id,
      component: CHANNEL_ENTRY_COMPONENT,
      title: entry.title,
      params: { entryId: id },
      position:
        previous === undefined
          ? { referencePanel: CHANNEL_BODY_PANEL, direction: 'right' }
          : { referencePanel: previous, direction: 'below' },
    });
    previous ??= id;
  }
  const column = previous === undefined ? undefined : api.getPanel(previous)?.group;
  column?.api.setSize({
    width: clampChannelSidebarWidth(channelSidebarPrefs.getSnapshot().width),
  });
  hideBodyHeader(api);
}

export const EMPTY_LAYOUT: import('dockview-react').SerializedDockview = {
  grid: {
    root: { type: 'branch', data: [] },
    width: 0,
    height: 0,
    orientation: 'HORIZONTAL' as import('dockview-react').SerializedDockview['grid']['orientation'],
  },
  panels: {},
};

export function simpleViewIds(sideColumn: string | null): readonly string[] {
  return sideColumn === null ? [CHANNEL_BODY_PANEL] : [sideColumn, CHANNEL_BODY_PANEL];
}
