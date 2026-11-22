import { useTeamMode } from '../../team-state.js';
import type {
  ConversationStateView,
  BotSummary,
  ChannelAttachmentRef,
  ChannelMessage,
  ClientStore,
} from '../../store.js';
import { useScopedRef, useScopedState } from '../../scoped-state.js';
import { WorkspaceContext } from '../../workspace-context.js';
import type { CompactNavigationHeader } from '../../mobile-conversation-header.js';
import type { WindowCompanions } from '../../window-companions.js';
import type {
  AllBotPreview,
  AllBotMention,
} from '../../../../../core/src/channels/all-bot-mention.js';
import { ComposerSendKeyContext } from '../../composer-send-key.js';
import { useContext, useMemo, type ReactElement, type ReactNode } from 'react';
import type { BridgeActions } from '../../actions.js';
import type { MemoryWorkingChange, ProfileActivity, GroupProfileActivity } from '../../bridge.js';
import type { PersonaBotFacepileItem } from '../../avatar.js';
import type { MessageHost } from '../../message-host.js';
import type { ChannelComposerUpload } from '../../channel-composer.js';
import { useHeaderSessionStop } from '../../header-session-stop.js';
import { runningSessionCount, runningSessionGroups } from '../../session-stop-model.js';
import { attachmentIdentity } from '../../../../../core/src/attachments/ref.js';
import { type SelectedMention, rebaseMentions } from '../../mentions.js';
import {
  conversationDraftKey,
  useConversationDraft,
  useComposerRecovery,
} from '../../conversation-draft.js';
import { insertAttachmentReferences, removeAttachmentReferences } from '../../attachment-refs.js';
import type { SkillCatalogEntry } from '../../../../../core/src/skills/entries.js';
import { rebaseChannelRefs } from '../../channel-refs.js';
import { ChannelHeaderMenu, type ChannelMenuTrigger } from '../../human-channel-name.js';
import type { NativeChatFailureText } from '../../channel-message-body.js';
import { StreamReplies } from '../../stream-replies.js';
import { botDmTitle, isBotDmChannel, isHumanReadOnlyDmChannel } from '../../channel-kind.js';
import type { BotHarnessTranslate } from '../../locale.js';
import type { NativeSessionCatalog } from '../../sessions-entry.js';
import {
  resolveChannelSidebarContext,
  type ChannelSidebarEntryProps,
  type ChannelSidebarRegistry,
} from '../../channel-sidebar.js';
import type { ChannelSettings } from '../../channel-settings-state.js';
import { useChannelSidebar } from '../../channel-sidebar-view.js';
import { useChannelDockActive } from '../../channel-dock.js';
import type { DockPanelHost } from '../../dock-panels.js';
import { personaBotActivity } from '../../persona-activity.js';
import { timelineWorkingRows } from '../../timeline-working-rows.js';
import { EMPTY_PROFILE_CARDS, type ProfileCardRegistry } from '../../profile-cards.js';
import { useMountedResource } from '../../mounted-resource.js';
import { reportFailure } from '../../diagnostic-log.js';
import type { InboxTarget } from './message-group-view.js';
import type { AvatarMenuRequest, MessageMenuRequest } from './message-menus.js';
import {
  createComposerMessageActions,
  createComposerSubmit,
  createComposerUploads,
} from './composer-actions.js';
import {
  composerQuoteLabels,
  createComposerRecall,
  useComposerEdits,
  useComposerFileDrop,
  useComposerResources,
  useComposerSubmissions,
} from './composer-draft.js';
import {
  conversationComposerActivity,
  conversationComposerContext,
  createComposerCompaction,
  useComposerCompaction,
  useConversationComposerContext,
} from './composer-context.js';
import { useConversationSettings } from './settings.js';
import { useConversationDictation } from '../voice/conversation-call.js';
import {
  useTimelineScrollState,
  useTimelineReadMark,
  createTimelinePagination,
  useTimelineScrolling,
} from './timeline-scroll.js';
import {
  useTimelineMessages,
  useTimelineCallbacks,
  useTimelineGroups,
  createTimelineGroupInputs,
} from './conversation-timeline.js';
import { useConversationSelection, type SelectedMessages } from './conversation-selection.js';
import { renderConversationPane } from './conversation-pane.js';
import {
  conversationComposerShortcuts,
  renderConversationShell,
  useConversationDock,
} from './conversation-shell.js';

