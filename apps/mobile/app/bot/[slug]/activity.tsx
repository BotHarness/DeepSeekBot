import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { loadBotActivity } from '../../../src/host/bot-profile';
import { useHostSession, useHostSnapshot } from '../../../src/host/host-session';
import { ActivityDetailView, type ActivityQuery } from '../../../src/ui/chat/activity-detail';
import { useStrings } from '../../../src/ui/strings';

export default function ActivityScreen() {
  const t = useStrings();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { client } = useHostSession();
  const bot = useHostSnapshot(client).roster?.bots.find((entry) => entry.slug === slug);
  const load = useMemo(
    () =>
      client === undefined || bot === undefined
        ? undefined
        : (query: ActivityQuery) => loadBotActivity(client, bot, query),
    [client, bot?.slug, bot?.dmChannelId],
  );

  return (
    <>
      <Stack.Screen options={{ title: t.activityTitle }} />
      {bot === undefined || load === undefined ? null : (
        <ActivityDetailView bot={bot} load={load} />
      )}
    </>
  );
}
