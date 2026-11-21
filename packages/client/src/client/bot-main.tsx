import { Icon } from './ds/icon.js';
import {
  DEFAULT_SESSION_COLLAPSE,
  DEFAULT_SESSION_DETAIL_LEVEL,
  DEFAULT_SESSION_FOLDED_REPLIES,
} from '@botharness/host-client/shared/bot-mode-settings';
import { collapseRepeatedFailures } from '@botharness/host-client/session-failure';
import { MessageSelectionToolbar } from './message-selection-toolbar.js';
import { selectedMessageText } from './selection-quote.js';
import { SessionDetailPrefsContext } from './session-detail.js';
import { useTeamMember, useTeamMode } from './team-state.js';
import { ReadFailure } from './ds/read-failure.js';
import { SelfHumanContext } from './self-human.js';
import { CONVERSATION_STATE_KEYS, type ConversationStateView } from './store.js';
import { AppearanceContext } from './appearance-context.js';
import type { Appearance } from './appearance.js';
import { useScopedRef, useScopedState } from './scoped-state.js';
import { flySentBubble, sendFlightExpired, sentMessageId, type SendFlight } from './send-fly.js';
import { PanelEmptyState } from './ds/empty-state.js';
import { Workspace, type WorkspaceOptions } from './workspace.js';
import { WorkspaceContext } from './workspace-context.js';
import { OnboardingMemoryNavigation } from './onboarding-memory.js';
import { useTimelineWindow } from './timeline-window.js';
import {
  ChannelMark,
  ChannelMenuCaret,
  ConversationTitle,
  GroupChannelHeader,
} from './group-channel-header.js';
import { GroupChannelIcon } from './group-avatar-stack.js';
import { MobileConversationHeader, CompactNavigationHeader } from './mobile-conversation-header.js';
import type { WindowCompanions } from './window-companions.js';
import { COMPANION_READ_INSET } from './companion-surface.js';
import type { AllBotPreview, AllBotMention } from '../../../core/src/channels/all-bot-mention.js';
import { ComposerSendKeyContext } from './composer-send-key.js';
import { ConversationFileDropOverlay } from './conversation-file-drop.js';
import type { ComposerShortcut } from './composer-shortcuts.js';
import {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentProps,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Tooltip } from './ds/tooltip.js';
import type { BridgeActions } from './actions.js';
import type { MemoryWorkingChange, ProfileActivity, GroupProfileActivity } from './bridge.js';
import { PersonaBotAvatar, PersonaBotFacepile, type PersonaBotFacepileItem } from './avatar.js';
import {
  ClientStoreContext,
  useClientStore,
  useConversationStore,
  useStoreSlice,
} from './use-client-store.js';
import { MessageHostContext, type MessageHost } from './message-host.js';
import { SessionOpenContext } from './session-links.js';
import { useRemoteHosts } from './host-tabs.js';
import { conversationKey } from './remote-hosts.js';
import { useRemoteNativeConversation } from './remote-native-conversation.js';
import { remoteChannelSidebar } from './remote-channel-sidebar.js';
import { sameConversationBots } from './conversation-bots.js';
import type { BotModePrefs } from './bot-mode-prefs.js';
import type { ChannelComposerUpload } from './channel-composer.js';
import { ConversationSessionStop, useHeaderSessionStop } from './header-session-stop.js';
import { runningSessionCount, runningSessionGroups } from './session-stop-model.js';
import { GeneratedFilesContext } from './generated-files-panel.js';
import { attachmentIdentity } from '../../../core/src/attachments/ref.js';
import type { SelectedMention } from './mentions.js';
import {
  conversationDraftKey,
  useConversationDraft,
  useComposerRecovery,
} from './conversation-draft.js';
import { insertAttachmentReferences, removeAttachmentReferences } from './attachment-refs.js';
import { rebaseMentions } from './mentions.js';
import type { SkillCatalogEntry } from '../../../core/src/skills/entries.js';
import { rebaseChannelRefs } from './channel-refs.js';
import { ChannelHeaderMenu, type ChannelMenuTrigger } from './human-channel-name.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import type { ChannelHumanMember } from './store.js';
import { MessageDeveloperMode, type NativeChatFailureText } from './channel-message-body.js';
import { DeliveryReceiptsVisible, readingBots } from './channel-delivery-receipt.js';
import { BotInboxDialog } from './bot-inbox-dialog.js';
import { StreamReplies } from './stream-replies.js';
import { useMessageArrivals } from './message-arrivals.js';
import { networkContactAvailabilityLabel } from './message-author-card.js';
import {
  botDmTitle,
  hasChannelBots,
  isBotDmChannel,
  isHumanDmChannel,
  isHumanReadOnlyDmChannel,
} from './channel-kind.js';
import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import type { NativeSessionCatalog } from './sessions-entry.js';
import {
  resolveChannelSidebarContext,
  type ChannelSidebarEntryProps,
  type ChannelSidebarRegistry,
} from './channel-sidebar.js';
import { ChannelAttentionDot } from './channel-options.js';
import {
  channelSettings,
  ChannelSettings,
  ChannelSettingsContext,
  isChannelSettingsSection,
} from './channel-settings-state.js';
import { ChannelSidebar, useChannelSidebar } from './channel-sidebar-view.js';
import { ChannelDock, useChannelDockActive } from './channel-dock.js';
import { dockPanelsFromEntries, type DockPanelChannel, type DockPanelHost } from './dock-panels.js';
import { TAKEOVER_PANELS, TakeoverTimeline, takeoverResolutions } from './takeover-card.js';
import type { TakeoverTarget } from '../../../core/src/takeover/contracts.js';
import { MemoryCommitView } from './memory-commit-view.js';
import { MemoryFileView, MemoryWorkingView } from './memory-current-view.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { groupChannelMessages } from './message-groups.js';
import { ProfileView } from './personabot-profile.js';
import { ShareFlowHost } from './share-flow.js';
import { GroupProfileView } from './group-profile.js';
import { personaBotActivity } from './persona-activity.js';
import { BotDmActionLabel } from './bot-dm-action-line.js';
import {
  hiddenDmActionsSnapshot,
  dmMemoryDisplaySnapshot,
  subscribeHiddenDmActions,
  visibleDmMessages,
} from './dm-actions.js';
import {
  timelineWorkingRows,
  HeaderWorkingStatus,
  WorkingAnnouncement,
  WorkingSummary,
} from './timeline-working-rows.js';
import { EMPTY_PROFILE_CARDS, type ProfileCardRegistry } from './profile-cards.js';
import {
  createStore,
  type BotSummary,
  type ChannelAttachmentRef,
  type ChannelMessage,
  type ChannelSummary,
  type ClientState,
  type ClientStore,
} from './store.js';
import { MessageFeedbackDialog } from './message-feedback.js';
import {
  MessageSelectionBar,
  MessageImagePreview,
  MessageSelectionContext,
} from './message-selection.js';
import { buildMessageSnapshot, renderMessageSnapshot } from './message-snapshot.js';
import {
  conversationText,
  selectionRange,
  toggleSelection,
  type MessageSelection,
} from './message-selection-state.js';
import { useMountedResource } from './mounted-resource.js';
import * as stylex from '@stylexjs/stylex';
import { IconButton } from './ds/icon-button.js';
import { color, radius, text } from './ds/tokens.stylex.js';
import {
  followsLatest,
  rememberTimelineScroll,
  rememberedTimelineScroll,
  restoreTimelineScroll,
  timelineScrollAnchor,
} from './timeline-position.js';
import { AutoCollapseMessages } from './message-fold.js';
import { MessageReactionSurface } from './message-reactions.js';
import { ConversationSearch } from './conversation-search.js';
import { reactableMessage } from './message-reactions-model.js';
import {
  galleryImageKey,
  useMessageImageGallery,
  type GalleryImage,
} from './message-image-gallery.js';
import { inlineImageAttachment } from './message-attachment.js';
import { MessageAvatarsContext } from './message-avatars.js';
import { channelAttachmentUrl } from './bridge.js';
import { observeHumanAttention } from './messaging-defaults-live.js';
import { reportFailure } from './diagnostic-log.js';
import {
  authorLabel,
  fullTime,
  memberName,
  quotableMessage,
} from './features/channels/message-labels.js';
import { MessageGroupView, type InboxTarget } from './features/channels/message-group-view.js';
import {
  BotAvatarMenu,
  MessageActionMenu,
  type AvatarMenuRequest,
  type MessageMenuRequest,
} from './features/channels/message-menus.js';
import { TimelineSlots } from './features/channels/timeline-slots.js';
import {
  renderTimelineGroup,
  type TimelineGroupInputs,
} from './features/channels/timeline-group.js';
import {
  createComposerMessageActions,
  createComposerSubmit,
  createComposerUploads,
} from './features/channels/composer-actions.js';
import {
  composerQuoteLabels,
  createComposerRecall,
  useComposerEdits,
  useComposerFileDrop,
  useComposerResources,
  useComposerSubmissions,
} from './features/channels/composer-draft.js';
import {
  conversationComposerActivity,
  conversationComposerContext,
  createComposerCompaction,
  useComposerCompaction,
  useConversationComposerContext,
} from './features/channels/composer-context.js';
import { renderConversationComposer } from './features/channels/conversation-composer.js';
import {
  renderConversationSettings,
  useConversationSettings,
} from './features/channels/settings.js';
import {
  renderConversationCall,
  renderHeaderConversationCall,
  useConversationDictation,
} from './features/voice/conversation-call.js';
import { renderActivityCenter } from './features/activity/panels/activity-center/entry.js';
import { renderBotInboxPanelDialog } from './features/activity/panels/bot-inbox/entry.js';
import {
  renderChannelFilesDialog,
  renderChannelFilesContent,
} from './features/channel-files/panels/generated-files/entry.js';
import { renderSessionPanelDetail } from './features/sessions/panels/sessions/entry.js';

export { BotPanel } from './panels/bot/panel.js';
export { BotAvatarMenu, type AvatarMenuRequest } from './features/channels/message-menus.js';
export { MessageBubbleWrap } from './features/channels/message-bubble-wrap.js';

export function committedMessageIds(messages: readonly ChannelMessage[]): Set<string> {
  return new Set(
    messages
      .filter(
        (message) =>
          message.pending !== true && message.streaming !== true && message.failed === undefined,
      )
      .map((message) => message.id),
  );
}

