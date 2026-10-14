import type { BridgeActions } from './actions.js';
import { channelSidebarPrefs, channelSidebarScopeKey } from './channel-sidebar-prefs.js';
import type { HumanAttentionItem } from './store.js';

type SourceActions = Pick<
  BridgeActions,
  'openAround' | 'openBot' | 'openChannel' | 'openChannelAtMessage' | 'openSession'
>;

export async function openRepairBotInbox(
  actions: SourceActions,
  item: HumanAttentionItem,
): Promise<void> {
  const scopeKey = channelSidebarScopeKey('personabot', '', item.botSlug);
  channelSidebarPrefs.setSidebarCollapsed(scopeKey, false);
  channelSidebarPrefs.setEntryExpanded(scopeKey, 'bot-inbox', true);
  await actions.openBot(item.botSlug);
}

export async function openHumanAttentionSource(
  actions: SourceActions,
  item: HumanAttentionItem,
): Promise<void> {
  if (
    item.kind === 'channel-unread' ||
    item.kind === 'channel-reply' ||
    item.kind === 'channel-mention'
  ) {
    await actions.openChannelAtMessage(item.channelId!, item.messageId!);
  } else if (item.kind === 'bot-message-needs-repair') {
    if (item.channelName && item.channelId && item.messageId) {
      try {
        await actions.openChannelAtMessage(item.channelId, item.messageId);
      } catch {
        await openRepairBotInbox(actions, item);
      }
    } else await openRepairBotInbox(actions, item);
  } else if (
    item.kind === 'assignment-waiting-human' ||
    item.kind === 'assignment-blocked' ||
    item.kind === 'assignment-report'
  ) {
    if (item.assignmentSessionId === undefined) return;
    await actions.openBot(item.botSlug);
    await actions.openSession(item.assignmentSessionId);
  } else if (item.kind === 'group-join-request') {
    if (item.channelId !== undefined) await actions.openChannel(item.channelId);
  } else {
    await actions.openBot(item.botSlug);
    if (item.channelId !== undefined && item.messageId !== undefined)
      await actions.openAround(item.channelId, item.messageId);
  }
}
