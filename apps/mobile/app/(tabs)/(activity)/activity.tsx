import { Stack, useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useHostSession, useHostSnapshot, useInbox } from '../../../src/host/host-session';
import { cardHref, unreadHref } from '../../../src/host/push';
import type { HumanAttentionItem } from '../../../src/host/wire';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { ConnectionBanner } from '../../../src/ui/connection-banner';
import { ActivityFeed } from '../../../src/ui/shell/activity-feed';
import { HostDrawerEdge } from '../../../src/ui/shell/host-drawer';
import { t } from '../../../src/ui/strings';

export default function ActivityScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const theme = useDesignTheme();
  const { saved, client, inbox } = useHostSession();
  const snapshot = useHostSnapshot(client);
  const list = useInbox(inbox);
  const bots = snapshot.roster?.bots ?? [];
  const channels = snapshot.roster?.channels ?? [];

  const open = (item: HumanAttentionItem) => {
    const unread = unreadHref(
      item,
      (slug) => bots.find((bot) => bot.slug === slug)?.dmChannelId,
      (channelId) => channels.some((channel) => channel.id === channelId),
    );
    if (unread !== undefined) return router.push(unread);
    const card = cardHref(
      item,
      (slug) => bots.find((bot) => bot.slug === slug)?.dmChannelId,
      (channelId) => channels.some((channel) => channel.id === channelId),
    );
    if (card !== undefined) return router.push(card);
    router.push({
      pathname: '/inbox/[id]',
      params: {
        id: item.id,
        kind: item.kind,
        botSlug: item.botSlug,
        summary: item.summary,
        ...(item.channelId === undefined ? {} : { channelId: item.channelId }),
        ...(item.messageId === undefined ? {} : { messageId: item.messageId }),
      },
    });
  };

  return (
    <>
      {focused ? <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} /> : null}
      <Stack.Screen options={{ title: t.activity, headerShown: false }} />
      <HostDrawerEdge>
        <ActivityFeed
          key={saved?.hostId ?? 'no-host'}
          hostId={saved?.hostId ?? ''}
          client={client}
          inbox={inbox}
          snapshot={list}
          botSlugs={bots.map((bot) => bot.slug)}
          channels={[
            ...bots.flatMap((bot) =>
              bot.dmChannelId ? [{ id: bot.dmChannelId, name: bot.displayName }] : [],
            ),
            ...channels.map((channel) => ({ id: channel.id, name: channel.name })),
          ]}
          bot={(slug) => bots.find((bot) => bot.slug === slug)}
          onOpen={open}
          header={
            <ConnectionBanner
              connection={snapshot.connection}
              onRetry={() => client?.retryNow()}
              onPairAgain={() => router.push('/pair')}
            />
          }
        />
      </HostDrawerEdge>
    </>
  );
}
