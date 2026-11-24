import type { ConnectHost } from '@botharness/host-client/connect-account';
import type { HostGlance } from '../../host/host-glance';
import type { SavedHost } from '@botharness/host-client/hosts';

export interface HostDrawerRow {
  hostId: string;
  hostName: string;
  current: boolean;
  glance: HostGlance;
}

function routeHost(route: string): string {
  try {
    return new URL(route).host;
  } catch {
    return '';
  }
}

export function unpairedAccountHosts(
  linked: readonly ConnectHost[],
  hosts: readonly SavedHost[],
): ConnectHost[] {
  const paired = new Set(hosts.flatMap((host) => host.routes.map(routeHost)));
  return linked.filter((host) => !paired.has(host.hostname));
}

export function hostDrawerRows(
  hosts: readonly SavedHost[],
  currentId: string | undefined,
  glances: Readonly<Record<string, HostGlance>>,
  live: HostGlance,
): HostDrawerRow[] {
  return hosts.map((host) => {
    const current = host.hostId === currentId;
    return {
      hostId: host.hostId,
      hostName: host.hostName,
      current,
      glance: current
        ? withUnread(live, glances[host.hostId]?.unread)
        : (glances[host.hostId] ?? { status: 'checking' }),
    };
  });
}

function withUnread(glance: HostGlance, unread: number | undefined): HostGlance {
  return unread === undefined || glance.status !== 'online' ? glance : { ...glance, unread };
}

export type HostRowBadge = { tone: 'needs-you' | 'unread'; count: number } | undefined;

export function hostRowBadge(glance: HostGlance): HostRowBadge {
  if ((glance.pending ?? 0) > 0) return { tone: 'needs-you', count: glance.pending! };
  if ((glance.unread ?? 0) > 0) return { tone: 'unread', count: glance.unread! };
  return undefined;
}

export interface HostDrawerState {
  open: boolean;
  shown: boolean;
}

export interface HostDrawerPort {
  switchTo(hostId: string, current: () => boolean): Promise<boolean>;
  showView(hostId: string | undefined): void;
  pair(): void;
  notifications(): void;
  failed?(error?: unknown): void;
}

export interface HostDrawer {
  getSnapshot(): HostDrawerState;
  subscribe(listener: () => void): () => void;
  reveal(): void;
  open(): void;
  close(): void;
  hidden(): void;
  select(hostId: string): Promise<boolean>;
  selectAll(): void;
  beginWorkspaceSelection(): () => boolean;
  invalidateWorkspaceSources(): void;
  captureWorkspaceSelection(): () => boolean;
  captureChosenWorkspace(): () => boolean;
  pairNew(): void;
  openNotifications(): void;
  setReturnFocus(focus: (() => void) | undefined): void;
}

export function createHostDrawer(port: HostDrawerPort): HostDrawer {
  const listeners = new Set<() => void>();
  let state: HostDrawerState = { open: false, shown: false };
  let returnFocus: (() => void) | undefined;
  let selection = 0;
  let sources = 0;
  let switching: Promise<boolean> | undefined;

  const publish = (next: HostDrawerState): void => {
    if (next.open === state.open && next.shown === state.shown) return;
    const closing = state.open && !next.open;
    state = next;
    for (const listener of listeners) listener();
    if (closing) returnFocus?.();
  };

  const close = (): void => publish({ open: false, shown: state.shown });
  const beginWorkspaceSelection = () => {
    const selected = ++selection;
    const source = sources;
    return () => selected === selection && source === sources;
  };
  const invalidateWorkspaceSources = () => {
    sources++;
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reveal: () => publish({ open: state.open, shown: true }),
    open: () => publish({ open: true, shown: true }),
    close,
    hidden() {
      if (!state.open) publish({ open: false, shown: false });
    },
    async select(hostId) {
      const current = beginWorkspaceSelection();
      close();
      const switchHost = () =>
        current() ? port.switchTo(hostId, current) : Promise.resolve(false);
      const pending =
        switching === undefined ? switchHost() : switching.then(switchHost, switchHost);
      switching = pending;
      try {
        const switched = await pending;
        if (switched && current()) port.showView(hostId);
        if (!switched && current()) port.failed?.();
        return switched;
      } catch (error) {
        if (current()) port.failed?.(error);
        return false;
      } finally {
        if (switching === pending) switching = undefined;
      }
    },
    selectAll() {
      beginWorkspaceSelection();
      close();
      port.showView(undefined);
    },
    beginWorkspaceSelection,
    invalidateWorkspaceSources,
    captureWorkspaceSelection() {
      const selected = selection;
      const source = sources;
      return () => selected === selection && source === sources;
    },
    captureChosenWorkspace() {
      const selected = selection;
      return () => selected === selection;
    },
    pairNew() {
      close();
      port.pair();
    },
    openNotifications() {
      close();
      port.notifications();
    },
    setReturnFocus(focus) {
      returnFocus = focus;
    },
  };
}
