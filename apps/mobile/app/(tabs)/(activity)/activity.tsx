import { Stack, useIsFocused, useRouter, useNavigationContainerRef } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { useCloudSnapshot } from '../../../src/cloud/native';
import { Text } from '../../../src/ui/primitives/text';
import { space } from '../../../src/ui/design/tokens';
import { useConversationFilter } from '../../../src/host/native-conversation-filter';
import { useHostSessions } from '../../../src/host/host-session';
import { useActivitySources } from '../../../src/host/native-activity-sources';
import { activitySelection, type ActivityItem } from '../../../src/host/activity-sources';
import { channelDestination, navigateChannel } from '../../../src/ui/shell/channel-navigation';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { ActivityFeed } from '../../../src/ui/shell/activity-feed';
import { HostDrawerEdge } from '../../../src/ui/shell/host-drawer';
import { useStrings } from '../../../src/ui/strings';

export default function ActivityScreen() {
  const t = useStrings();
  const router = useRouter();
  const navigation = useNavigationContainerRef();
  const focused = useIsFocused();
  const theme = useDesignTheme();
  const sources = useActivitySources(focused);
  const hosts = useHostSessions(focused);
  const [scope] = useConversationFilter();
  const cloud = useCloudSnapshot();
  const partial = scope === 'all' && cloud.rows.some((row) => row.hasSession);
  const bots = useMemo(
    () =>
      new Map(
        sources.flatMap(
          (source) =>
            source.roster?.bots.map(
              (bot) =>
                [
                  activitySelection(source.hostId, bot.slug),
                  {
                    ...bot,
                    displayName: `${bot.displayName} · ${source.label}`,
                  },
                ] as const,
            ) ?? [],
        ),
      ),
    [sources, hosts],
  );
  const channels = useMemo(
    () =>
      sources.flatMap((source) => [
        ...(source.roster?.bots.flatMap((bot) =>
          bot.dmChannelId
            ? [
                {
                  id: activitySelection(source.hostId, bot.dmChannelId),
                  name: `${bot.displayName} · ${source.label}`,
                },
              ]
            : [],
        ) ?? []),
        ...(source.roster?.channels.map((channel) => ({
          id: activitySelection(source.hostId, channel.id),
          name: `${channel.name} · ${source.label}`,
        })) ?? []),
      ]),
    [sources, hosts],
  );
  const open = useCallback(
    (item: ActivityItem) => {
      const source = sources.find((source) => source.client === item.activitySource?.client);
      if (!source) return;
      const opensChannel = [
        'channel-unread',
        'tool-approval',
        'user-question',
        'workspace-grant-request',
      ].includes(item.kind);
      const destination = opensChannel
        ? channelDestination(source.hostId, item, source.roster)
        : undefined;
      if (destination && navigateChannel(navigation, destination)) return;
      router.push({
        pathname: '/inbox/[id]',
        params: {
          hostId: source.hostId,
          id: item.id,
          kind: item.kind,
          botSlug: item.botSlug,
          summary: item.summary,
          ...(item.channelId === undefined ? {} : { channelId: item.channelId }),
          ...(item.messageId === undefined ? {} : { messageId: item.messageId }),
        },
      });
    },
    [sources, router, navigation],
  );
  return (
    <>
      {focused ? <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} /> : null}
      <Stack.Screen options={{ title: t.activity, headerShown: false }} />
      <HostDrawerEdge>
        <ActivityFeed
          key={scope}
          sources={sources}
          unavailable={sources.length ? undefined : t.activitySourceUnavailable}
          hostId={scope}
          client={undefined}
          inbox={undefined}
          snapshot={{ status: 'idle' }}
          botSlugs={[...bots.keys()]}
          channels={channels}
          bot={(slug) => bots.get(slug)}
          onOpen={open}
          header={
            partial ? (
              <View>
                <Text tone="muted" style={{ padding: space.x5 }}>
                  {t.activityPartialScope}
                </Text>
              </View>
            ) : null
          }
        />
      </HostDrawerEdge>
    </>
  );
}
