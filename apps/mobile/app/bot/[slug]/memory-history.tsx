import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';

import { useHostSession, useHostSnapshot } from '../../../src/host/host-session';
import { loadMemoryChanges } from '../../../src/host/memory-changes';
import { MemoryFileChanges } from '../../../src/ui/chat/bot-profile';
import { useStrings } from '../../../src/ui/strings';

export default function MemoryHistoryScreen() {
  const t = useStrings();
  const router = useRouter();
  const {
    slug,
    path = '',
    name,
  } = useLocalSearchParams<{ slug: string; path?: string; name?: string }>();
  const { client } = useHostSession();
  const bot = useHostSnapshot(client).roster?.bots.find((entry) => entry.slug === slug);
  const load = useMemo(
    () =>
      client === undefined || bot === undefined
        ? undefined
        : (offset: number) => loadMemoryChanges(client, bot, offset, path),
    [client, bot?.slug, bot?.dmChannelId, path],
  );
  return (
    <>
      <Stack.Screen
        options={{ title: t.memoryHistoryTitle(name ?? path.split('/').at(-1) ?? path) }}
      />
      {load === undefined || bot === undefined ? null : (
        <MemoryFileChanges
          bot={bot}
          load={load}
          onOpen={(change) =>
            router.push({
              pathname: '/bot/[slug]/memory-commit',
              params: { slug: bot.slug, sha: change.sha, at: change.authoredAt },
            })
          }
        />
      )}
    </>
  );
}
