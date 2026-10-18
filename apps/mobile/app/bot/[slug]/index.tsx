import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { botChannels, botProfileResource } from '../../../src/host/bot-profile';
import { useHostSession, useHostSnapshot } from '../../../src/host/host-session';
import { BotProfileSheet } from '../../../src/ui/chat/bot-profile';
import { BotSettingsPanel } from '../../../src/ui/chat/bot-settings-panel';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { space } from '../../../src/ui/design/tokens';
import { Text } from '../../../src/ui/primitives/text';
import { t } from '../../../src/ui/strings';

export default function BotProfileScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const theme = useDesignTheme();
  const { client, saved } = useHostSession();
  const roster = useHostSnapshot(client).roster;
  const bot = roster?.bots.find((entry) => entry.slug === slug);
  const channels = useMemo(() => botChannels(roster, slug ?? ''), [roster, slug]);
  const profile = useMemo(
    () => (client === undefined || bot === undefined ? undefined : botProfileResource(client, bot)),
    [client, bot?.slug, bot?.dmChannelId],
  );

  if (bot === undefined || profile === undefined)
    return (
      <View
        style={{
          flex: 1,
          padding: space.x6,
          backgroundColor: theme.color.surface,
        }}
      >
        {roster === undefined ? null : <Text tone="muted">{t.noBot}</Text>}
      </View>
    );

  return (
    <BotProfileSheet
      key={`${saved?.hostId}:${bot.slug}`}
      bot={bot}
      channels={channels}
      initialProfile={profile.peek()}
      load={profile.refresh}
      settings={client === undefined ? undefined : <BotSettingsPanel client={client} bot={bot} />}
      actions={{
        onOpenRoutine: (routine) =>
          router.push({
            pathname: '/bot/[slug]/routine/[id]',
            params: { slug: bot.slug, id: routine.id },
          }),
        onNewRoutine: () =>
          router.push({ pathname: '/bot/[slug]/routine-new', params: { slug: bot.slug } }),
        onMessage: () => (router.canGoBack() ? router.back() : router.replace(`/dm/${bot.slug}`)),
        ...(bot.browserAccess
          ? {
              onBrowser: () =>
                router.push({
                  pathname: '/browser/[slug]',
                  params: { slug: bot.slug },
                }),
            }
          : {}),
        ...(bot.computerAccess
          ? {
              onComputer: () =>
                router.push({
                  pathname: '/computer/[slug]',
                  params: { slug: bot.slug },
                }),
            }
          : {}),
        onNotifications: () =>
          router.push({ pathname: '/bot/[slug]/notifications', params: { slug: bot.slug } }),
        onOpenActivity: () =>
          router.push({ pathname: '/bot/[slug]/activity', params: { slug: bot.slug } }),
        onOpenMemory: (entry) =>
          router.push({
            pathname: '/bot/[slug]/memory',
            params: { slug: bot.slug, path: entry.path, kind: entry.kind },
          }),
      }}
    />
  );
}
