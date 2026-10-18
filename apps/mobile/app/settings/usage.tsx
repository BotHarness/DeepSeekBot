import { useRouter } from 'expo-router';
import { useMemo } from 'react';

import { useHostSession, useHostSnapshot } from '../../src/host/host-session';
import {
  loadMemoryActivity,
  loadMoreMemoryActivity,
  loadMoreUsage,
  loadUsage,
} from '../../src/host/usage';
import { UsageView, type UsageSources } from '../../src/ui/usage-view';

export default function UsageScreen() {
  const router = useRouter();
  const { saved, client } = useHostSession();
  const roster = useHostSnapshot(client).roster;
  const sources = useMemo<UsageSources | undefined>(
    () =>
      client === undefined
        ? undefined
        : {
            loadUsage: (period) => loadUsage(client, period),
            loadMoreUsage: (current) => loadMoreUsage(client, current),
            loadMemory: () => loadMemoryActivity(client),
            loadMoreMemory: (current) => loadMoreMemoryActivity(client, current),
          },
    [client],
  );
  if (sources === undefined) return null;
  return (
    <UsageView
      key={saved?.hostId}
      sources={sources}
      roster={roster?.bots ?? []}
      onOpenBot={(slug) => router.push({ pathname: '/bot/[slug]', params: { slug } })}
    />
  );
}
