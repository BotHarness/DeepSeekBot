import { Stack, useRouter } from 'expo-router';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from 'react-native';
import Animated, { useAnimatedRef, useScrollOffset, useSharedValue } from 'react-native-reanimated';

import type { HostClient, RosterBot } from '../../host/client';
import {
  shownInChat,
  type CardResolution,
  type ConversationDraft,
  type ConversationMessage,
  type MessageAttachment,
  type MessageCard,
} from '../../host/conversation';
import type { Inbox } from '../../host/inbox';
import type { WireAllBotPreview } from '../../host/wire';
import { shareAttachment } from '../../host/share-attachment';
import { MAX_PICKED, pickFiles, type PickSource, type PickedFile } from '../../host/pick-files';
import {
  useChannelConversation,
  useConversation,
  useConversationSnapshot,
  useHostSession,
  useHostSnapshot,
} from '../../host/host-session';
import {
  answerInChat,
  answerQuestion,
  decideApproval,
  loadApproval,
  loadQuestion,
  type RequestRef,
} from '../../host/requests';
import { useDictation } from '../../host/speech';
import { botColor } from '../bot-color';
import { ApprovalCard } from './approval-card';
import type { BubbleGroup } from './bubble-shape';
import { botBusy } from './bot-tone';
import { ChannelTitle } from './channel-title';
import { ChatTitle } from './chat-title';
import { Composer } from './composer';
import { ChatHeader, EdgeFade, HeaderBackButton, useChatHeaderHeight } from './header-chrome';
import { useFollowLatest } from './follow-latest';
import { useMarkRead } from './mark-read';
import { ImageViewer } from './image-viewer';
import { JumpToLatest } from './jump-to-latest';
import { MessageActions, type MessageMenuTarget } from './message-actions';
import {
  activeMentionQuery,
  chooseMention,
  mentionCandidates,
  rebaseMentions,
  submittedMessage,
  type MentionCandidate,
  type SelectedMention,
} from './mention-draft';
import { MentionSuggestions } from './mention-suggestions';
import { DraftBubble, MessageBubble, type Speaker } from './message-bubble';
import { copyMessage, shareText } from './message-menu';
import type { Rect } from './menu-placement';
import { chatRows, messageGroups, type ChatRow } from './message-groups';
import { createSpeakerRegistry, SpeakerStageContext } from './speaker-row';
import { QuestionCard } from './question-card';
import { WorkingStatus } from './working-status';
import { TimeSeparator } from './time-separator';
import { AccentProvider, useDesignTheme } from '../design/theme';
import { edgeFade, space } from '../design/tokens';
import { OpenFullClientButton } from '../open-full-client';
import { Text } from '../primitives/text';
import { t } from '../strings';

type Row = ChatRow | { kind: 'draft'; key: string; draft: ConversationDraft };

export type ChatPlace =
  | { kind: 'dm'; slug: string | undefined }
  | { kind: 'channel'; channelId: string | undefined };

export function ConversationScreen({
  place,
  focus,
}: {
  place: ChatPlace;
  focus: string | undefined;
}) {
  const { client } = useHostSession();
  const roster = useHostSnapshot(client).roster;
  const bot =
    place.kind === 'dm' ? roster?.bots.find((entry) => entry.slug === place.slug) : undefined;
  return (
    <AccentProvider accent={bot === undefined ? undefined : botColor(bot)}>
      <ChatConversation place={place} focus={focus} />
    </AccentProvider>
  );
}

const RequestCard = memo(function RequestCard({
  client,
  inbox,
  message,
  card,
  botSlug,
  botName,
  resolution,
  focused,
  replyInChat,
  answeredHere,
  group,
}: {
  client: HostClient;
  inbox: Inbox | undefined;
  message: ConversationMessage;
  card: MessageCard;
  botSlug: string;
  botName: string;
  resolution: CardResolution | undefined;
  focused: boolean;
  replyInChat: boolean;
  answeredHere: boolean;
  group: BubbleGroup;
}) {
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
        {...subject}
        {...(resolution?.kind === 'tool-approval' ? { resolution } : {})}
        focused={focused}
        group={group}
      />
    );
  return (
    <QuestionCard
      port={question}
      botName={botName}
      {...subject}
      {...(resolution?.kind === 'user-question' ? { resolution } : {})}
      focused={focused}
      group={group}
      replyInChat={replyInChat}
      answeredHere={answeredHere}
    />
  );
});

