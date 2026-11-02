import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { useHostSession, useHostSnapshot } from '../../../src/host/host-session';
import { loadMemoryCommit } from '../../../src/host/memory-changes';
import { MemoryCommitView } from '../../../src/ui/chat/memory-changes';
import { useStrings } from '../../../src/ui/strings';

export default function MemoryCommitScreen() {
  const t = useStrings();
  const {
    slug,
    sha = '',
    at,
  } = useLocalSearchParams<{ slug: string; sha?: string; at?: string }>();
  const { client } = useHostSession();
  const bot = useHostSnapshot(client).roster?.bots.find((entry) => entry.slug === slug);
  const load = useMemo(
    () =>
      client === undefined || bot === undefined
        ? undefined
        : () => loadMemoryCommit(client, bot, sha),
    [client, bot?.slug, bot?.dmChannelId, sha],
  );
  const when = at === undefined ? undefined : new Date(at);
  const title =
    when === undefined || Number.isNaN(when.getTime())
      ? t.memoryChangeTitle
      : when.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
  return (
    <>
      <Stack.Screen options={{ title }} />
      {load === undefined ? null : <MemoryCommitView key={sha} load={load} />}
    </>
  );
}
