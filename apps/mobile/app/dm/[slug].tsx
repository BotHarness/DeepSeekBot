import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';

import type { HostClient } from '../../src/host/client';
import type {
  CardResolution,
  ConversationDraft,
  ConversationMessage,
  MessageAttachment,
  MessageCard,
} from '../../src/host/conversation';
import type { Inbox } from '../../src/host/inbox';
import { shareAttachment } from '../../src/host/share-attachment';
import { MAX_PICKED, pickFiles, type PickSource, type PickedFile } from '../../src/host/pick-files';
import { stopBot, type StopOutcome } from '../../src/host/stop';
import {
  useConversation,
  useConversationSnapshot,
  useHostSession,
  useHostSnapshot,
} from '../../src/host/host-session';
import {
  answerQuestion,
  decideApproval,
  loadApproval,
  loadQuestion,
  type RequestRef,
} from '../../src/host/requests';
import { useDictation } from '../../src/host/speech';
import { botColor } from '../../src/ui/bot-color';
import { ApprovalCard } from '../../src/ui/chat/approval-card';
import { botBusy } from '../../src/ui/chat/bot-tone';
import { ChatTitle } from '../../src/ui/chat/chat-title';
import { Composer } from '../../src/ui/chat/composer';
import { ImageViewer } from '../../src/ui/chat/image-viewer';
import { DraftBubble, MessageBubble } from '../../src/ui/chat/message-bubble';
import { chatRows, type ChatRow } from '../../src/ui/chat/message-groups';
import { QuestionCard } from '../../src/ui/chat/question-card';
import { StatusStrip } from '../../src/ui/chat/status-strip';
import { TimeSeparator } from '../../src/ui/chat/time-separator';
import { AccentProvider, useDesignTheme } from '../../src/ui/design/theme';
import { space } from '../../src/ui/design/tokens';
import { OpenFullClientButton } from '../../src/ui/open-full-client';
import { Text } from '../../src/ui/primitives/text';
import { t } from '../../src/ui/strings';

type Row = ChatRow | { kind: 'draft'; key: string; draft: ConversationDraft };

export default function DmScreen() {
  const { slug, focus } = useLocalSearchParams<{ slug: string; focus?: string }>();
  const { client } = useHostSession();
  const bot = useHostSnapshot(client).roster?.bots.find((entry) => entry.slug === slug);
  return (
    <AccentProvider accent={bot === undefined ? undefined : botColor(bot)}>
      <DmConversation slug={slug} focus={focus} />
    </AccentProvider>
  );
}

function hiddenResolution(message: ConversationMessage): boolean {
  const resolution = message.resolves?.resolution;
  return (
    resolution?.kind === 'tool-approval' ||
    (resolution?.kind === 'user-question' && resolution.state === 'cancelled')
  );
}

function RequestCard({
  client,
  inbox,
  message,
  card,
  botSlug,
  botName,
  resolution,
  focused,
}: {
  client: HostClient;
  inbox: Inbox | undefined;
  message: ConversationMessage;
  card: MessageCard;
  botSlug: string;
  botName: string;
  resolution: CardResolution | undefined;
  focused: boolean;
}) {
  const router = useRouter();
  const ref = useMemo<RequestRef>(
    () => ({ channelId: card.channelId, messageId: message.id, botSlug }),
    [card.channelId, message.id, botSlug],
  );
  const approval = useMemo(
    () => ({
      load: () => loadApproval(client, ref),
      decide: async (outcome: Parameters<typeof decideApproval>[2]) => {
        const result = await decideApproval(client, ref, outcome);
        void inbox?.refresh();
        return result;
      },
    }),
    [client, inbox, ref],
  );
  const question = useMemo(
    () => ({
      load: () => loadQuestion(client, ref),
      answer: async (answer: Parameters<typeof answerQuestion>[2]) => {
        const result = await answerQuestion(client, ref, answer);
        void inbox?.refresh();
        return result;
      },
    }),
    [client, inbox, ref],
  );
  const subject = card.subject === undefined ? {} : { subject: card.subject };
  if (card.kind === 'tool-approval')
    return (
      <ApprovalCard
        port={approval}
        botName={botName}
        {...subject}
        {...(resolution?.kind === 'tool-approval' ? { resolution } : {})}
        focused={focused}
        onDetails={() => router.push({ pathname: '/approval', params: { ...ref } })}
      />
    );
  return (
    <QuestionCard
      port={question}
      botName={botName}
      {...subject}
      {...(resolution?.kind === 'user-question' ? { resolution } : {})}
      focused={focused}
    />
  );
}

