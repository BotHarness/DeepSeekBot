export interface ListedChannels {
  channels: readonly { id: string }[];
  activityChannels?: readonly { id: string }[];
}

export interface GroupListingChange {
  gone: string[];
  stale?: (cacheKey: string) => boolean;
}

export function watchDisbandedGroups(): (listing: ListedChannels) => GroupListingChange {
  let previous: ReadonlySet<string> | undefined;
  return (listing) => {
    const current = new Set(listing.channels.map((channel) => channel.id));
    const gone = [...(previous ?? [])].filter((id) => !current.has(id));
    const changed = previous === undefined || gone.length > 0;
    previous = current;
    const known = listing.activityChannels;
    if (!changed || known === undefined) return { gone };
    const listed = new Set([...current, ...known.map((channel) => channel.id)]);
    return {
      gone,
      stale: (cacheKey) => cacheKey.startsWith('channel:') && !listed.has(cacheKey.slice(8)),
    };
  };
}
