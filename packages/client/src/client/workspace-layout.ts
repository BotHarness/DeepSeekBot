import type { DockviewApi, SerializedDockview, SerializedGridObject } from 'dockview-react';
import { WORKSPACE_RAIL } from './workspace-context.js';

type Node = SerializedGridObject<{ id: string; views: string[]; activeView?: string }>;

function contains(node: Node, panel: string): boolean {
  return node.type === 'leaf'
    ? (node.data as { views: string[] }).views.includes(panel)
    : (node.data as Node[]).some((child) => contains(child, panel));
}

function groups(node: Node): string[] {
  return node.type === 'leaf'
    ? [(node.data as { id: string }).id]
    : (node.data as Node[]).flatMap(groups);
}

export function workspaceColumns(api: DockviewApi): { id: string; left: number }[] {
  const layout = api.toJSON();
  if (layout.grid.orientation !== 'HORIZONTAL') return [];
  return (layout.grid.root.data as Node[])
    .filter((node) => !contains(node, WORKSPACE_RAIL))
    .map((node) => {
      const ids = groups(node);
      return {
        id: ids[0]!,
        left: Math.min(
          ...ids.map(
            (id) => api.groups.find((group) => group.id === id)?.api.boundingBox?.left ?? 0,
          ),
        ),
      };
    });
}

export function reorderWorkspaceRail(
  layout: SerializedDockview,
  before: string,
): SerializedDockview {
  const children = layout.grid.root.data as Node[];
  const rail = children.find((node) => node.type === 'leaf' && contains(node, WORKSPACE_RAIL));
  if (!rail || layout.grid.orientation !== 'HORIZONTAL') return layout;
  const columns = children.filter((node) => node !== rail);
  const target =
    before === 'right'
      ? columns.length
      : before === 'left'
        ? 0
        : columns.findIndex((node) => groups(node).includes(before));
  if (target < 0) return layout;
  columns.splice(target, 0, rail);
  return { ...layout, grid: { ...layout.grid, root: { ...layout.grid.root, data: columns } } };
}

export function moveWorkspaceRail(api: DockviewApi, before: string): void {
  const current = api.toJSON();
  api.fromJSON(reorderWorkspaceRail(current, before), { reuseExistingPanels: true });
}

export function isFullHeightRail(layout: SerializedDockview): boolean {
  if (layout.grid.orientation !== 'HORIZONTAL') return false;
  const columns = layout.grid.root.data as Node[];
  return columns.some(
    (node) =>
      node.type === 'leaf' &&
      contains(node, WORKSPACE_RAIL) &&
      (node.data as { views: string[] }).views.length === 1,
  );
}
