import { useSourceDraft } from '../../host/native-source-drafts';
import { hostDraftKey } from '../../host/source-drafts';
import { takeSharedFiles } from '../share/incoming-share';
import { Stack, useIsFocused, useRouter } from 'expo-router';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';
import Animated, { useAnimatedRef, useScrollOffset, useSharedValue } from 'react-native-reanimated';

import {
  chatBackgrounds,
  useChatBackgrounds,
  backgroundImageUri,
} from '../../host/native-chat-background';
import { ChatBackground } from './chat-background';
import type { HostClient } from '../../host/client';
import { visibleDmActivity } from '../../host/dm-activity';
import { useHiddenDmActivity } from '../../host/native-dm-activity';
import { useMessageDisplay } from '../../host/native-message-display';
import {
  shownInChat,
  type CardResolution,
  type ConversationDraftReference,
  type ConversationMessage,
  type MessageAttachment,
  type MessageCard,
} from '../../host/conversation';
import type { Inbox } from '../../host/inbox';
import type { WireAllBotPreview } from '../../host/wire';
import { shareAttachment } from '../../host/share-attachment';
import {
  MAX_PICKED,
  fromClipboardImage,
  pickFiles,
  type PickSource,
  type PickedFile,
} from '../../host/pick-files';
import {
  useChannelConversation,
  useConversation,
  useConversationTimelineSnapshot,
  useStreamPlayback,
  useHostSession,
  useHostSnapshot,
} from '../../host/host-session';
import {
  answerInChat,
  answerQuestion,
  decideApproval,
  handledHere,
  grantRequestPort,
  loadApproval,
  loadQuestion,
  type RequestRef,
} from '../../host/requests';
import { useDictation } from '../../host/speech';
import { botColor } from '../bot-color';
import { ApprovalCard } from './approval-card';
import { GrantRequestCard } from './grant-request-card';
import { PrivateInputCard } from './private-input-card';
import { ActivityRow } from './activity-row';
import type { BubbleGroup } from './bubble-shape';
import { botBusy } from './bot-tone';
import { ChannelTitle } from './channel-title';
import { ChatTitle } from './chat-title';
import { Composer, type ComposerInput } from './composer';
import { ClipboardImageOffer, useClipboardImage } from './clipboard-image';
import { EdgeFade, HeaderBackButton, titleChipFill } from './header-chrome';
import {
  barLabelStyle,
  floatingHeader,
  glassHeader,
  useHeaderOverlap,
  useHeaderPadding,
} from './native-header';
import { useFollowLatest } from './follow-latest';
import { usePullToCompose } from './pull-to-compose';
import { chatHref, useRecentChat } from '../shell/recent-chats';
import { PullToComposeHint } from './pull-to-compose-hint';
import { useMarkRead } from './mark-read';
import { useBotNames } from './use-bot-names';
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
import { PlaybackBubble, type Speaker } from './message-bubble';
import { MessageIdentities } from './message-identities';
import { copyMessage, shareText } from './message-menu';
import type { Rect } from './menu-placement';
import { chatRows, messageGroups, type ChatRow } from './message-groups';
import { createSpeakerRegistry, SpeakerStageContext } from './speaker-row';
import { QuestionCard } from './question-card';
import { WorkingStatus } from './working-status';
import { TimeSeparator } from './time-separator';
import { AccentProvider, useDesignTheme } from '../design/theme';
import { edgeFade, pullToCompose, radius, space } from '../design/tokens';
import { OpenFullClientButton } from '../open-full-client';
import { fullClientParams, type FullClientTarget } from '../../host/full-client';
import { leaveScreen } from '../shell/leave-screen';
import { Text } from '../primitives/text';
import { MarkdownViewportContext } from '../markdown-viewport';
import { KeyboardChatFrame, useListBottomSafeArea } from '../primitives/keyboard-frame';
import { t } from '../strings';

type Row = ChatRow | { kind: 'draft'; key: string; draft: ConversationDraftReference };
const NO_DRAFTS: ConversationDraftReference[] = [];

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

export type ChatPlace =
  | { kind: 'dm'; slug: string | undefined }
  | { kind: 'channel'; channelId: string | undefined };