export function resolvedGrantRequestIds(messages: readonly ChannelMessage[]): Set<string> {
  const committed = committedMessageIds(messages);
  return new Set(
    messages
      .filter(
        (item) =>
          committed.has(item.id) &&
          item.author.kind === 'human' &&
          item.replyTo !== undefined &&
          item.grantRequestResolution?.requestMessageId === item.replyTo,
      )
      .map((item) => item.replyTo!)
      .concat(
        messages
          .filter((item) => committed.has(item.id) && item.grantRequestResolved === true)
          .map((item) => item.id),
      ),
  );
}

const messageStyles = stylex.create({
  channelIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: text.titleLine,
    height: text.titleLine,
    overflow: 'hidden',
    borderRadius: radius.xs,
  },
  emptyContainer: { display: 'flex', flexDirection: 'column', flexGrow: 1 },
});

function Welcome({
  state,
  t,
}: {
  state: ConversationStateView;
  t: BotHarnessTranslate;
}): ReactElement {
  const member = useTeamMember();
  return (
    <div className="bh-root bh-main">
      <div className="bh-content" {...stylex.props(messageStyles.emptyContainer)}>
        <PanelEmptyState icon="messages-circle">
          {t(
            member
              ? 'team.firstRun.main'
              : state.bots.length === 0
                ? 'main.welcome.empty'
                : 'main.welcome.hint',
          )}
        </PanelEmptyState>
      </div>
    </div>
  );
}

const SEARCH_PANEL_GAP_PX = 8;

function renderAvatarButton({
  botSlug,
  displayBot,
  avatar,
  onAvatarMenu,
  actions,
  t,
}: Parameters<ComponentProps<typeof MessageGroupView>['renderAvatarButton']>[0]): ReactElement {
  return (
    <button
      type="button"
      className="bh-message-group-avatar-link"
      aria-label={t('message.mention.openDm', {
        bot: displayBot?.displayName ?? '',
      })}
      {...(onAvatarMenu === undefined ? {} : { 'aria-haspopup': 'menu' as const })}
      onClick={() => void actions.openBot(botSlug)}
      onContextMenu={
        onAvatarMenu === undefined
          ? undefined
          : (event) => {
              event.preventDefault();
              const box = event.currentTarget.getBoundingClientRect();
              const keyboard = event.clientX === 0 && event.clientY === 0;
              onAvatarMenu(
                botSlug,
                keyboard ? box.left : event.clientX,
                keyboard ? box.bottom : event.clientY,
              );
            }
      }
    >
      {avatar}
    </button>
  );
}

function renderFailedButton({
  message,
  onRestoreFailed,
  t,
}: Parameters<ComponentProps<typeof MessageGroupView>['renderFailedButton']>[0]): ReactElement {
  return (
    <button
      type="button"
      className="bh-bubble-failed-action"
      aria-label={t(
        message.unconfirmed === true ? 'message.unconfirmedRestore' : 'message.failedRestore',
      )}
      title={message.failed}
      onClick={() => onRestoreFailed(message)}
    >
      <Icon name="triangle-alert" size={16} />
    </button>
  );
}

const NO_HUMAN_MEMBERS: readonly ChannelHumanMember[] = [];

