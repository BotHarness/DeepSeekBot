import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { botChannels, loadBotProfile } from '../../../src/host/bot-profile';
import { fullClientParams } from '../../../src/host/full-client';
import { useHostSession, useHostSnapshot } from '../../../src/host/host-session';
import { BotProfileSheet } from '../../../src/ui/chat/bot-profile';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { space } from '../../../src/ui/design/tokens';
import { Text } from '../../../src/ui/primitives/text';
import { t } from '../../../src/ui/strings';

export default function BotProfileScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const theme = useDesignTheme();
  const { client } = useHostSession();
  const roster = useHostSnapshot(client).roster;
  const bot = roster?.bots.find((entry) => entry.slug === slug);
  const channels = useMemo(() => botChannels(roster, slug ?? ''), [roster, slug]);
  const load = useMemo(
    () =>
      client === undefined || bot === undefined ? undefined : () => loadBotProfile(client, bot),
    [client, bot?.slug, bot?.dmChannelId],
  );

  if (bot === undefined || load === undefined)
    return (
      <View style={{ flex: 1, padding: space.x6, backgroundColor: theme.color.surface }}>
        {roster === undefined ? null : <Text tone="muted">{t.noBot}</Text>}
      </View>
    );

  return (
    <BotProfileSheet
      bot={bot}
      channels={channels}
      load={load}
      actions={{
        onMessage: () => (router.canGoBack() ? router.back() : router.replace(`/dm/${bot.slug}`)),
        ...(bot.browserAccess
          ? {
              onBrowser: () =>
                router.push({ pathname: '/browser/[slug]', params: { slug: bot.slug } }),
            }
          : {}),
        ...(bot.computerAccess
          ? {
              onComputer: () =>
                router.push({
                  pathname: '/full-client',
                  params: fullClientParams({ kind: 'dm', slug: bot.slug }),
                }),
            }
          : {}),
        onNotifications: () => router.push('/notifications'),
        onOpenMemory: (entry) =>
          router.push({
            pathname: '/bot/[slug]/memory',
            params: { slug: bot.slug, path: entry.path, kind: entry.kind },
          }),
      }}
    />
  );
}