function DmConversation({ slug, focus }: { slug: string | undefined; focus: string | undefined }) {
  const theme = useDesignTheme();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const { client, inbox } = useHostSession();
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
  const dictation = useDictation(setDraft);
  const [stop, setStop] = useState<StopOutcome | { status: 'stopping' } | undefined>();
  const [shareError, setShareError] = useState(false);
  const [viewing, setViewing] = useState<MessageAttachment>();
  const now = new Date();
  const list = useRef<FlatList<Row>>(null);
  const jumped = useRef<string | undefined>(undefined);

  const resolutions = useMemo(
    () =>
      new Map(
        snapshot.messages.flatMap((message) =>
          message.resolves === undefined
            ? []
            : [[message.resolves.requestId, message.resolves.resolution] as const],
        ),
      ),
    [snapshot.messages],
  );

  const rows = useMemo<Row[]>(
    () => [
      ...snapshot.drafts.map((entry): Row => ({
        kind: 'draft',
        key: `draft:${entry.draftId}`,
        draft: entry,
      })),
      ...chatRows(snapshot.messages.filter((message) => !hiddenResolution(message))).reverse(),
    ],
    [snapshot.drafts, snapshot.messages],
  );

  const jump = () => {
    if (focus === undefined || jumped.current === focus) return;
    const index = rows.findIndex((row) => row.kind === 'message' && row.message.id === focus);
    if (index >= 0) {
      jumped.current = focus;
      list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    } else if (snapshot.status === 'live' && snapshot.hasOlder && !snapshot.loadingOlder)
      void conversation?.loadOlder();
  };

  const send = () => {
    const body = draft.trim();
    if ((body === '' && files.length === 0) || conversation === undefined) return;
    conversation.send(body, files);
    if (dictation.state.status !== 'idle') dictation.cancel();
    setDraft('');
    setFiles([]);
  };

  const pick = (source: PickSource) => {
    setAttachError(false);
    pickFiles(source, MAX_PICKED - files.length)
      .then((more) => setFiles((current) => [...current, ...more].slice(0, MAX_PICKED)))
      .catch(() => setAttachError(true));
  };

  const stopRun = () => {
    if (client === undefined || bot?.dmChannelId === undefined || stop?.status === 'stopping')
      return;
    setStop({ status: 'stopping' });
    void stopBot(client, bot.dmChannelId, bot.slug).then((outcome) =>
      setStop(outcome.status === 'stopped' ? undefined : outcome),
    );
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
                : stop?.status === 'not-working' && bot !== undefined
                  ? t.stopNotWorking(bot.displayName)
                  : stop?.status === 'failed'
                    ? `${t.stopFailed} ${stop.reason}`
                    : dictation.state.status === 'denied'
                      ? t.dictationDenied
                      : dictation.state.status === 'unavailable'
                        ? t.dictationUnavailable
                        : dictation.state.status === 'failed'
                          ? t.dictationFailed
                          : undefined;

  return (
    <>
      <Stack.Screen
        options={{
          headerLargeTitle: false,
          headerTitleAlign: 'center',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.color.base },
          headerTitle: () => (
            <ChatTitle
              bot={bot}
              fallback={slug ?? ''}
              onPress={() => router.push(`/bot/${bot?.slug ?? slug}`)}
            />
          ),
          headerRight: () =>
            slug === undefined ? null : <OpenFullClientButton target={{ kind: 'dm', slug }} />,
        }}
      />
      <KeyboardAvoidingView
        ref={dictation.mountRef}
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
          ref={list}
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
            ) : client !== undefined &&
              slug !== undefined &&
              (item.message.card?.kind === 'tool-approval' ||
                item.message.card?.kind === 'user-question') ? (
              <RequestCard
                client={client}
                inbox={inbox}
                message={item.message}
                card={item.message.card}
                botSlug={slug}
                botName={bot?.displayName ?? slug}
                resolution={resolutions.get(item.message.id)}
                focused={item.message.id === focus}
              />
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
          onContentSizeChange={jump}
          onScrollToIndexFailed={(info) => {
            list.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: false,
            });
            setTimeout(
              () =>
                list.current?.scrollToIndex({
                  index: info.index,
                  viewPosition: 0.5,
                  animated: true,
                }),
              100,
            );
          }}
          onEndReached={() => void conversation?.loadOlder()}
          onEndReachedThreshold={0.5}
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
            autoscrollToTopThreshold: 40,
          }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            snapshot.loadingOlder ? (
              <View
                style={{
                  padding: space.x4,
                  alignItems: 'center',
                  gap: space.x2,
                }}
              >
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
        {bot !== undefined && botBusy(bot) ? (
          <StatusStrip bot={bot} stopping={stop?.status === 'stopping'} onStop={stopRun} />
        ) : null}
        <Composer
          value={draft}
          placeholder={bot === undefined ? t.messagePlaceholder : t.messageBot(bot.displayName)}
          disabled={conversation === undefined}
          files={files}
          canAttach={files.length < MAX_PICKED}
          dictation={dictation.state.status}
          canDictate={conversation !== undefined}
          onChange={setDraft}
          onSend={send}
          onPick={pick}
          onRemove={(id) => setFiles((current) => current.filter((file) => file.id !== id))}
          onDictate={() => {
            setAttachError(false);
            dictation.start();
          }}
          onStopDictation={dictation.stop}
          onCancelDictation={dictation.cancel}
        />
      </KeyboardAvoidingView>
      <ImageViewer attachment={viewing} onClose={() => setViewing(undefined)} onShare={share} />
    </>
  );
}
