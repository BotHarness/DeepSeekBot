import type { InitiatedActivityRequest } from '../../host/live-activity-routing';
import { ConnectionProgress, useConnectionProgress } from '../primitives/connection-progress';
import { SelectionBar, SelectionScreenshot, MessageSelectionRow } from './message-selection-ui';
import { selectionText, toggleMessageSelection } from './message-selection';
import { HostScope } from '../../host/host-scope';
import { useSourceDraft } from '../../host/native-source-drafts';
import { SessionFailureCard } from './session-failure-card';
import { hostDraftKey } from '../../host/source-drafts';
import { takeSharedFiles } from '../share/incoming-share';
import { Stack, useIsFocused, useRouter, useNavigationContainerRef } from 'expo-router';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';
import Animated, { useAnimatedRef, useScrollOffset } from 'react-native-reanimated';

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
import { useDeliveryReceiptPreferences } from '../../host/native-delivery-receipts';
import { readingBots } from '../../host/delivery-receipt';
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
import { WorkingStatus } from './working-status';
import { ChatTitle } from './chat-title';
import { Composer, type ComposerInput } from './composer';
import { DraftSaveNotice } from './draft-save-notice';
import { ClipboardImageOffer, useClipboardImage } from './clipboard-image';
import { EdgeFade, HeaderBackButton, HeaderCloseUpButton, titleChipFill } from './header-chrome';
import { useConversationChrome } from './conversation-chrome';
import {
  barLabelStyle,
  floatingHeader,
  glassHeader,
  headerIslands,
  useHeaderOverlap,
  useHeaderPadding,
} from './native-header';
import { useChannelViewport } from './channel-viewport';
import { usePullToCompose } from './pull-to-compose';
import { chatHref, useRecentChat } from '../shell/recent-chats';
import { PullToComposeHint } from './pull-to-compose-hint';
import { useMarkRead } from './mark-read';
import { useBotNames } from './use-bot-names';
import { ImageViewer } from './image-viewer';
import { JumpToLatest } from './jump-to-latest';
import { DeliverySheet } from './delivery-sheet';
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
import { useArrivals } from './arrivals';
import { MessageIdentities } from './message-identities';
import { copyMessage, shareText } from './message-menu';
import type { Rect } from './menu-placement';
import { chatRows, messageGroups, type ChatRow } from './message-groups';
import { createSpeakerRegistry, SpeakerStageContext } from './speaker-row';
import { QuestionCard } from './question-card';
import { TimeSeparator } from './time-separator';
import { AccentProvider, pressTint, useDesignTheme } from '../design/theme';
import { edge, edgeFade, pullToCompose, radius, space } from '../design/tokens';
import { navigateChannel } from '../shell/channel-navigation';
import { leaveScreen } from '../shell/leave-screen';
import { Text } from '../primitives/text';
import { MarkdownViewportContext } from '../markdown-viewport';
import { KeyboardChatFrame, useListBottomSafeArea } from '../primitives/keyboard-frame';
import { useStrings } from '../strings';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { ListSkeleton } from '../primitives/list-skeleton';
import { Button } from '../primitives/button';

type Row = ChatRow | { kind: 'draft'; key: string; draft: ConversationDraftReference };
const NO_DRAFTS: ConversationDraftReference[] = [];
const cellLayer = ({ index }: { index: number }) => ({ zIndex: -index });

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

export type ChatPlace =
  | { kind: 'dm'; slug: string | undefined }
  | { kind: 'channel'; channelId: string | undefined };

