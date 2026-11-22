import {
  DEFAULT_SESSION_COLLAPSE,
  DEFAULT_SESSION_DETAIL_LEVEL,
  DEFAULT_SESSION_FOLDED_REPLIES,
} from '@botharness/host-client/shared/bot-mode-settings';
import { SessionDetailPrefsContext } from '../../session-detail.js';
import { SelfHumanContext } from '../../self-human.js';
import {
  CONVERSATION_STATE_KEYS,
  type ConversationStateView,
  createStore,
  type ClientState,
  type ClientStore,
} from '../../store.js';
import { AppearanceContext } from '../../appearance-context.js';
import type { Appearance } from '../../appearance.js';
import { Workspace, type WorkspaceOptions } from '../../workspace.js';
import { WorkspaceContext } from '../../workspace-context.js';
import { CompactNavigationHeader } from '../../mobile-conversation-header.js';
import type { WindowCompanions } from '../../window-companions.js';
import { ComposerSendKeyContext } from '../../composer-send-key.js';
import {
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { BridgeActions } from '../../actions.js';
import { ClientStoreContext, useConversationStore, useStoreSlice } from '../../use-client-store.js';
import { MessageHostContext, type MessageHost } from '../../message-host.js';
import { useRemoteHosts } from '../../host-tabs.js';
import { conversationKey } from '../../remote-hosts.js';
import { useRemoteNativeConversation } from '../../remote-native-conversation.js';
import { remoteChannelSidebar } from '../../remote-channel-sidebar.js';
import { sameConversationBots } from '../../conversation-bots.js';
import type { BotModePrefs } from '../../bot-mode-prefs.js';
import { MessageDeveloperMode, type NativeChatFailureText } from '../../channel-message-body.js';
import { DeliveryReceiptsVisible } from '../../channel-delivery-receipt.js';
import { StreamReplies } from '../../stream-replies.js';
import { zhTranslate, type BotHarnessTranslate } from '../../locale.js';
import type { NativeSessionCatalog } from '../../sessions-entry.js';
import type { ChannelSidebarRegistry } from '../../channel-sidebar.js';
import {
  channelSettings,
  ChannelSettings,
  ChannelSettingsContext,
} from '../../channel-settings-state.js';
import type { DockPanelHost } from '../../dock-panels.js';
import type { ProfileCardRegistry } from '../../profile-cards.js';
import { AutoCollapseMessages } from '../../message-fold.js';
import { MessageAvatarsContext } from '../../message-avatars.js';
import { renderActivityCenter } from '../activity/panels/activity-center/entry.js';
import { Welcome } from './conversation-empty-state.js';
import { ConversationView } from './conversation-view.js';
import { subscribeWithoutPrefs } from './conversation-shell.js';

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
