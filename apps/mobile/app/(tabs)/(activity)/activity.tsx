import { Stack, useIsFocused, useRouter } from 'expo-router';
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
import { cardHref, unreadHref } from '../../../src/host/push';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { ActivityFeed } from '../../../src/ui/shell/activity-feed';
import { HostDrawerEdge } from '../../../src/ui/shell/host-drawer';
import { useStrings } from '../../../src/ui/strings';

export default function ActivityScreen() {
  const t = useStrings();
  const router = useRouter();
  const focused = useIsFocused();
  const theme = useDesignTheme();
  const sources = useActivitySources();
  const hosts = useHostSessions();
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
      const dm = (slug: string) =>
        source.roster?.bots.find((bot) => bot.slug === slug)?.dmChannelId;
      const group = (id: string) =>
        source.roster?.channels.some((channel) => channel.id === id) ?? false;
      const href = unreadHref(item, dm, group) ?? cardHref(item, dm, group);
      if (href) return router.push({ ...href, params: { ...href.params, hostId: source.hostId } });
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
    [sources, router],
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