function EmptyConversation({
  channel,
  bot,
  t,
}: {
  channel: ChannelSummary | undefined;
  bot: BotSummary | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const member = useTeamMember();
  return (
    <div className="bh-chat-empty" {...stylex.props(messageStyles.emptyContainer)}>
      <PanelEmptyState icon="messages-circle">
        {isHumanDmChannel(channel)
          ? t('main.humanChat.hint')
          : channel?.type === 'group'
            ? `${channel.name} · ${t(member ? 'main.group.memberNote' : 'main.group.note')}`
            : `${bot === undefined ? t('main.localChat') : t('main.localChat.with', { name: bot.displayName })} · ${t('main.localChat.hint')}`}
      </PanelEmptyState>
    </div>
  );
}
function composeAllBotMention(submittedMentions: SelectedMention[]): AllBotMention | undefined {
  const shortcut = submittedMentions.find((item) => item.kind === 'all-bots');
  return shortcut?.kind === 'all-bots'
    ? { start: shortcut.start, end: shortcut.end, label: shortcut.label, preview: shortcut.preview }
    : undefined;
}
function ConversationView({
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
  const [detail, setDetail] = useScopedState<
    'files' | 'inbox' | { botSlug?: string; sessionId: string; title: string } | undefined
  >(
    scopeKey,
    state.selection?.kind === 'bot' && state.selection.inboxRequest ? 'inbox' : undefined,
  );
  const filesOpen = detail === 'files';
  const inboxOpen = detail === 'inbox';
  const sessionItems = useClientStore((state) => state.sessions.items);
  const setFilesOpen = (open: boolean) => setDetail(open ? 'files' : undefined);
  const setInboxOpen = (open: boolean) => setDetail(open ? 'inbox' : undefined);
  const sessionDetail = typeof detail === 'object' ? detail : undefined;
  const dockBotEntries = useSyncExternalStore(
    channelSidebar.subscribe,
    () => channelSidebar.entries('personabot'),
    () => channelSidebar.entries('personabot'),
  );
  const dockGroupEntries = useSyncExternalStore(
    channelSidebar.subscribe,
    () => channelSidebar.entries('channel'),
    () => channelSidebar.entries('channel'),
  );
  const registeredDockPanels = useSyncExternalStore(
    dockPanels?.subscribe ?? subscribeWithoutPrefs,
    () => dockPanels?.panels(),
    () => dockPanels?.panels(),
  );
  const dockEntryPanels = useMemo(
    () =>
      dockPanelsFromEntries(
        [
          ...new Map(
            [...dockBotEntries, ...dockGroupEntries].map((entry) => [entry.id, entry]),
          ).values(),
        ].filter((entry) => !isChannelSettingsSection(entry)),
      ),
    [dockBotEntries, dockGroupEntries],
  );
  const dockPanelList = useMemo(() => {
    if (registeredDockPanels === undefined) return dockEntryPanels;
    const entries = new Map(dockEntryPanels.map((panel) => [panel.id, panel.entry]));
    return registeredDockPanels.map((panel) => {
      const entry = entries.get(panel.id);
      return panel.entry === undefined || entry === undefined || panel.entry === entry
        ? panel
        : { ...panel, entry };
    });
  }, [registeredDockPanels, dockEntryPanels]);
  const dockChannelContext = resolveChannelSidebarContext(state);
  const dockChannelSummary = dockChannelContext?.channel;
  const dockBotDeleted = state.bots.some(
    (candidate) => candidate.slug === dockChannelContext?.botSlug && candidate.deleted === true,
  );
  const dockChannelBotSlug = dockBotDeleted ? undefined : dockChannelSummary?.botSlug;
  const dockChannel = useMemo<DockPanelChannel | undefined>(
    () =>
      dockChannelSummary === undefined
        ? undefined
        : {
            id: dockChannelSummary.id,
            type: dockChannelSummary.type,
            botSlug: dockChannelBotSlug,
          },
    [dockChannelSummary?.id, dockChannelSummary?.type, dockChannelBotSlug],
  );
  const dockBotSlug = dockBotDeleted ? undefined : dockChannelContext?.botSlug;
  const sessionOwner = sessionDetail?.botSlug ?? dockBotSlug;
  const dockInboxMount = useMountedResource<HTMLSpanElement>(() => {
    if (!inboxOpen || dockBotSlug === undefined) return;
    void actions.refreshBotInbox(dockBotSlug);
    return observeHumanAttention(() => void actions.refreshBotInbox(dockBotSlug));
  }, [inboxOpen, dockBotSlug, actions]);
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
  const [selectedMemoryView, setSelectedMemoryView] = useScopedState<
    { channelId: string } & (
      | { kind: 'commit'; sha: string }
      | { kind: 'file'; path: string }
      | { kind: 'working'; change: MemoryWorkingChange }
    )
  >(scopeKey);
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
  const followingLatest = useScopedRef(scopeKey, true);
  const lastTimelineTop = useScopedRef(scopeKey, 0);
  const sendFlight = useScopedRef<SendFlight | undefined>(scopeKey, undefined);
  const pinTimelineToLatest = (element: HTMLElement): void => {
    element.scrollTop = element.scrollHeight;
    lastTimelineTop.current = element.scrollTop;
  };
  const companionReadMount = useMountedResource<HTMLElement>(
    (pane) => {
      let visible: boolean | undefined;
      const sync = () => {
        const next = (companion?.getSnapshot().companions.length ?? 0) > 0;
        if (visible === next) return;
        visible = next;
        if (next) pane.style.setProperty('--bh-companion-read-inset', COMPANION_READ_INSET + 'px');
        else pane.style.removeProperty('--bh-companion-read-inset');
        const timeline = pane.querySelector<HTMLElement>('.bh-chat-body');
        if (
          timeline &&
          followingLatest.current &&
          !store.getSnapshot().conversation.timeline.hasNewer
        ) {
          pinTimelineToLatest(timeline);
        }
      };
      sync();
      return companion?.subscribe(sync);
    },
    [companion, scopeKey],
  );
  const prependAnchor = useScopedRef<{
    firstId: string | undefined;
    y: number | undefined;
    top: number;
    height: number;
  } | null>(scopeKey, null);
  const lastRevision = useScopedRef<number | undefined>(scopeKey, undefined);
  const positioned = useScopedRef(scopeKey, false);
  const restoredScroll = useScopedRef(scopeKey, false);
  const placedUnreadDivider = useScopedRef<string | undefined>(scopeKey, undefined);
  const readMarkTimer = useScopedRef<number | undefined>(scopeKey, undefined);
  const [unseen, setUnseen] = useScopedState(scopeKey, 0);
  const [atLatest, setAtLatest] = useScopedState(scopeKey, true);
  const [messageMenu, setMessageMenu] = useScopedState<MessageMenuRequest | undefined>(scopeKey);
  const [reactionMenu, setReactionMenu] = useScopedState<MessageMenuRequest | undefined>(scopeKey);
  const [feedbackMessage, setFeedbackMessage] = useScopedState<string | undefined>(scopeKey);
  const [avatarMenu, setAvatarMenu] = useScopedState<AvatarMenuRequest | undefined>(scopeKey);
  const [inboxTarget, setInboxTarget] = useScopedState<InboxTarget | undefined>(scopeKey);
  const [selectedMessages, setSelectedMessages] = useScopedState<
    { channelId: string; ids: readonly string[] } | undefined
  >(scopeKey);
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
  const dmBotSlug = channel?.type === 'dm' ? channel.botSlug : undefined;
  const hiddenActions = useSyncExternalStore(
    subscribeHiddenDmActions,
    () => hiddenDmActionsSnapshot(dmBotSlug),
    () => hiddenDmActionsSnapshot(dmBotSlug),
  );
  const memoryDisplay = useSyncExternalStore(
    subscribeHiddenDmActions,
    () => dmMemoryDisplaySnapshot(dmBotSlug),
    () => dmMemoryDisplaySnapshot(dmBotSlug),
  );
  const messages = conversation.messages;
  const timelineDrafts =
    conversation.timeline.hasNewer || !streamReplies ? undefined : conversation.drafts;
  const visibleMessages = useMemo(
    () =>
      collapseRepeatedFailures(
        visibleDmMessages(messages, hiddenActions).filter(
          (message) => message.takeoverResolution === undefined,
        ),
        (message) => ({
          bot: message.author.kind === 'bot' ? message.author.slug : undefined,
          failure: message.sessionFailure,
        }),
        (message, repeated) => ({
          ...message,
          sessionFailure: { ...message.sessionFailure!, repeated },
        }),
        (message) =>
          message.id === conversation.focusMessageId ||
          message.id === conversation.unreadAfterMessageId,
      ),
    [messages, hiddenActions, conversation.focusMessageId, conversation.unreadAfterMessageId],
  );
  const takeoverTimeline = useMemo(
    () => ({
      resolutions: takeoverResolutions(messages),
      open: (target: TakeoverTarget, botSlug: string): boolean => {
        const panel = TAKEOVER_PANELS[target];
        if (dockPanels === undefined || !dockPanels.panels().some((entry) => entry.id === panel))
          return false;
        if (channel?.type !== 'dm' || channel.botSlug !== botSlug) {
          void actions.openBot(botSlug).then(() => dockPanels.open(panel));
          return true;
        }
        if (dockPanels.canOpen?.(panel) === false) return false;
        dockPanels.open(panel);
        return true;
      },
    }),
    [messages, dockPanels, channel, actions],
  );
  const displayMessages = useMemo<readonly ChannelMessage[]>(() => {
    if (timelineDrafts === undefined || timelineDrafts.length === 0) return visibleMessages;
    return [
      ...visibleMessages,
      ...timelineDrafts.map((item) => ({
        id: item.draftId,
        at: '',
        author: { kind: 'bot' as const, slug: item.botSlug },
        body: item.body,
        streaming: true,
      })),
    ];
  }, [visibleMessages, timelineDrafts]);
  const timelineDecisions = useMemo(
    () => ({
      resolvedGrantRequests: resolvedGrantRequestIds(visibleMessages),
      toolApprovalDecisions: new Map(
        visibleMessages
          .filter((item) => item.toolApprovalDecision !== undefined)
          .map((item) => [
            item.toolApprovalDecision!.requestMessageId,
            item.toolApprovalDecision!.outcome,
          ]),
      ),
      userQuestionResolutions: new Map(
        visibleMessages
          .filter((item) => item.userQuestionResolution !== undefined)
          .map((item) => [
            item.userQuestionResolution!.requestMessageId,
            item.userQuestionResolution!.state,
          ]),
      ),
    }),
    [visibleMessages],
  );
  const reading = useMemo(() => readingBots(messages), [messages]);
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
  const selectedIds =
    selectedMessages !== undefined && selectedMessages.channelId === channelId
      ? selectedMessages.ids
      : undefined;
  const messageSelection = useMemo<MessageSelection | undefined>(
    () =>
      channelId === undefined
        ? undefined
        : {
            selected: new Set(selectedIds ?? []),
            active: selectedIds !== undefined,
            begin: (message) => {
              setMessageMenu(undefined);
              setSelectedMessages({
                channelId,
                ids: toggleSelection([], message),
              });
            },
            toggle: (message) =>
              setSelectedMessages((current) =>
                current === undefined || current.channelId !== channelId
                  ? current
                  : { channelId, ids: toggleSelection(current.ids, message) },
              ),
          },
    [channelId, selectedIds],
  );
  const cancelSelection = useCallback(() => setSelectedMessages(undefined), [scopeKey]);
  const [selectionBusy, setSelectionBusy] = useScopedState(scopeKey, false);
  const [selectionImage, setSelectionImage] = useScopedState<Blob | undefined>(scopeKey);
  const snapshotScope = useRef(scopeKey);
  snapshotScope.current = scopeKey;
  const [selectionNotice, setSelectionNotice] = useScopedState<string>(scopeKey);
  const flashSelectionNotice = (notice: string): void => {
    setSelectionNotice(notice);
    window.setTimeout(
      () => setSelectionNotice((current) => (current === notice ? undefined : current)),
      2500,
    );
  };
  const selectionAuthor = (message: ChannelMessage): string =>
    authorLabel(message, state.bots, t, channel);
  const copySelection = async (ids: readonly string[]): Promise<void> => {
    const text = conversationText(ids, messages, {
      title,
      author: selectionAuthor,
      attachment: t('selection.attachment'),
    });
    try {
      await navigator.clipboard.writeText(text);
      flashSelectionNotice(t('selection.copied', { count: String(ids.length) }));
    } catch {
      flashSelectionNotice(t('selection.failed'));
    }
  };
  const exportSelectionImage = async (ids: readonly string[]): Promise<void> => {
    const timeline = scrollRef.current;
    const range = selectionRange(ids, messages);
    if (timeline === null || range === undefined) return;
    const first = messages.find((message) => message.id === range.fromMessageId);
    const last = messages.find(
      (message) => message.id === (range.toMessageId ?? range.fromMessageId),
    );
    const sheet = buildMessageSnapshot(
      timeline,
      ids,
      title,
      [first, last]
        .filter((message) => message !== undefined)
        .map((message) =>
          new Date(message.at).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
        )
        .filter((value, index, all) => all.indexOf(value) === index)
        .join(' – '),
    );
    if (sheet === undefined) return;
    setSelectionBusy(true);
    try {
      const blob = await renderMessageSnapshot(timeline, sheet);
      if (blob === undefined) throw new Error('snapshot-empty');
      if (snapshotScope.current === scopeKey) setSelectionImage(blob);
    } catch {
      flashSelectionNotice(t('selection.failed'));
    } finally {
      setSelectionBusy(false);
    }
  };
  const memoryCommitIntent = state.memoryCommitIntent;
  const activeMemoryView =
    selectedMemoryView?.channelId === channelId
      ? selectedMemoryView
      : memoryCommitIntent !== undefined && memoryCommitIntent.channelId === channelId
        ? { channelId, kind: 'commit' as const, sha: memoryCommitIntent.sha }
        : undefined;
  const selectedMemoryCommitSha =
    activeMemoryView?.kind === 'commit' ? activeMemoryView.sha : undefined;
  const openMemoryView = (
    view:
      | { kind: 'commit'; sha: string }
      | { kind: 'file'; path: string }
      | { kind: 'working'; change: MemoryWorkingChange },
  ): void => {
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
  const scheduleReadMark = (): void => {
    if (channelId === undefined || scrollRef.current === null || conversation.status !== 'ready')
      return;
    window.clearTimeout(readMarkTimer.current);
    readMarkTimer.current = window.setTimeout(() => {
      const element = scrollRef.current;
      if (currentChannel.current !== channelId || element === null) return;
      const committedIds = committedMessageIds(messages);
      const bounds = element.getBoundingClientRect();
      const overlay =
        Number.parseFloat(getComputedStyle(element).getPropertyValue('--bh-composer-overlay')) || 0;
      const viewport = { top: bounds.top, bottom: bounds.bottom - overlay };
      const visible = Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]'))
        .filter((candidate) => {
          const id = candidate.dataset['messageId'];
          if (id === undefined || !committedIds.has(id)) return false;
          const bounds = candidate.getBoundingClientRect();
          return bounds.top < viewport.bottom && bounds.bottom > viewport.top;
        })
        .at(-1);
      const messageId = visible?.dataset['messageId'];
      if (messageId === undefined) return;
      void actions.markRead(channelId, messageId).catch((error: unknown) => {
        reportFailure('channel-read-position-failed', 'channel read position failed', error);
      });
    }, 250);
  };

  const currentChannel = useRef(channelId);
  currentChannel.current = channelId;
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
  const conversationShortcuts: ComposerShortcut[] = [
    ...(dmComposerContext === undefined
      ? []
      : [
          {
            id: 'memory' as const,
            label: t('composerCommand.memory'),
            icon: <ChannelSidebarIcon name="files" />,
            run: () => sidebar.openTab('memory'),
          },
          {
            id: 'sessions' as const,
            label: t('composerCommand.sessions'),
            icon: <ChannelSidebarIcon name="text-quote" />,
            run: () => sidebar.openTab('conversation'),
          },
          {
            id: 'compact' as const,
            label: t('composerCommand.compact'),
            icon: <ChannelSidebarIcon name="archive" />,
            disabled: compacting,
            run: () => void compactProfileBot(),
          },
          {
            id: 'new' as const,
            label: t('composerCommand.newSession'),
            icon: <ChannelSidebarIcon name="text-quote" />,
            disabled: compacting,
            run: newProfileSession,
          },
        ]),
    {
      id: 'profile',
      label: t('composerCommand.profile'),
      icon: <ChannelSidebarIcon name={channel?.type === 'group' ? 'users' : 'id-card'} />,
      run: openProfileView,
    },
    ...(hasChannelSettings
      ? [
          {
            id: 'settings' as const,
            label: t('composerCommand.settings'),
            icon: <ChannelSidebarIcon name="settings" />,
            run: () => channelSettings.open(settingsAttention[0]?.id),
          },
        ]
      : []),
    {
      id: 'sidebar',
      label: t(sidebar.mode === 'hidden' ? 'sidebar.expand' : 'sidebar.collapse'),
      icon: <ChannelSidebarIcon name="panels-top-left" />,
      run: sidebar.toggle,
    },
  ];
  const contextInHeader = docked && workspaceEnabled && channel !== undefined;
  const composerContext = conversationComposerContext(
    baseComposerContext,
    contextInHeader,
    conversationShortcuts,
    t,
  );

  const loadOlderAtTop = (retry = false): void => {
    const element = scrollRef.current;
    if (
      element === null ||
      channelId === undefined ||
      !conversation.timeline.hasOlder ||
      conversation.timeline.loadingOlder ||
      (!retry && conversation.timeline.olderError !== undefined) ||
      prependAnchor.current !== null
    )
      return;
    prependAnchor.current = {
      firstId: messages[0]?.id,
      y: element.querySelector<HTMLElement>('[data-message-id]')?.getBoundingClientRect().top,
      top: element.scrollTop,
      height: element.scrollHeight,
    };
    void actions.loadOlder(channelId);
  };

  const loadNewerAtBottom = (): void => {
    if (
      channelId === undefined ||
      !conversation.timeline.hasNewer ||
      conversation.timeline.loadingNewer ||
      conversation.timeline.newerError !== undefined
    )
      return;
    void actions.loadNewer(channelId);
  };

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

  const timelineHandlers = {
    contextMenu: (message: ChannelMessage, x: number, y: number) => {
      setAvatarMenu(undefined);
      const selection = selectedMessageText(message.id);
      setMessageMenu({
        message,
        x,
        y,
        ...(selection === undefined ? {} : { selection }),
      });
    },
    avatarMenu: (botSlug: string, x: number, y: number) => {
      setMessageMenu(undefined);
      setAvatarMenu({ botSlug, x, y });
    },
    reply: (message: ChannelMessage) => quoteMessage(message),
    react: (message: ChannelMessage, emoji: string, active: boolean) =>
      reactToMessage?.(message, emoji, active),
    jumpReply: (messageId: string) => {
      if (channelId !== undefined) void actions.openAround(channelId, messageId);
    },
    restoreFailed: restoreFailedMessage,
    openInbox: (target: InboxTarget) => setInboxTarget(target),
    openMemoryView,
  };
  const latestTimeline = useRef(timelineHandlers);
  latestTimeline.current = timelineHandlers;
  const timelineCallbacks = useMemo(
    () => ({
      contextMenu: (message: ChannelMessage, x: number, y: number) =>
        latestTimeline.current.contextMenu(message, x, y),
      avatarMenu: (botSlug: string, x: number, y: number) =>
        latestTimeline.current.avatarMenu(botSlug, x, y),
      reply: (message: ChannelMessage) => latestTimeline.current.reply(message),
      react: (message: ChannelMessage, emoji: string, active: boolean) =>
        latestTimeline.current.react(message, emoji, active),
      jumpReply: (messageId: string) => latestTimeline.current.jumpReply(messageId),
      restoreFailed: (message: ChannelMessage) => latestTimeline.current.restoreFailed(message),
      openInbox: (target: InboxTarget) => latestTimeline.current.openInbox(target),
      memoryNavigation: {
        file: (path: string) => latestTimeline.current.openMemoryView({ kind: 'file', path }),
        commit: (sha: string) => latestTimeline.current.openMemoryView({ kind: 'commit', sha }),
        working: (change: MemoryWorkingChange) =>
          latestTimeline.current.openMemoryView({ kind: 'working', change }),
      },
    }),
    [],
  );
  const unreadAfter = conversation.unreadAfterMessageId;
  const committedGroups = useMemo(
    () => groupChannelMessages(visibleMessages, unreadAfter),
    [visibleMessages, unreadAfter],
  );
  const messageGroups = useMemo(
    () =>
      displayMessages === visibleMessages
        ? committedGroups
        : [
            ...committedGroups,
            ...groupChannelMessages(displayMessages.slice(visibleMessages.length)),
          ],
    [committedGroups, displayMessages, visibleMessages],
  );
  const arrivalIds = useMemo(
    () =>
      visibleMessages
        .filter((item) => !streamReplies || item.author.kind !== 'bot')
        .map((item) => item.id),
    [visibleMessages, streamReplies],
  );
  const arrivals = useMessageArrivals(channelId, arrivalIds, conversation.status === 'ready');
  const galleryImages = useMemo<GalleryImage[]>(
    () =>
      channelId === undefined
        ? []
        : visibleMessages.flatMap((message) =>
            message.contentPurged === true
              ? []
              : (message.attachments ?? []).flatMap((ref) =>
                  inlineImageAttachment(ref.mime)
                    ? [
                        {
                          key: galleryImageKey(message.id, ref),
                          src: channelAttachmentUrl(ref, {
                            channelId,
                            messageId: message.id,
                          }),
                          alt: ref.name,
                        },
                      ]
                    : [],
                ),
          ),
    [channelId, visibleMessages],
  );
  const imageGallery = useMessageImageGallery(galleryImages, t);
  const groupShape = useStableGroupShape(messageGroups);
  const groupKeys = groupShape.keys;
  const groupMembers = groupShape.members;
  const pinnedGroups = useMemo(() => {
    const pinned = new Set<string>();
    const focus = conversation.focusMessageId;
    groupKeys.forEach((key, index) => {
      const ids = groupMembers.get(key) ?? [];
      const previous = index === 0 ? undefined : groupMembers.get(groupKeys[index - 1]!);
      if (
        (focus !== undefined && ids.includes(focus)) ||
        (unreadAfter !== undefined && previous?.at(-1) === unreadAfter)
      )
        pinned.add(key);
    });
    return pinned;
  }, [groupKeys, groupMembers, unreadAfter, conversation.focusMessageId]);
  const timelineWindow = useTimelineWindow(groupKeys, pinnedGroups, groupMembers);
  const placeUnreadDivider = (element: HTMLDivElement): boolean => {
    const divider = element.querySelector<HTMLElement>('[data-unread-divider]');
    if (divider === null) return false;
    const viewport = element.getBoundingClientRect();
    element.scrollTop += divider.getBoundingClientRect().top - viewport.top - viewport.height / 4;
    lastTimelineTop.current = element.scrollTop;
    followingLatest.current =
      !conversation.timeline.hasNewer &&
      element.scrollHeight - element.scrollTop - element.clientHeight <= 80;
    setAtLatest(followingLatest.current);
    return true;
  };

  const timelineMount = useMountedResource<HTMLDivElement>(
    (element) => {
      scrollRef.current = element;
      timelineWindow.rootRef(element);
      if (conversation.timeline.olderError !== undefined) prependAnchor.current = null;
      if (conversation.status === 'ready') {
        if (conversation.focusMessageId !== undefined && conversation.timeline.hasNewer) {
          followingLatest.current = false;
          setAtLatest(false);
        }
        const anchor = prependAnchor.current;
        if (anchor !== null && messages[0]?.id !== anchor.firstId) {
          const retained = Array.from(
            element.querySelectorAll<HTMLElement>('[data-message-id]'),
          ).find((candidate) => candidate.dataset['messageId'] === anchor.firstId);
          if (retained !== undefined && anchor.y !== undefined) {
            element.scrollTop += retained.getBoundingClientRect().top - anchor.y;
          } else {
            element.scrollTop = anchor.top + element.scrollHeight - anchor.height;
          }
          lastTimelineTop.current = element.scrollTop;
          prependAnchor.current = null;
        } else if (
          unreadAfter !== undefined &&
          placedUnreadDivider.current !== unreadAfter &&
          !restoredScroll.current &&
          conversation.focusMessageId === undefined &&
          placeUnreadDivider(element)
        ) {
          placedUnreadDivider.current = unreadAfter;
          positioned.current = true;
        } else if (
          !positioned.current &&
          conversation.focusMessageId === undefined &&
          messages.length > 0
        ) {
          positioned.current = true;
          const saved = channelId === undefined ? undefined : rememberedTimelineScroll(channelId);
          if (saved !== undefined && !saved.atLatest && restoreTimelineScroll(element, saved)) {
            restoredScroll.current = true;
            lastTimelineTop.current = element.scrollTop;
            followingLatest.current = false;
            setAtLatest(false);
          } else if (followingLatest.current) pinTimelineToLatest(element);
        } else if (followingLatest.current) {
          pinTimelineToLatest(element);
        }
        const previousRevision = lastRevision.current;
        if (
          previousRevision !== undefined &&
          conversation.revision > previousRevision &&
          !followingLatest.current
        ) {
          setUnseen((count) => count + conversation.revision - previousRevision);
        }
        lastRevision.current = conversation.revision;
        const flight = sendFlight.current;
        const sentId = flight === undefined ? undefined : sentMessageId(flight, messages);
        if (flight !== undefined && sentId === undefined && sendFlightExpired(flight))
          sendFlight.current = undefined;
        if (flight !== undefined && sentId !== undefined) {
          sendFlight.current = undefined;
          const bubble = element.querySelector<HTMLElement>(
            `[data-message-id="${CSS.escape(sentId)}"] .bh-bubble`,
          );
          if (bubble !== null && followingLatest.current) flySentBubble(bubble, flight.from);
        }
      }
      const id = conversation.focusMessageId;
      let focusTimer: number | undefined;
      if (id !== undefined) {
        positioned.current = true;
        const target = Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]')).find(
          (candidate) => candidate.dataset['messageId'] === id,
        );
        target?.scrollIntoView({ block: 'center' });
        lastTimelineTop.current = element.scrollTop;
        focusTimer = window.setTimeout(() => {
          const current = store.getSnapshot().conversation;
          if (current.channel?.id === channelId && current.focusMessageId === id) {
            store.setConversation({ focusMessageId: undefined });
          }
        }, 2200);
      }
      const frame = window.requestAnimationFrame(() => {
        if (element.scrollHeight <= element.clientHeight + 1) {
          loadOlderAtTop();
          loadNewerAtBottom();
        }
        if (conversation.status === 'ready') scheduleReadMark();
      });
      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(focusTimer);
        scrollRef.current = null;
      };
    },
    [
      scopeKey,
      actions,
      channelId,
      conversation.status,
      conversation.drafts,
      conversation.revision,
      conversation.focusMessageId,
      unreadAfter,
      conversation.timeline.hasOlder,
      conversation.timeline.hasNewer,
      conversation.timeline.loadingOlder,
      conversation.timeline.loadingNewer,
      conversation.timeline.olderError,
      conversation.timeline.newerError,
      messages,
    ],
  );

  const onTimelineScroll = (): void => {
    const element = scrollRef.current;
    if (element === null) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 80;
    followingLatest.current = followsLatest(
      element,
      lastTimelineTop.current,
      conversation.timeline.hasNewer,
    );
    lastTimelineTop.current = element.scrollTop;
    setAtLatest(followingLatest.current);
    if (followingLatest.current) setUnseen(0);
    if (channelId !== undefined && conversation.status === 'ready' && positioned.current) {
      const position = timelineScrollAnchor(element, followingLatest.current);
      if (position !== undefined) rememberTimelineScroll(channelId, position);
    }
    scheduleReadMark();
    if (element.scrollTop <= 48) loadOlderAtTop();
    if (atBottom) loadNewerAtBottom();
  };

  const jumpToLatest = (): void => {
    followingLatest.current = true;
    setAtLatest(true);
    setUnseen(0);
    if (conversation.timeline.hasNewer && channelId !== undefined) {
      void actions.openLatest(channelId).catch((error: unknown) => {
        reportFailure('latest-timeline-reload-failed', 'latest timeline reload failed', error);
      });
      return;
    }
    const element = scrollRef.current;
    if (element !== null) pinTimelineToLatest(element);
  };

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
  const timelineGroupInputs: TimelineGroupInputs = {
    messageGroups,
    timelineWindow,
    unreadAfter,
    channel,
    bots: state.bots,
    channels: state.channels,
    dmBotSlug,
    memoryDisplay,
    onOpenInbox: setInboxTarget,
    onOpenChannelMessage: (targetChannelId, messageId) => {
      void actions
        .openChannel(targetChannelId)
        .then(() => actions.openAround(targetChannelId, messageId));
    },
    onOpenMemoryCommit: (commit) => {
      if (channel?.type === 'dm' && channel.botSlug === commit.botSlug) {
        openMemoryView({
          kind: 'commit',
          sha: commit.sha,
        });
        return;
      }
      const dm = state.channels.find(
        (candidate) => candidate.type === 'dm' && candidate.botSlug === commit.botSlug,
      );
      if (dm !== undefined)
        store.setMemoryCommitIntent({
          channelId: dm.id,
          sha: commit.sha,
        });
      void actions.openBot(commit.botSlug);
    },
    renderBotCreateAction: (first, action) => (
      <button
        type="button"
        className="bh-bot-dm-action"
        data-message-id={first.id}
        onClick={() => void actions.openBot(first.botCreateAction!.botSlug)}
      >
        <BotDmActionLabel
          messageKey="botCreate.action"
          senderSlug={first.author.kind === 'bot' ? first.author.slug : undefined}
          senderName={authorLabel(first, state.bots, t, channel)}
          recipientSlug={action.botSlug}
          recipientName={
            state.bots.find((bot) => bot.slug === action.botSlug)?.displayName ?? action.displayName
          }
          bots={state.bots}
          t={t}
        />
      </button>
    ),
    renderMessageGroup: (group) => (
      <OnboardingMemoryNavigation.Provider value={timelineCallbacks.memoryNavigation}>
        <TakeoverTimeline.Provider value={takeoverTimeline}>
          <MessageGroupView
            humanMembers={channel?.humanMembers ?? NO_HUMAN_MEMBERS}
            group={group}
            arrivals={arrivals}
            reading={reading}
            channelId={channelId}
            channelType={channel?.type}
            remoteBot={channel?.remoteBot}
            remoteContact={channel?.remoteContact}
            remoteAvailability={channel?.remoteAvailability}
            actions={actions}
            gallery={imageGallery.gallery}
            nativeChatT={nativeChatT}
            resolvedGrantRequests={timelineDecisions.resolvedGrantRequests}
            toolApprovalDecisions={timelineDecisions.toolApprovalDecisions}
            userQuestionResolutions={timelineDecisions.userQuestionResolutions}
            focusMessageId={conversation.focusMessageId}
            currentDmBotSlug={channel?.type === 'dm' && !botDm ? channel.botSlug : undefined}
            bots={state.bots}
            onContextMenu={timelineCallbacks.contextMenu}
            onAvatarMenu={channel?.type === 'group' ? timelineCallbacks.avatarMenu : undefined}
            renderAvatarButton={renderAvatarButton}
            renderFailedButton={renderFailedButton}
            onOpenInbox={timelineCallbacks.openInbox}
            onReply={mutationLocked ? undefined : timelineCallbacks.reply}
            onReact={reactToMessage === undefined ? undefined : timelineCallbacks.react}
            onJumpReply={timelineCallbacks.jumpReply}
            onRestoreFailed={mutationLocked ? undefined : timelineCallbacks.restoreFailed}
            t={t}
          />
        </TakeoverTimeline.Provider>
      </OnboardingMemoryNavigation.Provider>
    ),
    renderBotDmAction: (first, dmAction) => (
      <button
        type="button"
        className="bh-bot-dm-action"
        data-message-id={first.id}
        onClick={() => {
          const action = first.botDmAction!;
          void actions
            .openChannel(action.channelId)
            .then(() => actions.openAround(action.channelId, action.messageId));
        }}
      >
        <BotDmActionLabel
          senderSlug={first.author.kind === 'bot' ? first.author.slug : undefined}
          senderName={authorLabel(first, state.bots, t, channel)}
          recipientSlug={dmAction.recipientBotSlug}
          recipientName={memberName(state.bots, dmAction.recipientBotSlug)}
          bots={state.bots}
          t={t}
        />
      </button>
    ),
    t,
  };
  const conversationPane = (
    <section ref={companionReadMount} className="bh-chat-pane" {...fileDrop.handlers}>
      <WorkingAnnouncement rows={workingRows} t={t} />
      {fileDrop.active ? (
        <ConversationFileDropOverlay
          label={t('composer.dropFiles')}
          hint={t('composer.dropLimit')}
        />
      ) : null}
      <div
        ref={profileMount}
        hidden={workspaceEnabled}
        style={workspaceEnabled ? { display: 'none' } : undefined}
        className="bh-topbar"
        data-window-drag
        data-bh-tour="topbar"
        data-channel-detail={profileViewOpen || activeMemoryView !== undefined ? 'true' : undefined}
        data-memory-diff={
          activeMemoryView?.kind === 'commit' || activeMemoryView?.kind === 'working'
            ? 'true'
            : undefined
        }
      >
        {!workspaceEnabled && (
          <>
            {openCompactSidebar !== undefined ? (
              <MobileConversationHeader
                title={title}
                openSidebar={openCompactSidebar}
                onSettings={sidebar.toggle}
                onFiles={channelId === undefined ? undefined : () => setFilesOpen(!filesOpen)}
                filesOpen={filesOpen}
                onInbox={inboxAvailable ? () => setInboxOpen(!inboxOpen) : undefined}
                inboxOpen={inboxOpen}
                settingsOpen={sidebar.mode !== 'hidden'}
                t={t}
              />
            ) : channel?.type === 'group' ? (
              <span className="bh-channel-island-wrap">
                {channelHeaderMenu(
                  {
                    label: t('groupProfile.label'),
                    icon: <ChannelSidebarIcon name="id-card" size={16} />,
                    run: openProfileView,
                  },
                  (menu) => (
                    <GroupChannelHeader
                      channel={channel}
                      title={title}
                      members={channelFacepile}
                      expanded={profileViewOpen}
                      menu={menu}
                      t={t}
                      onOpenActivity={openProfileView}
                      onToggleProfile={openProfileView}
                      status={<HeaderWorkingStatus rows={workingRows} t={t} />}
                    />
                  ),
                )}
              </span>
            ) : profileBot === undefined ? (
              <span className="bh-companion-chip">
                {channelHeaderMenu(
                  {
                    label: t(sidebar.mode === 'hidden' ? 'sidebar.expand' : 'sidebar.collapse'),
                    icon: <ChannelSidebarIcon name="panels-top-left" size={16} />,
                    run: sidebar.toggle,
                  },
                  (menu) => (
                    <button
                      type="button"
                      className="bh-channel-island"
                      {...(menu === undefined
                        ? {
                            'aria-label': `${title} — ${t(sidebar.mode === 'hidden' ? 'sidebar.expand' : 'sidebar.collapse')}`,
                            'aria-controls': 'bh-channel-sidebar',
                            'aria-expanded': sidebar.mode !== 'hidden',
                            onClick: sidebar.toggle,
                          }
                        : {
                            'aria-label': channelMenuLabel(menu),
                            'aria-haspopup': 'menu' as const,
                            'aria-expanded': menu.open,
                            onClick: menu.toggle,
                          })}
                    >
                      {bot !== undefined ? (
                        <PersonaBotAvatar
                          t={t}
                          personaBotId={bot.slug}
                          name={bot.displayName}
                          src={bot.avatar}
                          appearance={bot.appearance}
                          avatarSeed={bot.avatarSeed}
                          state={botActivity}
                          size={22}
                          indicator={false}
                        />
                      ) : channelFacepile.length > 0 ? (
                        <PersonaBotFacepile
                          items={channelFacepile}
                          size={22}
                          indicator={false}
                          t={t}
                        />
                      ) : (
                        <ChannelMark />
                      )}
                      <ConversationTitle>
                        {dmWorking ? <WorkingSummary rows={workingRows} t={t} /> : title}
                      </ConversationTitle>
                      {menu === undefined ? null : <ChannelMenuCaret attention={menu.attention} />}
                    </button>
                  ),
                )}
              </span>
            ) : (
              <span className="bh-channel-island-wrap">
                {channelHeaderMenu(
                  {
                    label: t('profile.view'),
                    icon: <ChannelSidebarIcon name="id-card" size={16} />,
                    run: openProfileView,
                  },
                  (menu) => (
                    <button
                      type="button"
                      className="bh-channel-island"
                      {...(menu === undefined
                        ? {
                            'aria-label': t('profile.openAvatar', {
                              name: profileBot.displayName,
                            }),
                            onClick: openProfileView,
                          }
                        : {
                            'aria-haspopup': 'menu' as const,
                            'aria-expanded': menu.open,
                            'aria-label': channelMenuLabel(menu),
                            onClick: menu.toggle,
                          })}
                    >
                      <PersonaBotAvatar
                        t={t}
                        personaBotId={profileBot.slug}
                        name={profileBot.displayName}
                        src={profileBot.avatar}
                        appearance={profileBot.appearance}
                        avatarSeed={profileBot.avatarSeed}
                        state={profileBotActivity}
                        size={22}
                        indicator={false}
                      />
                      <ConversationTitle>
                        {dmWorking ? <WorkingSummary rows={workingRows} t={t} /> : title}
                      </ConversationTitle>
                      {menu === undefined ? null : <ChannelMenuCaret attention={menu.attention} />}
                    </button>
                  ),
                )}
              </span>
            )}
            {!workspaceEnabled && openCompactSidebar === undefined && channelId !== undefined && (
              <span className="bh-channel-island-wrap">
                <IconButton
                  aria-label={t('generatedFiles.title')}
                  aria-expanded={filesOpen}
                  onClick={() => setFilesOpen(!filesOpen)}
                >
                  <ChannelSidebarIcon name="file" />
                </IconButton>
              </span>
            )}
            {!workspaceEnabled &&
              messageHost === undefined &&
              openCompactSidebar === undefined &&
              channel?.type === 'dm' &&
              profileBot !== undefined &&
              profileBot.deleted !== true &&
              renderConversationCall(profileBot, channel, actions, t)}
            {!workspaceEnabled && openCompactSidebar === undefined && inboxAvailable && (
              <span className="bh-channel-island-wrap">
                <IconButton
                  aria-label={t('entry.botInbox')}
                  aria-expanded={inboxOpen}
                  onClick={() => setInboxOpen(!inboxOpen)}
                >
                  <ChannelSidebarIcon name="inbox" />
                </IconButton>
              </span>
            )}
          </>
        )}
      </div>
      {profileViewOpen && channel?.type === 'group' ? (
        <GroupProfileView
          members={channelFacepile}
          channel={channel}
          activity={
            groupProfileActivity?.channelId === channel.id ? groupProfileActivity : undefined
          }
          cards={profileCards}
          botNames={botNames}
          t={t}
          onClose={() => setProfileViewOpen(false)}
        />
      ) : profileViewOpen && profileBot !== undefined && channel !== undefined ? (
        <ProfileView
          bot={profileBot}
          channel={channel}
          activity={profileActivity}
          cards={profileCards}
          actions={actions}
          t={t}
          onClose={() => setProfileViewOpen(false)}
        />
      ) : (
        <>
          {activeMemoryView === undefined ||
          channelId === undefined ? null : activeMemoryView.kind === 'commit' ? (
            <MemoryCommitView
              key={`${channelId}:${activeMemoryView.sha}`}
              actions={actions}
              channelId={channelId}
              sha={activeMemoryView.sha}
              botSlug={channel?.botSlug}
              t={t}
              onClose={closeMemoryView}
            />
          ) : activeMemoryView.kind === 'file' ? (
            <MemoryFileView
              key={`${channelId}:${activeMemoryView.path}`}
              actions={actions}
              channelId={channelId}
              path={activeMemoryView.path}
              botSlug={channel?.botSlug}
              t={t}
              onClose={closeMemoryView}
            />
          ) : (
            <MemoryWorkingView
              key={`${channelId}:${activeMemoryView.change.kind}:${activeMemoryView.change.path}`}
              actions={actions}
              channelId={channelId}
              change={activeMemoryView.change}
              botSlug={channel?.botSlug}
              t={t}
              onClose={closeMemoryView}
            />
          )}
          {searchTop === undefined ||
          channelId === undefined ||
          activeMemoryView !== undefined ||
          actions.searchChannel === undefined ? null : (
            <ConversationSearch
              top={searchTop}
              search={(query, cursor) => actions.searchChannel!(channelId, query, cursor)}
              onJump={(messageId) => void actions.openAround(channelId, messageId)}
              onClose={() => {
                setSearchTop(undefined);
                searchReturnFocus.current?.focus();
                searchReturnFocus.current = null;
              }}
              label={selectionAuthor}
              time={(at) => fullTime(at, t)}
              t={t}
            />
          )}
          <div
            className="bh-chat-body"
            ref={timelineMount}
            data-loaded-messages={displayMessages.length}
            onScroll={onTimelineScroll}
            onWheel={(event) => {
              if (
                event.deltaY >= 0 ||
                event.ctrlKey ||
                event.currentTarget.scrollTop <= 0 ||
                !followingLatest.current
              )
                return;
              followingLatest.current = false;
              setAtLatest(false);
            }}
            onTransitionEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                event.propertyName === 'padding-bottom' &&
                followingLatest.current
              )
                pinTimelineToLatest(event.currentTarget);
            }}
            style={{
              display: activeMemoryView === undefined ? undefined : 'none',
            }}
          >
            {conversation.timeline.hasOlder ? (
              <div className="bh-timeline-top-sentinel">
                {conversation.timeline.loadingOlder ? (
                  <span>{t('messages.older.loading')}</span>
                ) : conversation.timeline.olderError !== undefined ? (
                  <button type="button" onClick={() => loadOlderAtTop(true)}>
                    {t('messages.retry')}
                  </button>
                ) : (
                  <button type="button" onClick={() => loadOlderAtTop()}>
                    {t('messages.older.view')}
                  </button>
                )}
              </div>
            ) : null}
            {conversation.status === 'loading' && messages.length === 0 ? (
              <LoadingSkeleton kind="messages" label={t('messages.loading')} />
            ) : null}
            {conversation.status === 'error' && conversation.error !== undefined ? (
              <>
                <ReadFailure
                  retryLabel={t('messages.retry')}
                  onRetry={() => onRetryConversation?.()}
                  disabled={onRetryConversation === undefined}
                >
                  {t('messages.loadFailed')}
                </ReadFailure>
                <details className="bh-session-failure-details">
                  <summary>{t('failure.details')}</summary>
                  <div>{conversation.error}</div>
                </details>
              </>
            ) : null}
            {conversation.draftNotice !== undefined ? (
              <div className="bh-note" role="status">
                {conversation.draftNotice === 'interrupted'
                  ? t('message.draftInterrupted')
                  : t('message.draftExpired')}
              </div>
            ) : null}
            {displayMessages.length === 0 && conversation.status !== 'loading' ? (
              <EmptyConversation channel={channel} bot={bot} t={t} />
            ) : null}
            <MessageSelectionContext.Provider value={messageSelection}>
              <TimelineSlots
                timeline={timelineWindow}
                keys={groupKeys}
                renderGroup={(index) => renderTimelineGroup(index, timelineGroupInputs)}
              />
            </MessageSelectionContext.Provider>
            {imageGallery.lightbox}
            {conversation.timeline.hasNewer ? (
              <div className="bh-timeline-newer-sentinel">
                {conversation.timeline.loadingNewer ? (
                  <span>{t('messages.newer.loading')}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (channelId !== undefined) void actions.loadNewer(channelId);
                    }}
                  >
                    {conversation.timeline.newerError === undefined
                      ? t('messages.newer.view')
                      : t('messages.retry')}
                  </button>
                )}
              </div>
            ) : null}
          </div>
          {activeMemoryView === undefined && restoreBlocked ? (
            <div className="bh-note" role="alert">
              {t('message.restoreBlocked')}
            </div>
          ) : null}
          {activeMemoryView === undefined &&
          selectedIds !== undefined &&
          channelId !== undefined ? (
            <MessageSelectionBar
              count={selectedIds.length}
              busy={selectionBusy}
              notice={selectionNotice}
              t={t}
              onCancel={cancelSelection}
              onExport={(kind) => {
                if (kind === 'conversation') {
                  void copySelection(selectedIds);
                } else void exportSelectionImage(selectedIds);
              }}
            />
          ) : null}
          {activeMemoryView === undefined &&
          selectedIds === undefined &&
          (!atLatest || unseen > 0 || conversation.timeline.hasNewer) ? (
            <div className="bh-timeline-jump-anchor">
              <button
                type="button"
                className="bh-timeline-new"
                data-unseen={unseen > 0 ? '' : undefined}
                style={
                  unseen > 0
                    ? ({
                        '--bh-timeline-new-bg': color.accent,
                        '--bh-timeline-new-fg': color.onAccent,
                      } as CSSProperties)
                    : undefined
                }
                aria-label={t('messages.latest')}
                aria-description={
                  unseen > 0
                    ? t(unseen === 1 ? 'messages.unseenOne' : 'messages.unseen', { count: unseen })
                    : undefined
                }
                onClick={jumpToLatest}
              >
                {unseen > 0 ? (
                  <span className="bh-timeline-new-count" aria-hidden="true">
                    {unseen > 99 ? '99+' : unseen}
                  </span>
                ) : (
                  <Icon name="chevron-down" size={16} aria-hidden="true" />
                )}
              </button>
            </div>
          ) : null}
          {readOnlyDm && selectedIds === undefined ? (
            <div className="bh-bot-dm-readonly">
              {t(deletedBotDm ? 'deletion.readOnly' : 'botDm.readOnly')}
              {channel?.remoteBot === undefined
                ? null
                : ` · ${networkContactAvailabilityLabel(channel.remoteAvailability, t)}`}
            </div>
          ) : null}
          {readOnlyDm
            ? null
            : renderConversationComposer({
                draftState: composerDraft,
                edits: composerEdits,
                submissions: composerSubmissions,
                channel,
                channelId,
                activeMemoryView,
                selectedIds,
                compactNotice,
                setCompactNotice,
                actions,
                followingLatest,
                pinTimelineToLatest,
                store,
                composerContext,
                sendKey,
                skillOptions,
                composerSessions,
                state,
                allBotPreview,
                allBotNotice,
                channelBots,
                title,
                dictationPort,
                dictating,
                conversation,
                unavailable,
                addFiles,
                startUpload,
                composerQuotes,
                recallInput,
                submit,
                t,
              })}
          <MessageSelectionToolbar
            enabled={!mutationLocked && activeMemoryView === undefined && messageMenu === undefined}
            label={t('message.quoteSelection')}
            quoteLabel={t('message.quote')}
            canQuote={(messageId) => {
              const target = messages.find((candidate) => candidate.id === messageId);
              return target !== undefined && quotableMessage(target);
            }}
            onQuote={(messageId, text) => {
              const target = messages.find((candidate) => candidate.id === messageId);
              if (target !== undefined) quoteMessage(target, text);
            }}
          />
          {activeMemoryView !== undefined || messageMenu === undefined ? null : (
            <MessageActionMenu
              request={messageMenu}
              t={t}
              {...(readOnlyDm ||
              reactToMessage === undefined ||
              !reactableMessage(messageMenu.message)
                ? {}
                : { onReact: setReactionMenu })}
              {...(readOnlyDm
                ? {}
                : {
                    onQuote: quoteMessage,
                    onFeedback: (message: ChannelMessage) => setFeedbackMessage(message.id),
                  })}
              {...(messageSelection === undefined ? {} : { onSelect: messageSelection.begin })}
              onClose={() => {
                setMessageMenu(undefined);
              }}
            />
          )}
          {reactionMenu === undefined || reactToMessage === undefined ? null : (
            <MessageReactionSurface
              message={
                messages.find((message) => message.id === reactionMenu.message.id) ??
                reactionMenu.message
              }
              anchor={() => ({
                left: reactionMenu.x,
                top: reactionMenu.y,
                width: 0,
                bottom: reactionMenu.y,
              })}
              onReact={(emoji, active) => reactToMessage(reactionMenu.message, emoji, active)}
              onClose={() => setReactionMenu(undefined)}
              t={t}
            />
          )}
          {activeMemoryView !== undefined ||
          avatarMenu === undefined ||
          channel?.type !== 'group' ? null : (
            <BotAvatarMenu
              request={avatarMenu}
              canMention={channelBots.some(
                (member) => member.slug === avatarMenu.botSlug && member.deleted !== true,
              )}
              t={t}
              onMessage={(botSlug) => void actions.openBot(botSlug)}
              onMention={mentionBot}
              onProfile={(botSlug) => void actions.openBot(botSlug, 'profile')}
              onClose={() => setAvatarMenu(undefined)}
            />
          )}
          {inboxTarget === undefined ? null : (
            <BotInboxDialog
              key={inboxTarget.botSlug + ':' + inboxTarget.messageId}
              botSlug={inboxTarget.botSlug}
              botName={
                state.bots.find((bot) => bot.slug === inboxTarget.botSlug)?.displayName ??
                inboxTarget.botSlug
              }
              messageId={inboxTarget.messageId}
              missing={inboxTarget.missing}
              actions={actions}
              t={t}
              onClose={() => setInboxTarget(undefined)}
            />
          )}
          {selectionImage === undefined ? null : (
            <MessageImagePreview
              blob={selectionImage}
              t={t}
              onClose={() => setSelectionImage(undefined)}
            />
          )}
          {feedbackMessage === undefined || channelId === undefined ? null : (
            <MessageFeedbackDialog
              key={feedbackMessage}
              channelId={channelId}
              messageId={feedbackMessage}
              t={t}
              onClose={() => setFeedbackMessage(undefined)}
            />
          )}
        </>
      )}
    </section>
  );
  const chatPane =
    state.selection === undefined ? (
      <Welcome state={state} t={t} />
    ) : state.selection.kind === 'inbox' ? (
      renderActivityCenter(actions, t, dockPanels)
    ) : (
      conversationPane
    );
  const openSession = (botSlug: string | undefined, sessionId: string, title: string): void => {
    const show = (owner: string): void =>
      setDetail({
        ...(owner === dockBotSlug ? {} : { botSlug: owner }),
        sessionId,
        title:
          title ||
          sessionItems.find((item) => item.sessionId === sessionId)?.assignmentTitle ||
          composerSessions.options.find((option) => option.sessionId === sessionId)?.title ||
          t('sessions.detail.title'),
      });
    const owner =
      botSlug ??
      dockBotSlug ??
      composerSessions.options.find((option) => option.sessionId === sessionId)?.botSlug;
    if (owner !== undefined) {
      show(owner);
      return;
    }
    if (channel?.type !== 'group') return;
    void Promise.all(
      channel.members.map((slug) =>
        actions.readSessions(slug).then(
          (items) => (items.some((item) => item.sessionId === sessionId) ? slug : undefined),
          () => undefined,
        ),
      ),
    ).then((owners) => {
      const found = owners.find((slug) => slug !== undefined);
      if (found !== undefined) show(found);
    });
  };
  return (
    <SessionOpenContext.Provider value={openSession}>
      <div ref={conversationMount} className="bh-root bh-main">
        <span ref={allBotPreviewMount} hidden />
        <span ref={skillCatalogMount} hidden />
        <span ref={searchShortcutMount} hidden />
        <span ref={replyPerfMount} hidden />
        <span ref={dockInboxMount} hidden />
        {conversationScope(<ShareFlowHost actions={actions} registry={dockPanels} t={t} />)}
        <div className="bh-chat-layout" data-sidebar={docked ? 'dock' : sidebar.mode}>
          <GeneratedFilesContext.Provider
            value={{
              attachments: uploadItems.flatMap((item) =>
                item.ref === undefined ? [] : [item.ref],
              ),
              full: uploadItems.length >= 10,
              disabled: mutationLocked || conversation.sending || recovery.blocked,
              toggle: toggleGeneratedFile,
            }}
          >
            {docked ? (
              <ChannelDock
                conversation={conversationScope}
                hasBots={channel === undefined || hasChannelBots(channel)}
                body={chatPane}
                header={
                  workspaceEnabled && channel !== undefined
                    ? {
                        title,
                        ...(dmWorking
                          ? { label: <WorkingSummary rows={workingRows} t={t} /> }
                          : {}),
                        ...(baseComposerContext === undefined
                          ? {}
                          : { info: baseComposerContext.content }),
                        status: (
                          <ConversationSessionStop
                            channel={channel}
                            groups={sessionStopGroups}
                            controller={sessionStop}
                            actions={actions}
                            t={t}
                            status={
                              channel.type === 'group' && workingRows.items.length > 0 ? (
                                <HeaderWorkingStatus rows={workingRows} t={t} />
                              ) : undefined
                            }
                            onOpenProfile={profileBot === undefined ? undefined : openProfileView}
                          />
                        ),
                        icon:
                          channel.type === 'group' || botDm ? (
                            <GroupChannelIcon
                              channel={channel}
                              bots={new Map(state.bots.map((member) => [member.slug, member]))}
                              className={stylex.props(messageStyles.channelIcon).className ?? ''}
                              groupClassName=""
                              size={20}
                              hashSize={16}
                              t={t}
                            />
                          ) : dmBot !== undefined ? (
                            <PersonaBotAvatar
                              t={t}
                              personaBotId={dmBot.slug}
                              name={dmBot.displayName}
                              src={dmBot.avatar}
                              appearance={dmBot.appearance}
                              avatarSeed={dmBot.avatarSeed}
                              size={20}
                              indicator={false}
                              still
                            />
                          ) : (
                            <ChannelSidebarIcon name="user" size={20} />
                          ),
                        ...(profileBot !== undefined || channel.type === 'group'
                          ? {
                              profile: {
                                label:
                                  channel.type === 'dm' && sessionStopCount > 0
                                    ? t('sessionStop.open', { count: sessionStopCount })
                                    : t(
                                        channel.type === 'group'
                                          ? 'groupProfile.openAvatar'
                                          : 'profile.openAvatar',
                                        { name: title },
                                      ),
                                open:
                                  channel.type === 'dm' && sessionStopCount > 0
                                    ? sessionStop.toggle
                                    : openProfileView,
                                ...(channel.type === 'dm' && sessionStopCount > 0
                                  ? { expanded: sessionStop.open }
                                  : {}),
                              },
                            }
                          : {}),
                        actions: (
                          <>
                            {messageHost === undefined &&
                              profileBot !== undefined &&
                              profileBot.deleted !== true &&
                              renderHeaderConversationCall(profileBot, channel, actions, t)}
                            {hasChannelSettings && (
                              <Tooltip
                                label={t('channelSettings.open')}
                                side="bottom"
                                portal
                                delayMs={500}
                              >
                                <IconButton
                                  aria-label={t('channelSettings.open')}
                                  onClick={() => channelSettings.open(settingsAttention[0]?.id)}
                                >
                                  <ChannelSidebarIcon name="settings" />
                                  {settingsAttention.length > 0 && (
                                    <ChannelAttentionDot
                                      label={t('channelSettings.needsAttention')}
                                    />
                                  )}
                                </IconButton>
                              </Tooltip>
                            )}
                          </>
                        ),
                      }
                    : undefined
                }
                files={
                  workspaceEnabled && channelId !== undefined
                    ? {
                        open: filesOpen,
                        setOpen: setFilesOpen,
                        content: renderChannelFilesContent(channelId, actions, t),
                      }
                    : undefined
                }
                inbox={inboxAvailable ? { open: inboxOpen, setOpen: setInboxOpen } : undefined}
                session={
                  sessionDetail === undefined || sessionOwner === undefined
                    ? undefined
                    : renderSessionPanelDetail(sessionDetail, sessionOwner, state, actions, t, () =>
                        setDetail(undefined),
                      )
                }
                revealBody={
                  state.selection?.kind === 'bot' &&
                  (state.selection.profile === true || state.selection.inboxRequest !== undefined)
                }
                panels={dockPanelList}
                channel={dockChannel}
                registry={dockPanels}
                entryProps={dockEntryProps}
                shows={(entry) =>
                  (hasChannelBots(channel) ||
                    (entry.scope !== 'personabot' &&
                      entry.id !== 'sessions' &&
                      (entry.id !== 'members' || teamMode))) &&
                  (entry.scope === 'both' || entry.scope === settingsScope) &&
                  (entry.visible?.(state) ?? true)
                }
                t={t}
              />
            ) : (
              conversationScope(chatPane)
            )}
            {!workspaceEnabled &&
              filesOpen &&
              channelId !== undefined &&
              conversationScope(renderChannelFilesDialog(channelId, actions, t, setFilesOpen))}
            {!workspaceEnabled &&
              inboxOpen &&
              inboxAvailable &&
              conversationScope(
                renderBotInboxPanelDialog(inboxEntry, dockBotSlug, dockEntryProps, t, setInboxOpen),
              )}
          </GeneratedFilesContext.Provider>
          {conversationScope(renderConversationSettings(channelSidebar, state, actions, t))}
          {docked
            ? null
            : conversationScope(
                <>
                  <ChannelSidebar
                    registry={channelSidebar}
                    state={state}
                    actions={actions}
                    controller={sidebar}
                    t={t}
                    onMentionBot={mentionBot}
                    selectedMemoryCommitSha={selectedMemoryCommitSha}
                    selectedMemoryFilePath={
                      activeMemoryView?.kind === 'file' ? activeMemoryView.path : undefined
                    }
                    selectedMemoryWorking={
                      activeMemoryView?.kind === 'working' ? activeMemoryView.change : undefined
                    }
                    onMemoryCommitSelect={(sha) => openMemoryView({ kind: 'commit', sha })}
                    onMemoryFileSelect={(path) => openMemoryView({ kind: 'file', path })}
                    onMemoryWorkingSelect={(change) => openMemoryView({ kind: 'working', change })}
                  />
                  <button
                    type="button"
                    className="bh-sidebar-toggle"
                    aria-label={
                      sidebar.mode === 'hidden' ? t('sidebar.expand') : t('sidebar.collapse')
                    }
                    aria-expanded={sidebar.mode !== 'hidden'}
                    aria-controls="bh-channel-sidebar"
                    onClick={sidebar.toggle}
                  >
                    <Icon name="panel-left" size={16} />
                  </button>
                </>,
              )}
        </div>
      </div>
    </SessionOpenContext.Provider>
  );
}