export function ConversationScreen({
  expectedHostId,
  place,
  focus,
  focusRequest,
  latestWindowOnly = false,
}: {
  place: ChatPlace;
  expectedHostId?: string | undefined;
  focus: string | undefined;
  focusRequest?: string | undefined;
  latestWindowOnly?: boolean;
}) {
  const t = useStrings();
  const initial = useHostSession();
  const [openedOn, setOpenedOn] = useState(initial.saved?.hostId);
  if (openedOn === undefined && initial.saved?.hostId !== undefined)
    setOpenedOn(initial.saved.hostId);
  const { client, saved } = useHostSession(expectedHostId ?? openedOn);

  const focused = useIsFocused();
  const roster = useHostSnapshot(client, focused).roster;
  const navigation = useNavigationContainerRef();
  const identities = useMemo(
    () => ({
      bots: roster?.bots ?? [],
      openBot: (slug: string) =>
        saved &&
        navigateChannel(navigation, {
          pathname: '/dm/[slug]',
          params: { slug, hostId: saved.hostId },
        }),
    }),
    [roster?.bots, navigation, saved],
  );
  const bot =
    place.kind === 'dm' ? roster?.bots.find((entry) => entry.slug === place.slug) : undefined;
  const shownHostId = expectedHostId ?? openedOn;
  if (shownHostId && saved?.hostId !== shownHostId) return <Text>{t.sourceChanged}</Text>;
  return (
    <HostScope value={saved?.hostId}>
      <AccentProvider accent={bot === undefined ? undefined : botColor(bot)}>
        <MessageIdentities.Provider value={identities}>
          <ChatConversation
            key={JSON.stringify([saved?.hostId, place])}
            place={place}
            focus={focus}
            focusRequest={focusRequest}
            latestWindowOnly={latestWindowOnly}
            focused={focused}
          />
        </MessageIdentities.Provider>
      </AccentProvider>
    </HostScope>
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

  const subject = card.subject === undefined ? {} : { subject: card.subject };
  if (card.kind === 'private-input')
    return (
      <PrivateInputCard
        target={ref}
        botName={botName}
        purpose={card.subject}
        resolved={resolution?.kind === 'private-input'}
        focused={focused}
        group={group}
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
  focusRequest,
  latestWindowOnly,
  focused,
}: {
  focused: boolean;
  place: ChatPlace;
  focus: string | undefined;
  focusRequest: string | undefined;
  latestWindowOnly: boolean;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const router = useRouter();
  const navigation = useNavigationContainerRef();
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
  const receiptPreference = useDeliveryReceiptPreferences();
  const receipts = receiptPreference.loaded && receiptPreference.enabled;
  const playback = useStreamPlayback(conversation, display.loaded && display.mode === 'streaming');
  const snapshot = useConversationTimelineSnapshot(conversation, playback);
  const shownDrafts = display.loaded && display.mode === 'streaming' ? snapshot.drafts : NO_DRAFTS;
  const draftKey = hostDraftKey(
    saved?.hostId ?? '',
    place.kind,
    (place.kind === 'dm' ? place.slug : place.channelId) ?? '',
  );
  const [draft, setDraft, draftPersistence] = useSourceDraft(draftKey);
  const [retryingDraft, setRetryingDraft] = useState(false);
  const draftRetryPending = useRef(false);
  const retryDraft = async () => {
    if (draftRetryPending.current) return;
    draftRetryPending.current = true;
    setRetryingDraft(true);
    try {
      await draftPersistence.retry();
    } finally {
      draftRetryPending.current = false;
      setRetryingDraft(false);
    }
  };
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
  const [initiatedRequest, setInitiatedRequest] = useState<InitiatedActivityRequest>();
  const selectionScope = (saved?.hostId ?? '') + ':' + (activeChannel ?? '');
  const [picked, setPicked] = useState<{
    scope: string;
    ids: readonly string[];
  }>();
  const selected = picked?.scope === selectionScope ? picked.ids : undefined;
  const [imageSelection, setImageSelection] = useState<{
    scope: string;
    messages: ConversationMessage[];
  }>();
  useLayoutEffect(() => {
    setPicked(undefined);
    setImageSelection(undefined);
    setActionsFor(undefined);
  }, [selectionScope, focused]);
  const togglePicked = useCallback(
    (message: ConversationMessage) => {
      setPicked((current) => ({
        scope: selectionScope,
        ids: toggleMessageSelection(current?.scope === selectionScope ? current.ids : [], message),
      }));
    },
    [selectionScope],
  );

  const [reactError, setReactError] = useState(false);
  const list = useAnimatedRef<FlatList<Row>>();
  const jumped = useRef<string | undefined>(undefined);
  const focusPage = useRef<string | undefined>(undefined);
  const focusCancelled = useRef(false);
  const focusNeedsLayout = useRef(false);
  const focusEstimate = useRef<string | undefined>(undefined);
  const focusAttempt = useRef<
    { message: string; request: string | undefined; index: number } | undefined
  >(undefined);
  const retryFocus = useRef<() => void>(() => undefined);
  const onFocusViewabilityChange = useCallback(() => {
    focusNeedsLayout.current = false;
    retryFocus.current();
  }, []);
  const focusIntent = useRef<{
    request: string | undefined;
    message: string | undefined;
  }>({
    request: undefined,
    message: undefined,
  });
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
  const latest = useChannelViewport(
    list,
    visible,
    playback?.setFollowing,
    headerOverlap,
    snapshot.status === 'live' && visible.length === 0,
    shownDrafts.length > 0,
  );
  const { composerHeight, viewportHeight, viewportLayout } = latest;
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
    () => ({
      scroll,
      viewport,
      content,
      layout: viewportLayout,
      active: focused,
    }),
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
  const rowKeys = useMemo(() => rows.map((row) => row.key), [rows]);
  const arrivals = useArrivals(rowKeys, latest.ready);

  const firstMessageId = snapshot.messages[0]?.id ?? '';
  const jump = useCallback(() => {
    if (
      !focused ||
      focus === undefined ||
      focusCancelled.current ||
      focusNeedsLayout.current ||
      jumped.current === focus ||
      focusIntent.current.message !== focus ||
      focusIntent.current.request !== focusRequest
    )
      return;
    const index = rows.findIndex((row) => row.kind === 'message' && row.message.id === focus);
    if (index >= 0) {
      if (!list.current) return;
      jumped.current = focus;
      focusAttempt.current = { message: focus, request: focusRequest, index };
      latest.hold();
      list.current.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    } else if (latestWindowOnly && snapshot.status === 'live') jumped.current = focus;
    else if (
      snapshot.status === 'live' &&
      snapshot.hasOlder &&
      !snapshot.loadingOlder &&
      !snapshot.olderError &&
      conversation !== undefined &&
      !snapshot.fromCache &&
      focusPage.current !== firstMessageId
    ) {
      focusPage.current = firstMessageId;
      void conversation.loadOlder();
    }
  }, [
    focused,
    focus,
    focusRequest,
    rows,
    list,
    latest.hold,
    latestWindowOnly,
    snapshot.status,
    snapshot.hasOlder,
    snapshot.loadingOlder,
    snapshot.olderError,
    snapshot.fromCache,
    firstMessageId,
    conversation,
  ]);

  useLayoutEffect(() => {
    retryFocus.current = jump;
    if (!focused) return;
    const previous = focusIntent.current;
    if (previous.message !== focus || previous.request !== focusRequest) {
      focusIntent.current = { request: focusRequest, message: focus };
      jumped.current = undefined;
      focusPage.current = undefined;
      focusCancelled.current = false;
      focusNeedsLayout.current = false;
      focusEstimate.current = undefined;
      focusAttempt.current = undefined;
    }
    jump();
  }, [focused, focus, focusRequest, jump]);

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
    if (!draftPersistence.loaded || draftPersistence.failed) return;
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
      const messageId = conversation.send(body, files, tags);
      if (dm && saved && slug)
        setInitiatedRequest({
          hostId: saved.hostId,
          ...(activeChannel === undefined ? {} : { channelId: activeChannel }),
          messageId,
          botSlug: slug,
        });
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
          const messageId = conversation.send(body, files);
          if (saved && slug)
            setInitiatedRequest({
              hostId: saved.hostId,
              ...(activeChannel === undefined ? {} : { channelId: activeChannel }),
              messageId,
              botSlug: slug,
            });
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

  const reportingActions = useCallback(
    (message: ConversationMessage) =>
      activeChannel && saved
        ? {
            feedback: () =>
              router.push({
                pathname: '/message-feedback',
                params: {
                  hostId: saved.hostId,
                  channelId: activeChannel,
                  messageId: message.id,
                },
              }),
            select: () => setPicked({ scope: selectionScope, ids: [message.id] }),
          }
        : undefined,
    [activeChannel, saved, router, selectionScope],
  );
  const openActions = useCallback(
    (message: ConversationMessage, anchor: Rect, group: BubbleGroup) => {
      if (selected !== undefined) {
        togglePicked(message);
        return;
      }
      const actions = reportingActions(message);
      setActionsFor({
        message,
        anchor,
        group,
        ...(actions ? { actions } : {}),
      });
    },
    [selected, togglePicked, reportingActions],
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
  const reading = useMemo(() => readingBots(snapshot.messages), [snapshot.messages]);
  const [deliveryFor, setDeliveryFor] = useState<string>();
  const openDelivery = useCallback(
    (message: ConversationMessage) => setDeliveryFor(message.id),
    [],
  );
  const openInbox = (target: { botSlug: string; missing: boolean }) => {
    const messageId = deliveryFor;
    setDeliveryFor(undefined);
    if (!saved || messageId === undefined) return;
    router.push({
      pathname: '/bot/[slug]/inbox',
      params: {
        slug: target.botSlug,
        hostId: saved.hostId,
        messageId,
        missing: target.missing ? '1' : '0',
      },
    });
  };

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
            focused={focused}
            queueKey={item.key}
            entering={arrivals.has(item.key)}
            speaker={
              dm
                ? undefined
                : speakerOf(item.draft.botSlug, {
                    key: item.key,
                    first: true,
                    last: true,
                  })
            }
          />
        );
      if (item.kind === 'separator') return <TimeSeparator at={item.at} />;
      const wrap = (children: React.ReactNode) => (
        <MessageSelectionRow
          message={item.message}
          selected={selected === undefined ? undefined : selected.includes(item.message.id)}
          onToggle={() => togglePicked(item.message)}
          onOpen={item.message.card === undefined ? undefined : openActions}
        >
          {children}
        </MessageSelectionRow>
      );

      if (item.message.activity !== undefined)
        return wrap(
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
                ...(reportingActions(item.message)
                  ? { actions: reportingActions(item.message)! }
                  : {}),
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
                        onOpen: () => {
                          if (target.pathname === '/dm/[slug]') {
                            if (saved)
                              navigateChannel(navigation, {
                                ...target,
                                params: {
                                  ...target.params,
                                  hostId: saved.hostId,
                                },
                              });
                          } else if (target.pathname === '/channel/[id]') {
                            if (saved)
                              navigateChannel(navigation, {
                                ...target,
                                params: {
                                  ...target.params,
                                  hostId: saved.hostId,
                                },
                              });
                          } else
                            router.push({
                              ...target,
                              params: {
                                ...target.params,
                                hostId: saved?.hostId,
                              },
                            });
                        },
                      },
              })
            }
          />,
        );
      const author = item.message.bot ?? slug;
      if (client && activeChannel && item.message.sessionFailure)
        return (
          <SessionFailureCard
            client={client}
            channelId={activeChannel}
            messageId={item.message.id}
            failure={item.message.sessionFailure}
            onReport={
              saved
                ? () =>
                    router.push({
                      pathname: '/message-feedback',
                      params: {
                        hostId: saved.hostId,
                        channelId: activeChannel,
                        messageId: item.message.id,
                        failureTurn: '1',
                      },
                    })
                : undefined
            }
          />
        );
      if (
        client !== undefined &&
        author !== undefined &&
        (item.message.card?.kind === 'tool-approval' ||
          item.message.card?.kind === 'user-question' ||
          item.message.card?.kind === 'grant' ||
          item.message.card?.kind === 'private-input')
      )
        return wrap(
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
          />,
        );
      return wrap(
        <PlaybackBubble
          playback={playback}
          focused={focused}
          queueKey={item.key}
          entering={arrivals.has(item.key)}
          message={item.message}
          first={item.first}
          last={item.last}
          onRetry={retry}
          onOpenImage={setViewing}
          onShare={share}
          onLongPress={openActions}
          lifted={Platform.OS === 'web' && item.message.id === actionsFor?.message.id}
          {...(botDm ? {} : { onReact: react })}
          {...(receipts ? { onOpenDelivery: openDelivery } : {})}
          readers={reading.get(item.message.id)}
          bots={roster?.bots}
          botName={botName}
          speaker={
            !dm && item.message.bot !== undefined ? speakerOf(item.message.bot, item) : undefined
          }
        />,
      );
    },
    [
      t,
      dm,
      playback,
      focused,
      conversation,
      client,
      slug,
      inbox,
      resolutions,
      focus,
      answered,
      retry,
      openActions,
      reportingActions,
      selected,
      togglePicked,
      theme,
      actionsFor,
      share,
      react,
      botName,
      speakerOf,
      roster,
      botDm,
      router,
      receipts,
      reading,
      arrivals,
    ],
  );

  const hostRefused = host.connection.status === 'refused';
  const connectionLabel = useConnectionProgress(
    host.connection.status,
    snapshot.status === 'interrupted',
  );
  const missing =
    host.roster !== undefined && (dm ? bot === undefined : channel === undefined && !botDm);
  const chrome = useConversationChrome();
  const leave = chrome?.close ?? (() => leaveScreen(router));
  const canGoBack = chrome === undefined && router.canGoBack();
  const botDmName =
    channelDetails?.members
      .map(
        (member) =>
          roster?.bots.find((entry) => entry.slug === member)?.displayName ??
          t.activityRow.unavailableBot,
      )
      .join('、') ?? '';
  const profileHref = {
    pathname: '/bot/[slug]' as const,
    params: {
      slug: bot?.slug ?? slug ?? '',
      ...(saved?.hostId === undefined ? {} : { hostId: saved.hostId }),
      ...(activeChannel ? { channelId: activeChannel } : {}),
      ...(initiatedRequest?.hostId === saved?.hostId &&
      initiatedRequest?.botSlug === slug &&
      initiatedRequest?.messageId !== undefined
        ? { activityMessageId: initiatedRequest.messageId }
        : {}),
    },
  };
  const pairHref = {
    pathname: '/channel-details' as const,
    params: {
      channelId: channelDetails?.id ?? '',
      ...(saved?.hostId === undefined ? {} : { hostId: saved.hostId }),
    },
  };
  const groupHref = {
    pathname: '/group/[id]' as const,
    params: {
      id: channel?.id ?? channelId ?? '',
      ...(saved?.hostId === undefined ? {} : { hostId: saved.hostId }),
    },
  };
  const pairChip = (press: (() => void) | undefined) => (
    <Pressable
      testID="channel-details-chip"
      accessibilityRole="button"
      accessibilityLabel={[botDmName, connectionLabel].filter(Boolean).join(', ')}
      android_ripple={{ color: pressTint(theme.color.fg), borderless: false }}
      accessibilityState={{ busy: connectionLabel !== undefined }}
      disabled={!saved || hostRefused}
      onPress={press}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        paddingHorizontal: theme.touch / 2,
        borderRadius: radius.round,
        ...titleChipFill(theme, pressed),
        overflow: 'hidden',
      })}
    >
      <Text strong numberOfLines={1} style={[{ flexShrink: 1 }, barLabelStyle]}>
        {botDmName}
      </Text>
      <ConnectionProgress active={connectionLabel !== undefined} />
      <WorkingStatus bots={working} />
    </Pressable>
  );
  const title = dm ? (
    <ChatTitle
      bot={bot}
      connectionLabel={connectionLabel}
      fallback={slug ?? ''}
      onPress={() => router.push(profileHref)}
    />
  ) : botDm ? (
    pairChip(saved && !hostRefused ? () => router.push(pairHref) : undefined)
  ) : (
    <ChannelTitle
      channel={channel}
      working={working}
      connectionLabel={connectionLabel}
      fallback={channelId ?? ''}
      onPress={() => router.push(groupHref)}
    />
  );
  const ios = Platform.OS === 'ios';
  const back = chrome ? (
    <HeaderCloseUpButton label={chrome.closeLabel} plain={!headerIslands} onPress={leave} />
  ) : (
    <HeaderBackButton plain={!headerIslands} onPress={leave} />
  );
  const trailing = chrome?.trailing;
  const titleItem = (
    <View
      style={{
        width: dm || botDm ? undefined : windowWidth - (theme.touch + space.x5) * 2,
        maxWidth: windowWidth - (theme.touch + space.x5) * 2,
      }}
    >
      {title}
    </View>
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
        : host.connection.status === 'unreachable' ||
            (snapshot.fromCache && host.connection.status === 'stopped')
          ? t.offline
          : snapshot.status === 'interrupted' && connectionLabel === undefined
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
                        : focus !== undefined &&
                            !latestWindowOnly &&
                            snapshot.status === 'live' &&
                            !snapshot.hasOlder &&
                            !snapshot.loadingOlder &&
                            !rows.some((row) => row.kind === 'message' && row.message.id === focus)
                          ? t.messageFocusUnavailable
                          : undefined;

  const listTop = notice === undefined ? headerPadding : 0;
  const topFade =
    notice !== undefined ? 0 : floatingHeader ? headerPadding : glassHeader ? 0 : headerOverlap;
  const composerCover = Math.max(0, composerHeight - space.x3 - space.x2);
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
          ...(glassHeader
            ? {
                scrollEdgeEffects: {
                  top: 'automatic' as const,
                  bottom: 'hidden' as const,
                },
              }
            : {}),
          ...(ios
            ? {
                title: '',
                headerTitle: '',
                headerBackVisible: canGoBack && !headerIslands,
                unstable_headerRightItems: () =>
                  trailing === undefined ? [] : [{ type: 'custom' as const, element: trailing }],
                unstable_headerLeftItems: () => [
                  ...(headerIslands
                    ? [{ type: 'custom' as const, element: back }]
                    : canGoBack
                      ? []
                      : [
                          {
                            type: 'button' as const,
                            label: chrome?.closeLabel ?? t.back,
                            icon: {
                              type: 'sfSymbol' as const,
                              name: chrome ? ('chevron.up' as const) : ('chevron.left' as const),
                            },
                            onPress: leave,
                          },
                        ]),
                  { type: 'spacing' as const, spacing: 0 },
                  { type: 'custom' as const, element: titleItem },
                ],
              }
            : {
                headerTitleAlign: 'left' as const,
                headerRight: () => trailing ?? null,
                headerTitle: () => (
                  <View
                    key={`${theme.scheme}:${theme.fontScale}:${bot?.displayName ?? channel?.name ?? ''}`}
                    style={{
                      width: dm || botDm ? undefined : windowWidth - (theme.touch + space.x5) * 2,
                      maxWidth: windowWidth - (theme.touch + space.x5) * 2,
                      marginHorizontal: space.x3,
                    }}
                  >
                    {title}
                  </View>
                ),
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
        onComposerLayout={latest.onComposerLayout}
        composer={
          selected !== undefined ? (
            <SelectionBar
              count={selected.length}
              onCancel={() => setPicked(undefined)}
              onCopy={() => copyMessage(selectionText(selected, visible))}
              onScreenshot={() =>
                setImageSelection({
                  scope: selectionScope,
                  messages: visible.filter((m) => selected.includes(m.id)),
                })
              }
            />
          ) : botDm ? (
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
              disabled={
                conversation === undefined ||
                host.connection.status !== 'connected' ||
                !draftPersistence.loaded ||
                draftPersistence.failed
              }
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
              above={
                <>
                  {draftPersistence.failed ? (
                    <DraftSaveNotice busy={retryingDraft} onRetry={() => void retryDraft()} />
                  ) : null}
                  {candidates.length > 0 ? (
                    <MentionSuggestions candidates={candidates} onChoose={mention} />
                  ) : clipboard.offered ? (
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
                  ) : null}
                </>
              }
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
            ) : host.connection.status === 'unreachable' ? (
              <Pressable
                testID="chat-connection-retry"
                accessibilityRole="button"
                accessibilityLabel={t.retry}
                onPress={() => client?.retryNow()}
                hitSlop={space.x3}
              >
                <Text variant="meta" tone="accent" strong>
                  {t.retry}
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
        <Animated.View style={{ flex: 1 }} onLayout={latest.onViewportLayout}>
          <MarkdownViewportContext.Provider value={markdownViewport}>
            <SpeakerStageContext.Provider value={dm ? undefined : stage}>
              <Animated.FlatList
                ref={attachList}
                renderScrollComponent={latest.renderScrollComponent}
                removeClippedSubviews={false}
                CellRendererComponentStyle={cellLayer}
                style={{
                  flex: 1,
                  opacity: latest.ready || rows.length === 0 ? 1 : 0,
                }}
                pointerEvents={!latest.ready && rows.length > 0 ? 'none' : 'auto'}
                accessibilityElementsHidden={!latest.ready && rows.length > 0}
                importantForAccessibility={
                  !latest.ready && rows.length > 0 ? 'no-hide-descendants' : 'auto'
                }
                contentInsetAdjustmentBehavior="automatic"
                contentInset={{ bottom: -listSafeArea }}
                automaticallyAdjustsScrollIndicatorInsets
                scrollToOverflowEnabled
                contentContainerStyle={{
                  minHeight: Math.max(
                    0,
                    viewportHeight -
                      (notice === undefined ? headerOverlap : 0) +
                      (Platform.OS === 'android' ? edge.hairline : 0),
                  ),
                  justifyContent: 'flex-end',
                  paddingTop: space.x3 + listTop,
                  paddingBottom: composerHeight + edgeFade.bottom,
                }}
                data={rows}
                keyExtractor={(row) => row.key}
                renderItem={renderItem}
                onViewableItemsChanged={onFocusViewabilityChange}
                onScrollToIndexFailed={(info) => {
                  const attempt = focusAttempt.current;
                  if (
                    focusCancelled.current ||
                    attempt === undefined ||
                    attempt.index !== info.index ||
                    attempt.message !== focusIntent.current.message ||
                    attempt.request !== focusIntent.current.request
                  )
                    return;
                  focusNeedsLayout.current = true;
                  jumped.current = undefined;
                  focusAttempt.current = undefined;
                  const estimate = `${info.index}:${info.highestMeasuredFrameIndex}:${info.averageItemLength}`;
                  if (focusEstimate.current === estimate) return;
                  focusEstimate.current = estimate;
                  list.current?.scrollToOffset({
                    offset: info.averageItemLength * info.index,
                    animated: false,
                  });
                }}
                {...(latest.ready && latest.browsed && !snapshot.olderError
                  ? { onStartReached: () => void conversation?.loadOlder() }
                  : {})}
                onStartReachedThreshold={0.5}
                {...latest.listProps}
                onScrollBeginDrag={(event: ScrollEvent) => {
                  focusCancelled.current = true;
                  focusAttempt.current = undefined;
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
                  focusNeedsLayout.current = false;
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
                      <LoadingIndicator />
                      <Text variant="meta" tone="muted">
                        {t.olderLoading}
                      </Text>
                    </View>
                  ) : snapshot.olderError ? (
                    <View style={{ padding: space.x4, gap: space.x2 }}>
                      <Text variant="meta" tone="muted" accessibilityLiveRegion="polite">
                        {t.olderLoadFailed}
                      </Text>
                      <Button
                        label={t.retry}
                        variant="text"
                        testID="history-retry"
                        onPress={() => void conversation?.loadOlder()}
                      />
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
              />
            </SpeakerStageContext.Provider>
          </MarkdownViewportContext.Provider>
          <Animated.View
            ref={viewport}
            collapsable={false}
            pointerEvents="box-none"
            style={[
              { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
              latest.overlayStyle,
            ]}
            onLayout={() => {
              viewportLayout.value += 1;
            }}
          >
            {(!latest.ready && rows.length > 0) ||
            (snapshot.status === 'opening' && rows.length === 0) ? (
              <View
                pointerEvents={latest.canRetry ? 'auto' : 'none'}
                style={{
                  position: 'absolute',
                  top: listTop,
                  bottom: composerHeight + edgeFade.bottom,
                  left: 0,
                  right: 0,
                  justifyContent: 'flex-end',
                }}
              >
                <ListSkeleton layout="messages" />
                {latest.canRetry ? (
                  <Button
                    label={t.retry}
                    variant="text"
                    testID="history-loading-retry"
                    onPress={latest.retry}
                  />
                ) : null}
              </View>
            ) : null}
            {topFade > 0 ? (
              <EdgeFade
                edge="top"
                height={topFade + edgeFade.reach}
                cover={topFade}
                color={fadeColor}
              />
            ) : null}
            <EdgeFade
              edge="bottom"
              height={composerCover + edgeFade.bottom}
              cover={composerCover}
              solid={composerCover}
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
        </Animated.View>
      </KeyboardChatFrame>
      {imageSelection?.scope === selectionScope ? (
        <SelectionScreenshot
          messages={imageSelection.messages}
          renderCard={(message) => {
            const author = message.bot ?? slug;
            return client && author && message.card ? (
              <RequestCard
                client={client}
                inbox={inbox}
                message={message}
                card={message.card}
                botSlug={author}
                botName={botName(author)}
                resolution={resolutions.get(message.id)}
                focused={false}
                replyInChat={dm}
                answeredHere={answered.has(message.id)}
                group={{ first: true, last: true }}
              />
            ) : (
              <Text>{message.body}</Text>
            );
          }}
          botName={botName}
          onClose={() => setImageSelection(undefined)}
        />
      ) : null}
      <ImageViewer attachment={viewing} onClose={() => setViewing(undefined)} onShare={share} />
      <DeliverySheet
        message={
          deliveryFor === undefined
            ? undefined
            : snapshot.messages.find((message) => message.id === deliveryFor)
        }
        botName={botName}
        onClose={() => setDeliveryFor(undefined)}
        onOpenInbox={openInbox}
      />
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