export type MemoryView =
  | { kind: 'commit'; sha: string }
  | { kind: 'file'; path: string }
  | { kind: 'working'; change: MemoryWorkingChange };
export type ActiveMemoryView = { channelId: string } & MemoryView;
const SEARCH_PANEL_GAP_PX = 8;
function composeAllBotMention(submittedMentions: SelectedMention[]): AllBotMention | undefined {
  const shortcut = submittedMentions.find((item) => item.kind === 'all-bots');
  return shortcut?.kind === 'all-bots'
    ? { start: shortcut.start, end: shortcut.end, label: shortcut.label, preview: shortcut.preview }
    : undefined;
}
export function ConversationView({
  settingsController: channelSettings,
  clientStore: store,
  conversationScope,
  messageHost,
  unavailable,
  onRetryConversation,
  openCompactSidebar,
  scopeKey,
  state,
  actions,
  companion,
  channelSidebar,
  dockPanels,
  profileCards = EMPTY_PROFILE_CARDS,
  nativeChatT,
  nativeSessions,
  t,
}: {
  settingsController: ChannelSettings;
  clientStore: ClientStore;
  conversationScope: (node: ReactNode) => ReactNode;
  messageHost?: MessageHost | undefined;
  unavailable: boolean;
  onRetryConversation?: (() => void) | undefined;
  openCompactSidebar?: Parameters<typeof CompactNavigationHeader>[0]['openSidebar'] | undefined;
  scopeKey: string;
  state: ConversationStateView;
  actions: BridgeActions;
  companion?: WindowCompanions | undefined;
  channelSidebar: ChannelSidebarRegistry;
  dockPanels?: DockPanelHost | undefined;
  nativeSessions?: NativeSessionCatalog | undefined;
  profileCards?: ProfileCardRegistry | undefined;
  nativeChatT?: NativeChatFailureText | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const sidebar = useChannelSidebar(state);
  const docked = useChannelDockActive();
  const workspaceEnabled = useContext(WorkspaceContext) !== undefined;
  const teamMode = useTeamMode(actions.teamCall)?.enabled === true;
  const dock = useConversationDock({ scopeKey, state, actions, channelSidebar, dockPanels });
  const { dockBotEntries, dockBotDeleted, dockBotSlug, sessionDetail, sessionItems, setDetail } =
    dock;
  const sendKey = useContext(ComposerSendKeyContext);
  const streamReplies = useContext(StreamReplies);
  const { settingsScope, hasChannelSettings, settingsAttention } = useConversationSettings(
    state,
    channelSidebar,
    dockBotDeleted,
  );
  const scrollRef = useScopedRef<HTMLDivElement | null>(scopeKey, null);
  const draftScope = conversationDraftKey(state);
  const recovery = useComposerRecovery(draftScope, store.getSnapshot, actions);
  const [draft, setDraft] = useConversationDraft(draftScope, 'text', '');
  const [allBotPreview, setAllBotPreview] = useScopedState<AllBotPreview>(scopeKey);
  const [allBotNotice, setAllBotNotice] = useScopedState<string>(scopeKey);
  const [mentionTokens, setMentionTokens] = useConversationDraft(draftScope, 'mentions', []);
  const [channelRefTokens, setChannelRefTokens] = useConversationDraft(
    draftScope,
    'channelRefs',
    [],
  );
  const [skillTokens, setSkillTokens] = useConversationDraft(draftScope, 'skills', []);
  const [skillCatalog, setSkillCatalog] = useScopedState<SkillCatalogEntry[]>(scopeKey);
  const [selectedMemoryView, setSelectedMemoryView] = useScopedState<ActiveMemoryView>(scopeKey);
  const chatScrollBeforeDiff = useScopedRef(scopeKey, 0);
  const composerEdits = useComposerEdits(scopeKey, draftScope);
  const { uploadItems, setUploadItems, restoreBlocked, setRestoreFocusSignal, uploadControllers } =
    composerEdits;
  const composerDraft = {
    draftScope,
    recovery,
    draft,
    setDraft,
    mentionTokens,
    setMentionTokens,
    channelRefTokens,
    setChannelRefTokens,
    skillTokens,
    setSkillTokens,
  };
  const compaction = useComposerCompaction(scopeKey);
  const { compactNotice, setCompactNotice, compacting } = compaction;
  const composerSubmissions = useComposerSubmissions(draftScope, state, actions);
  const scrollState = useTimelineScrollState({ scopeKey, companion, store });
  const {
    followingLatest,
    lastTimelineTop,
    sendFlight,
    prependAnchor,
    readMarkTimer,
    setUnseen,
    setAtLatest,
  } = scrollState;
  const [messageMenu, setMessageMenu] = useScopedState<MessageMenuRequest | undefined>(scopeKey);
  const [reactionMenu, setReactionMenu] = useScopedState<MessageMenuRequest | undefined>(scopeKey);
  const [feedbackMessage, setFeedbackMessage] = useScopedState<string | undefined>(scopeKey);
  const [avatarMenu, setAvatarMenu] = useScopedState<AvatarMenuRequest | undefined>(scopeKey);
  const [inboxTarget, setInboxTarget] = useScopedState<InboxTarget | undefined>(scopeKey);
  const [selectedMessages, setSelectedMessages] = useScopedState<SelectedMessages>(scopeKey);
  const [profileViewOpen, setProfileViewOpen] = useScopedState(
    scopeKey,
    state.selection?.kind === 'bot' && state.selection.profile === true,
  );
  const [profileActivity, setProfileActivity] = useScopedState<ProfileActivity | undefined>(
    scopeKey,
    undefined,
  );
  const [profileUsageLoading, setProfileUsageLoading] = useScopedState(scopeKey, true);
  const [groupProfileActivity, setGroupProfileActivity] =
    useScopedState<GroupProfileActivity>(scopeKey);
  const conversation = state.conversation;
  const channel = conversation.channel;
  const dictationPort = useConversationDictation(actions, channel);
  const recallInput = createComposerRecall({
    draftState: composerDraft,
    edits: composerEdits,
    submissions: composerSubmissions,
    state,
    channel,
    t,
  });
  const botNames = new Map(state.bots.map((member) => [member.slug, member.displayName]));
  const timelineMessages = useTimelineMessages({
    conversation,
    streamReplies,
    dockPanels,
    actions,
  });
  const { messages, timelineDrafts, visibleMessages, displayMessages } = timelineMessages;
  const selection = state.selection;
  const bot =
    selection?.kind === 'bot'
      ? state.bots.find((candidate) => candidate.slug === selection.slug)
      : undefined;
  const botDm = isBotDmChannel(channel);
  const deletedBotDm =
    channel?.type === 'dm' &&
    state.bots.find((candidate) => candidate.slug === channel.botSlug)?.deleted === true;
  const readOnlyDm = isHumanReadOnlyDmChannel(channel) || deletedBotDm;
  const mutationLocked = readOnlyDm || channel?.readOnly === true;
  const composerQuotes = composerQuoteLabels(
    composerEdits.quoteTargets,
    messages,
    state,
    channel,
    t,
  );
  const profileBot =
    channel?.type === 'dm' && channel.botSlug !== undefined
      ? state.bots.find((candidate) => candidate.slug === channel.botSlug)
      : undefined;
  const profileBotActivity =
    profileBot === undefined ? undefined : personaBotActivity(state, profileBot);
  const title =
    channel?.type === 'dm'
      ? botDm
        ? botDmTitle(channel, state.bots)
        : (bot?.displayName ??
          state.bots.find((candidate) => candidate.slug === channel.botSlug)?.displayName ??
          channel.name)
      : (channel?.name ?? bot?.displayName ?? t('main.group.title'));
  const botActivity = bot === undefined ? undefined : personaBotActivity(state, bot);
  const channelBots =
    channel !== undefined && (channel.type === 'group' || botDm)
      ? channel.members.flatMap((slug): BotSummary[] => {
          const member = state.bots.find((candidate) => candidate.slug === slug);
          if (member !== undefined) return [member];
          const shared = channel.memberBots?.find((candidate) => candidate.slug === slug);
          return shared === undefined
            ? []
            : [
                {
                  slug: shared.slug,
                  displayName: shared.displayName,
                  ...(shared.avatar === undefined ? {} : { avatar: shared.avatar }),
                  roles: [],
                  aggregateState: 'idle',
                  workspaces: [],
                  createdAt: '',
                },
              ];
        })
      : [];
  const channelFacepile: PersonaBotFacepileItem[] = channelBots.map((member) => ({
    personaBotId: member.slug,
    name: member.displayName,
    src: member.avatar,
    appearance: member.appearance,
    avatarSeed: member.avatarSeed,
    state: personaBotActivity(state, member),
    activity: member.activity,
    attention: member.attention,
    sessions: member.sessionActivity,
  }));
  const dmBot = bot ?? (channel?.type === 'dm' && !botDm ? profileBot : undefined);
  const sessionStop = useHeaderSessionStop();
  const sessionStopGroups = runningSessionGroups(
    readOnlyDm || channel === undefined
      ? []
      : channel.type === 'group'
        ? channelBots.filter((member) => member.deleted !== true)
        : channel.type === 'dm' && !botDm && profileBot !== undefined
          ? [profileBot]
          : [],
  );
  const sessionStopCount = runningSessionCount(sessionStopGroups);
  const composerActivity = conversationComposerActivity({
    state,
    channel,
    dmBot,
    channelFacepile,
    t,
  });
  const streamingBotSlugs = new Set(timelineDrafts?.map((item) => item.botSlug));
  const latestMessage = messages.findLast(
    (item) =>
      item.botDmAction === undefined &&
      item.botCreateAction === undefined &&
      item.botChannelPost === undefined &&
      item.memoryCommit === undefined &&
      item.memberDeparture === undefined &&
      item.turnStop === undefined &&
      item.modelSwitch === undefined &&
      item.voiceCallRecord === undefined &&
      item.toolAutoApproval === undefined &&
      item.toolAutoApprovalPause === undefined,
  );
  const workingRows = timelineWorkingRows(
    conversation.status === 'ready' ? composerActivity : undefined,
    streamingBotSlugs,
    latestMessage?.author.kind === 'bot' ? latestMessage.author.slug : undefined,
  );
  const dmWorking = channel?.type !== 'group' && workingRows.items.length > 0;
  const channelId = channel?.id;
  const reactToMessage =
    mutationLocked || channelId === undefined || actions.reactToMessage === undefined
      ? undefined
      : (message: ChannelMessage, emoji: string, active: boolean) =>
          void actions
            .reactToMessage?.(channelId, message.id, emoji, active)
            .catch((error: unknown) => {
              reportFailure('reaction-failed', 'reaction failed', error);
            });
  const selectionState = useConversationSelection({
    selectedMessages,
    channelId,
    setMessageMenu,
    setSelectedMessages,
    scopeKey,
    state,
    t,
    channel,
    messages,
    title,
    scrollRef,
  });
  const { selectedIds } = selectionState;
  const memoryCommitIntent = state.memoryCommitIntent;
  const activeMemoryView =
    selectedMemoryView?.channelId === channelId
      ? selectedMemoryView
      : memoryCommitIntent !== undefined && memoryCommitIntent.channelId === channelId
        ? { channelId, kind: 'commit' as const, sha: memoryCommitIntent.sha }
        : undefined;
  const selectedMemoryCommitSha =
    activeMemoryView?.kind === 'commit' ? activeMemoryView.sha : undefined;
  const openMemoryView = (view: MemoryView): void => {
    if (activeMemoryView === undefined)
      chatScrollBeforeDiff.current = scrollRef.current?.scrollTop ?? 0;
    setProfileViewOpen(false);
    if (memoryCommitIntent !== undefined) store.setMemoryCommitIntent(undefined);
    if (channelId !== undefined) setSelectedMemoryView({ channelId, ...view });
  };
  const closeMemoryView = (): void => {
    if (memoryCommitIntent !== undefined) store.setMemoryCommitIntent(undefined);
    setSelectedMemoryView(undefined);
    window.requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (element === null) return;
      element.scrollTop = chatScrollBeforeDiff.current;
      lastTimelineTop.current = element.scrollTop;
    });
  };
  const { scheduleReadMark, currentChannel } = useTimelineReadMark({
    channelId,
    scrollRef,
    conversation,
    readMarkTimer,
    messages,
    actions,
  });
  const { allBotPreviewMount, skillCatalogMount, skillOptions, composerSessions } =
    useComposerResources({
      scopeKey,
      channelId,
      channel,
      channelBots,
      actions,
      state,
      botDm,
      sessionItems,
      setAllBotPreview,
      skillCatalog,
      setSkillCatalog,
    });
  const [searchTop, setSearchTop] = useScopedState<number | undefined>(scopeKey, undefined);
  const searchAvailable = useScopedRef(scopeKey, false);
  const searchReturnFocus = useScopedRef<HTMLElement | null>(scopeKey, null);
  searchAvailable.current =
    channelId !== undefined &&
    actions.searchChannel !== undefined &&
    activeMemoryView === undefined &&
    !profileViewOpen;
  const searchShortcutMount = useMountedResource<HTMLSpanElement>(
    (node) => {
      const onKeyDown = (event: KeyboardEvent): void => {
        if (
          !(event.metaKey || event.ctrlKey) ||
          event.altKey ||
          event.shiftKey ||
          event.key.toLowerCase() !== 'f' ||
          !searchAvailable.current ||
          document.querySelector('[aria-modal="true"]') !== null
        )
          return;
        const pane = node.parentElement?.querySelector<HTMLElement>('.bh-chat-pane');
        const bar = pane?.querySelector<HTMLElement>('.bh-topbar');
        if (pane == null) return;
        event.preventDefault();
        const field = pane.querySelector<HTMLInputElement>('[data-conversation-search] input');
        if (field === null && document.activeElement instanceof HTMLElement)
          searchReturnFocus.current = document.activeElement;
        const offset =
          bar == null ? 0 : bar.getBoundingClientRect().bottom - pane.getBoundingClientRect().top;
        setSearchTop(Math.max(0, offset) + SEARCH_PANEL_GAP_PX);
        field?.select();
      };
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    },
    [scopeKey],
  );
  const conversationMount = useMountedResource<HTMLDivElement>(() => {
    currentChannel.current = channelId;
    setAllBotNotice(undefined);
    return () => {
      currentChannel.current = undefined;
      window.clearTimeout(readMarkTimer.current);
      for (const controller of uploadControllers.current.values()) controller.abort();
      uploadControllers.current.clear();
      setUploadItems((items) =>
        items.map((item) =>
          item.status === 'uploading' ? { ...item, status: 'error', error: undefined } : item,
        ),
      );
    };
  }, [channelId, scopeKey]);

  const profileMount = useMountedResource<HTMLDivElement>(() => {
    if (channel?.type !== 'dm' && !profileViewOpen) return;
    let cancelled = false;
    let fetching = false;
    const refreshUsage = (): void => {
      if (fetching || channelId === undefined || channel?.type !== 'dm') return;
      fetching = true;
      setProfileUsageLoading(true);
      void actions
        .profileActivity(channelId)
        .then(
          (activity) => {
            if (!cancelled)
              setProfileActivity(activity?.slug === channel.botSlug ? activity : undefined);
          },
          () => {
            if (!cancelled) setProfileActivity(undefined);
          },
        )
        .finally(() => {
          fetching = false;
          if (!cancelled) setProfileUsageLoading(false);
        });
    };
    if (channelId !== undefined) {
      if (channel?.type === 'group')
        void actions.groupProfileActivity(channelId).then(
          (activity) => {
            if (!cancelled) setGroupProfileActivity(activity);
          },
          (error: unknown) => {
            reportFailure('group-profile-activity-failed', 'Group Profile activity failed', error);
          },
        );
      else refreshUsage();
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!profileViewOpen) return;
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]') !== null) return;
      event.preventDefault();
      setProfileViewOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelled = true;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [
    scopeKey,
    actions,
    channel?.type,
    channelId,
    profileViewOpen,
    messages.findLast((message) => !message.pending && !message.failed && !message.streaming)?.id,
  ]);

  const { replyPerfMount, dmComposerContext, baseComposerContext } = useConversationComposerContext(
    {
      actions,
      channelId,
      state,
      scopeKey,
      channel,
      readOnlyDm,
      profileBot,
      companion,
      profileActivity,
      profileUsageLoading,
      t,
      channelBots,
      onUsage: () => {
        setProfileViewOpen(true);
      },
    },
  );
  const openProfileView = (): void => {
    setSelectedMemoryView(undefined);
    setProfileViewOpen(true);
  };
  const { compactProfileBot, newProfileSession } = createComposerCompaction(
    compaction,
    profileBot,
    actions,
    t,
  );
  const conversationShortcuts = conversationComposerShortcuts({
    dmComposerContext,
    t,
    sidebar,
    compacting,
    compactProfileBot,
    newProfileSession,
    channel,
    openProfileView,
    hasChannelSettings,
    channelSettings,
    settingsAttention,
  });
  const contextInHeader = docked && workspaceEnabled && channel !== undefined;
  const composerContext = conversationComposerContext(
    baseComposerContext,
    contextInHeader,
    conversationShortcuts,
    t,
  );

  const { loadOlderAtTop, loadNewerAtBottom } = createTimelinePagination({
    scrollRef,
    channelId,
    conversation,
    prependAnchor,
    messages,
    actions,
  });

  const { restoreFailedMessage, quoteMessage, mentionBot } = createComposerMessageActions({
    draftState: composerDraft,
    edits: composerEdits,
    channelId,
    channel,
    channelBots,
    conversation,
    messages,
    state,
    actions,
    t,
  });

  const timelineCallbacks = useTimelineCallbacks({
    setAvatarMenu,
    setMessageMenu,
    quoteMessage,
    reactToMessage,
    channelId,
    actions,
    restoreFailedMessage,
    setInboxTarget,
    openMemoryView,
  });
  const timelineGroups = useTimelineGroups({
    conversation,
    visibleMessages,
    displayMessages,
    streamReplies,
    channelId,
    t,
  });
  const { unreadAfter, timelineWindow } = timelineGroups;
  const scrolling = useTimelineScrolling({
    conversation,
    scrollRef,
    timelineWindow,
    messages,
    unreadAfter,
    channelId,
    store,
    loadOlderAtTop,
    loadNewerAtBottom,
    scheduleReadMark,
    scopeKey,
    actions,
    scrollState,
  });

  const { startUpload, addFiles } = createComposerUploads({
    draftState: composerDraft,
    edits: composerEdits,
    unavailable,
    mutationLocked,
    messageHost,
  });

  const toggleGeneratedFile = (ref: ChannelAttachmentRef): void => {
    if (mutationLocked || conversation.sending || recovery.blocked) return;
    const existing = uploadItems.find(
      (item) => item.ref !== undefined && attachmentIdentity(item.ref) === attachmentIdentity(ref),
    );
    if (existing === undefined && uploadItems.length >= 10) return;
    const item: ChannelComposerUpload = existing ?? {
      id: attachmentIdentity(ref),
      file: new File([], ref.name, { type: ref.mime }),
      fileAvailable: false,
      ref,
      status: 'ready',
    };
    const inserted = existing === undefined ? insertAttachmentReferences(draft, [item]) : undefined;
    const selected =
      inserted === undefined
        ? removeAttachmentReferences(draft, item, mentionTokens, channelRefTokens)
        : {
            value: inserted.value,
            mentions: rebaseMentions(draft, inserted.value, mentionTokens),
            channelRefs: rebaseChannelRefs(draft, inserted.value, channelRefTokens),
          };
    recovery.update({
      text: selected.value,
      mentions: selected.mentions,
      channelRefs: selected.channelRefs,
      uploads:
        existing === undefined
          ? [...uploadItems, item]
          : uploadItems.filter((entry) => entry.id !== existing.id),
    });
    setRestoreFocusSignal((value) => value + 1);
  };

  const { dictating, fileDrop } = useComposerFileDrop({
    mutationLocked,
    unavailable,
    conversation,
    recovery,
    activeMemoryView,
    selectedIds,
    addFiles,
    setRestoreFocusSignal,
    scopeKey,
  });
  const submit = createComposerSubmit({
    draftState: composerDraft,
    edits: composerEdits,
    unavailable,
    conversation,
    composeAllBotMention,
    store,
    scrollRef,
    followingLatest,
    sendFlight,
    setAtLatest,
    setUnseen,
    currentChannel,
    actions,
    setAllBotNotice,
    setAllBotPreview,
    t,
  });

  const channelMenuLabel = (menu: ChannelMenuTrigger): string =>
    `${title} · ${t('humanNickname.menu')}` +
    (menu.attention ? ` · ${t('channelSettings.needsAttention')}` : '');
  const channelHeaderMenu = (
    primaryAction: { label: string; icon: ReactNode; run(): void },
    anchor: (menu: ChannelMenuTrigger | undefined) => ReactNode,
  ): ReactNode =>
    openCompactSidebar !== undefined || channel === undefined ? (
      anchor(undefined)
    ) : (
      <ChannelHeaderMenu
        key={channel.id}
        channel={channel}
        actions={actions}
        t={t}
        anchor={anchor}
        primaryAction={primaryAction}
        deleteBotSlug={
          profileBot === undefined || profileBot.deleted === true ? undefined : profileBot.slug
        }
        onOpenSettings={
          hasChannelSettings ? () => channelSettings.open(settingsAttention[0]?.id) : undefined
        }
        settingsAttention={settingsAttention.length > 0}
      />
    );

  const dockContext = resolveChannelSidebarContext(state);
  const dockEntryProps: ChannelSidebarEntryProps | undefined =
    dockContext?.channel === undefined
      ? undefined
      : {
          scope: dockContext.scope,
          channelId: dockContext.channel.id,
          conversationRevision: state.conversation.revision,
          botSlug: dockContext.botSlug,
          actions,
          onMentionBot: mentionBot,
          t,
          selectedMemoryCommitSha,
          selectedMemoryFilePath:
            activeMemoryView?.kind === 'file' ? activeMemoryView.path : undefined,
          selectedMemoryWorking:
            activeMemoryView?.kind === 'working' ? activeMemoryView.change : undefined,
          onMemoryCommitSelect: (sha) => openMemoryView({ kind: 'commit', sha }),
          onMemoryFileSelect: (path) => openMemoryView({ kind: 'file', path }),
          onMemoryWorkingSelect: (change) => openMemoryView({ kind: 'working', change }),
          onSessionSelect: (sessionId, title) => setDetail({ sessionId, title }),
          selectedSessionId: sessionDetail?.sessionId,
        };
  const inboxEntry = dockBotEntries.find((entry) => entry.id === 'bot-inbox');
  const inboxAvailable =
    dockBotSlug !== undefined && dockEntryProps !== undefined && inboxEntry !== undefined;
  const timelineGroupInputs = createTimelineGroupInputs({
    channel,
    state,
    actions,
    setInboxTarget,
    openMemoryView,
    store,
    t,
    timelineCallbacks,
    channelId,
    nativeChatT,
    conversation,
    botDm,
    mutationLocked,
    reactToMessage,
    timelineGroups,
    timelineMessages,
  });
  const conversationPane = renderConversationPane({
    header: {
      dock,
      profileMount,
      workspaceEnabled,
      profileViewOpen,
      activeMemoryView,
      openCompactSidebar,
      title,
      sidebar,
      channelId,
      inboxAvailable,
      channel,
      channelHeaderMenu,
      openProfileView,
      channelFacepile,
      profileBot,
      channelMenuLabel,
      bot,
      botActivity,
      dmWorking,
      profileBotActivity,
      workingRows,
      messageHost,
      actions,
      t,
    },
    fileDrop,
    workingRows,
    t,
    profileViewOpen,
    activeMemoryView,
    title,
    channelId,
    channel,
    channelFacepile,
    profileBot,
    bot,
    actions,
    groupProfileActivity,
    profileCards,
    botNames,
    setProfileViewOpen,
    profileActivity,
    dockPanels,
    closeMemoryView,
    searchTop,
    setSearchTop,
    searchReturnFocus,
    conversation,
    loadOlderAtTop,
    onRetryConversation,
    timelineGroupInputs,
    restoreBlocked,
    readOnlyDm,
    deletedBotDm,
    composerDraft,
    composerEdits,
    composerSubmissions,
    compactNotice,
    setCompactNotice,
    store,
    composerContext,
    sendKey,
    skillOptions,
    composerSessions,
    state,
    allBotPreview,
    allBotNotice,
    channelBots,
    dictationPort,
    dictating,
    unavailable,
    addFiles,
    startUpload,
    composerQuotes,
    recallInput,
    submit,
    mutationLocked,
    messageMenu,
    quoteMessage,
    reactToMessage,
    setReactionMenu,
    setFeedbackMessage,
    setMessageMenu,
    reactionMenu,
    avatarMenu,
    mentionBot,
    setAvatarMenu,
    inboxTarget,
    setInboxTarget,
    feedbackMessage,
    scrollState,
    selectionState,
    scrolling,
    timelineGroups,
    timelineMessages,
  });
  return renderConversationShell({
    dock,
    state,
    t,
    actions,
    dockPanels,
    conversationPane,
    composerSessions,
    channel,
    conversationMount,
    allBotPreviewMount,
    skillCatalogMount,
    searchShortcutMount,
    replyPerfMount,
    conversationScope,
    docked,
    sidebar,
    uploadItems,
    mutationLocked,
    conversation,
    recovery,
    toggleGeneratedFile,
    workspaceEnabled,
    title,
    dmWorking,
    workingRows,
    baseComposerContext,
    sessionStopGroups,
    sessionStop,
    profileBot,
    openProfileView,
    botDm,
    dmBot,
    sessionStopCount,
    messageHost,
    hasChannelSettings,
    channelSettings,
    settingsAttention,
    channelId,
    dockEntryProps,
    teamMode,
    settingsScope,
    inboxEntry,
    channelSidebar,
    mentionBot,
    selectedMemoryCommitSha,
    activeMemoryView,
    openMemoryView,
  });
}