function useStableGroupShape(
  groups: readonly { key: string; messages: readonly { id: string }[] }[],
): {
  keys: string[];
  members: Map<string, string[]>;
} {
  const shape = useRef<{ keys: string[]; members: Map<string, string[]> } | undefined>(undefined);
  const previous = shape.current;
  if (
    previous !== undefined &&
    previous.keys.length === groups.length &&
    groups.every((group, index) => {
      const ids = previous.members.get(group.key);
      return (
        previous.keys[index] === group.key &&
        ids !== undefined &&
        ids.length === group.messages.length &&
        group.messages.every((message, at) => ids[at] === message.id)
      );
    })
  )
    return previous;
  const next = {
    keys: groups.map((group) => group.key),
    members: new Map(
      groups.map((group) => [group.key, group.messages.map((message) => message.id)]),
    ),
  };
  shape.current = next;
  return next;
}

function selectConversationState(state: ClientState): ConversationStateView {
  return Object.fromEntries(
    CONVERSATION_STATE_KEYS.flatMap((key) => (state[key] === undefined ? [] : [[key, state[key]]])),
  ) as ConversationStateView;
}

function sameConversationInputs(
  left: ConversationStateView,
  right: ConversationStateView,
): boolean {
  return CONVERSATION_STATE_KEYS.every(
    (key) =>
      left[key] === right[key] ||
      (key === 'bots' && sameConversationBots(left.bots, right.bots, right)),
  );
}

