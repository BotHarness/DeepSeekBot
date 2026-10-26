import { Stack } from 'expo-router';
import { useMemo, useSyncExternalStore } from 'react';
import { FlatList, View, type ViewInstance } from 'react-native';

import { createBotInbox, inboxOrder } from '../../host/bot-inbox';
import type { HostClient } from '../../host/client';
import type { BotInboxItem } from '../../host/wire';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { ReadFailure } from '../primitives/read-failure';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

function Tag({ label, tone }: { label: string; tone: 'accent' | 'muted' }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        paddingHorizontal: space.x3,
        paddingVertical: space.x1,
        borderRadius: radius.sm,
        backgroundColor: tone === 'accent' ? theme.color.accentTint : theme.layer.raised.fill,
      }}
    >
      <Text variant="meta" tone={tone === 'accent' ? 'accent' : 'muted'}>
        {label}
      </Text>
    </View>
  );
}

function InboxRow({ item, marked }: { item: BotInboxItem; marked: boolean }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const source = item.externalOrigin?.conversationName ?? item.sourceChannelName;
  const note = item.resolutionNote ?? item.snoozeNote;
  return (
    <View
      testID={`bot-inbox-item-${item.id}`}
      style={{
        gap: space.x2,
        paddingVertical: space.x4,
        borderBottomWidth: edge.hairline,
        borderColor: theme.color.border,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: space.x2,
        }}
      >
        {marked ? <Tag label={t.delivery.thisMessage} tone="accent" /> : null}
        <Tag label={t.delivery.inboxState[item.state]} tone="muted" />
        <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {[source, new Date(item.createdAt).toLocaleString()].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text numberOfLines={4}>{item.summary}</Text>
      {note === undefined ? null : (
        <Text variant="meta" tone="muted">
          {note}
        </Text>
      )}
    </View>
  );
}

export function BotInboxScreen({
  client,
  slug,
  botName,
  messageId,
  missing,
}: {
  client: HostClient;
  slug: string;
  botName: string;
  messageId: string | undefined;
  missing: boolean;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const inbox = useMemo(() => createBotInbox(client, slug), [client, slug]);
  const snapshot = useSyncExternalStore(inbox.subscribe, inbox.getSnapshot);
  const mount = useMounted<ViewInstance>(() => {
    void inbox.load();
    return () => inbox.close();
  }, [inbox]);
  const items = inboxOrder(snapshot.items, messageId);
  const nextCursor = snapshot.status === 'ready' ? snapshot.nextCursor : undefined;
  return (
    <View ref={mount} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t.delivery.inboxTitle(botName) }} />
      <FlatList
        testID="bot-inbox-list"
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.x5, paddingBottom: space.x6 }}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <InboxRow
            item={item}
            marked={messageId !== undefined && item.sourceMessageId === messageId}
          />
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (nextCursor !== undefined) void inbox.load(nextCursor);
        }}
        ListHeaderComponent={
          missing ? (
            <View
              accessibilityRole="alert"
              style={{
                marginBottom: space.x4,
                paddingHorizontal: space.x4,
                paddingVertical: space.x3,
                borderRadius: radius.md,
                backgroundColor: theme.color.warningSoft,
              }}
            >
              <Text variant="meta">{t.delivery.notInInbox(botName)}</Text>
            </View>
          ) : (
            <></>
          )
        }
        ListEmptyComponent={
          snapshot.status === 'ready' ? <Text tone="muted">{t.delivery.empty}</Text> : <></>
        }
        ListFooterComponent={
          <View style={{ paddingTop: space.x5, gap: space.x3 }}>
            {snapshot.status === 'loading' ? <LoadingIndicator /> : null}
            {snapshot.status === 'failed' ? (
              <ReadFailure
                title={t.loadFailed}
                detail={snapshot.error}
                onRetry={() => void inbox.load(snapshot.cursor)}
              />
            ) : null}
            {nextCursor === undefined ? null : (
              <Button
                testID="bot-inbox-load-more"
                label={t.delivery.loadMore}
                onPress={() => void inbox.load(nextCursor)}
              />
            )}
          </View>
        }
      />
    </View>
  );
}
