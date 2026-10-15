import { Stack, useRouter } from 'expo-router';

import { useHostSession, useHostSnapshot, useInbox } from '../../../src/host/host-session';
import { cardHref } from '../../../src/host/push';
import type { HumanAttentionItem } from '../../../src/host/wire';
import { ConnectionBanner } from '../../../src/ui/connection-banner';
import { ActivityFeed } from '../../../src/ui/shell/activity-feed';
import { HostDrawerEdge } from '../../../src/ui/shell/host-drawer';
import { t } from '../../../src/ui/strings';

export default function ActivityScreen() {
  const router = useRouter();
  const { client, inbox } = useHostSession();
  const snapshot = useHostSnapshot(client);
  const list = useInbox(inbox);
  const bots = snapshot.roster?.bots ?? [];

  const open = (item: HumanAttentionItem) => {
    const card = cardHref(item, (slug) => bots.find((bot) => bot.slug === slug)?.dmChannelId);
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
      <Stack.Screen options={{ title: t.activity }} />
      <HostDrawerEdge>
        <ActivityFeed
          client={client}
          inbox={inbox}
          snapshot={list}
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
