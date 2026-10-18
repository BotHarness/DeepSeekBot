import { useCallback, useSyncExternalStore } from 'react';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { useClientState } from './bot-sidebar.js';
import { store } from './store.js';
import { defaultStorage } from './roster-config.js';

export const SESSION_TARGET_KEY = 'botharness/session-targets.v1';
export type SessionTarget = { kind: 'channel' } | { kind: 'bot'; slug: string };
const listeners = new Set<() => void>();
const cache = new Map<string, string>();
function read(channelId: string): string {
  if (cache.has(channelId)) return cache.get(channelId)!;
  try {
    const value: unknown = JSON.parse(defaultStorage()?.getItem(SESSION_TARGET_KEY) ?? '{}');
    if (value && typeof value === 'object' && channelId in value) {
      const slug = (value as Record<string, unknown>)[channelId];
      if (typeof slug === 'string') {
        cache.set(channelId, slug);
        return slug;
      }
    }
  } catch {}
  return '';
}
export function setSessionTarget(channelId: string, slug: string): void {
  cache.set(channelId, slug);
  try {
    const storage = defaultStorage();
    const raw: unknown = JSON.parse(storage?.getItem(SESSION_TARGET_KEY) ?? '{}');
    storage?.setItem(
      SESSION_TARGET_KEY,
      JSON.stringify({
        ...(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}),
        [channelId]: slug,
      }),
    );
  } catch {}
  listeners.forEach((listener) => listener());
}
function subscribe(channelId: string, listener: () => void) {
  listeners.add(listener);
  let disposed = false;
  const reconcile = () => {
    if (disposed) return;
    const state = store.getSnapshot();
    const channel =
      state.conversation.channel?.id === channelId
        ? state.conversation.channel
        : state.channels.find((item) => item.id === channelId);
    const slug = read(channelId);
    if (
      slug &&
      state.status === 'ready' &&
      channel?.type === 'group' &&
      (!channel.members.includes(slug) || !state.bots.some((bot) => bot.slug === slug))
    )
      setSessionTarget(channelId, '');
  };
  const unsubscribe = store.subscribe(reconcile);
  queueMicrotask(reconcile);
  return () => {
    disposed = true;
    unsubscribe();
    listeners.delete(listener);
  };
}
export function useSessionTarget(
  props: Pick<ChannelSidebarEntryProps, 'channelId' | 'botSlug'>,
): SessionTarget {
  const state = useClientState();
  const slug = useSyncExternalStore(
    useCallback((listener) => subscribe(props.channelId, listener), [props.channelId]),
    () => read(props.channelId),
    () => read(props.channelId),
  );
  const channel =
    state.conversation.channel?.id === props.channelId
      ? state.conversation.channel
      : state.channels.find((c) => c.id === props.channelId);
  const valid =
    !!slug && !!channel?.members.includes(slug) && state.bots.some((bot) => bot.slug === slug);
  return props.botSlug
    ? { kind: 'bot', slug: props.botSlug }
    : valid
      ? { kind: 'bot', slug }
      : { kind: 'channel' };
}
