import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { useHostSession, useHostSnapshot, useInbox } from '../../../src/host/host-session';
import type { HumanAttentionItem } from '../../../src/host/wire';
import { ConnectionBanner } from '../../../src/ui/connection-banner';
import { InboxList } from '../../../src/ui/inbox-list';
import { t } from '../../../src/ui/strings';

export default function ActivityScreen() {
  const router = useRouter();
  const { client, inbox } = useHostSession();
  const snapshot = useHostSnapshot(client);
  const list = useInbox(inbox);
  const [refreshing, setRefreshing] = useState(false);
  const bots = snapshot.roster?.bots ?? [];

  const open = (item: HumanAttentionItem) =>
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

  return (
    <>
      <Stack.Screen options={{ title: t.activity }} />
      <InboxList
        snapshot={list}
        bot={(slug) => bots.find((bot) => bot.slug === slug)}
        onOpen={open}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void inbox?.refresh().finally(() => setRefreshing(false));
        }}
        header={
          <ConnectionBanner
            connection={snapshot.connection}
            onRetry={() => client?.retryNow()}
            onPairAgain={() => router.push('/pair')}
          />
        }
      />
    </>
  );
}