export function ConversationScreen({
  expectedHostId,
  place,
  focus,
  latestWindowOnly = false,
}: {
  place: ChatPlace;
  expectedHostId?: string | undefined;
  focus: string | undefined;
  latestWindowOnly?: boolean;
}) {
  const { client, saved } = useHostSession();
  const focused = useIsFocused();
  const roster = useHostSnapshot(client, focused).roster;
  const router = useRouter();
  const identities = useMemo(
    () => ({
      bots: roster?.bots ?? [],
      openBot: (slug: string) =>
        router.push({ pathname: '/dm/[slug]', params: { slug, hostId: saved?.hostId } }),
    }),
    [roster?.bots, router, saved?.hostId],
  );
  const bot =
    place.kind === 'dm' ? roster?.bots.find((entry) => entry.slug === place.slug) : undefined;
  if (expectedHostId && saved?.hostId !== expectedHostId) return <Text>{t.sourceChanged}</Text>;
  return (
    <AccentProvider accent={bot === undefined ? undefined : botColor(bot)}>
      <MessageIdentities.Provider value={identities}>
        <ChatConversation
          key={JSON.stringify([saved?.hostId, place])}
          place={place}
          focus={focus}
          latestWindowOnly={latestWindowOnly}
          focused={focused}
        />
      </MessageIdentities.Provider>
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
  const grant = useMemo(
    () => grantRequestPort(client, ref, () => void inbox?.refresh()),
    [client, inbox, ref],
  );
  const router = useRouter();
  const subject = card.subject === undefined ? {} : { subject: card.subject };
  if (card.kind === 'private-input')
    return (
      <PrivateInputCard
        botName={botName}
        purpose={card.subject}
        resolved={resolution?.kind === 'private-input'}
        focused={focused}
        group={group}
        onFill={() =>
          router.push({
            pathname: '/full-client',
            params: fullClientParams({
              kind: 'private-input',
              channelId: card.channelId,
              messageId: message.id,
            }),
          })
        }
      />
    );
  if (card.kind === 'grant')
    return (
      <GrantRequestCard
        port={grant}
        botName={botName}
        resolved={card.resolved === true || resolution?.kind === 'grant'}
        decidedHere={handledHere(ref)}
        focused={focused}
        group={group}
      />
    );
  if (card.kind === 'tool-approval')
    return (
      <ApprovalCard
        port={approval}
        {...subject}
        {...(card.command === undefined ? {} : { command: card.command })}
        {...(resolution?.kind === 'tool-approval' ? { resolution } : {})}
        decidedHere={handledHere(ref)}
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
      expandInput
      answeredHere={answeredHere || handledHere(ref)}
    />
  );
});

