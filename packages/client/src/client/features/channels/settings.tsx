import type { ConversationStateView } from '../../store.js';
import { useSyncExternalStore, type ReactElement } from 'react';
import type { BridgeActions } from '../../actions.js';
import type { BotHarnessTranslate } from '../../locale.js';
import {
  resolveChannelSidebarContext,
  type ChannelSidebarRegistry,
} from '../../channel-sidebar.js';
import { ChannelSettingsAttention, ChannelSettingsDialog } from '../../channel-settings.js';
import {
  channelSettings,
  channelSettingsAttentionSections,
  channelSettingsSections,
} from '../../channel-settings-state.js';

export function useConversationSettings(
  state: ConversationStateView,
  channelSidebar: ChannelSidebarRegistry,
  dockBotDeleted: boolean,
) {
  const settingsScope = resolveChannelSidebarContext(state)?.scope ?? 'channel';
  const settingsEntries = useSyncExternalStore(
    channelSidebar.subscribe,
    () => channelSidebar.entries(settingsScope),
    () => channelSidebar.entries(settingsScope),
  );
  const settingsSections = channelSettingsSections(settingsEntries, state);
  const hasChannelSettings = !dockBotDeleted && settingsSections.length > 0;
  const settingsAttentionIds = useSyncExternalStore(
    channelSettings.subscribe,
    () => channelSettings.attentionOf(resolveChannelSidebarContext(state)?.channel?.id),
    () => channelSettings.attentionOf(resolveChannelSidebarContext(state)?.channel?.id),
  );
  const settingsAttention = channelSettingsAttentionSections(
    settingsSections,
    settingsAttentionIds,
  );

  return { settingsScope, hasChannelSettings, settingsAttention };
}

export function renderConversationSettings(
  channelSidebar: ChannelSidebarRegistry,
  state: ConversationStateView,
  actions: BridgeActions,
  t: BotHarnessTranslate,
): ReactElement {
  return (
    <>
      <ChannelSettingsDialog registry={channelSidebar} state={state} actions={actions} t={t} />
      <ChannelSettingsAttention registry={channelSidebar} state={state} actions={actions} t={t} />
    </>
  );
}
