import type { RosterView } from '../../host/client';
import type { ChatPlace } from './chat-place';

export type ProfilePageTarget =
  | { kind: 'bot'; hostId: string; slug: string }
  | { kind: 'group' | 'pair'; hostId: string; channelId: string };

export function profilePageTarget(
  place: ChatPlace,
  hostId: string | undefined,
  roster: RosterView | undefined,
): ProfilePageTarget | undefined {
  if (hostId === undefined) return undefined;
  if (place.kind === 'dm')
    return place.slug === undefined ? undefined : { kind: 'bot', hostId, slug: place.slug };
  if (place.channelId === undefined) return undefined;
  const detail = roster?.activityChannels?.find((channel) => channel.id === place.channelId);
  if (detail?.type === 'dm' && detail.botSlug === undefined)
    return { kind: 'pair', hostId, channelId: place.channelId };
  return roster?.channels.some((channel) => channel.id === place.channelId)
    ? { kind: 'group', hostId, channelId: place.channelId }
    : undefined;
}
