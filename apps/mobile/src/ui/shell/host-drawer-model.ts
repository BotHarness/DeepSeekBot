import type { HostGlance } from '../../host/host-glance';
import type { SavedHost } from '../../host/hosts';

export const DRAWER_SHARE = 0.85;
export const EDGE_WIDTH = 24;
const SETTLE_SHARE = 0.4;
const FLING = 500;

export interface HostDrawerRow {
  hostId: string;
  hostName: string;
  current: boolean;
  glance: HostGlance;
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

export function drawerWidth(windowWidth: number): number {
  return Math.round(windowWidth * DRAWER_SHARE);
}

export function settleOpen(progress: number, velocityX: number): boolean {
  'worklet';
  if (velocityX > FLING) return true;
  if (velocityX < -FLING) return false;
  return progress > SETTLE_SHARE;
}

export interface HostDrawerState {
  open: boolean;
  shown: boolean;
}

export interface HostDrawerPort {
  switchTo(hostId: string): Promise<boolean>;
  pair(): void;
  notifications(): void;
}

export interface HostDrawer {
  getSnapshot(): HostDrawerState;
  subscribe(listener: () => void): () => void;
  reveal(): void;
  open(): void;
  close(): void;
  hidden(): void;
  select(hostId: string): Promise<boolean>;
  pairNew(): void;
  openNotifications(): void;
  setReturnFocus(focus: (() => void) | undefined): void;
}

export function createHostDrawer(port: HostDrawerPort): HostDrawer {
  const listeners = new Set<() => void>();
  let state: HostDrawerState = { open: false, shown: false };
  let returnFocus: (() => void) | undefined;

  const publish = (next: HostDrawerState): void => {
    if (next.open === state.open && next.shown === state.shown) return;
    const closing = state.open && !next.open;
    state = next;
    for (const listener of listeners) listener();
    if (closing) returnFocus?.();
  };

  const close = (): void => publish({ open: false, shown: state.shown });

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
      close();
      return port.switchTo(hostId);
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