function ConversationSource({
  scopeKey,
  source,
  self,
  host,
  settings,
  children,
}: {
  scopeKey: string;
  source: ClientStore;
  self: string | undefined;
  host: MessageHost | undefined;
  settings: ChannelSettings;
  children: ReactNode;
}): ReactElement {
  return (
    <ClientStoreContext.Provider key={scopeKey} value={source}>
      <SelfHumanContext.Provider value={self}>
        <MessageHostContext.Provider value={host}>
          <ChannelSettingsContext.Provider value={settings}>
            {children}
          </ChannelSettingsContext.Provider>
        </MessageHostContext.Provider>
      </SelfHumanContext.Provider>
    </ClientStoreContext.Provider>
  );
}

function BotMainContent({
  openCompactSidebar,
  actions,
  companion,
  nativeSessions,
  channelSidebar,
  dockPanels,
  profileCards,
  nativeChatT,
  t = zhTranslate,
}: {
  openCompactSidebar?: Parameters<typeof CompactNavigationHeader>[0]['openSidebar'] | undefined;
  actions: BridgeActions;
  companion?: WindowCompanions | undefined;
  channelSidebar: ChannelSidebarRegistry;
  dockPanels?: DockPanelHost | undefined;
  nativeSessions?: NativeSessionCatalog | undefined;
  profileCards?: ProfileCardRegistry | undefined;
  nativeChatT?: NativeChatFailureText | undefined;
  t?: BotHarnessTranslate | undefined;
}): ReactElement {
  const localStore = useConversationStore();
  const remote = useRemoteHosts().open;
  const [source, sourceMount] = useRemoteNativeConversation(remote);
  const unavailableStore = useMemo(() => createStore(), [remote?.hostId]);
  const clientStore = remote === undefined ? localStore : (source?.store ?? unavailableStore);
  const state = useStoreSlice(clientStore, selectConversationState, sameConversationInputs);
  const conversationActions = source?.actions ?? actions;
  const sourceScope =
    remote === undefined
      ? 'local'
      : `${conversationKey(remote)}:${source?.scopeId ?? 'unavailable'}`;
  const settingsController = useMemo(
    () => (remote === undefined ? channelSettings : new ChannelSettings()),
    [source, remote?.hostId],
  );
  const conversationSidebar = useMemo(
    () => (source === undefined ? channelSidebar : remoteChannelSidebar(channelSidebar)),
    [source, channelSidebar],
  );
  const self = remote === undefined ? undefined : (state.composerIdentity?.humanId ?? '');
  const conversationScope = useCallback(
    (node: ReactNode): ReactNode => (
      <ConversationSource
        scopeKey={sourceScope}
        source={clientStore}
        self={self}
        host={source?.host}
        settings={settingsController}
      >
        {node}
      </ConversationSource>
    ),
    [clientStore, self, source, settingsController, sourceScope],
  );
  const workspace = useContext(WorkspaceContext);
  if (remote === undefined && !workspace && state.selection === undefined)
    return (
      <>
        <span ref={sourceMount} hidden />
        {openCompactSidebar !== undefined && (
          <CompactNavigationHeader
            title={t('panel.brand')}
            openSidebar={openCompactSidebar}
            t={t}
          />
        )}
        <Welcome state={state} t={t} />
      </>
    );
  if (remote === undefined && !workspace && state.selection?.kind === 'inbox')
    return (
      <>
        <span ref={sourceMount} hidden />
        {openCompactSidebar !== undefined && (
          <CompactNavigationHeader
            title={t('activityCenter.title')}
            openSidebar={openCompactSidebar}
            t={t}
          />
        )}
        {renderActivityCenter(actions, t, dockPanels)}
      </>
    );
  const scopeKey =
    state.selection === undefined
      ? 'welcome'
      : state.selection.kind === 'inbox'
        ? 'inbox'
        : state.selection.kind === 'bot'
          ? `bot:${state.selection.slug}:${state.selection.profile ? 'profile' : state.selection.inboxRequest ? `inbox:${state.selection.inboxRequest}` : 'chat'}`
          : `channel:${state.selection.channelId}`;
  return (
    <>
      <span ref={sourceMount} hidden />
      <ConversationView
        clientStore={clientStore}
        settingsController={settingsController}
        conversationScope={conversationScope}
        messageHost={source?.host}
        unavailable={remote !== undefined && (source === undefined || !source.available())}
        onRetryConversation={source?.retry}
        openCompactSidebar={openCompactSidebar}
        scopeKey={`${sourceScope}:${scopeKey}:${state.conversation.channel?.id ?? ''}`}
        nativeSessions={remote === undefined ? nativeSessions : undefined}
        state={state}
        actions={conversationActions}
        companion={remote === undefined ? companion : undefined}
        channelSidebar={conversationSidebar}
        dockPanels={dockPanels}
        profileCards={profileCards}
        nativeChatT={nativeChatT}
        t={t}
      />
    </>
  );
}

