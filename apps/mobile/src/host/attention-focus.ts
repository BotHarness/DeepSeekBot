export interface FocusedChannel {
  hostId: string;
  channelId: string;
}

export interface AttentionTarget {
  hostId?: unknown;
  channelId?: unknown;
  kind?: unknown;
}

const REPLY_KINDS = new Set(['channel-reply', 'channel-mention']);

export const dmChannel = (slug: string) => `dm-${slug}`;

export function createAttentionFocus() {
  const held = new Map<symbol, FocusedChannel>();
  const listeners = new Set<() => void>();
  const publish = () => {
    for (const listener of listeners) listener();
  };
  const channels = (hostId: string): string[] => [
    ...new Set(
      [...held.values()].filter((entry) => entry.hostId === hostId).map((entry) => entry.channelId),
    ),
  ];
  return {
    hold(channel: FocusedChannel): () => void {
      const token = Symbol(channel.channelId);
      held.set(token, { ...channel });
      publish();
      return () => {
        if (held.delete(token)) publish();
      };
    },
    channels,
    covers(target: AttentionTarget | null | undefined): boolean {
      if (typeof target !== 'object' || target === null) return false;
      const { hostId, channelId, kind } = target;
      if (typeof hostId !== 'string' || typeof channelId !== 'string') return false;
      if (typeof kind !== 'string' || !REPLY_KINDS.has(kind)) return false;
      return channels(hostId).includes(channelId);
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type AttentionFocus = ReturnType<typeof createAttentionFocus>;

export const attentionFocus = createAttentionFocus();
