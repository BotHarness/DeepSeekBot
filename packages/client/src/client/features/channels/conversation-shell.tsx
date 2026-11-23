import * as stylex from '@stylexjs/stylex';
import { Icon } from '../../ds/icon.js';
import type {
  ConversationStateView,
  BotSummary,
  ChannelAttachmentRef,
  ChannelSummary,
  ConversationState,
} from '../../store.js';
import { GroupChannelIcon } from '../../group-avatar-stack.js';
import {
  useMemo,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
  type RefCallback,
  type MouseEventHandler,
} from 'react';
import { Tooltip } from '../../ds/tooltip.js';
import type { BridgeActions } from '../../actions.js';
import { PersonaBotAvatar, PersonaBotFacepile, type PersonaBotFacepileItem } from '../../avatar.js';
import type { MessageHost } from '../../message-host.js';
import { SessionOpenContext } from '../../session-links.js';
import type { ChannelComposerUpload } from '../../channel-composer.js';
import {
  ConversationSessionStop,
  type HeaderSessionStopController,
} from '../../header-session-stop.js';
import { GeneratedFilesContext } from '../../generated-files-panel.js';
import type { useComposerRecovery } from '../../conversation-draft.js';
import { ChannelSidebarIcon } from '../../channel-sidebar-icon.js';
import { hasChannelBots } from '../../channel-kind.js';
import type { BotHarnessTranslate } from '../../locale.js';
import {
  resolveChannelSidebarContext,
  type ChannelSidebarEntryProps,
  type ChannelSidebarRegistry,
  type ChannelSidebarEntry,
  type ChannelSidebarScope,
} from '../../channel-sidebar.js';
import { ChannelAttentionDot } from '../../channel-options.js';
import { type ChannelSettings, isChannelSettingsSection } from '../../channel-settings-state.js';
import { ChannelSidebar, type ChannelSidebarController } from '../../channel-sidebar-view.js';
import { ChannelDock } from '../../channel-dock.js';
import {
  dockPanelsFromEntries,
  type DockPanelChannel,
  type DockPanelHost,
} from '../../dock-panels.js';
import { ShareFlowHost } from '../../share-flow.js';
import {
  HeaderWorkingStatus,
  WorkingSummary,
  type TimelineWorkingRows,
} from '../../timeline-working-rows.js';
import { IconButton } from '../../ds/icon-button.js';
import type { useComposerResources } from './composer-draft.js';
import { renderConversationSettings } from './settings.js';
import {
  renderConversationCall,
  renderHeaderConversationCall,
} from '../voice/conversation-call.js';
import { renderActivityCenter } from '../activity/panels/activity-center/entry.js';
import { renderBotInboxPanelDialog } from '../activity/panels/bot-inbox/entry.js';
import {
  renderChannelFilesDialog,
  renderChannelFilesContent,
} from '../channel-files/panels/generated-files/entry.js';
import { renderSessionPanelDetail } from '../sessions/panels/sessions/entry.js';
import { Welcome } from './conversation-empty-state.js';
import { radius, text } from '../../ds/tokens.stylex.js';
import type { ActiveMemoryView, MemoryView } from './conversation-view.js';
import type { ComposerContext, ComposerShortcut } from '../../composer-shortcuts.js';
import type { RunningSessionGroup } from '../../session-stop-model.js';
import { useScopedState } from '../../scoped-state.js';
import { useClientStore } from '../../use-client-store.js';
import { useMountedResource } from '../../mounted-resource.js';
import { observeHumanAttention } from '../../messaging-defaults-live.js';
import {
  ChannelMark,
  ChannelMenuCaret,
  ConversationTitle,
  GroupChannelHeader,
} from '../../group-channel-header.js';
import { MobileConversationHeader } from '../../mobile-conversation-header.js';
import type { ChannelMenuTrigger } from '../../human-channel-name.js';
import type { personaBotActivity } from '../../persona-activity.js';
import type {
  createComposerCompaction,
  useConversationComposerContext,
} from './composer-context.js';

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
});

type ConversationSessionDetail = { botSlug?: string; sessionId: string; title: string };
type ConversationDetail = 'files' | 'inbox' | ConversationSessionDetail | undefined;

export const subscribeWithoutPrefs = (): (() => void) => () => {};