const subscribeWithoutPrefs = (): (() => void) => () => {};

export function BotMain({
  appearance,
  prefs,
  workspace,
  ...props
}: Parameters<typeof BotMainContent>[0] & {
  appearance?: Appearance | undefined;
  workspace?: WorkspaceOptions | undefined;
  prefs?: Pick<BotModePrefs, 'source'> | undefined;
}): ReactElement {
  const developerMode = useSyncExternalStore(
    prefs?.source.subscribe ?? subscribeWithoutPrefs,
    () => prefs?.source.getSnapshot().developerMode ?? false,
    () => false,
  );
  const sendKey = useSyncExternalStore(
    prefs?.source.subscribe ?? subscribeWithoutPrefs,
    () => prefs?.source.getSnapshot().sendKey ?? 'enter',
    () => 'enter' as const,
  );
  const autoCollapseMessages = useSyncExternalStore(
    prefs?.source.subscribe ?? subscribeWithoutPrefs,
    () => prefs?.source.getSnapshot().autoCollapseMessages ?? false,
    () => false,
  );
  const showDeliveryReceipts = useSyncExternalStore(
    prefs?.source.subscribe ?? subscribeWithoutPrefs,
    () => prefs?.source.getSnapshot().showDeliveryReceipts ?? false,
    () => false,
  );
  const showDmAvatar = useSyncExternalStore(
    prefs?.source.subscribe ?? subscribeWithoutPrefs,
    () => prefs?.source.getSnapshot().showDmAvatar ?? false,
    () => prefs?.source.getSnapshot().showDmAvatar ?? false,
  );
  const showOwnAvatar = useSyncExternalStore(
    prefs?.source.subscribe ?? subscribeWithoutPrefs,
    () => prefs?.source.getSnapshot().showOwnAvatar ?? false,
    () => prefs?.source.getSnapshot().showOwnAvatar ?? false,
  );
  const messageAvatars = useMemo(
    () => ({ dm: showDmAvatar, own: showOwnAvatar }),
    [showDmAvatar, showOwnAvatar],
  );
  const streamReplies = useSyncExternalStore(
    prefs?.source.subscribe ?? subscribeWithoutPrefs,
    () => prefs?.source.getSnapshot().streamReplies ?? false,
    () => false,
  );
  const sessionLevel = useSyncExternalStore(
    prefs?.source.subscribe ?? subscribeWithoutPrefs,
    () => prefs?.source.getSnapshot().sessionDetailLevel ?? DEFAULT_SESSION_DETAIL_LEVEL,
    () => DEFAULT_SESSION_DETAIL_LEVEL,
  );
  const sessionCollapse = useSyncExternalStore(
    prefs?.source.subscribe ?? subscribeWithoutPrefs,
    () => prefs?.source.getSnapshot().sessionCollapse ?? DEFAULT_SESSION_COLLAPSE,
    () => DEFAULT_SESSION_COLLAPSE,
  );
  const sessionReplies = useSyncExternalStore(
    prefs?.source.subscribe ?? subscribeWithoutPrefs,
    () => prefs?.source.getSnapshot().sessionFoldedReplies ?? DEFAULT_SESSION_FOLDED_REPLIES,
    () => DEFAULT_SESSION_FOLDED_REPLIES,
  );
  const sessionDetailPrefs = useMemo(
    () => ({ level: sessionLevel, collapse: sessionCollapse, replies: sessionReplies }),
    [sessionLevel, sessionCollapse, sessionReplies],
  );
  return (
    <SessionDetailPrefsContext.Provider value={sessionDetailPrefs}>
      <DeliveryReceiptsVisible.Provider value={showDeliveryReceipts}>
        <MessageAvatarsContext.Provider value={messageAvatars}>
          <StreamReplies.Provider value={streamReplies}>
            <AutoCollapseMessages.Provider value={autoCollapseMessages}>
              <MessageDeveloperMode.Provider value={developerMode}>
                <ComposerSendKeyContext.Provider value={sendKey}>
                  <AppearanceContext.Provider value={appearance}>
                    <Workspace options={workspace} t={props.t ?? zhTranslate}>
                      <BotMainContent {...props} />
                    </Workspace>
                  </AppearanceContext.Provider>
                </ComposerSendKeyContext.Provider>
              </MessageDeveloperMode.Provider>
            </AutoCollapseMessages.Provider>
          </StreamReplies.Provider>
        </MessageAvatarsContext.Provider>
      </DeliveryReceiptsVisible.Provider>
    </SessionDetailPrefsContext.Provider>
  );
}