function ChatConversation({ place, focus }: { place: ChatPlace; focus: string | undefined }) {
  const theme = useDesignTheme();
  const router = useRouter();
  const headerHeight = useChatHeaderHeight();
  const { client, inbox } = useHostSession();
  const host = useHostSnapshot(client);
  const dm = place.kind === 'dm';
  const slug = dm ? place.slug : undefined;
  const channelId = dm ? undefined : place.channelId;
  const bot = dm ? host.roster?.bots.find((entry) => entry.slug === slug) : undefined;
  const channel = dm ? undefined : host.roster?.channels.find((entry) => entry.id === channelId);
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
  const dmConversation = useConversation(client, target);
  const channelConversation = useChannelConversation(client, channelId);
  const conversation = dm ? dmConversation : channelConversation;
  const members = useMemo(
    () =>
      channel === undefined
        ? []
        : (host.roster?.bots ?? []).filter((entry) => channel.members.includes(entry.slug)),
    [channel, host.roster],
  );
  const working = dm ? (bot !== undefined && botBusy(bot) ? [bot] : []) : members.filter(botBusy);
  const activeChannel = dm ? bot?.dmChannelId : channelId;
  const snapshot = useConversationSnapshot(conversation);
  const [draft, setDraft] = useState('');
  const [mentions, setMentions] = useState<SelectedMention[]>([]);
  const [caret, setCaret] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number }>();
  const [allPreview, setAllPreview] = useState<{ key: string; preview: WireAllBotPreview }>();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [attachError, setAttachError] = useState(false);
  const dictation = useDictation(setDraft);
  const [shareError, setShareError] = useState(false);
  const [viewing, setViewing] = useState<MessageAttachment>();
  const [actionsFor, setActionsFor] = useState<MessageMenuTarget>();
  const [reactError, setReactError] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const list = useAnimatedRef<FlatList<Row>>();
  const jumped = useRef<string | undefined>(undefined);
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set());

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

  const visible = useMemo(() => snapshot.messages.filter(shownInChat), [snapshot.messages]);
  const chronological = useMemo(
    () =>
      chatRows(
        visible,
        (message) => message.card !== undefined && (!dm || !resolutions.has(message.id)),
      ),
    [visible, resolutions, dm],
  );
  const history = useMemo(() => [...chronological].reverse(), [chronological]);
  const [speakers] = useState(createSpeakerRegistry);
  const groups = useMemo(() => messageGroups(chronological), [chronological]);
  const groupOf = useMemo(() => new Map(groups.map((entry) => [entry.key, entry.group])), [groups]);
  useLayoutEffect(() => {
    speakers.setGroups([
      ...groups,
      ...snapshot.drafts.map((entry) => {
        const key = `draft:${entry.draftId}`;
        return { key, group: key };
      }),
    ]);
  }, [speakers, groups, snapshot.drafts]);
  const scroll = useScrollOffset(list);
  const viewport = useAnimatedRef<View>();
  const viewportLayout = useSharedValue(0);
  const stage = useMemo(
    () => ({
      registry: speakers,
      scroll,
      viewport,
      viewportLayout,
      floor: composerHeight + edgeFade.bottom,
    }),
    [speakers, scroll, viewport, viewportLayout, composerHeight],
  );
  const latest = useFollowLatest(list, visible);
  const readMount = useMarkRead(client, inbox, conversation, activeChannel, !latest.away);
  const mountRef = dictation.mountRef;
  const screenRef = useCallback(
    (node: unknown) => {
      mountRef(node);
      readMount(node);
    },
    [mountRef, readMount],
  );

  const asking = snapshot.messages.findLast(
    (message) => message.card?.kind === 'user-question' && !resolutions.has(message.id),
  );

  const rows = useMemo<Row[]>(
    () => [
      ...snapshot.drafts.map((entry): Row => ({
        kind: 'draft',
        key: `draft:${entry.draftId}`,
        draft: entry,
      })),
      ...history,
    ],
    [snapshot.drafts, history],
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

  const membersKey = channel === undefined ? undefined : `${channel.id}:${channel.members.join()}`;
  const mentionQuery = dm ? undefined : activeMentionQuery(draft, caret, mentions);
  const candidates = mentionCandidates(members, mentionQuery, mentions, {
    label: t.mentionAll,
    preview: allPreview?.key === membersKey ? allPreview?.preview : undefined,
  });

  const loadAllPreview = () => {
    const key = membersKey;
    if (client === undefined || channelId === undefined || key === undefined) return;
    if (allPreview?.key === key) return;
    client
      .call<WireAllBotPreview>('channelAllBotPreview', { channelId })
      .then((preview) => setAllPreview({ key, preview }))
      .catch(() => undefined);
  };

  const edit = (next: string) => {
    setMentions((current) => rebaseMentions(draft, next, current));
    setDraft(next);
    if (!dm && next.includes('@')) loadAllPreview();
  };

  const mention = (candidate: MentionCandidate) => {
    if (mentionQuery === undefined) return;
    const chosen = chooseMention(draft, mentions, mentionQuery, candidate);
    setDraft(chosen.value);
    setMentions(chosen.mentions);
    setCaret(chosen.caret);
    setSelection({ start: chosen.caret, end: chosen.caret });
  };

  const send = () => {
    const { body, tags } = submittedMessage(draft, mentions);
    if ((body === '' && files.length === 0) || conversation === undefined) return;
    if (tags.allBotMention?.preview.recipients.length === 0) return;
    if (dictation.state.status !== 'idle') dictation.cancel();
    setDraft('');
    setMentions([]);
    setFiles([]);
    latest.jumpToLatest();
    if (
      !dm ||
      asking?.card === undefined ||
      client === undefined ||
      slug === undefined ||
      files.length > 0
    ) {
      conversation.send(body, files, tags);
      return;
    }
    const ref = {
      channelId: asking.card.channelId,
      messageId: asking.id,
      botSlug: slug,
    };
    void answerInChat(client, ref, body)
      .catch(() => false)
      .then((done) => {
        if (!done) {
          conversation.send(body, files);
          return;
        }
        setAnswered((current) => new Set([...current, asking.id]));
        void inbox?.refresh();
      });
  };

  const pick = (source: PickSource) => {
    setAttachError(false);
    pickFiles(source, MAX_PICKED - files.length)
      .then((more) => setFiles((current) => [...current, ...more].slice(0, MAX_PICKED)))
      .catch(() => setAttachError(true));
  };

  const share = useCallback((attachment: MessageAttachment): Promise<void> => {
    setShareError(false);
    return shareAttachment(attachment).catch(() => setShareError(true));
  }, []);

  const retry = useCallback((id: string) => conversation?.retry(id), [conversation]);

  const openActions = useCallback(
    (message: ConversationMessage, anchor: Rect, group: BubbleGroup) =>
      setActionsFor({ message, anchor, group }),
    [],
  );

  const react = useCallback(
    (messageId: string, emoji: string, active: boolean): void => {
      setReactError(false);
      void conversation?.react(messageId, emoji, active).catch(() => setReactError(true));
    },
    [conversation],
  );

  const roster = host.roster;
  const botName = useCallback(
    (id: string): string => roster?.bots.find((entry) => entry.slug === id)?.displayName ?? id,
    [roster],
  );

  const speakerOf = useCallback(
    (id: string, row: { key: string; first: boolean; last: boolean }): Speaker => ({
      name: botName(id),
      bot: roster?.bots.find((entry) => entry.slug === id),
      group: groupOf.get(row.key) ?? row.key,
      first: row.first,
      last: row.last,
    }),
    [roster, botName, groupOf],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'draft')
        return (
          <DraftBubble
            draft={item.draft}
            speaker={
              dm
                ? undefined
                : speakerOf(item.draft.botSlug, { key: item.key, first: true, last: true })
            }
          />
        );
      if (item.kind === 'separator') return <TimeSeparator at={item.at} />;
      const author = item.message.bot ?? slug;
      if (
        client !== undefined &&
        author !== undefined &&
        (item.message.card?.kind === 'tool-approval' || item.message.card?.kind === 'user-question')
      )
        return (
          <RequestCard
            client={client}
            inbox={inbox}
            message={item.message}
            card={item.message.card}
            botSlug={author}
            botName={botName(author)}
            resolution={resolutions.get(item.message.id)}
            focused={item.message.id === focus}
            replyInChat={dm}
            answeredHere={answered.has(item.message.id)}
            group={item}
          />
        );
      return (
        <MessageBubble
          message={item.message}
          first={item.first}
          last={item.last}
          onRetry={retry}
          onOpenImage={setViewing}
          onShare={share}
          onLongPress={openActions}
          lifted={item.message.id === actionsFor?.message.id}
          onReact={react}
          botName={botName}
          speaker={
            !dm && item.message.bot !== undefined ? speakerOf(item.message.bot, item) : undefined
          }
        />
      );
    },
    [
      dm,
      client,
      slug,
      inbox,
      resolutions,
      focus,
      answered,
      retry,
      openActions,
      actionsFor,
      share,
      react,
      botName,
      speakerOf,
    ],
  );

  const hostRefused = host.connection.status === 'refused';
  const notice = hostRefused
    ? t.refused
    : snapshot.status === 'refused'
      ? dm
        ? t.dmRefused
        : t.channelRefused
      : host.roster !== undefined && (dm ? bot === undefined : channel === undefined)
        ? dm
          ? t.noBot
          : t.noChannel
        : snapshot.fromCache && host.connection.status !== 'connected'
          ? t.offline
          : snapshot.status === 'interrupted'
            ? t.liveInterrupted
            : attachError
              ? t.attachFailed
              : shareError
                ? t.shareFailed
                : reactError
                  ? t.reactFailed
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
          headerShown: false,
          scrollEdgeEffects: { top: 'hidden', bottom: 'hidden', left: 'hidden', right: 'hidden' },
        }}
      />
      <KeyboardAvoidingView
        ref={screenRef}
        style={{ flex: 1, backgroundColor: theme.color.base }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {notice === undefined ? null : (
          <View
            style={{
              marginTop: headerHeight,
              backgroundColor: theme.color.warningSoft,
              paddingHorizontal: space.x5,
              paddingVertical: space.x3,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.x4,
            }}
          >
            <Text
              accessibilityLiveRegion="polite"
              variant="meta"
              tone="warning"
              style={{ flex: 1 }}
            >
              {notice}
            </Text>
            {!hostRefused ? null : (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/pair')}
                hitSlop={space.x3}
              >
                <Text variant="meta" tone="accent" strong>
                  {t.pairAgain}
                </Text>
              </Pressable>
            )}
          </View>
        )}
        <Animated.View
          ref={viewport}
          collapsable={false}
          style={{ flex: 1 }}
          onLayout={() => {
            viewportLayout.value += 1;
          }}
        >
          <SpeakerStageContext.Provider value={dm ? undefined : stage}>
            <Animated.FlatList
              ref={list}
              inverted
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingTop: composerHeight + edgeFade.bottom,
                paddingBottom: (notice === undefined ? headerHeight : 0) + space.x3,
              }}
              data={rows}
              keyExtractor={(row) => row.key}
              renderItem={renderItem}
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
              {...latest.listProps}
              scrollEventThrottle={32}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={<WorkingStatus bots={working} />}
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
                  <Text
                    variant="meta"
                    tone="muted"
                    style={{ textAlign: 'center', padding: space.x5 }}
                  >
                    {dm ? t.beginning : t.beginningChannel}
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
          </SpeakerStageContext.Provider>
          <EdgeFade edge="bottom" height={composerHeight + edgeFade.bottom} />
          {latest.away ? (
            <View
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                bottom: composerHeight + space.x4,
                left: 0,
                right: 0,
                alignItems: 'center',
              }}
            >
              <JumpToLatest unseen={latest.unseen} onPress={latest.jumpToLatest} />
            </View>
          ) : null}
          <View
            onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
          >
            <Composer
              value={draft}
              placeholder={
                bot !== undefined
                  ? t.messageBot(bot.displayName)
                  : channel !== undefined
                    ? t.messageBot(`#${channel.name}`)
                    : t.messagePlaceholder
              }
              disabled={conversation === undefined}
              files={files}
              canAttach={files.length < MAX_PICKED}
              dictation={dictation.state.status}
              canDictate={conversation !== undefined}
              onChange={edit}
              selection={selection}
              onSelection={(next) => {
                setSelection(undefined);
                setCaret(next);
              }}
              {...(candidates.length === 0
                ? {}
                : { above: <MentionSuggestions candidates={candidates} onChoose={mention} /> })}
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
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
      <EdgeFade edge="top" height={headerHeight + edgeFade.top} />
      <ChatHeader
        left={<HeaderBackButton onPress={() => router.back()} />}
        center={
          dm ? (
            <ChatTitle
              bot={bot}
              fallback={slug ?? ''}
              onPress={() => router.push(`/bot/${bot?.slug ?? slug}`)}
            />
          ) : (
            <ChannelTitle
              channel={channel}
              fallback={channelId ?? ''}
              onPress={() =>
                router.push({ pathname: '/group/[id]', params: { id: channel?.id ?? channelId } })
              }
            />
          )
        }
        right={
          slug !== undefined ? (
            <OpenFullClientButton target={{ kind: 'dm', slug }} round />
          ) : channelId !== undefined ? (
            <OpenFullClientButton target={{ kind: 'channel', channelId }} round />
          ) : null
        }
      />
      <ImageViewer attachment={viewing} onClose={() => setViewing(undefined)} onShare={share} />
      <MessageActions
        target={actionsFor}
        onClose={() => setActionsFor(undefined)}
        onReact={(message, emoji, active) => react(message.id, emoji, active)}
        onCopy={copyMessage}
        onShareText={shareText}
      />
    </>
  );
}
