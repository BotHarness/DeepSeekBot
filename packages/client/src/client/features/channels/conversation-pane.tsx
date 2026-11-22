import { Icon } from '../../ds/icon.js';
import { MessageSelectionToolbar } from '../../message-selection-toolbar.js';
import { ReadFailure } from '../../ds/read-failure.js';
import type {
  ConversationStateView,
  BotSummary,
  ChannelMessage,
  ChannelSummary,
  ClientStore,
  ConversationState,
} from '../../store.js';
import { ConversationFileDropOverlay } from '../../conversation-file-drop.js';
import type { CSSProperties, Dispatch, SetStateAction, RefCallback, MutableRefObject } from 'react';
import type { BridgeActions } from '../../actions.js';
import type { ProfileActivity, GroupProfileActivity } from '../../bridge.js';
import type { PersonaBotFacepileItem } from '../../avatar.js';
import type { MessageHost } from '../../message-host.js';
import type { ChannelComposerUpload, ComposerSkillOption } from '../../channel-composer.js';
import { BotInboxDialog } from '../../bot-inbox-dialog.js';
import { networkContactAvailabilityLabel } from '../../message-author-card.js';
import type { BotHarnessTranslate } from '../../locale.js';
import type { DockPanelHost } from '../../dock-panels.js';
import { MemoryCommitView } from '../../memory-commit-view.js';
import { MemoryFileView, MemoryWorkingView } from '../../memory-current-view.js';
import { LoadingSkeleton } from '../../loading-skeleton.js';
import { ProfileView } from '../../personabot-profile.js';
import { openMarketplaceAvatarPublish } from '../../market-panel.js';
import { GroupProfileView } from '../../group-profile.js';
import { WorkingAnnouncement, type TimelineWorkingRows } from '../../timeline-working-rows.js';
import type { ProfileCardRegistry } from '../../profile-cards.js';
import { MessageFeedbackDialog } from '../../message-feedback.js';
import {
  MessageSelectionBar,
  MessageImagePreview,
  MessageSelectionContext,
} from '../../message-selection.js';
import { color, text } from '../../ds/tokens.stylex.js';
import { MessageReactionSurface } from '../../message-reactions.js';
import { ConversationSearch } from '../../conversation-search.js';
import { reactableMessage } from '../../message-reactions-model.js';
import { fullTime, quotableMessage } from './message-labels.js';
import type { InboxTarget } from './message-group-view.js';
import {
  BotAvatarMenu,
  MessageActionMenu,
  type AvatarMenuRequest,
  type MessageMenuRequest,
} from './message-menus.js';
import { TimelineSlots } from './timeline-slots.js';
import { renderTimelineGroup, type TimelineGroupInputs } from './timeline-group.js';
import type {
  useComposerFileDrop,
  useComposerResources,
  useComposerSubmissions,
  ComposerTextDraft,
  ComposerEdits,
} from './composer-draft.js';
import type { useComposerCompaction } from './composer-context.js';
import { renderConversationComposer } from './conversation-composer.js';
import type { useConversationDictation } from '../voice/conversation-call.js';
import type { useTimelineScrollState, useTimelineScrolling } from './timeline-scroll.js';
import type { useTimelineMessages, useTimelineGroups } from './conversation-timeline.js';
import type { useConversationSelection } from './conversation-selection.js';
import { EmptyConversation } from './conversation-empty-state.js';
import type { ActiveMemoryView } from './conversation-view.js';
import { renderConversationHeader } from './conversation-shell.js';
import type { ComposerContext } from '../../composer-shortcuts.js';
import type { ComposerQuote } from '../../composer-draft-store.js';