function ChatConversation({
  place,
  focus,
  latestWindowOnly,
  focused,
}: {
  focused: boolean;
  place: ChatPlace;
  focus: string | undefined;
  latestWindowOnly: boolean;
}) {
  const theme = useDesignTheme();
  const router = useRouter();
  const headerOverlap = useHeaderOverlap();
  const headerPadding = useHeaderPadding();
  const { width: windowWidth } = useWindowDimensions();
  const listSafeArea = useListBottomSafeArea();
  const { client, inbox, saved } = useHostSession();
  const host = useHostSnapshot(client, focused);
  const dm = place.kind === 'dm';
  const slug = dm ? place.slug : undefined;
  const hiddenActivity = useHiddenDmActivity(saved?.hostId, slug);
  const channelId = dm ? undefined : place.channelId;
  const bot = dm ? host.roster?.bots.find((entry) => entry.slug === slug) : undefined;
  const channel = dm ? undefined : host.roster?.channels.find((entry) => entry.id === channelId);
  const channelDetails = dm
    ? undefined
    : host.roster?.activityChannels?.find((entry) => entry.id === channelId);
  const botDm = channelDetails?.type === 'dm' && channelDetails.botSlug === undefined;
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
  useChatBackgrounds();
  const background = chatBackgrounds.resolve(
    saved && activeChannel ? { hostId: saved.hostId, channelId: activeChannel } : undefined,
  );
  const display = useMessageDisplay();
  const playback = useStreamPlayback(conversation, display.loaded && display.mode === 'streaming');
  const snapshot = useConversationTimelineSnapshot(conversation, playback);
  const shownDrafts = display.loaded && display.mode === 'streaming' ? snapshot.drafts : NO_DRAFTS;
  const draftKey = hostDraftKey(
    saved?.hostId ?? '',
    place.kind,
    (place.kind === 'dm' ? place.slug : place.channelId) ?? '',
  );
  const [draft, setDraft] = useSourceDraft(draftKey);
  const [mentions, setMentions] = useState<SelectedMention[]>([]);
  const [caret, setCaret] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number }>();
  const [allPreview, setAllPreview] = useState<{
    key: string;
    preview: WireAllBotPreview;
  }>();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [attachError, setAttachError] = useState(false);
  const dictation = useDictation(setDraft);
  const [shareError, setShareError] = useState(false);
  const [viewing, setViewing] = useState<MessageAttachment>();
  const [actionsFor, setActionsFor] = useState<MessageMenuTarget>();
  const [reactError, setReactError] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
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

  const visible = useMemo(() => {
    const shown = snapshot.messages.filter(shownInChat);
    return dm ? visibleDmActivity(shown, hiddenActivity) : shown;
  }, [snapshot.messages, dm, hiddenActivity]);
  const chronological = useMemo(
    () =>
      chatRows(
        visible,
        (message) => message.card !== undefined && (!dm || !resolutions.has(message.id)),
      ).map((row) =>
        row.kind === 'message' ? { ...row, key: playback?.rowKey(row.message.id) ?? row.key } : row,
      ),
    [visible, resolutions, dm, playback],
  );
  const [speakers] = useState(createSpeakerRegistry);
  const groups = useMemo(() => messageGroups(chronological), [chronological]);
  const groupOf = useMemo(() => new Map(groups.map((entry) => [entry.key, entry.group])), [groups]);
  useLayoutEffect(() => {
    speakers.setGroups([
      ...groups,
      ...shownDrafts.map((entry) => {
        const key = `draft:${entry.draftId}`;
        return { key, group: key };
      }),
    ]);
  }, [speakers, groups, shownDrafts]);
  const scroll = useScrollOffset(list);
  const viewport = useAnimatedRef<ViewInstance>();
  const content = useAnimatedRef<ViewInstance>();
  const attachList = useCallback(
    (node: FlatList<Row> | null) => {
      list(node);
      const scroll = node?.getNativeScrollRef?.();
      content(
        scroll !== null && scroll !== undefined && 'getInnerViewRef' in scroll
          ? scroll.getInnerViewRef()
          : null,
      );
    },
    [list, content],
  );
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
  const latest = useFollowLatest(list, visible, playback?.setFollowing, headerOverlap);
  const composerInput = useRef<ComposerInput>(null);
  const [typing, setTyping] = useState(false);
  const clipboard = useClipboardImage(typing && files.length < MAX_PICKED);
  const composable = !botDm && conversation !== undefined && host.connection.status === 'connected';
  const { jumpToLatest } = latest;
  const compose = useCallback(() => {
    jumpToLatest();
    composerInput.current?.focus();
  }, [jumpToLatest]);
  const pull = usePullToCompose({
    enabled: composable,
    threshold: pullToCompose.threshold,
    flick: Platform.OS === 'android' ? pullToCompose.flick : undefined,
    onCompose: compose,
  });
  const markdownViewport = useMemo(
    () => ({ scroll, viewport, content, layout: viewportLayout, active: focused }),
    [scroll, viewport, content, viewportLayout, focused],
  );
  const readMount = useMarkRead(client, inbox, conversation, activeChannel, !latest.away);
  const recentMount = useRecentChat(
    botDm
      ? undefined
      : bot !== undefined
        ? {
            id: `dm:${saved?.hostId ?? ''}:${bot.slug}`,
            title: bot.displayName,
            href: chatHref(`/dm/${encodeURIComponent(bot.slug)}`, saved?.hostId),
          }
        : channel !== undefined
          ? {
              id: `channel:${saved?.hostId ?? ''}:${channel.id}`,
              title: channel.name,
              href: chatHref(`/channel/${encodeURIComponent(channel.id)}`, saved?.hostId),
            }
          : undefined,
  );
  const sharedMount = useCallback(
    (node: unknown) => {
      if (node === null) return;
      const shared = takeSharedFiles(draftKey);
      if (shared.length > 0) setFiles((current) => [...current, ...shared].slice(0, MAX_PICKED));
    },
    [draftKey],
  );
  const mountRef = dictation.mountRef;
  const screenRef = useCallback(
    (node: unknown) => {
      mountRef(node);
      readMount(node);
      recentMount(node);
      sharedMount(node);
    },
    [mountRef, readMount, recentMount, sharedMount],
  );

  const asking = snapshot.messages.findLast(
    (message) => message.card?.kind === 'user-question' && !resolutions.has(message.id),
  );

  const rows = useMemo<Row[]>(
    () => [
      ...chronological,
      ...shownDrafts.map((entry): Row => ({
        kind: 'draft',
        key: `draft:${entry.draftId}`,
        draft: entry,
      })),
    ],
    [shownDrafts, chronological],
  );

  const jump = () => {
    if (focus === undefined || jumped.current === focus) return;
    const index = rows.findIndex((row) => row.kind === 'message' && row.message.id === focus);
    if (index >= 0) {
      jumped.current = focus;
      latest.hold();
      list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    } else if (latestWindowOnly && snapshot.status === 'live') jumped.current = focus;
    else if (snapshot.status === 'live' && snapshot.hasOlder && !snapshot.loadingOlder)
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
    if (host.connection.status !== 'connected') return;
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
  const botName = useBotNames(roster?.bots);

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
        return conversation === undefined ? null : (
          <PlaybackBubble
            playback={playback}
            queueKey={item.key}
            speaker={
              dm
                ? undefined
                : speakerOf(item.draft.botSlug, { key: item.key, first: true, last: true })
            }
          />
        );
      if (item.kind === 'separator') return <TimeSeparator at={item.at} />;
      if (item.message.activity !== undefined)
        return (
          <ActivityRow
            message={item.message}
            activity={item.message.activity}
            roster={roster}
            count={item.activityCount ?? 1}
            dmSlug={slug}
            lifted={Platform.OS === 'web' && item.message.id === actionsFor?.message.id}
            onLongPress={(anchor, label, target) =>
              setActionsFor({
                message: { ...item.message, body: label },
                anchor,
                group: { first: true, last: true },
                activity:
                  target === undefined
                    ? {}
                    : {
                        label:
                          item.message.activity?.kind === 'memory'
                            ? t.activityRow.openMemory
                            : item.message.activity?.kind === 'bot-create'
                              ? t.activityRow.openBot
                              : t.activityRow.openChat,
                        onOpen: () => router.push(target),
                      },
              })
            }
          />
        );
      const author = item.message.bot ?? slug;
      if (
        client !== undefined &&
        author !== undefined &&
        (item.message.card?.kind === 'tool-approval' ||
          item.message.card?.kind === 'user-question' ||
          item.message.card?.kind === 'grant' ||
          item.message.card?.kind === 'private-input')
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
        <PlaybackBubble
          playback={playback}
          queueKey={item.key}
          message={item.message}
          first={item.first}
          last={item.last}
          onRetry={retry}
          onOpenImage={setViewing}
          onShare={share}
          onLongPress={openActions}
          lifted={Platform.OS === 'web' && item.message.id === actionsFor?.message.id}
          {...(botDm ? {} : { onReact: react })}
          botName={botName}
          speaker={
            !dm && item.message.bot !== undefined ? speakerOf(item.message.bot, item) : undefined
          }
        />
      );
    },
    [
      dm,
      playback,
      conversation,
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
      roster,
      botDm,
      router,
    ],
  );

  const hostRefused = host.connection.status === 'refused';
  const missing =
    host.roster !== undefined && (dm ? bot === undefined : channel === undefined && !botDm);
  const leave = () => leaveScreen(router);
  const canGoBack = router.canGoBack();
  const title = dm ? (
    <ChatTitle
      bot={bot}
      fallback={slug ?? ''}
      onPress={() => router.push(`/bot/${bot?.slug ?? slug}`)}
    />
  ) : botDm ? (
    <View
      style={{
        minHeight: theme.touch,
        justifyContent: 'center',
        paddingHorizontal: theme.touch / 2,
        borderRadius: radius.round,
        ...titleChipFill(theme, false),
      }}
    >
      <Text strong numberOfLines={1} style={barLabelStyle}>
        {channelDetails.members
          .map(
            (member) =>
              roster?.bots.find((entry) => entry.slug === member)?.displayName ??
              t.activityRow.unavailableBot,
          )
          .join('、')}
      </Text>
    </View>
  ) : (
    <ChannelTitle
      channel={channel}
      fallback={channelId ?? ''}
      onPress={() =>
        router.push({ pathname: '/group/[id]', params: { id: channel?.id ?? channelId } })
      }
    />
  );
  const fullClient: FullClientTarget | undefined =
    slug !== undefined
      ? { kind: 'dm', slug }
      : channelId !== undefined
        ? { kind: 'channel', channelId }
        : undefined;
  const trailing =
    fullClient === undefined ? null : (
      <OpenFullClientButton target={fullClient} bar plain={!floatingHeader} />
    );
  const ios = Platform.OS === 'ios';
  const back = <HeaderBackButton plain={!floatingHeader} onPress={leave} />;
  const titleItem = (
    <View style={{ maxWidth: windowWidth - (theme.touch + space.x5) * 3 }}>{title}</View>
  );
  const notice = hostRefused
    ? t.refused
    : snapshot.status === 'refused'
      ? dm
        ? t.dmRefused
        : t.channelRefused
      : missing
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

  const listTop = notice === undefined ? headerPadding : 0;
  const fadeColor = background.kind === 'color' ? background.color : theme.color.base;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: ios || floatingHeader,
          headerStyle: ios || floatingHeader ? {} : { backgroundColor: theme.color.base },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          ...(ios && !glassHeader ? { headerBlurEffect: 'systemChromeMaterial' as const } : {}),
          ...(glassHeader
            ? { scrollEdgeEffects: { top: 'automatic' as const, bottom: 'hidden' as const } }
            : {}),
          ...(ios
            ? {
                title: '',
                headerTitle: '',
                headerBackVisible: canGoBack,
                unstable_headerLeftItems: () => [
                  ...(canGoBack
                    ? []
                    : [
                        {
                          type: 'button' as const,
                          label: t.back,
                          icon: { type: 'sfSymbol' as const, name: 'chevron.left' as const },
                          onPress: leave,
                        },
                      ]),
                  { type: 'spacing' as const, spacing: 0 },
                  { type: 'custom' as const, element: titleItem },
                ],
                unstable_headerRightItems: () =>
                  fullClient === undefined
                    ? []
                    : [
                        {
                          type: 'button' as const,
                          label: t.openFullClient,
                          icon: { type: 'sfSymbol' as const, name: 'macwindow' as const },
                          onPress: () =>
                            router.push({
                              pathname: '/full-client',
                              params: fullClientParams(fullClient),
                            }),
                        },
                      ],
              }
            : {
                headerTitleAlign: 'left' as const,
                headerTitle: () => (
                  <View
                    key={`${theme.scheme}:${theme.fontScale}:${bot?.displayName ?? channel?.name ?? ''}`}
                    style={{ maxWidth: windowWidth - (theme.touch + space.x5) * 3 }}
                  >
                    {title}
                  </View>
                ),
                headerRight: () => trailing,
                ...(canGoBack && !floatingHeader ? {} : { headerLeft: () => back }),
              }),
        }}
      />
      <KeyboardChatFrame
        onMount={screenRef}
        backgroundColor={background.kind === 'color' ? background.color : theme.color.base}
        background={
          background.kind === 'image' ? (
            <ChatBackground choice={background} imageUri={backgroundImageUri} />
          ) : undefined
        }
        onComposerLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}
        composer={
          botDm ? (
            <View style={{ padding: space.x5, alignItems: 'center' }}>
              <Text variant="meta" tone="muted">
                {t.activityRow.botDm}
              </Text>
            </View>
          ) : (
            <Composer
              value={draft}
              placeholder={
                bot !== undefined
                  ? t.messageBot(bot.displayName)
                  : channel !== undefined
                    ? t.messageBot(`#${channel.name}`)
                    : t.messagePlaceholder
              }
              disabled={conversation === undefined || host.connection.status !== 'connected'}
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
              {...(candidates.length > 0
                ? { above: <MentionSuggestions candidates={candidates} onChoose={mention} /> }
                : clipboard.offered
                  ? {
                      above: (
                        <ClipboardImageOffer
                          onUnreadable={clipboard.used}
                          onPaste={(data) => {
                            clipboard.used();
                            setAttachError(false);
                            setFiles((current) =>
                              [...current, fromClipboardImage(data)].slice(0, MAX_PICKED),
                            );
                          }}
                        />
                      ),
                    }
                  : {})}
              onSend={send}
              onPick={pick}
              onRemove={(id) => setFiles((current) => current.filter((file) => file.id !== id))}
              onDictate={() => {
                setAttachError(false);
                dictation.start();
              }}
              onStopDictation={dictation.stop}
              onCancelDictation={dictation.cancel}
              inputRef={composerInput}
              onFocusChange={setTyping}
            />
          )
        }
      >
        {notice === undefined ? null : (
          <View
            style={{
              marginTop: headerOverlap + headerPadding,
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
            {hostRefused ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/pair')}
                hitSlop={space.x3}
              >
                <Text variant="meta" tone="accent" strong>
                  {t.pairAgain}
                </Text>
              </Pressable>
            ) : notice === t.noBot || notice === t.noChannel ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.dismissTo('/')}
                hitSlop={space.x3}
              >
                <Text variant="meta" tone="accent" strong>
                  {t.backToChats}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
        <Animated.View
          ref={viewport}
          collapsable={false}
          style={{ flex: 1 }}
          onLayout={(event) => {
            viewportLayout.value += 1;
            setViewportHeight(event.nativeEvent.layout.height);
          }}
        >
          <MarkdownViewportContext.Provider value={markdownViewport}>
            <SpeakerStageContext.Provider value={dm ? undefined : stage}>
              <Animated.FlatList
                ref={attachList}
                removeClippedSubviews={false}
                style={{ flex: 1, opacity: latest.ready || rows.length === 0 ? 1 : 0 }}
                contentInsetAdjustmentBehavior="automatic"
                contentInset={{ bottom: -listSafeArea }}
                automaticallyAdjustsScrollIndicatorInsets
                scrollToOverflowEnabled
                contentContainerStyle={{
                  minHeight: Math.max(
                    0,
                    viewportHeight - (notice === undefined ? headerOverlap : 0),
                  ),
                  justifyContent: 'flex-end',
                  paddingTop: space.x3 + listTop,
                  paddingBottom: composerHeight + edgeFade.bottom,
                }}
                data={rows}
                keyExtractor={(row) => row.key}
                renderItem={renderItem}
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
                {...(latest.ready ? { onStartReached: () => void conversation?.loadOlder() } : {})}
                onStartReachedThreshold={0.5}
                {...latest.listProps}
                onScrollBeginDrag={(event: ScrollEvent) => {
                  pull.onScrollBeginDrag(event);
                  latest.listProps.onScrollBeginDrag();
                }}
                onScroll={(event: ScrollEvent) => {
                  latest.listProps.onScroll(event);
                  pull.onScroll(event);
                }}
                onScrollEndDrag={(event: ScrollEvent) => {
                  latest.listProps.onScrollEndDrag(event);
                  pull.onScrollEndDrag(event);
                }}
                onContentSizeChange={(width: number, height: number) => {
                  latest.listProps.onContentSizeChange(width, height);
                  jump();
                }}
                scrollEventThrottle={32}
                keyboardDismissMode={ios ? 'interactive' : 'on-drag'}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
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
                  ) : undefined
                }
                ListFooterComponent={<WorkingStatus bots={working} />}
                ListEmptyComponent={
                  snapshot.status === 'opening' ? (
                    <View style={{ padding: space.x6, alignItems: 'center' }}>
                      <ActivityIndicator />
                    </View>
                  ) : undefined
                }
              />
            </SpeakerStageContext.Provider>
          </MarkdownViewportContext.Provider>
          {listTop > 0 ? (
            <EdgeFade
              edge="top"
              height={listTop + edgeFade.top}
              cover={listTop}
              color={fadeColor}
            />
          ) : null}
          <EdgeFade
            edge="bottom"
            height={composerHeight + edgeFade.bottom}
            cover={composerHeight}
            color={fadeColor}
          />
          {composable && Platform.OS === 'ios' ? (
            <PullToComposeHint
              progress={pull.progress}
              ready={pull.ready}
              bottom={composerHeight + space.x3}
            />
          ) : null}
          {latest.away ? (
            <View
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                bottom: composerHeight + space.x2,
                left: 0,
                right: space.x4,
                alignItems: 'flex-end',
              }}
            >
              <JumpToLatest unseen={latest.unseen} onPress={latest.jumpToLatest} />
            </View>
          ) : null}
        </Animated.View>
      </KeyboardChatFrame>
      <ImageViewer attachment={viewing} onClose={() => setViewing(undefined)} onShare={share} />
      <MessageActions
        target={actionsFor}
        readOnly={botDm}
        onClose={() => setActionsFor(undefined)}
        onReact={(message, emoji, active) => react(message.id, emoji, active)}
        onCopy={copyMessage}
        onShareText={shareText}
      />
    </>
  );
}
