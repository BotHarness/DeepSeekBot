import type { DockPanelHost } from '../dock-panels.js';
import type { TeamSectionId } from './sections.js';

export const TEAM_WORKBENCH_PANEL = 'team-workbench';

export interface TeamSectionRequest {
  readonly section: TeamSectionId;
}

let request: TeamSectionRequest | undefined;
const listeners = new Set<() => void>();

export function teamSectionRequest(): TeamSectionRequest | undefined {
  return request;
}

export function subscribeTeamSectionRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function openTeamWorkbenchSection(
  panels: Pick<DockPanelHost, 'available' | 'open' | 'subscribe'>,
  activate: () => void,
  section: TeamSectionId,
): void {
  const open = (): void => {
    request = { section };
    for (const listener of listeners) listener();
    panels.open(TEAM_WORKBENCH_PANEL);
  };
  if (panels.available()) {
    open();
    return;
  }
  const unsubscribe = panels.subscribe(() => {
    if (!panels.available()) return;
    clearTimeout(timeout);
    unsubscribe();
    open();
  });
  const timeout = setTimeout(unsubscribe, 10_000);
  activate();
}

export function imConnectionsOpener<Panel>(
  panels: Pick<DockPanelHost, 'available' | 'open' | 'subscribe'>,
  layout: { selectPanel(id: Panel): void },
  main: Panel,
): () => void {
  return () => openTeamWorkbenchSection(panels, () => layout.selectPanel(main), 'imConnections');
}
