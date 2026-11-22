import { Icon } from '../../ds/icon.js';
import { collapseRepeatedFailures } from '@botharness/host-client/session-failure';
import { selectedMessageText } from '../../selection-quote.js';
import type {
  ConversationStateView,
  ChannelHumanMember,
  ChannelMessage,
  ChannelSummary,
  ClientStore,
  ConversationState,
} from '../../store.js';
import { OnboardingMemoryNavigation } from '../../onboarding-memory.js';
import { useTimelineWindow } from '../../timeline-window.js';
import {
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentProps,
  type ReactElement,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { BridgeActions } from '../../actions.js';
import { type MemoryWorkingChange, channelAttachmentUrl } from '../../bridge.js';
import type { NativeChatFailureText } from '../../channel-message-body.js';
import { readingBots } from '../../channel-delivery-receipt.js';
import { useMessageArrivals } from '../../message-arrivals.js';
import type { BotHarnessTranslate } from '../../locale.js';
import type { DockPanelHost } from '../../dock-panels.js';
import { TAKEOVER_PANELS, TakeoverTimeline, takeoverResolutions } from '../../takeover-card.js';
import type { TakeoverTarget } from '../../../../../core/src/takeover/contracts.js';
import { groupChannelMessages } from '../../message-groups.js';
import { BotDmActionLabel } from '../../bot-dm-action-line.js';
import {
  hiddenDmActionsSnapshot,
  dmMemoryDisplaySnapshot,
  subscribeHiddenDmActions,
  visibleDmMessages,
} from '../../dm-actions.js';
import {
  galleryImageKey,
  useMessageImageGallery,
  type GalleryImage,
} from '../../message-image-gallery.js';
import { inlineImageAttachment } from '../../message-attachment.js';
import { switchEngineToModel } from '../../turn-stop-line.js';
import { authorLabel, memberName } from './message-labels.js';
import { MessageGroupView, type InboxTarget } from './message-group-view.js';
import type { AvatarMenuRequest, MessageMenuRequest } from './message-menus.js';
import type { TimelineGroupInputs } from './timeline-group.js';
import type { MemoryView } from './conversation-view.js';

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

export function useTimelineMessages({
  conversation,
  streamReplies,
  dockPanels,
  actions,
}: {
  conversation: ConversationState;
  streamReplies: boolean;
  dockPanels: DockPanelHost | undefined;
  actions: BridgeActions;
}) {
  const channel = conversation.channel;
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
  return {
    dmBotSlug,
    memoryDisplay,
    messages,
    timelineDrafts,
    visibleMessages,
    takeoverTimeline,
    displayMessages,
    timelineDecisions,
    reading,
  };
}

export function useTimelineCallbacks({
  setAvatarMenu,
  setMessageMenu,
  quoteMessage,
  reactToMessage,
  channelId,
  actions,
  restoreFailedMessage,
  setInboxTarget,
  openMemoryView,
}: {
  setAvatarMenu: Dispatch<SetStateAction<AvatarMenuRequest | undefined>>;
  setMessageMenu: Dispatch<SetStateAction<MessageMenuRequest | undefined>>;
  quoteMessage: (message: ChannelMessage, text?: string) => void;
  reactToMessage: ((message: ChannelMessage, emoji: string, active: boolean) => void) | undefined;
  channelId: string | undefined;
  actions: BridgeActions;
  restoreFailedMessage: (message: ChannelMessage) => void;
  setInboxTarget: Dispatch<SetStateAction<InboxTarget | undefined>>;
  openMemoryView: (view: MemoryView) => void;
}) {
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
  return timelineCallbacks;
}

export function useTimelineGroups({
  conversation,
  visibleMessages,
  displayMessages,
  streamReplies,
  channelId,
  t,
}: {
  conversation: ConversationState;
  visibleMessages: readonly ChannelMessage[];
  displayMessages: readonly ChannelMessage[];
  streamReplies: boolean;
  channelId: string | undefined;
  t: BotHarnessTranslate;
}) {
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
  return { unreadAfter, messageGroups, arrivals, imageGallery, groupKeys, timelineWindow };
}

export function createTimelineGroupInputs({
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
  timelineGroups: { unreadAfter, messageGroups, arrivals, imageGallery, timelineWindow },
  timelineMessages: { dmBotSlug, memoryDisplay, takeoverTimeline, timelineDecisions, reading },
}: {
  channel: ChannelSummary | undefined;
  state: ConversationStateView;
  actions: BridgeActions;
  setInboxTarget: Dispatch<SetStateAction<InboxTarget | undefined>>;
  openMemoryView: (view: MemoryView) => void;
  store: ClientStore;
  t: BotHarnessTranslate;
  timelineCallbacks: ReturnType<typeof useTimelineCallbacks>;
  channelId: string | undefined;
  nativeChatT: NativeChatFailureText | undefined;
  conversation: ConversationState;
  botDm: boolean;
  mutationLocked: boolean;
  reactToMessage: ((message: ChannelMessage, emoji: string, active: boolean) => void) | undefined;
  timelineGroups: Pick<
    ReturnType<typeof useTimelineGroups>,
    'unreadAfter' | 'messageGroups' | 'arrivals' | 'imageGallery' | 'timelineWindow'
  >;
  timelineMessages: Pick<
    ReturnType<typeof useTimelineMessages>,
    'dmBotSlug' | 'memoryDisplay' | 'takeoverTimeline' | 'timelineDecisions' | 'reading'
  >;
}): TimelineGroupInputs {
  return {
    messageGroups,
    timelineWindow,
    unreadAfter,
    channel,
    bots: state.bots,
    channels: state.channels,
    dmBotSlug,
    memoryDisplay,
    switchToModel: (slug) =>
      actions.subscriptionEngine?.use(slug, 'orchestrator', null) ?? switchEngineToModel(slug),
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
}
