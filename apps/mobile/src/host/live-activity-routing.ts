import type { ActivityTarget } from './live-activity-session';

export type InitiatedActivityRequest = Omit<ActivityTarget, 'channelId'> & { channelId?: string };

export function subscribeActivityHost(
  session: {
    getState(): {
      saved: { hostId: string } | null | undefined;
      client: { subscribe(listener: () => void): () => void } | undefined;
    };
    subscribe(listener: () => void): () => void;
  },
  changed: () => void,
): () => void {
  let disposed = false;
  let generation = 0;
  let current: ReturnType<typeof session.getState>['client'];
  let hostId: string | undefined;
  let offClient: (() => void) | undefined;
  const bind = () => {
    const next = session.getState();
    if (next.client === current && next.saved?.hostId === hostId) return;
    offClient?.();
    current = next.client;
    hostId = next.saved?.hostId;
    const binding = ++generation;
    offClient = current?.subscribe(() => {
      if (!disposed && binding === generation) changed();
    });
  };
  const offSession = session.subscribe(() => {
    if (disposed) return;
    bind();
    changed();
  });
  bind();
  return () => {
    disposed = true;
    offSession();
    offClient?.();
  };
}

export function activityDestination(
  target: ActivityTarget,
  currentHostId: string | undefined,
  dmChannelId: string | undefined,
) {
  if (currentHostId !== target.hostId || dmChannelId !== target.channelId) return undefined;
  return {
    pathname: '/dm/[slug]' as const,
    params: { slug: target.botSlug, hostId: target.hostId, focus: target.messageId },
  };
}

export function activityStartTarget(
  initiated: InitiatedActivityRequest | undefined,
  hostId: string | undefined,
  channelId: string | undefined,
  committed: readonly string[],
): ActivityTarget | undefined {
  return initiated &&
    initiated.hostId === hostId &&
    channelId !== undefined &&
    (initiated.channelId === undefined || initiated.channelId === channelId) &&
    committed.includes(initiated.messageId)
    ? { ...initiated, channelId }
    : undefined;
}