export function renderConversationPane({
  header,
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
  scrollState: {
    followingLatest,
    pinTimelineToLatest,
    companionReadMount,
    unseen,
    atLatest,
    setAtLatest,
  },
  selectionState: {
    selectedIds,
    messageSelection,
    cancelSelection,
    selectionBusy,
    selectionImage,
    setSelectionImage,
    selectionNotice,
    selectionAuthor,
    copySelection,
    exportSelectionImage,
  },
  scrolling: { timelineMount, onTimelineScroll, jumpToLatest },
  timelineGroups: { imageGallery, groupKeys, timelineWindow },
  timelineMessages: { messages, displayMessages },
}: {
  header: Parameters<typeof renderConversationHeader>[0];
  fileDrop: ReturnType<typeof useComposerFileDrop>['fileDrop'];
  workingRows: TimelineWorkingRows;
  t: BotHarnessTranslate;
  profileViewOpen: boolean;
  activeMemoryView: ActiveMemoryView | undefined;
  title: string;
  channelId: string | undefined;
  channel: ChannelSummary | undefined;
  channelFacepile: PersonaBotFacepileItem[];
  profileBot: BotSummary | undefined;
  bot: BotSummary | undefined;
  actions: BridgeActions;
  groupProfileActivity: GroupProfileActivity | undefined;
  profileCards: ProfileCardRegistry;
  botNames: Map<string, string>;
  setProfileViewOpen: Dispatch<SetStateAction<boolean>>;
  profileActivity: ProfileActivity | undefined;
  dockPanels: DockPanelHost | undefined;
  closeMemoryView: () => void;
  searchTop: number | undefined;
  setSearchTop: Dispatch<SetStateAction<number | undefined>>;
  searchReturnFocus: { current: HTMLElement | null };
  conversation: ConversationState;
  loadOlderAtTop: (retry?: boolean) => void;
  onRetryConversation: (() => void) | undefined;
  timelineGroupInputs: TimelineGroupInputs;
  restoreBlocked: boolean;
  readOnlyDm: boolean;
  deletedBotDm: boolean;
  composerDraft: ComposerTextDraft;
  composerEdits: ComposerEdits;
  composerSubmissions: ReturnType<typeof useComposerSubmissions>;
  compactNotice: ReturnType<typeof useComposerCompaction>['compactNotice'];
  setCompactNotice: ReturnType<typeof useComposerCompaction>['setCompactNotice'];
  store: ClientStore;
  composerContext: ComposerContext | undefined;
  sendKey: 'enter' | 'shift-enter' | 'mod-enter';
  skillOptions: ComposerSkillOption[];
  composerSessions: ReturnType<typeof useComposerResources>['composerSessions'];
  state: ConversationStateView;
  allBotPreview: Parameters<typeof renderConversationComposer>[0]['allBotPreview'];
  allBotNotice: string | undefined;
  channelBots: BotSummary[];
  dictationPort: ReturnType<typeof useConversationDictation>;
  dictating: MutableRefObject<boolean>;
  unavailable: boolean;
  addFiles: (files: File[], selection?: { start: number; end: number }) => number | void;
  startUpload: (item: ChannelComposerUpload) => void;
  composerQuotes: ComposerQuote[];
  recallInput: (direction: 'older' | 'newer') => boolean;
  submit: () => Promise<void>;
  mutationLocked: boolean;
  messageMenu: MessageMenuRequest | undefined;
  quoteMessage: (message: ChannelMessage, text?: string) => void;
  reactToMessage: ((message: ChannelMessage, emoji: string, active: boolean) => void) | undefined;
  setReactionMenu: Dispatch<SetStateAction<MessageMenuRequest | undefined>>;
  setFeedbackMessage: Dispatch<SetStateAction<string | undefined>>;
  setMessageMenu: Dispatch<SetStateAction<MessageMenuRequest | undefined>>;
  reactionMenu: MessageMenuRequest | undefined;
  avatarMenu: AvatarMenuRequest | undefined;
  mentionBot: (botSlug: string) => void;
  setAvatarMenu: Dispatch<SetStateAction<AvatarMenuRequest | undefined>>;
  inboxTarget: InboxTarget | undefined;
  setInboxTarget: Dispatch<SetStateAction<InboxTarget | undefined>>;
  feedbackMessage: string | undefined;
  scrollState: Pick<
    ReturnType<typeof useTimelineScrollState>,
    | 'followingLatest'
    | 'pinTimelineToLatest'
    | 'companionReadMount'
    | 'unseen'
    | 'atLatest'
    | 'setAtLatest'
  >;
  selectionState: Pick<
    ReturnType<typeof useConversationSelection>,
    | 'selectedIds'
    | 'messageSelection'
    | 'cancelSelection'
    | 'selectionBusy'
    | 'selectionImage'
    | 'setSelectionImage'
    | 'selectionNotice'
    | 'selectionAuthor'
    | 'copySelection'
    | 'exportSelectionImage'
  >;
  scrolling: Pick<
    ReturnType<typeof useTimelineScrolling>,
    'timelineMount' | 'onTimelineScroll' | 'jumpToLatest'
  >;
  timelineGroups: Pick<
    ReturnType<typeof useTimelineGroups>,
    'imageGallery' | 'groupKeys' | 'timelineWindow'
  >;
  timelineMessages: Pick<ReturnType<typeof useTimelineMessages>, 'messages' | 'displayMessages'>;
}) {
  return (
    <section ref={companionReadMount} className="bh-chat-pane" {...fileDrop.handlers}>
      <WorkingAnnouncement rows={workingRows} t={t} />
      {fileDrop.active ? (
        <ConversationFileDropOverlay
          label={t('composer.dropFiles')}
          hint={t('composer.dropLimit')}
        />
      ) : null}
      {renderConversationHeader(header)}
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
          onPublishAvatar={
            dockPanels === undefined
              ? undefined
              : (slug) => openMarketplaceAvatarPublish(dockPanels, slug, actions)
          }
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
}
