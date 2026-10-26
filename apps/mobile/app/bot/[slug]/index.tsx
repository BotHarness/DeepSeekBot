import { useLocalSearchParams, useNavigationContainerRef, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { botChannels, botProfileResource } from '../../../src/host/bot-profile';
import { setBotAvatar } from '../../../src/host/bot-avatar';
import { pickAvatarImage } from '../../../src/host/pick-avatar-image';
import { useHostSession, useHostSnapshot } from '../../../src/host/host-session';
import { RequestActivityControl } from '../../../src/ui/chat/request-activity-control';
import { ChannelFilesAction } from '../../../src/ui/chat/channel-files-action';
import { BotProfileSheet } from '../../../src/ui/chat/bot-profile';
import { BotSettingsPanel } from '../../../src/ui/chat/bot-settings-panel';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { space } from '../../../src/ui/design/tokens';
import { Text } from '../../../src/ui/primitives/text';
import { useStrings } from '../../../src/ui/strings';
import { navigateChannel } from '../../../src/ui/shell/channel-navigation';

export default function BotProfileScreen() {
  const t = useStrings();
  const { slug, hostId, channelId, activityMessageId } = useLocalSearchParams<{
    slug: string;
    hostId?: string;
    channelId?: string;
    activityMessageId?: string;
  }>();
  const router = useRouter();
  const navigation = useNavigationContainerRef();
  const theme = useDesignTheme();
  const { client, saved } = useHostSession(hostId);
  const [openedOn, setOpenedOn] = useState(saved?.hostId);
  if (openedOn === undefined && saved?.hostId !== undefined) setOpenedOn(saved.hostId);
  const snapshot = useHostSnapshot(client);
  const roster = snapshot.roster;
  const bot = roster?.bots.find((entry) => entry.slug === slug);
  const channels = useMemo(() => botChannels(roster, slug ?? ''), [roster, slug]);
  const profile = useMemo(
    () => (client === undefined || bot === undefined ? undefined : botProfileResource(client, bot)),
    [client, bot?.slug, bot?.dmChannelId],
  );

  const sourceChanged = (hostId ?? openedOn) !== saved?.hostId;
  if (sourceChanged || bot === undefined || profile === undefined || client === undefined)
    return (
      <View
        style={{
          flex: 1,
          padding: space.x6,
          backgroundColor: theme.color.surface,
        }}
      >
        {sourceChanged ? (
          <Text tone="muted">{t.sourceChanged}</Text>
        ) : roster === undefined ? null : (
          <Text tone="muted">{t.noBot}</Text>
        )}
      </View>
    );

  return (
    <BotProfileSheet
      key={`${saved?.hostId}:${bot.slug}`}
      bot={bot}
      channels={channels}
      initialProfile={profile.peek()}
      load={profile.refresh}
      avatar={{ pick: pickAvatarImage, save: (avatar) => setBotAvatar(client, bot, avatar) }}
      conversationActions={
        <View style={{ gap: space.x3 }}>
          {saved &&
          bot.dmChannelId &&
          snapshot.connection.status !== 'refused' &&
          (channelId === undefined || channelId === bot.dmChannelId) ? (
            <ChannelFilesAction
              hostId={saved.hostId}
              channelId={bot.dmChannelId}
              botSlug={bot.slug}
            />
          ) : null}
          <RequestActivityControl
            target={
              saved &&
              activityMessageId &&
              channelId &&
              channelId === bot.dmChannelId &&
              snapshot.connection.status !== 'refused'
                ? {
                    hostId: saved.hostId,
                    channelId,
                    botSlug: bot.slug,
                    messageId: activityMessageId,
                  }
                : undefined
            }
          />
        </View>
      }
      settings={<BotSettingsPanel client={client} bot={bot} />}
      actions={{
        onOpenRoutine: (routine) =>
          router.push({
            pathname: '/bot/[slug]/routine/[id]',
            params: { slug: bot.slug, id: routine.id },
          }),
        onNewRoutine: () =>
          router.push({
            pathname: '/bot/[slug]/routine-new',
            params: { slug: bot.slug, hostId: saved?.hostId },
          }),
        onMessage: () => {
          if (saved)
            navigateChannel(
              navigation,
              {
                pathname: '/dm/[slug]',
                params: { slug: bot.slug, hostId: saved.hostId },
              },
              'dismiss-profile',
            );
        },
        ...(bot.browserAccess
          ? {
              onBrowser: () =>
                router.push({
                  pathname: '/browser/[slug]',
                  params: { slug: bot.slug, hostId: saved?.hostId },
                }),
            }
          : {}),
        ...(snapshot.computerAvailable === true &&
        snapshot.connection.status !== 'refused' &&
        snapshot.connection.status !== 'stopped'
          ? {
              onComputer: () =>
                router.push({
                  pathname: '/computer/[slug]',
                  params: { slug: bot.slug, hostId: saved?.hostId },
                }),
            }
          : {}),
        onNotifications: () =>
          router.push({
            pathname: '/bot/[slug]/notifications',
            params: { slug: bot.slug, hostId: saved?.hostId },
          }),
        onOpenActivity: () =>
          router.push({
            pathname: '/bot/[slug]/activity',
            params: { slug: bot.slug, hostId: saved?.hostId },
          }),
        onOpenMemory: (entry) =>
          router.push({
            pathname: '/bot/[slug]/memory',
            params: { slug: bot.slug, path: entry.path, kind: entry.kind },
          }),
      }}
    />
  );
}