export function useConversationDock({
  scopeKey,
  state,
  actions,
  channelSidebar,
  dockPanels,
}: {
  scopeKey: string;
  state: ConversationStateView;
  actions: BridgeActions;
  channelSidebar: ChannelSidebarRegistry;
  dockPanels: DockPanelHost | undefined;
}) {
  const [detail, setDetail] = useScopedState<ConversationDetail>(
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
  return {
    dockBotEntries,
    dockBotDeleted,
    dockBotSlug,
    dockChannel,
    dockInboxMount,
    dockPanelList,
    filesOpen,
    inboxOpen,
    sessionDetail,
    sessionItems,
    sessionOwner,
    setDetail,
    setFilesOpen,
    setInboxOpen,
  };
}

export function renderConversationShell({
  dock: {
    dockBotSlug,
    dockChannel,
    dockInboxMount,
    dockPanelList,
    filesOpen,
    inboxOpen,
    sessionDetail,
    sessionItems,
    sessionOwner,
    setDetail,
    setFilesOpen,
    setInboxOpen,
  },
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
}: {
  dock: ReturnType<typeof useConversationDock>;
  state: ConversationStateView;
  t: BotHarnessTranslate;
  actions: BridgeActions;
  dockPanels: DockPanelHost | undefined;
  conversationPane: ReactElement;
  composerSessions: ReturnType<typeof useComposerResources>['composerSessions'];
  channel: ChannelSummary | undefined;
  conversationMount: RefCallback<HTMLDivElement>;
  allBotPreviewMount: RefCallback<HTMLSpanElement>;
  skillCatalogMount: RefCallback<HTMLSpanElement>;
  searchShortcutMount: RefCallback<HTMLSpanElement>;
  replyPerfMount: RefCallback<HTMLSpanElement>;
  conversationScope: (node: ReactNode) => ReactNode;
  docked: boolean;
  sidebar: ChannelSidebarController;
  uploadItems: ChannelComposerUpload[];
  mutationLocked: boolean;
  conversation: ConversationState;
  recovery: ReturnType<typeof useComposerRecovery>;
  toggleGeneratedFile: (ref: ChannelAttachmentRef) => void;
  workspaceEnabled: boolean;
  title: string;
  dmWorking: boolean;
  workingRows: TimelineWorkingRows;
  baseComposerContext: ComposerContext | undefined;
  sessionStopGroups: RunningSessionGroup<BotSummary>[];
  sessionStop: HeaderSessionStopController;
  profileBot: BotSummary | undefined;
  openProfileView: () => void;
  botDm: boolean;
  dmBot: BotSummary | undefined;
  sessionStopCount: number;
  messageHost: MessageHost | undefined;
  hasChannelSettings: boolean;
  channelSettings: ChannelSettings;
  settingsAttention: readonly ChannelSidebarEntry[];
  channelId: string | undefined;
  dockEntryProps: ChannelSidebarEntryProps | undefined;
  teamMode: boolean;
  settingsScope: ChannelSidebarScope;
  inboxEntry: ChannelSidebarEntry | undefined;
  channelSidebar: ChannelSidebarRegistry;
  mentionBot: (botSlug: string) => void;
  selectedMemoryCommitSha: string | undefined;
  activeMemoryView: ActiveMemoryView | undefined;
  openMemoryView: (view: MemoryView) => void;
}) {
  const inboxAvailable =
    dockBotSlug !== undefined && dockEntryProps !== undefined && inboxEntry !== undefined;
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

export function renderConversationHeader({
  dock: { filesOpen, inboxOpen, setFilesOpen, setInboxOpen },
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
}: {
  dock: Pick<
    ReturnType<typeof useConversationDock>,
    'filesOpen' | 'inboxOpen' | 'setFilesOpen' | 'setInboxOpen'
  >;
  profileMount: RefCallback<HTMLDivElement>;
  workspaceEnabled: boolean;
  profileViewOpen: boolean;
  activeMemoryView: ActiveMemoryView | undefined;
  openCompactSidebar: MouseEventHandler<HTMLButtonElement> | undefined;
  title: string;
  sidebar: ChannelSidebarController;
  channelId: string | undefined;
  inboxAvailable: boolean;
  channel: ChannelSummary | undefined;
  channelHeaderMenu: (
    primaryAction: { label: string; icon: ReactNode; run(): void },
    anchor: (menu: ChannelMenuTrigger | undefined) => ReactNode,
  ) => ReactNode;
  openProfileView: () => void;
  channelFacepile: PersonaBotFacepileItem[];
  profileBot: BotSummary | undefined;
  channelMenuLabel: (menu: ChannelMenuTrigger) => string;
  bot: BotSummary | undefined;
  botActivity: ReturnType<typeof personaBotActivity> | undefined;
  dmWorking: boolean;
  profileBotActivity: ReturnType<typeof personaBotActivity> | undefined;
  workingRows: TimelineWorkingRows;
  messageHost: MessageHost | undefined;
  actions: BridgeActions;
  t: BotHarnessTranslate;
}) {
  return (
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
  );
}

export function conversationComposerShortcuts({
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
}: {
  dmComposerContext: ReturnType<typeof useConversationComposerContext>['dmComposerContext'];
  t: BotHarnessTranslate;
  sidebar: ChannelSidebarController;
  compacting: boolean;
  compactProfileBot: ReturnType<typeof createComposerCompaction>['compactProfileBot'];
  newProfileSession: ReturnType<typeof createComposerCompaction>['newProfileSession'];
  channel: ChannelSummary | undefined;
  openProfileView: () => void;
  hasChannelSettings: boolean;
  channelSettings: ChannelSettings;
  settingsAttention: readonly ChannelSidebarEntry[];
}): ComposerShortcut[] {
  return [
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
}
