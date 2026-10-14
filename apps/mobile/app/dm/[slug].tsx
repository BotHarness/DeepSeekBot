import { Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';

import type { ConversationDraft, MessageAttachment } from '../../src/host/conversation';
import { shareAttachment } from '../../src/host/share-attachment';
import { MAX_PICKED, pickFiles, type PickSource, type PickedFile } from '../../src/host/pick-files';
import {
  useConversation,
  useConversationSnapshot,
  useHostSession,
  useHostSnapshot,
} from '../../src/host/host-session';
import { botColor } from '../../src/ui/bot-color';
import { botBusy } from '../../src/ui/chat/bot-tone';
import { ChatTitle } from '../../src/ui/chat/chat-title';
import { Composer } from '../../src/ui/chat/composer';
import { ImageViewer } from '../../src/ui/chat/image-viewer';
import { DraftBubble, MessageBubble } from '../../src/ui/chat/message-bubble';
import { chatRows, type ChatRow } from '../../src/ui/chat/message-groups';
import { StatusStrip } from '../../src/ui/chat/status-strip';
import { TimeSeparator } from '../../src/ui/chat/time-separator';
import { AccentProvider, useDesignTheme } from '../../src/ui/design/theme';
import { space } from '../../src/ui/design/tokens';
import { OpenFullClientButton } from '../../src/ui/open-full-client';
import { Text } from '../../src/ui/primitives/text';
import { t } from '../../src/ui/strings';

type Row = ChatRow | { kind: 'draft'; key: string; draft: ConversationDraft };

export default function DmScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { client } = useHostSession();
  const bot = useHostSnapshot(client).roster?.bots.find((entry) => entry.slug === slug);
  return (
    <AccentProvider accent={bot === undefined ? undefined : botColor(bot)}>
      <DmConversation slug={slug} />
    </AccentProvider>
  );
}

function DmConversation({ slug }: { slug: string | undefined }) {
  const theme = useDesignTheme();
  const headerHeight = useHeaderHeight();
  const { client } = useHostSession();
  const host = useHostSnapshot(client);
  const bot = host.roster?.bots.find((entry) => entry.slug === slug);
  const target = useMemo(
    () =>
      slug === undefined
        ? undefined
        : {
            slug,
            ...(bot === undefined ? {} : { displayName: bot.displayName }),
            ...(bot?.dmChannelId === undefined ? {} : { dmChannelId: bot.dmChannelId }),
          },
    [slug, bot !== undefined],
  );
  const conversation = useConversation(client, target);
  const snapshot = useConversationSnapshot(conversation);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [attachError, setAttachError] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [viewing, setViewing] = useState<MessageAttachment>();
  const now = new Date();

  const rows = useMemo<Row[]>(
    () => [
      ...snapshot.drafts.map((entry): Row => ({
        kind: 'draft',
        key: `draft:${entry.draftId}`,
        draft: entry,
      })),
      ...chatRows(snapshot.messages).reverse(),
    ],
    [snapshot.drafts, snapshot.messages],
  );

  const send = () => {
    const body = draft.trim();
    if ((body === '' && files.length === 0) || conversation === undefined) return;
    conversation.send(body, files);
    setDraft('');
    setFiles([]);
  };

  const pick = (source: PickSource) => {
    setAttachError(false);
    pickFiles(source, MAX_PICKED - files.length)
      .then((more) => setFiles((current) => [...current, ...more].slice(0, MAX_PICKED)))
      .catch(() => setAttachError(true));
  };

  const share = (attachment: MessageAttachment): Promise<void> => {
    setShareError(false);
    return shareAttachment(attachment).catch(() => setShareError(true));
  };

  const notice =
    snapshot.status === 'refused'
      ? t.dmRefused
      : host.roster !== undefined && bot === undefined
        ? t.noBot
        : snapshot.fromCache && host.connection.status !== 'connected'
          ? t.offline
          : snapshot.status === 'interrupted'
            ? t.liveInterrupted
            : attachError
              ? t.attachFailed
              : shareError
                ? t.shareFailed
                : undefined;

  return (
    <>
      <Stack.Screen
        options={{
          headerLargeTitle: false,
          headerTitleAlign: 'center',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.color.base },
          headerTitle: () => <ChatTitle bot={bot} fallback={slug ?? ''} />,
          headerRight: () =>
            slug === undefined ? null : <OpenFullClientButton target={{ kind: 'dm', slug }} />,
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.color.base }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
        {notice === undefined ? null : (
          <Text
            accessibilityLiveRegion="polite"
            variant="meta"
            tone="warning"
            style={{
              backgroundColor: theme.color.warningSoft,
              paddingHorizontal: space.x5,
              paddingVertical: space.x3,
            }}
          >
            {notice}
          </Text>
        )}
        <FlatList
          inverted
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: space.x3 }}
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={({ item }) =>
            item.kind === 'draft' ? (
              <DraftBubble draft={item.draft} />
            ) : item.kind === 'separator' ? (
              <TimeSeparator at={item.at} now={now} />
            ) : (
              <MessageBubble
                message={item.message}
                first={item.first}
                last={item.last}
                onRetry={(id) => conversation?.retry(id)}
                onOpenImage={setViewing}
                onShare={share}
              />
            )
          }
          onEndReached={() => void conversation?.loadOlder()}
          onEndReachedThreshold={0.5}
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 40 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            snapshot.loadingOlder ? (
              <View style={{ padding: space.x4, alignItems: 'center', gap: space.x2 }}>
                <ActivityIndicator />
                <Text variant="meta" tone="muted">
                  {t.olderLoading}
                </Text>
              </View>
            ) : !snapshot.hasOlder && snapshot.status === 'live' ? (
              <Text variant="meta" tone="muted" style={{ textAlign: 'center', padding: space.x5 }}>
                {t.beginning}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            snapshot.status === 'opening' ? (
              <View style={{ padding: space.x6, alignItems: 'center' }}>
                <ActivityIndicator />
              </View>
            ) : null
          }
        />
        {bot !== undefined && botBusy(bot) ? <StatusStrip bot={bot} /> : null}
        <Composer
          value={draft}
          placeholder={bot === undefined ? t.messagePlaceholder : t.messageBot(bot.displayName)}
          disabled={conversation === undefined}
          files={files}
          canAttach={files.length < MAX_PICKED}
          onChange={setDraft}
          onSend={send}
          onPick={pick}
          onRemove={(id) => setFiles((current) => current.filter((file) => file.id !== id))}
        />
      </KeyboardAvoidingView>
      <ImageViewer attachment={viewing} onClose={() => setViewing(undefined)} onShare={share} />
    </>
  );
}
